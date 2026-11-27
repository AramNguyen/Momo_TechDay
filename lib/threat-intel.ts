// Threat-Intel Engine (tầng xác minh kỹ thuật chạy song song/trước LLM):
// 1. Pre-extract STK / SĐT / URL từ text thô (deterministic, 0ms)
// 2. Phân tích cấu trúc URL: typosquatting brand VN, punycode, TLD rủi ro, APK sideload, IP trần, link rút gọn
// 3. Network probe an toàn (chống SSRF): giải nén link rút gọn + tra tuổi domain qua RDAP
// 4. Kết hợp tín hiệu kỹ thuật với điểm AI thành risk cuối có giải trình rõ ràng

import { normalizeIoc } from './ioc';
import type { IocType, RiskSignal, ScoreBreakdown, Verdict } from './types';

/** Trọng số từng tín hiệu — tập trung một chỗ để sau này tinh chỉnh dễ dàng. */
export const SIGNAL_WEIGHTS = {
  KNOWN_IOC_HIGH: 30,      // Đã bị báo cáo >= 3 lần
  KNOWN_IOC_LOW: 20,       // Đã bị báo cáo 1-2 lần
  BRAND_TYPOSQUAT: 25,     // Domain giả mạo / gần giống thương hiệu VN (Levenshtein / confusable)
  PUNYCODE_IDN: 20,        // Dùng xn-- (homograph attack)
  EXECUTABLE_PAYLOAD: 25,  // Link tải .apk / .ipa / app giả
  RAW_IP_URL: 18,          // URL dùng IP trực tiếp thay vì domain
  YOUNG_DOMAIN: 20,        // Domain mới đăng ký < 30 ngày
  URL_SHORTENER: 10,       // Link rút gọn che giấu đích
  SUSPICIOUS_TLD: 10,      // TLD hay bị lạm dụng (.xyz, .top, .click...)
  OFFICIAL_DOMAIN: -15,    // Trùng chính xác domain chính thức (giảm báo nhầm)
} as const;

export interface ExtractedCandidates {
  urls: string[];
  phones: string[];
  bankAccounts: string[];
  normalizedValues: string[];
}

export interface UrlInspection {
  url: string;
  hostname: string;
  resolvedUrl?: string;
  resolvedHostname?: string;
  domainAgeDays?: number | null;
  isOfficial: boolean;
  matchedBrand?: string;
  signals: RiskSignal[];
}

interface BrandRule {
  brand: string;
  keywords: string[];
  officialDomains: string[];
}

const VN_BRANDS: BrandRule[] = [
  { brand: 'MoMo', keywords: ['momo'], officialDomains: ['momo.vn'] },
  { brand: 'Vietcombank', keywords: ['vietcombank', 'vcb'], officialDomains: ['vietcombank.com.vn'] },
  { brand: 'Techcombank', keywords: ['techcombank', 'tcb'], officialDomains: ['techcombank.com', 'techcombank.com.vn'] },
  { brand: 'BIDV', keywords: ['bidv'], officialDomains: ['bidv.com.vn'] },
  { brand: 'VietinBank', keywords: ['vietinbank', 'vietin'], officialDomains: ['vietinbank.vn'] },
  { brand: 'Agribank', keywords: ['agribank'], officialDomains: ['agribank.com.vn'] },
  { brand: 'MB Bank', keywords: ['mbbank', 'mb-bank'], officialDomains: ['mbbank.com.vn'] },
  { brand: 'VPBank', keywords: ['vpbank'], officialDomains: ['vpbank.com.vn'] },
  { brand: 'ACB', keywords: ['acbbank', 'acb-bank'], officialDomains: ['acb.com.vn'] },
  { brand: 'Sacombank', keywords: ['sacombank'], officialDomains: ['sacombank.com.vn'] },
  { brand: 'TPBank', keywords: ['tpbank'], officialDomains: ['tpb.vn', 'tpbank.vn'] },
  { brand: 'VNeID / Dịch vụ công', keywords: ['vneid', 'dichvucong', 'bocongan', 'congan'], officialDomains: ['vneid.gov.vn', 'dichvucong.gov.vn', 'bocongan.gov.vn', 'chinhphu.vn'] },
  { brand: 'Thuế VN', keywords: ['gdt', 'thuedientu', 'tongcucthue'], officialDomains: ['gdt.gov.vn', 'thuedientu.gdt.gov.vn'] },
  { brand: 'EVN Điện lực', keywords: ['evn', 'dienluc', 'cskh-evn'], officialDomains: ['evn.com.vn'] },
  { brand: 'Viettel', keywords: ['viettel', 'viettelpost'], officialDomains: ['viettel.vn', 'viettelpost.com.vn', 'vietteltelecom.vn'] },
  { brand: 'Zalo', keywords: ['zalo', 'zalopay'], officialDomains: ['zalo.me', 'zalo.vn', 'zalopay.vn'] },
  { brand: 'Shopee', keywords: ['shopee'], officialDomains: ['shopee.vn'] },
  { brand: 'Giao Hàng Nhanh / Tiết Kiệm', keywords: ['giaohangnhanh', 'giaohangtietkiem', 'ghtk'], officialDomains: ['ghn.vn', 'ghtk.vn', 'giaohangtietkiem.vn'] },
];

