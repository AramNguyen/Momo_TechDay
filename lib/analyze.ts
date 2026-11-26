// Lõi "Gọi Bà": phân tích tin nhắn/ảnh → lưu kho → trả kết quả kèm thống kê kịch bản.
import { callAI, parseJson, type AIMessage } from './llm';
import { db } from './supabase';
import { ANALYZE_SYSTEM } from './prompts';
import { normalizeIoc } from './ioc';
import type { AnalyzeResponse, Ioc, IocType, RawAnalysis, ScenarioInfo, Verdict } from './types';

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

export async function analyzeAndStore(input: AnalyzeInput): Promise<AnalyzeResponse> {
  const supa = db();

  // 1. Lấy kho kịch bản để AI xếp loại
  const { data: scenarios, error: scenErr } = await supa
    .from('scenarios')
    .select('id,name,description')
    .eq('is_hidden', false)
    .order('id');
  if (scenErr) throw new Error('Không đọc được kho kịch bản: ' + scenErr.message);
  const rows = (scenarios ?? []) as { id: number; name: string; description: string }[];
  const list = rows.map((s) => `${s.id} | ${s.name} | ${s.description}`).join('\n') || '(kho đang trống)';
  const known = new Set<number>(rows.map((s) => s.id));

  // 2. Gọi AI
  const content: Exclude<AIMessage['content'], string> = [];
  if (input.image) {
    content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.data } });
  }
  const text = input.text?.trim();
  content.push({
    type: 'text',
    text: text
      ? `Tin nhắn con cháu gửi cho bà:\n<tin_nhan>\n${text}\n</tin_nhan>`
      : 'Con cháu gửi cho bà ảnh chụp màn hình ở trên. Hãy đọc nội dung trong ảnh và phân tích.',
  });

  const raw = await callAI({
    system: ANALYZE_SYSTEM.replace('{SCENARIOS}', list),
    messages: [{ role: 'user', content }],
    maxTokens: 1500,
    json: true,
  });
  const r = sanitize(parseJson<RawAnalysis>(raw));

  // 3. Xác định kịch bản (có sẵn hoặc tạo mới)
  let scenarioId: number | null = null;
  let justCreated = false;
  if (r.verdict !== 'an_toan') {
    if (r.scenario_match_id !== null && known.has(r.scenario_match_id)) {
      scenarioId = r.scenario_match_id;
    } else if (r.new_scenario) {
      // Trùng tên kịch bản đã có (kể cả đang ẩn) thì dùng lại, không ghi đè mô tả
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

  // 4. Lưu lượt gửi (không lưu ảnh gốc, không lưu nguyên văn tin nhắn)
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

  // 5. Lưu IOC
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

  // 6. Thống kê kịch bản để hiện "X người đã gặp"
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
  return { ...rest, scenario };
}
