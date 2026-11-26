'use client';

import { useEffect, useState } from 'react';
import type { CheckResponse } from '@/lib/types';
import { readJson } from '@/lib/api-client';

async function check(q: string): Promise<CheckResponse> {
  const res = await fetch(`/api/check-account?q=${encodeURIComponent(q)}`);
  return readJson<CheckResponse>(res);
}

function CheckResult({ r }: { r: CheckResponse }) {
  if (!r.flagged) {
    return (
      <div className="check ok">
        Bà chưa thấy ai báo cáo <code>{r.query}</code>. Chưa có báo cáo không có nghĩa là chắc chắn an toàn, con vẫn nên gọi
        xác minh với người nhận.
      </div>
    );
  }
  const total = r.matches.reduce((a, m) => a + m.report_count, 0);
  const simOnly = r.matches.every((m) => m.simulated_only);
  return (
    <div className="check danger">
      <strong>Đã bị báo cáo {total} lần</strong>
      {simOnly && <span className="muted"> (dữ liệu mô phỏng)</span>}
      <ul>
        {r.matches.map((m, i) => (
          <li key={i}>
            <code>{m.display}</code>
            {m.bank ? ` · ${m.bank}` : ''}
            {m.scenario ? ` · kịch bản: ${m.scenario}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function KiemTraStk() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<CheckResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Màn mô phỏng chuyển tiền
  const [to, setTo] = useState('');
  const [bank, setBank] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'form' | 'checking' | 'blocked' | 'confirm' | 'cancelled' | 'done'>('form');
  const [hit, setHit] = useState<CheckResponse | null>(null);

  async function lookup(value: string) {
    if (!value.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      setRes(await check(value));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Đọc ?q= từ link "Tra cứu" ở trang Gọi Bà (không dùng useSearchParams để khỏi cần Suspense)
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial) {
      setQ(initial);
      void lookup(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startTransfer() {
    if (!to.trim() || !amount.trim()) return;
    setStep('checking');
    try {
      const r = await check(to);
      setHit(r);
      setStep(r.flagged ? 'blocked' : 'confirm');
    } catch {
      setHit(null);
      setStep('confirm');
    }
  }

  return (
    <>
      <section className="hero">
        <h1>Kiểm tra STK, SĐT</h1>
        <p className="lede">Trước khi chuyển tiền, tra xem số tài khoản, số điện thoại hoặc link đã bị ai báo cáo lừa đảo chưa.</p>
      </section>

      <section className="sheet">
        <div className="row">
          <input
            aria-label="STK, SĐT hoặc link cần kiểm tra"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookup(q)}
            placeholder="Nhập STK, SĐT hoặc link"
            inputMode="text"
          />
          <button type="button" className="btn-primary" onClick={() => lookup(q)} disabled={loading}>
            {loading ? 'Đang tra…' : 'Kiểm tra'}
          </button>
        </div>
        {err && <p className="error">{err}</p>}
        {res && <CheckResult r={res} />}
        <p className="muted small">
          API cho ví điện tử / ngân hàng: <code>GET /api/check-account?q=…</code>
        </p>
      </section>

      <section className="wallet-wrap">
        <div className="wallet-intro">
          <h2>Ví Demo</h2>
          <p className="muted small">
            Mô phỏng cách một ví điện tử gọi API của Bà ngay trước khi con bấm chuyển tiền. Thử nhập 9999 0012 3456 78.
          </p>
        </div>
        <div className="wallet">
        <div className="wallet-bar">Chuyển tiền</div>

        {(step === 'form' || step === 'checking') && (
          <div className="wallet-form">
            <label>
              Số tài khoản / SĐT người nhận
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="vd 9999 0012 3456 78" />
            </label>
            <label>
              Ngân hàng
              <input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="vd Ngân hàng mô phỏng" />
            </label>
            <label>
              Số tiền (đ)
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="vd 15000000" />
            </label>
            <button type="button" className="btn-primary" onClick={startTransfer} disabled={step === 'checking' || !to || !amount}>
              {step === 'checking' ? 'Đang kiểm tra người nhận…' : 'Tiếp tục'}
            </button>
          </div>
        )}

        {step === 'blocked' && hit && (
          <div className="block-modal">
            <div className="block-title">Khoan đã</div>
            <p>
              Tài khoản người nhận đã bị <b>{hit.matches.reduce((a, m) => a + m.report_count, 0)} người</b> báo cáo lừa đảo
              {hit.matches[0]?.scenario ? (
                <>
                  {' '}
                  với kịch bản <b>{hit.matches[0].scenario}</b>
                </>
              ) : null}
              .
            </p>
            <p className="muted small">
              Nếu có người xưng công an, ngân hàng hay người thân đang hối con chuyển gấp, hãy cúp máy và gọi lại số chính thức.
            </p>
            <div className="actions">
              <button type="button" className="btn-primary" onClick={() => setStep('cancelled')}>
                Hủy giao dịch
              </button>
              <button type="button" className="btn-secondary" onClick={() => setStep('confirm')}>
                Tôi vẫn muốn chuyển
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="wallet-form">
            <p>
              Chuyển <b>{Number(amount || 0).toLocaleString('vi-VN')}đ</b> tới <code>{to}</code>
              {bank ? ` (${bank})` : ''}?
            </p>
            {hit?.flagged && <p className="error">Bà đã cảnh báo rồi đó nha con.</p>}
            <div className="actions">
              <button type="button" className="btn-secondary" onClick={() => setStep('cancelled')}>
                Hủy
              </button>
              <button type="button" className="btn-primary" onClick={() => setStep('done')}>
                Xác nhận
              </button>
            </div>
          </div>
        )}

        {step === 'cancelled' && (
          <div className="check ok">
            Đã hủy giao dịch. Bà tự hào về con.{' '}
            <button type="button" className="btn-small" onClick={() => setStep('form')}>
              Làm lại
            </button>
          </div>
        )}
        {step === 'done' && (
          <div className="check warn">
            (Mô phỏng) Giao dịch đã gửi, không có tiền thật nào được chuyển.{' '}
            <button type="button" className="btn-small" onClick={() => setStep('form')}>
              Làm lại
            </button>
          </div>
        )}
        </div>
      </section>
    </>
  );
}