const SHORTENER_HOSTS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 's.gd', 'rebrand.ly', 'cutt.ly', 'is.gd', 'by.vn', 'shorturl.at', 'rb.gy', 'bom.so',
]);

const RISKY_TLDS = new Set([
  'xyz', 'top', 'click', 'icu', 'vip', 'cfd', 'shop', 'cc', 'tk', 'ml', 'ga', 'cf', 'gq', 'buzz', 'rest', 'work',
]);

/** Chuẩn hóa ký tự hay dùng để giả mạo chữ cái (homoglyph / leetspeak). */
export function normalizeConfusables(s: string): string {
  return s
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4|@/g, 'a')
    .replace(/5|\$/g, 's')
    .replace(/7/g, 't')
    .replace(/vv/g, 'w')
    .replace(/rn/g, 'm');
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

function isSubdomainOrExact(host: string, official: string): boolean {
  return host === official || host.endsWith('.' + official);
}

function parseHostname(rawUrl: string): { url: URL; hostname: string } | null {
  const candidate = /^[a-z]+:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!hostname) return null;
    return { url, hostname };
  } catch {
    return null;
  }
}

/** Chống SSRF: chỉ cho phép host public, chặn localhost, IP private và link-local. */
export function isSafePublicHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.example')) {
    return false;
  }
  // IPv6 loopback / private
  if (h.includes(':')) {
    if (h === '::1' || h === '::' || /^(fc|fd|fe8|fe9|fea|feb)/i.test(h)) return false;
    return true;
  }
  // IPv4 private / reserved
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false;
  }
  return h.includes('.');
}

/**
 * Bóc ứng viên URL, SĐT, STK từ text thô bằng rule/regex (chạy trước LLM).
 */
