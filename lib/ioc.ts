// Chuẩn hóa và che bớt IOC (STK, SĐT, link) của kẻ lừa đảo.
import type { IocType } from './types';

export function normalizeIoc(type: IocType, value: string): string {
  const v = value.trim();
  if (type === 'bank_account') return v.replace(/\D/g, '');
  if (type === 'phone') {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('84') && d.length >= 11) d = '0' + d.slice(2);
    return d;
  }
  if (type === 'url') {
    return v
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  }
  return v.toLowerCase();
}

/** Các dạng chuẩn hóa có thể có của chuỗi người dùng nhập vào ô kiểm tra. */
export function queryCandidates(q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const digits = trimmed.replace(/[\s.\-+()]/g, '');
  if (/^\d+$/.test(digits)) {
    const set = new Set([normalizeIoc('bank_account', trimmed), normalizeIoc('phone', trimmed)]);
    return [...set].filter((x) => x.length >= 6);
  }
  return [normalizeIoc('url', trimmed)];
}

export function maskIoc(type: IocType, normalized: string): string {
  if (type === 'bank_account' || type === 'phone') {
    if (normalized.length <= 6) return normalized.slice(0, 2) + '****';
    return normalized.slice(0, 4) + '*'.repeat(Math.max(3, normalized.length - 6)) + normalized.slice(-2);
  }
  // Link thì "làm mất tác dụng" để không ai lỡ bấm
  if (type === 'url') return normalized.replace(/\./g, '[.]');
  return normalized;
}

export const IOC_TYPE_LABELS: Record<IocType, string> = {
  bank_account: 'STK',
  phone: 'SĐT',
  url: 'Link',
  other: 'Khác',
};
