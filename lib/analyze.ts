// Lõi "Gọi Bà" (Hybrid Pipeline):
// 1. Pre-extract ứng viên URL/SĐT/STK + kiểm tra tên miền + tra trước sổ đen IOC
// 2. Gọi AI kèm khối <tin_hieu_ky_thuat> đã xác minh từ server
// 3. Kết hợp điểm AI + tín hiệu kỹ thuật (fuseRisk), lưu report + IOC
import { callAI, parseJson, type AIMessage } from './llm';
import { db } from './supabase';
import { ANALYZE_SYSTEM } from './prompts';
import { maskIoc, normalizeIoc } from './ioc';
import { buildIocHitSignal, extractCandidates, fuseRisk, inspectUrlLexical, inspectUrlsDeep } from './threat-intel';
import type { AnalyzeResponse, Ioc, IocType, RawAnalysis, RiskSignal, ScenarioInfo, Verdict } from './types';

const VERDICTS: Verdict[] = ['lua_dao', 'nghi_ngo', 'an_toan'];
const IOC_TYPES: IocType[] = ['bank_account', 'phone', 'url', 'other'];

export interface AnalyzeInput {
  text?: string;
  image?: { data: string; mediaType: string };
  source: 'web' | 'telegram' | 'email';
}

function strArr(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, max);
}

function sanitize(raw: RawAnalysis): RawAnalysis {
  const verdict = VERDICTS.includes(raw.verdict) ? raw.verdict : 'nghi_ngo';
  const iocs: Ioc[] = Array.isArray(raw.iocs)
    ? raw.iocs
        .filter((i) => i && typeof i.value === 'string' && i.value.trim())
        .map((i) => ({
          type: IOC_TYPES.includes(i.type) ? i.type : 'other',
          value: i.value.trim().slice(0, 300),
          bank: typeof i.bank === 'string' && i.bank.trim() ? i.bank.trim() : null,
        }))
        .slice(0, 10)
    : [];
  const ns = raw.new_scenario;
  return {
    verdict,
    risk: Math.max(0, Math.min(100, Math.round(Number(raw.risk) || 0))),
    // Gemini hay trả id dạng chuỗi ("3"), nên chấp nhận cả hai
    scenario_match_id:
      raw.scenario_match_id !== null &&
      raw.scenario_match_id !== undefined &&
      Number.isInteger(Number(raw.scenario_match_id))
        ? Number(raw.scenario_match_id)
        : null,
    new_scenario:
      ns && typeof ns.name === 'string' && ns.name.trim()
        ? { name: ns.name.trim().slice(0, 80), description: String(ns.description ?? '').trim().slice(0, 400) }
        : null,
    impersonated_entity:
      typeof raw.impersonated_entity === 'string' && raw.impersonated_entity.trim() ? raw.impersonated_entity.trim() : null,
    tactics: strArr(raw.tactics, 7),
    red_flags: strArr(raw.red_flags, 3),
    advice: strArr(raw.advice, 4),
    troll_replies: verdict === 'an_toan' ? [] : strArr(raw.troll_replies, 2),
    iocs: verdict === 'an_toan' ? [] : iocs,
    key_phrases: strArr(raw.key_phrases, 3),
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    grandma_note: typeof raw.grandma_note === 'string' ? raw.grandma_note.trim() : '',
  };
}

function pushUniqueSignal(signals: RiskSignal[], sig: RiskSignal) {
  if (!signals.some((s) => s.code === sig.code && s.label === sig.label)) {
    signals.push(sig);
  }
}

interface IocPrecheckRow {
  type: IocType;
  value_normalized: string;
  report_count: number;
  real_count: number;
  last_seen: string | null;
  scenarios: { name: string } | { name: string }[] | null;
}

function appendIocSignals(signals: RiskSignal[], rows: IocPrecheckRow[]) {
  for (const row of rows) {
    const sc = Array.isArray(row.scenarios) ? row.scenarios[0]?.name ?? null : row.scenarios?.name ?? null;
    pushUniqueSignal(
      signals,
      buildIocHitSignal(
        row.type,
        maskIoc(row.type, row.value_normalized),
        Number(row.report_count) || 1,
        sc,
        Number(row.real_count) || 0,
        row.last_seen,
      ),
    );
  }
}

