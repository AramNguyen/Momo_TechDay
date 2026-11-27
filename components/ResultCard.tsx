'use client';

import Link from 'next/link';
import CopyButton from './CopyButton';
import { IOC_TYPE_LABELS } from '@/lib/ioc';
import { isNewScenario, TACTIC_LABELS, VERDICT_META, type AnalyzeResponse } from '@/lib/types';

export default function ResultCard({ r }: { r: AnalyzeResponse }) {
  const meta = VERDICT_META[r.verdict];
  const sc = r.scenario;
  const isNew = sc ? sc.just_created || isNewScenario(sc.first_report) : false;

  return (
    <section className={`result ${meta.className}`} aria-live="polite">
      <div className="result-head">
        <div className={`stamp ${meta.className}`} role="img" aria-label={`Kết luận: ${meta.label}, mức nguy hiểm ${r.risk} trên 100`}>
          <span className="stamp-word">{meta.label}</span>
          <span className="stamp-risk">Nguy hiểm {r.risk}/100</span>
        </div>

        {sc && (
          <div className="scenario">
            <p className="scenario-name">
              {sc.name}
              {isNew && <span className="tag-new">Mới</span>}
            </p>
            <p className="scenario-desc">{sc.description}</p>
            <p className="crowd">
              <strong>{sc.real_count}</strong> người đã gửi cho Bà kịch bản này
              {sc.sim_count > 0 && <span className="muted"> (thêm {sc.sim_count} mẫu mô phỏng)</span>}
            </p>
          </div>
        )}
      </div>

      {r.grandma_note && <blockquote className="grandma">{r.grandma_note}</blockquote>}

      {r.summary && <p className="summary">{r.summary}</p>}

      {r.tactics.length > 0 && (
        <ul className="chips" aria-label="Chiêu tâm lý">
          {r.tactics.map((t) => (
            <li key={t} className="chip">
              {TACTIC_LABELS[t] ?? t}
            </li>
          ))}
        </ul>
      )}

      {r.red_flags.length > 0 && (
        <div className="block">
          <h3>Dấu hiệu nhận biết</h3>
          <ul className="list">
            {r.red_flags.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}

      {r.advice.length > 0 && (
        <div className="block">
          <h3>Con nên làm ngay</h3>
          <ul className="list">
            {r.advice.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}

      {r.troll_replies.length > 0 && (
        <div className="block">
          <h3>Câu giờ kẻ lừa</h3>
          <p className="muted small">
            Copy rồi gửi lại cho nó. Nó càng tốn thời gian với con thì càng ít thời gian lừa người khác. Tuyệt đối không chuyển
            tiền hay đưa mã OTP.
          </p>
          {r.troll_replies.map((x, i) => (
            <div key={i} className="troll">
              <p>{x}</p>
              <CopyButton text={x} />
            </div>
          ))}
        </div>
      )}

      {r.iocs.length > 0 && (
        <div className="block">
          <h3>Bà đã ghi vào sổ đen</h3>
          <ul className="iocs">
            {r.iocs.map((i, k) => (
              <li key={k}>
                <span className="ioc-type">{IOC_TYPE_LABELS[i.type]}</span>
                <code>{i.value}</code>
                {i.bank ? <span className="muted">{i.bank}</span> : null}
                {(i.type === 'bank_account' || i.type === 'phone' || i.type === 'url') && (
                  <Link href={`/kiem-tra-stk?q=${encodeURIComponent(i.value)}`}>Tra cứu</Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {((r.signals && r.signals.length > 0) || r.score_breakdown) && (
        <div className="block">
          <h3>Bằng chứng kỹ thuật &amp; cách tính điểm</h3>
          {r.score_breakdown && (
            <div className="score-grid" aria-label="Thành phần điểm rủi ro">
              <div className="score-cell">
                <span>AI (ngữ nghĩa)</span>
                <b>{r.score_breakdown.ai_risk}/100</b>
              </div>
              <div className="score-cell">
                <span>Kỹ thuật (cộng/trừ)</span>
                <b>
                  {r.score_breakdown.signal_boost >= 0
                    ? `+${r.score_breakdown.signal_boost}`
                    : r.score_breakdown.signal_boost}
                </b>
              </div>
              <div className="score-cell">
                <span>Điểm cuối</span>
                <b>{r.score_breakdown.final_risk}/100</b>
              </div>
              {r.score_breakdown.guardrail_triggered && (
                <span className="guardrail-badge">Guardrail đã nâng mức cảnh báo</span>
              )}
            </div>
          )}
          {r.signals && r.signals.length > 0 && (
            <ul className="signals">
              {r.signals.map((s, k) => (
                <li key={k} className={`signal-item signal-${s.severity}`}>
                  <div className="signal-head">
                    <strong>{s.label}</strong>
                    {s.weight !== 0 && (
                      <span className="signal-weight">{s.weight > 0 ? `+${s.weight} điểm` : `${s.weight} điểm`}</span>
                    )}
                  </div>
                  {s.evidence && s.evidence.length > 0 ? (
                    <div className="evidence-row">
                      {s.evidence.map((ev, idx) => (
                        <span key={idx} className="evidence-pill">
                          {ev.label}: <code>{ev.value}</code>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="muted small">{s.detail}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