export function extractCandidates(text: string): ExtractedCandidates {
  const urls = new Set<string>();
  const phones = new Set<string>();
  const bankAccounts = new Set<string>();

  if (!text) return { urls: [], phones: [], bankAccounts: [], normalizedValues: [] };

  // 1. URL có scheme hoặc domain rõ ràng (kể cả .example trong seed)
  const urlRe = /(?:https?:\/\/[^\s<>"')]+)|(?:\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]{2,})+(?:\/[^\s<>"')]*)?)/gi;
  for (const m of text.matchAll(urlRe)) {
    const raw = m[0].replace(/[.,;!?]+$/, '');
    // Bỏ qua chuỗi dạng số phiên bản hoặc số tiền kiểu 1.500.000
    if (/^\d+(?:\.\d+)+$/.test(raw)) continue;
    // Bỏ qua email
    const idx = m.index ?? 0;
    if (idx > 0 && text[idx - 1] === '@') continue;
    const parsed = parseHostname(raw);
    if (!parsed) continue;
    const tld = parsed.hostname.split('.').pop() ?? '';
    if (!/^[a-z]{2,15}$/.test(tld)) continue;
    urls.add(raw);
  }

  // 2. SĐT Việt Nam (03/05/07/08/09, +84, và 0123 mô phỏng)
  const phoneRe = /(?:\+?84|0)(?:[\s.\-]?\d){8,10}\b/g;
  for (const m of text.matchAll(phoneRe)) {
    const norm = normalizeIoc('phone', m[0]);
    if (/^(0[35789]\d{8}|0123\d{6,7})$/.test(norm)) {
      phones.add(norm);
    }
  }

  // 3. Chuỗi số có thể là STK ngân hàng (8-19 chữ số, tránh trùng SĐT vừa bắt)
  const digitRunRe = /\b\d(?:[\s.\-]?\d){7,18}\b/g;
  for (const m of text.matchAll(digitRunRe)) {
    const digits = normalizeIoc('bank_account', m[0]);
    if (digits.length < 8 || digits.length > 19) continue;
    if (phones.has(digits)) continue;
    // Chuỗi toàn 8-9 số dễ trùng ngày tháng/tiền nếu không đứng gần ngữ cảnh STK
    if (digits.length === 8) {
      const ctx = text.slice(Math.max(0, (m.index ?? 0) - 30), (m.index ?? 0) + m[0].length + 15).toLowerCase();
      if (!/(stk|tài khoản|tai khoan|tk\b|ngân hàng|ngan hang|chuyển|ck\b)/i.test(ctx)) continue;
    }
    bankAccounts.add(digits);
  }

  const normalizedValues = [
    ...[...urls].map((u) => normalizeIoc('url', u)),
    ...phones,
    ...bankAccounts,
  ].filter((v) => v.length >= 4);

  return {
    urls: [...urls].slice(0, 6),
    phones: [...phones].slice(0, 6),
    bankAccounts: [...bankAccounts].slice(0, 6),
    normalizedValues: [...new Set(normalizedValues)],
  };
}

/** Kiểm tra cấu trúc domain: typosquatting brand VN, punycode, APK, IP, TLD rủi ro. */
export function inspectUrlLexical(rawUrl: string): UrlInspection | null {
  const parsed = parseHostname(rawUrl);
  if (!parsed) return null;
  const { url, hostname } = parsed;
  const signals: RiskSignal[] = [];

  // Kiểm tra official domain trước để tránh false positive
  for (const rule of VN_BRANDS) {
    if (rule.officialDomains.some((d) => isSubdomainOrExact(hostname, d))) {
      signals.push({
        code: 'official_domain',
        label: `Tên miền chính thức (${rule.brand})`,
        detail: `${hostname} khớp danh sách tên miền chính thức của ${rule.brand}.`,
        weight: SIGNAL_WEIGHTS.OFFICIAL_DOMAIN,
        severity: 'info',
        evidence: [
          { label: 'Domain', value: hostname },
          { label: 'Xác thực', value: rule.brand },
        ],
      });
      return { url: rawUrl, hostname, isOfficial: true, matchedBrand: rule.brand, signals };
    }
  }

  // IP trần
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    signals.push({
      code: 'raw_ip_url',
      label: 'Đường link dùng địa chỉ IP trần',
      detail: `${hostname} không dùng tên miền chính thống.`,
      weight: SIGNAL_WEIGHTS.RAW_IP_URL,
      severity: 'high',
      evidence: [{ label: 'IP', value: hostname }],
    });
  }

  // Punycode homograph (xn--)
  if (hostname.split('.').some((part) => part.startsWith('xn--'))) {
    signals.push({
      code: 'punycode_idn',
      label: 'Tên miền dùng mã Punycode (dễ giả mạo ký tự)',
      detail: `${hostname} chứa nhãn xn-- có thể dùng ký tự gần giống để đánh lừa.`,
      weight: SIGNAL_WEIGHTS.PUNYCODE_IDN,
      severity: 'high',
      evidence: [{ label: 'Punycode host', value: hostname }],
    });
  }

  // File cài đặt app ngoài kho (.apk / .ipa / tai-app)
  const pathLower = (url.pathname + url.search).toLowerCase();
  const extMatch = pathLower.match(/\.(apk|ipa|exe|msi)(?:$|[?#])/);
  if (extMatch || /(?:tai-?app|download-?app|cai-?dat)/.test(pathLower)) {
    signals.push({
      code: 'executable_payload',
      label: 'Link dụ tải file cài đặt / app ngoài',
      detail: `${rawUrl} có dấu hiệu dẫn tới tệp cài đặt (.apk/app giả).`,
      weight: SIGNAL_WEIGHTS.EXECUTABLE_PAYLOAD,
      severity: 'high',
      evidence: [
        { label: 'Host', value: hostname },
        { label: 'Mẫu khớp', value: extMatch ? `.${extMatch[1]}` : url.pathname },
      ],
    });
  }

  // URL shortener
  if (SHORTENER_HOSTS.has(hostname)) {
    signals.push({
      code: 'url_shortener',
      label: 'Link rút gọn che giấu địa chỉ thật',
      detail: `${hostname} che giấu tên miền đích cuối cùng.`,
      weight: SIGNAL_WEIGHTS.URL_SHORTENER,
      severity: 'medium',
      evidence: [{ label: 'Shortener', value: hostname }],
    });
  }

  // TLD rủi ro
  const labels = hostname.split('.');
  const tld = labels[labels.length - 1] ?? '';
  if (RISKY_TLDS.has(tld)) {
    signals.push({
      code: 'suspicious_tld',
      label: `Đuôi tên miền .${tld} hay bị lạm dụng`,
      detail: `${hostname} dùng đuôi .${tld} phổ biến trong chiến dịch phishing.`,
      weight: SIGNAL_WEIGHTS.SUSPICIOUS_TLD,
      severity: 'medium',
      evidence: [
        { label: 'Domain', value: hostname },
        { label: 'TLD', value: `.${tld}` },
      ],
    });
  }

  // Typosquatting / Brand spoofing
  const sld = labels.length >= 2 ? labels[labels.length - 2] : hostname;
  const hostNormalized = normalizeConfusables(hostname.replace(/\.[a-z0-9-]+$/, ''));
  const sldNormalized = normalizeConfusables(sld);

  let matchedBrand: string | undefined;
  for (const rule of VN_BRANDS) {
    const hitKeyword = rule.keywords.some((kw) => kw.length >= 4 && hostNormalized.includes(kw));
    const hitEditDist = rule.keywords.some((kw) => {
      if (kw.length < 4) return false;
      // Kiểm tra từng token tách bởi '-' trong hostname
      const tokens = hostNormalized.split(/[.-]+/).filter((t) => t.length >= 3);
      return tokens.some((tok) => {
        const d = levenshtein(tok, kw);
        return d > 0 && d <= (kw.length >= 7 ? 2 : 1);
      }) || (sldNormalized !== kw && levenshtein(sldNormalized, kw) <= 1);
    });

    if (hitKeyword || hitEditDist) {
      matchedBrand = rule.brand;
      signals.push({
        code: 'brand_typosquat',
        label: `Tên miền có dấu hiệu giả mạo ${rule.brand}`,
        detail: `${hostname} giống hoặc chứa từ khóa của ${rule.brand} nhưng không thuộc tên miền chính thức (${rule.officialDomains.join(', ')}).`,
        weight: SIGNAL_WEIGHTS.BRAND_TYPOSQUAT,
        severity: 'high',
        evidence: [
          { label: 'Domain gửi', value: hostname },
          { label: 'Nhái brand', value: rule.brand },
          { label: 'Chính thức', value: rule.officialDomains[0] },
        ],
      });
      break;
    }
  }

  return { url: rawUrl, hostname, isOfficial: false, matchedBrand, signals };
}

function getRegistrableDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  const lastTwo = parts.slice(-2).join('.');
  // Xử lý ccTLD 2 cấp kiểu .com.vn, .gov.vn, .edu.vn
  if (/^(com|net|org|gov|edu|info|biz)\.vn$/i.test(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

/** Giải nén link rút gọn an toàn (SSRF-safe, tối đa 3 hop, timeout 2.5s). */
async function resolveRedirectsSafe(rawUrl: string): Promise<string | undefined> {
  let current = /^[a-z]+:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  for (let hop = 0; hop < 3; hop++) {
    const parsed = parseHostname(current);
    if (!parsed || !isSafePublicHost(parsed.hostname)) return undefined;
    try {
      const res = await fetch(parsed.url.toString(), {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(2500),
      });
      const loc = res.headers.get('location');
      if (!loc || res.status < 300 || res.status >= 400) return current;
      current = new URL(loc, parsed.url).toString();
    } catch {
      return undefined;
    }
  }
  return current;
}

/** Tra tuổi domain qua RDAP công khai (timeout 2.5s, lỗi mạng thì bỏ qua êm). */
async function lookupDomainAge(hostname: string): Promise<{ ageDays: number; createdDate: string } | null> {
  if (!isSafePublicHost(hostname)) return null;
  const domain = getRegistrableDomain(hostname);
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: 'application/rdap+json, application/json' },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: { eventAction?: string; eventDate?: string }[] };
    const reg = data.events?.find((e) => e.eventAction === 'registration' && e.eventDate);
    if (!reg?.eventDate) return null;
    const createdMs = Date.parse(reg.eventDate);
    if (Number.isNaN(createdMs)) return null;
    return {
      ageDays: Math.max(0, Math.floor((Date.now() - createdMs) / 86_400_000)),
      createdDate: reg.eventDate.slice(0, 10),
    };
  } catch {
    return null;
  }
}

/** Chạy kiểm tra URL đầy đủ (lexical + redirect + RDAP khi cần). */
export async function inspectUrlsDeep(rawUrls: string[], options?: { networkProbe?: boolean }): Promise<UrlInspection[]> {
  const probe = options?.networkProbe ?? true;
  const limited = rawUrls.slice(0, 3);

  return Promise.all(
    limited.map(async (rawUrl) => {
      const base = inspectUrlLexical(rawUrl);
      if (!base) {
        return { url: rawUrl, hostname: rawUrl, isOfficial: false, signals: [] };
      }
      if (!probe || base.isOfficial || !isSafePublicHost(base.hostname)) {
        return base;
      }

      const signals = [...base.signals];
      let targetHost = base.hostname;
      let resolvedUrl: string | undefined;

      if (SHORTENER_HOSTS.has(base.hostname)) {
        resolvedUrl = await resolveRedirectsSafe(rawUrl);
        if (resolvedUrl) {
          const shortenerSig = signals.find((s) => s.code === 'url_shortener');
          if (shortenerSig) {
            shortenerSig.evidence = [
              ...(shortenerSig.evidence ?? []),
              { label: 'Đích thật', value: resolvedUrl.slice(0, 120) },
            ];
          }
          const dest = inspectUrlLexical(resolvedUrl);
          if (dest && dest.hostname !== base.hostname) {
            targetHost = dest.hostname;
            for (const s of dest.signals) {
              if (!signals.some((x) => x.code === s.code)) signals.push(s);
            }
          }
        }
      }

      const ageInfo = await lookupDomainAge(targetHost);
      if (ageInfo && ageInfo.ageDays < 30) {
        signals.push({
          code: 'young_domain',
          label: `Tên miền mới tạo (${ageInfo.ageDays} ngày)`,
          detail: `${targetHost} mới được đăng ký ngày ${ageInfo.createdDate} — rất thường gặp ở trang giả mạo.`,
          weight: SIGNAL_WEIGHTS.YOUNG_DOMAIN,
          severity: 'high',
          evidence: [
            { label: 'Domain', value: targetHost },
            { label: 'Ngày tạo', value: ageInfo.createdDate },
            { label: 'Tuổi', value: `${ageInfo.ageDays} ngày` },
            { label: 'Nguồn', value: 'rdap.org' },
          ],
        });
      }

      return {
        ...base,
        resolvedUrl,
        resolvedHostname: targetHost !== base.hostname ? targetHost : undefined,
        domainAgeDays: ageInfo?.ageDays ?? null,
        signals,
      };
    }),
  );
}

/** Hợp nhất kết quả LLM và các tín hiệu kỹ thuật deterministic. */
export function fuseRisk(
  aiVerdict: Verdict,
  aiRisk: number,
  signals: RiskSignal[],
): { verdict: Verdict; risk: number; breakdown: ScoreBreakdown } {
  const clampedAi = Math.max(0, Math.min(100, Math.round(aiRisk)));
  // Trừ official_domain, cộng các tín hiệu rủi ro (trần boost +45 để không bão hòa sớm)
  const rawBoost = signals.reduce((sum, s) => sum + s.weight, 0);
  const signalBoost = Math.max(-20, Math.min(45, rawBoost));

  const hasHighSignal = signals.some((s) => s.severity === 'high');
  const hasMediumSignal = signals.some((s) => s.severity === 'medium');

  let verdict: Verdict = aiVerdict;
  let finalRisk = Math.max(0, Math.min(100, clampedAi + signalBoost));
  let guardrailTriggered = false;

  if (aiVerdict === 'an_toan' && hasHighSignal) {
    // Hard guardrail: AI nói an toàn nhưng bắt được IOC sổ đen / giả mạo thương hiệu / APK / domain < 30 ngày
    verdict = 'nghi_ngo';
    finalRisk = Math.max(finalRisk, 60);
    guardrailTriggered = true;
  } else if (aiVerdict === 'an_toan' && hasMediumSignal && signalBoost >= 20) {
    verdict = 'nghi_ngo';
    finalRisk = Math.max(finalRisk, 50);
    guardrailTriggered = true;
  } else if (verdict === 'nghi_ngo' && finalRisk >= 80 && hasHighSignal) {
    verdict = 'lua_dao';
  }

  return {
    verdict,
    risk: finalRisk,
    breakdown: {
      ai_risk: clampedAi,
      signal_boost: signalBoost,
      final_risk: finalRisk,
      ...(guardrailTriggered ? { guardrail_triggered: true } : {}),
    },
  };
}

export function buildIocHitSignal(
  type: IocType,
  display: string,
  reportCount: number,
  scenarioName: string | null,
  realCount = reportCount,
  lastSeen?: string | null,
): RiskSignal {
  const high = reportCount >= 3;
  const simCount = Math.max(0, reportCount - realCount);
  const evidence: { label: string; value: string }[] = [
    { label: 'IOC', value: display },
    { label: 'Báo cáo thật', value: String(realCount) },
  ];
  if (simCount > 0) evidence.push({ label: 'Mẫu mô phỏng', value: String(simCount) });
  if (scenarioName) evidence.push({ label: 'Kịch bản', value: scenarioName });
  if (lastSeen) evidence.push({ label: 'Gần nhất', value: lastSeen.slice(0, 10) });

  return {
    code: high ? 'known_ioc_high' : 'known_ioc_low',
    label: `Đã có trong sổ đen (${reportCount} lượt)`,
    detail: `${type === 'bank_account' ? 'STK' : type === 'phone' ? 'SĐT' : 'Link'} ${display} từng bị ghi nhận${scenarioName ? ` ở kịch bản "${scenarioName}"` : ''}.`,
    weight: high ? SIGNAL_WEIGHTS.KNOWN_IOC_HIGH : SIGNAL_WEIGHTS.KNOWN_IOC_LOW,
    severity: 'high',
    evidence,
  };
}
