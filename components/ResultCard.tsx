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
    <section className={`card result ${meta.className}`}>
      <div className="verdict-row">
        <span className={`badge ${meta.className}`}>
          {meta.emoji} {meta.label}
        </span>
        <div className="risk">
          <div className="risk-bar">
            <div className={`risk-fill ${meta.className}`} style={{ width: `${r.risk}%` }} />
          </div>
          <small>Mức nguy hiểm {r.risk}/100</small>
        </div>
      </div>

      {sc && (
        <div className="scenario-box">
          <div>
            <b>{sc.name}</b> {isNew && <span className="tag-new">MỚI</span>}
          </div>
          <div className="muted">{sc.description}</div>
          <div className="crowd">
            👥 <b>{sc.real_count}</b> người đã gửi cho bà kịch bản này
            {sc.sim_count > 0 && <span className="muted"> (+{sc.sim_count} mẫu mô phỏng)</span>}
          </div>
        </div>
      )}

      {r.summary && <p>{r.summary}</p>}

      {r.tactics.length > 0 && (
        <div className="chips">
          {r.tactics.map((t) => (
            <span key={t} className="chip">
              {TACTIC_LABELS[t] ?? t}
            </span>
          ))}
        </div>
      )}

      {r.red_flags.length > 0 && (
        <>
          <h3>🔎 Dấu hiệu nhận biết</h3>
          <ul>
            {r.red_flags.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </>
      )}

      {r.advice.length > 0 && (
        <>
          <h3>✅ Con làm ngay</h3>
          <ul>
            {r.advice.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </>
      )}

      {r.grandma_note && <blockquote className="grandma">👵 {r.grandma_note}</blockquote>}

      {r.troll_replies.length > 0 && (
        <>
          <h3>🧶 Troll câu giờ tụi nó</h3>
          <p className="muted">Copy rồi dán lại cho kẻ lừa. Nó càng mất thời gian với con thì càng ít thời gian lừa người khác.</p>
          {r.troll_replies.map((x, i) => (
            <div key={i} className="troll">
              <span>{x}</span>
              <CopyButton text={x} />
            </div>
          ))}
        </>
      )}

      {r.iocs.length > 0 && (
        <>
          <h3>🏴 Bà đã ghi sổ đen</h3>
          <ul className="iocs">
            {r.iocs.map((i, k) => (
              <li key={k}>
                <span className="chip">{IOC_TYPE_LABELS[i.type]}</span> <code>{i.value}</code>
                {i.bank ? <span className="muted"> · {i.bank}</span> : null}{' '}
                {(i.type === 'bank_account' || i.type === 'phone') && (
                  <Link href={`/kiem-tra-stk?q=${encodeURIComponent(i.value)}`}>Tra cứu</Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
