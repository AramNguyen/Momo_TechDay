// Kiểu dữ liệu dùng chung giữa server và client (không import gì của server ở đây).

export type Verdict = 'lua_dao' | 'nghi_ngo' | 'an_toan';
export type IocType = 'bank_account' | 'phone' | 'url' | 'other';

export interface Ioc {
  type: IocType;
  value: string;
  bank?: string | null;
}

/** JSON mà AI trả về ở bước Gọi Bà (xem lib/prompts.ts). */
export interface RawAnalysis {
  verdict: Verdict;
  risk: number;
  scenario_match_id: number | null;
  new_scenario: { name: string; description: string } | null;
  impersonated_entity: string | null;
  tactics: string[];
  red_flags: string[];
  advice: string[];
  troll_replies: string[];
  iocs: Ioc[];
  key_phrases: string[];
  summary: string;
  grandma_note: string;
}

export interface ScenarioInfo {
  id: number;
  name: string;
  description: string;
  real_count: number;
  sim_count: number;
  first_report: string | null;
  /** true nếu kịch bản vừa được tạo mới từ chính lượt gửi này */
  just_created: boolean;
}

export interface SignalEvidence {
  label: string;
  value: string;
}

export interface RiskSignal {
  code: string;
  label: string;
  detail: string;
  weight: number;
  severity: 'high' | 'medium' | 'info';
  evidence?: SignalEvidence[];
}

export interface ScoreBreakdown {
  ai_risk: number;
  signal_boost: number;
  final_risk: number;
  guardrail_triggered?: boolean;
}

export interface AnalyzeResponse extends Omit<RawAnalysis, 'scenario_match_id' | 'new_scenario'> {
  scenario: ScenarioInfo | null;
  signals?: RiskSignal[];
  score_breakdown?: ScoreBreakdown;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface BaitReport {
  is_scam: boolean;
  scenario_name: string;
  tactics: string[];
  stages_reached: string[];
  extracted_info: { label: string; value: string }[];
  scammer_frustration: number;
  highlights: string[];
  summary: string;
  lessons: string[];
}

export interface CheckMatch {
  type: IocType;
  display: string;
  bank: string | null;
  report_count: number;
  real_count: number;
  simulated_only: boolean;
  scenario: string | null;
  last_seen: string;
}

export interface CheckResponse {
  query: string;
  flagged: boolean;
  risk_level: 'cao' | 'trung_binh' | 'chua_ghi_nhan';
  matches: CheckMatch[];
}

export const TACTIC_LABELS: Record<string, string> = {
  khan_cap: 'Hối thúc gấp',
  so_hai: 'Hù dọa',
  long_tham: 'Đánh vào lòng tham',
  mao_danh_uy_quyen: 'Mạo danh cơ quan / người có quyền',
  tao_niem_tin: 'Tạo niềm tin',
  co_lap: 'Bắt giữ bí mật, cô lập nạn nhân',
  tinh_cam: 'Đánh vào tình cảm',
};

export const STAGE_LABELS: Record<string, string> = {
  tiep_can: 'Tiếp cận',
  tao_niem_tin: 'Tạo niềm tin',
  gay_ap_luc: 'Gây áp lực',
  doi_tien: 'Đòi tiền / thông tin',
};

export const VERDICT_META: Record<Verdict, { label: string; className: string }> = {
  lua_dao: { label: 'Lừa đảo', className: 'danger' },
  nghi_ngo: { label: 'Nghi ngờ', className: 'warn' },
  an_toan: { label: 'Có vẻ an toàn', className: 'ok' },
};

export const NEW_SCENARIO_DAYS = 7;

export function isNewScenario(firstReport: string | null): boolean {
  if (!firstReport) return false;
  return Date.now() - new Date(firstReport).getTime() < NEW_SCENARIO_DAYS * 24 * 3600 * 1000;
}
