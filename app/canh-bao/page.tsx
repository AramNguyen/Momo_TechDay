// Bản tin cảnh báo: kịch bản lừa đảo do cộng đồng gửi về, mới nhất lên đầu.
import { db } from '@/lib/supabase';
import { IOC_TYPE_LABELS, maskIoc } from '@/lib/ioc';
import { isNewScenario, TACTIC_LABELS, type IocType } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface ScenarioRow {
  id: number;
  name: string;
  description: string;
  real_count: number;
  sim_count: number;
  first_report: string | null;
  last_seen: string | null;
  sample_phrases: string[] | null;
  sample_tactics: string[] | null;
}

interface IocRow {
  type: IocType;
  value_normalized: string;
  bank: string | null;
  report_count: number;
  scenario_id: number | null;
}

function ago(iso: string | null): string {
  if (!iso) return '';
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return 'vừa xong';
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

async function load() {
  const supa = db();
  const [sc, io] = await Promise.all([
    supa.from('scenario_stats').select('*').order('last_seen', { ascending: false, nullsFirst: false }),
    supa
      .from('iocs')
      .select('type,value_normalized,bank,report_count,scenario_id')
      .order('report_count', { ascending: false })
      .limit(300),
  ]);
  if (sc.error) throw sc.error;
  if (io.error) throw io.error;
  return { scenarios: (sc.data ?? []) as ScenarioRow[], iocs: (io.data ?? []) as IocRow[] };
}

export default async function CanhBao() {
  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load();
  } catch (e) {
    console.error('[canh-bao]', e);
    return (
      <section className="card">
        <p className="error">Chưa tải được bản tin. Kiểm tra lại kết nối Supabase.</p>
      </section>
    );
  }

  const scenarios = data.scenarios.filter((s) => Number(s.real_count) + Number(s.sim_count) > 0);
  const totalReal = scenarios.reduce((a, s) => a + Number(s.real_count), 0);
  const totalSim = scenarios.reduce((a, s) => a + Number(s.sim_count), 0);
  const iocsByScenario = new Map<number, IocRow[]>();
  for (const i of data.iocs) {
    if (i.scenario_id === null) continue;
    const arr = iocsByScenario.get(i.scenario_id) ?? [];
    if (arr.length < 3) arr.push(i);
    iocsByScenario.set(i.scenario_id, arr);
  }

  return (
    <>
      <section className="hero">
        <h1>📰 Bản tin lừa đảo</h1>
        <p>Các chiêu lừa người dân vừa gửi cho Bà. Kịch bản gắn nhãn MỚI là chiêu xuất hiện trong 7 ngày gần đây.</p>
      </section>

      <section className="stats">
        <div>
          <b>{totalReal}</b>
          <span>lượt người dân báo</span>
        </div>
        <div>
          <b>{scenarios.length}</b>
          <span>kịch bản</span>
        </div>
        <div>
          <b>{data.iocs.length}</b>
          <span>STK/SĐT/link trong sổ đen</span>
        </div>
      </section>
      {totalSim > 0 && <p className="muted small center">Bao gồm {totalSim} mẫu mô phỏng dùng để demo, được tính riêng.</p>}

      {scenarios.map((s) => {
        const isNew = isNewScenario(s.first_report);
        const iocs = iocsByScenario.get(s.id) ?? [];
        return (
          <article key={s.id} className="card feed-item">
            <div className="feed-head">
              <h2>
                {s.name} {isNew && <span className="tag-new">MỚI</span>}
              </h2>
              <span className="muted small">{ago(s.last_seen)}</span>
            </div>
            <p>{s.description}</p>
            <div className="crowd">
              👥 <b>{s.real_count}</b> người đã gặp
              {Number(s.sim_count) > 0 && <span className="muted"> (+{s.sim_count} mẫu mô phỏng)</span>}
            </div>
            {s.sample_phrases && s.sample_phrases.length > 0 && (
              <blockquote className="phrase">“{s.sample_phrases[0]}”</blockquote>
            )}
            {s.sample_tactics && s.sample_tactics.length > 0 && (
              <div className="chips">
                {s.sample_tactics.map((t) => (
                  <span key={t} className="chip">
                    {TACTIC_LABELS[t] ?? t}
                  </span>
                ))}
              </div>
            )}
            {iocs.length > 0 && (
              <div className="ioc-line">
                {iocs.map((i) => (
                  <span key={i.type + i.value_normalized} className="ioc">
                    {IOC_TYPE_LABELS[i.type]} <code>{maskIoc(i.type, i.value_normalized)}</code>
                    {i.bank ? ` · ${i.bank}` : ''}
                  </span>
                ))}
              </div>
            )}
          </article>
        );
      })}

      {scenarios.length === 0 && (
        <section className="card">
          <p className="muted">Chưa có kịch bản nào. Chạy file supabase/seed.sql hoặc gửi thử một tin ở trang Gọi Bà.</p>
        </section>
      )}
    </>
  );
}
