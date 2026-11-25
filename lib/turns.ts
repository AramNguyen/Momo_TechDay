import type { ChatTurn } from './types';

export const MAX_TURNS = 60;
const MAX_CHARS = 1000;

/**
 * Kiểm tra lịch sử chat từ client: bắt đầu bằng 'user', luân phiên user/assistant,
 * kết thúc bằng `lastRole`. Trả về mảng hợp lệ hoặc câu báo lỗi.
 */
export function validateTurns(input: unknown, lastRole: 'user' | 'assistant' | 'any'): ChatTurn[] | string {
  if (!Array.isArray(input) || input.length === 0) return 'Chưa có tin nhắn nào.';
  if (input.length > MAX_TURNS) return 'Cuộc trò chuyện dài quá rồi, bấm "Kết thúc" để xem báo cáo nha.';
  const turns: ChatTurn[] = [];
  for (let i = 0; i < input.length; i++) {
    const t = input[i] as { role?: unknown; content?: unknown };
    const expected = i % 2 === 0 ? 'user' : 'assistant';
    if (t?.role !== expected) return 'Thứ tự tin nhắn không hợp lệ.';
    if (typeof t.content !== 'string' || !t.content.trim()) return 'Tin nhắn trống.';
    if (t.content.length > MAX_CHARS) return 'Tin nhắn dài quá (tối đa 1000 ký tự).';
    turns.push({ role: expected, content: t.content });
  }
  if (lastRole !== 'any' && turns[turns.length - 1].role !== lastRole) return 'Thứ tự tin nhắn không hợp lệ.';
  return turns;
}