export async function analyzeAndStore(input: AnalyzeInput): Promise<AnalyzeResponse> {
  const supa = db();
  const text = input.text?.trim() ?? '';
  const candidates = extractCandidates(text);

  // 1. Chạy song song: lấy kho kịch bản + kiểm tra URL + tra trước sổ đen IOC
  const [scenRes, urlInspections, preIocRes] = await Promise.all([
    supa.from('scenarios').select('id,name,description').eq('is_hidden', false).order('id'),
    candidates.urls.length > 0 ? inspectUrlsDeep(candidates.urls) : Promise.resolve([]),
    candidates.normalizedValues.length > 0
      ? supa
          .from('iocs')
          .select('type,value_normalized,report_count,real_count,last_seen,scenarios(name)')
          .in('value_normalized', candidates.normalizedValues)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (scenRes.error) throw new Error('Không đọc được kho kịch bản: ' + scenRes.error.message);
  const rows = (scenRes.data ?? []) as { id: number; name: string; description: string }[];
  const list = rows.map((s) => `${s.id} | ${s.name} | ${s.description}`).join('\n') || '(kho đang trống)';
  const known = new Set<number>(rows.map((s) => s.id));

  // Gom tín hiệu kỹ thuật từ bước tiền kiểm tra
  const signals: RiskSignal[] = [];
  for (const u of urlInspections) {
    for (const s of u.signals) pushUniqueSignal(signals, s);
  }

  const preCheckedValues = new Set<string>(candidates.normalizedValues);
  appendIocSignals(signals, (preIocRes.data ?? []) as IocPrecheckRow[]);

  // 2. Gọi AI kèm ngữ cảnh kỹ thuật đã xác minh
  const content: Exclude<AIMessage['content'], string> = [];
  if (input.image) {
    content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.data } });
  }

  const techLines = signals.map((s) => `- [${s.severity.toUpperCase()}] ${s.label}: ${s.detail}`);
  for (const u of urlInspections) {
    if (u.resolvedUrl) techLines.push(`- [INFO] Link rút gọn ${u.url} chuyển hướng tới: ${u.resolvedUrl}`);
  }
  const techBlock = techLines.length ? `\n\n<tin_hieu_ky_thuat>\n${techLines.join('\n')}\n</tin_hieu_ky_thuat>` : '';

  content.push({
    type: 'text',
    text: text
      ? `Tin nhắn con cháu gửi cho bà:\n<tin_nhan>\n${text}\n</tin_nhan>${techBlock}`
      : `Con cháu gửi cho bà ảnh chụp màn hình ở trên. Hãy đọc nội dung trong ảnh và phân tích.${techBlock}`,
  });

  const raw = await callAI({
    system: ANALYZE_SYSTEM.replace('{SCENARIOS}', list),
    messages: [{ role: 'user', content }],
    maxTokens: 1500,
    json: true,
  });
  const r = sanitize(parseJson<RawAnalysis>(raw));

  // 2b. Nếu AI bóc thêm URL/IOC mới từ ảnh (hoặc text mà regex bỏ sót), kiểm tra bổ sung
  const extraUrls = r.iocs.filter((i) => i.type === 'url').map((i) => i.value);
  for (const urlVal of extraUrls) {
    const lex = inspectUrlLexical(urlVal);
    if (lex) {
      for (const s of lex.signals) pushUniqueSignal(signals, s);
    }
  }
  const extraNorms = r.iocs
    .map((i) => normalizeIoc(i.type, i.value))
    .filter((v) => v.length >= 4 && !preCheckedValues.has(v));
  if (extraNorms.length > 0) {
    const { data: extraHits } = await supa
      .from('iocs')
      .select('type,value_normalized,report_count,real_count,last_seen,scenarios(name)')
      .in('value_normalized', extraNorms);
    appendIocSignals(signals, (extraHits ?? []) as IocPrecheckRow[]);
  }

  // 3. Hợp nhất điểm AI + tín hiệu kỹ thuật
  const fused = fuseRisk(r.verdict, r.risk, signals);
  r.verdict = fused.verdict;
  r.risk = fused.risk;
  if (r.verdict === 'an_toan') {
    r.troll_replies = [];
    r.iocs = [];
  }

  // 4. Xác định kịch bản (có sẵn hoặc tạo mới)
  let scenarioId: number | null = null;
  let justCreated = false;
  if (r.verdict !== 'an_toan') {
    if (r.scenario_match_id !== null && known.has(r.scenario_match_id)) {
      scenarioId = r.scenario_match_id;
    } else if (r.new_scenario) {
      const { data: existing } = await supa
        .from('scenarios')
        .select('id')
        .eq('name', r.new_scenario.name)
        .maybeSingle();
      if (existing) {
        scenarioId = existing.id as number;
      } else {
        const { data: inserted, error } = await supa
          .from('scenarios')
          .insert({ name: r.new_scenario.name, description: r.new_scenario.description })
          .select('id')
          .single();
        if (error) console.error('[analyze] tạo kịch bản lỗi', error.message);
        else {
          scenarioId = inserted.id as number;
          justCreated = true;
        }
      }
    }
  }

  // 5. Lưu lượt gửi (không lưu ảnh gốc, không lưu nguyên văn tin nhắn)
  const { error: repErr } = await supa.from('reports').insert({
    source: input.source,
    verdict: r.verdict,
    risk: r.risk,
    scenario_id: scenarioId,
    impersonated_entity: r.impersonated_entity,
    tactics: r.tactics,
    red_flags: r.red_flags,
    key_phrases: r.key_phrases,
    summary: r.summary,
    is_simulated: false,
  });
  if (repErr) console.error('[analyze] lưu report lỗi', repErr.message);

  // 6. Lưu IOC
  for (const ioc of r.iocs) {
    const norm = normalizeIoc(ioc.type, ioc.value);
    if (norm.length < 4) continue;
    const { error } = await supa.rpc('record_ioc', {
      p_type: ioc.type,
      p_value: norm,
      p_display: ioc.value,
      p_bank: ioc.bank ?? null,
      p_scenario_id: scenarioId,
      p_is_simulated: false,
    });
    if (error) console.error('[analyze] lưu IOC lỗi', error.message);
  }

  // 7. Thống kê kịch bản để hiện "X người đã gặp"
  let scenario: ScenarioInfo | null = null;
  if (scenarioId !== null) {
    const { data: stat } = await supa
      .from('scenario_stats')
      .select('id,name,description,real_count,sim_count,first_report')
      .eq('id', scenarioId)
      .maybeSingle();
    if (stat) {
      scenario = {
        id: stat.id,
        name: stat.name,
        description: stat.description,
        real_count: Number(stat.real_count) || 0,
        sim_count: Number(stat.sim_count) || 0,
        first_report: stat.first_report,
        just_created: justCreated,
      };
    }
  }

  const { scenario_match_id: _m, new_scenario: _n, ...rest } = r;
  return {
    ...rest,
    scenario,
    signals: signals.length ? signals : undefined,
    score_breakdown: fused.breakdown,
  };
}
