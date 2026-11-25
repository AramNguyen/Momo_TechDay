'use client';

import { useEffect, useRef, useState } from 'react';
import { STAGE_LABELS, TACTIC_LABELS, type BaitReport, type ChatTurn } from '@/lib/types';

const ROLES = [
  { label: 'Công an báo dính rửa tiền', opener: 'Alo, tôi là cán bộ công an phường. Bà đang liên quan đến một đường dây rửa tiền, bà cần hợp tác ngay.' },
  { label: 'Cháu nội mượn tiền gấp', opener: 'Bà ơi con nè, con đổi số mới. Con đang có chuyện gấp, bà cho con mượn ít tiền được không?' },
  { label: 'Mời đầu tư vàng lãi khủng', opener: 'Chào bác, bên cháu có gói đầu tư vàng lãi 30%/tháng, rút bất cứ lúc nào, bác có muốn tham gia không ạ?' },
  { label: 'Điện lực báo cắt điện', opener: 'Điện lực thông báo: nhà bà nợ tiền điện 2 tháng, 17h hôm nay sẽ cắt điện nếu chưa thanh toán.' },
];

const MAX_TURNS = 60;

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ThuLuaBa() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [report, setReport] = useState<BaitReport | null>(null);
  const [duration, setDuration] = useState(0);
  const [reporting, setReporting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startedAt || report) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, report]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, loading]);

  const elapsed = startedAt ? Math.floor(((report ? startedAt + duration * 1000 : now) - startedAt) / 1000) : 0;
  const full = turns.length >= MAX_TURNS - 1;

  async function sendMsg() {
    const content = input.trim();
    if (!content || loading || full) return;
    const next: ChatTurn[] = [...turns, { role: 'user', content }];
    setTurns(next);
    setInput('');
    setError(null);
    if (!startedAt) setStartedAt(Date.now());
    setLoading(true);
    try {
      const res = await fetch('/api/bait', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
      setTurns([...next, { role: 'assistant', content: data.reply as string }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra');
      setTurns(turns); // trả lại trạng thái cũ để thứ tự user/assistant không lệch
      setInput(content);
    } finally {
      setLoading(false);
    }
  }

  async function finish() {
    if (turns.length < 2 || reporting) return;
    const dur = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    setReporting(true);
    setError(null);
    try {
      const res = await fetch('/api/bait/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: turns, durationSec: dur }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
      setDuration(dur);
      setReport(data.report as BaitReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra');
    } finally {
      setReporting(false);
    }
  }

  function reset() {
    setTurns([]);
    setReport(null);
    setStartedAt(null);
    setDuration(0);
    setError(null);
  }

  return (
    <>
      <section className="hero">
        <h1>Thử lừa Bà 😈</h1>
        <p>
          Con đóng vai <b>kẻ lừa đảo</b>, cố lừa bà Tư (68 tuổi) chuyển tiền hoặc đưa OTP. Bà sẽ câu giờ và moi ngược thông tin
          của con. Bấm <b>Kết thúc</b> để xem báo cáo.
        </p>
        <p className="muted small">Cuộc chat này được lưu để cải thiện Bà, đừng nhập thông tin thật của con.</p>
      </section>

      {turns.length === 0 && (
        <div className="samples">
          <span className="muted">Gợi ý vai:</span>
          {ROLES.map((r) => (
            <button key={r.label} type="button" className="chip-btn" onClick={() => setInput(r.opener)}>
              {r.label}
            </button>
          ))}
        </div>
      )}

      <section className="card chat">
        <div className="chat-head">
          <div>
            👵 <b>Bà Tư</b> <span className="muted small">· đang online</span>
          </div>
          {startedAt && <div className="timer">⏱ Đã câu giờ {fmt(elapsed)}</div>}
        </div>
        <div className="chat-body">
          {turns.length === 0 && <p className="muted center">Nhắn tin đầu tiên để bắt đầu lừa bà…</p>}
          {turns.map((t, i) => (
            <div key={i} className={`bubble ${t.role === 'user' ? 'me' : 'ba'}`}>
              {t.content}
            </div>
          ))}
          {loading && <div className="bubble ba typing">Bà đang gõ…</div>}
          <div ref={bottomRef} />
        </div>
        {!report && (
          <div className="chat-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMsg();
                }
              }}
              placeholder={full ? 'Hết lượt, bấm Kết thúc nha' : 'Nhắn cho bà như một kẻ lừa đảo…'}
              maxLength={1000}
              disabled={loading || full}
            />
            <button type="button" className="btn-primary" onClick={sendMsg} disabled={loading || !input.trim() || full}>
              Gửi
            </button>
            <button type="button" className="btn-secondary" onClick={finish} disabled={turns.length < 2 || reporting || loading}>
              {reporting ? 'Đang chấm…' : 'Kết thúc'}
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {report && (
        <section className="card report">
          <h2>📋 Báo cáo của Bà</h2>
          <div className="stats">
            <div>
              <b>{fmt(duration)}</b>
              <span>bị câu giờ</span>
            </div>
            <div>
              <b>{turns.filter((t) => t.role === 'user').length}</b>
              <span>tin con đã nhắn</span>
            </div>
            <div>
              <b>{report.extracted_info.length}</b>
              <span>thông tin bà moi được</span>
            </div>
            <div>
              <b>{report.scammer_frustration}/10</b>
              <span>độ cay cú</span>
            </div>
          </div>

          <p>
            Kịch bản nhận diện: <b>{report.scenario_name}</b>
          </p>
          {report.summary && <p>{report.summary}</p>}

          {report.stages_reached.length > 0 && (
            <div className="stages">
              {report.stages_reached.map((s, i) => (
                <span key={s} className="stage">
                  {i > 0 && '→ '}
                  {STAGE_LABELS[s] ?? s}
                </span>
              ))}
            </div>
          )}

          {report.tactics.length > 0 && (
            <div className="chips">
              {report.tactics.map((t) => (
                <span key={t} className="chip">
                  {TACTIC_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          )}

          {report.extracted_info.length > 0 && (
            <>
              <h3>🕵️ Bà đã moi được</h3>
              <ul>
                {report.extracted_info.map((x, i) => (
                  <li key={i}>
                    {x.label}: <code>{x.value}</code>
                  </li>
                ))}
              </ul>
            </>
          )}

          {report.highlights.length > 0 && (
            <>
              <h3>😂 Câu đỉnh nhất của bà</h3>
              {report.highlights.map((h, i) => (
                <blockquote key={i} className="grandma">
                  “{h}”
                </blockquote>
              ))}
            </>
          )}

          {report.lessons.length > 0 && (
            <>
              <h3>📌 Bài học cho mọi người</h3>
              <ul>
                {report.lessons.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          )}

          <button type="button" className="btn-primary" onClick={reset}>
            Lừa lại từ đầu
          </button>
        </section>
      )}
    </>
  );
}
