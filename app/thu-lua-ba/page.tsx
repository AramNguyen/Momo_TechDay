'use client';

import { useEffect, useRef, useState } from 'react';
import { STAGE_LABELS, TACTIC_LABELS, type BaitReport, type ChatTurn } from '@/lib/types';
import { readJson } from '@/lib/api-client';

const ROLES = [
  { label: 'Công an báo dính rửa tiền', opener: 'Alo, tôi là cán bộ công an phường. Bà đang liên quan đến một đường dây rửa tiền, bà cần hợp tác ngay.' },
  { label: 'Cháu nội mượn tiền gấp', opener: 'Bà ơi con nè, con đổi số mới. Con đang có chuyện gấp, bà cho con mượn ít tiền được không?' },
  { label: 'Mời đầu tư vàng lãi khủng', opener: 'Chào bác, bên cháu có gói đầu tư vàng lãi 30%/tháng, rút bất cứ lúc nào, bác có muốn tham gia không ạ?' },
  { label: 'Điện lực báo cắt điện', opener: 'Điện lực thông báo: nhà bà nợ tiền điện 2 tháng, 17h hôm nay sẽ cắt điện nếu chưa thanh toán.' },
];

const MAX_TURNS = 60;

// Bà gõ chậm, mổ cò từng chữ: khoảng 11 ký tự/giây, tin càng dài chờ càng lâu (tối đa 10s),
// cộng chút ngẫu nhiên cho khỏi đều như máy
const typingDelay = (text: string) => Math.min(10000, 1000 + text.length * 90) * (0.85 + Math.random() * 0.3);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  // Số dòng (tin nhắn nhỏ) của lượt trả lời mới nhất đã hiện ra; null = hiện hết
  const [shownLines, setShownLines] = useState<number | null>(null);
  const revealId = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startedAt || report) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, report]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, loading, shownLines]);

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
    setShownLines(null);
    setLoading(true);
    const sentAt = Date.now();
    try {
      const res = await fetch('/api/bait', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = await readJson<{ reply: string }>(res);
      const lines = data.reply.split('\n').filter((l) => l.trim());
      // Đợi cho đủ thời gian "gõ" tin đầu (trừ phần đã chờ AI), rồi hiện từng tin một
      const id = ++revealId.current;
      await sleep(Math.max(0, typingDelay(lines[0] ?? '') - (Date.now() - sentAt)));
      if (id !== revealId.current) return;
      setTurns([...next, { role: 'assistant', content: lines.join('\n') }]);
      setShownLines(1);
      setLoading(false);
      for (let k = 1; k < lines.length; k++) {
        await sleep(typingDelay(lines[k]));
        if (id !== revealId.current) return;
        setShownLines(k + 1);
      }
      setShownLines(null);
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
      const data = await readJson<{ report: BaitReport }>(res);
      setDuration(dur);
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra');
    } finally {
      setReporting(false);
    }
  }

  function reset() {
    revealId.current++;
    setShownLines(null);
    setTurns([]);
    setReport(null);
    setStartedAt(null);
    setDuration(0);
    setError(null);
  }

  return (
    <>
      <section className="hero">
        <h1>Thử lừa Bà</h1>
        <p className="lede">
          Con đóng vai kẻ lừa đảo, tìm cách bắt bà Tư (68 tuổi) chuyển tiền hoặc đọc mã OTP. Bà sẽ câu giờ và moi ngược thông tin
          của con. Bấm Kết thúc để xem báo cáo.
        </p>
        <p className="muted small">Cuộc chat này được lưu để cải thiện Bà, đừng nhập thông tin thật của con.</p>
      </section>

      {turns.length === 0 && (
        <div className="samples">
          <span className="muted small">Chưa biết mở lời sao? Chọn một vai:</span>
          {ROLES.map((r) => (
            <button key={r.label} type="button" className="chip-btn" onClick={() => setInput(r.opener)}>
              {r.label}
            </button>
          ))}
        </div>
      )}

      <section className="sheet chat">
        <div className="chat-head">
          <div className="chat-who">
            <span className="online-dot" aria-hidden />
            <strong>Bà Tư</strong>
            <span className="muted small">đang online</span>
          </div>
          {startedAt && (
            <div className="timer">
              Đã câu giờ <span>{fmt(elapsed)}</span>
            </div>
          )}
        </div>
        <div className="chat-body">
          {turns.length === 0 && <p className="muted chat-empty">Gửi tin đầu tiên để bắt đầu lừa bà.</p>}
          {turns.map((t, i) => {
            if (t.role === 'user') {
              return (
                <div key={i} className="bubble me">
                  {t.content}
                </div>
              );
            }
            // Tin của bà: mỗi dòng là một bong bóng riêng; lượt mới nhất hiện dần
            const lines = t.content.split('\n').filter((l) => l.trim());
            const isLast = i === turns.length - 1;
            const visible = isLast && shownLines !== null ? lines.slice(0, shownLines) : lines;
            return visible.map((l, k) => (
              <div key={`${i}-${k}`} className="bubble ba">
                {l}
              </div>
            ));
          })}
          {(loading || (shownLines !== null && turns.length > 0 && shownLines < turns[turns.length - 1].content.split('\n').filter((l) => l.trim()).length)) && (
            <div className="bubble ba typing">Bà đang gõ…</div>
          )}
          <div ref={bottomRef} />
        </div>
        {!report && (
          <div className="chat-input">
            <input
              aria-label="Tin nhắn gửi bà"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMsg();
                }
              }}
              placeholder={full ? 'Hết lượt, bấm Kết thúc nha' : 'Nhắn cho bà như một kẻ lừa đảo'}
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
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      {report && (
        <section className="sheet report">
          <h2>Báo cáo của Bà</h2>
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
              <h3>Bà đã moi được</h3>
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
              <h3>Câu đỉnh nhất của bà</h3>
              {report.highlights.map((h, i) => (
                <blockquote key={i} className="grandma">
                  “{h}”
                </blockquote>
              ))}
            </>
          )}

          {report.lessons.length > 0 && (
            <>
              <h3>Bài học cho mọi người</h3>
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
