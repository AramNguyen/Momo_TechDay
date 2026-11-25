-- Bà Ngoại AI: schema. Chạy 1 lần trong Supabase > SQL Editor.
-- Mọi bảng bật RLS và KHÔNG có policy → chỉ server (service_role) đọc/ghi được.

create table if not exists scenarios (
  id bigint generated always as identity primary key,
  name text not null unique,
  description text not null default '',
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('web', 'telegram', 'email', 'seed')),
  verdict text not null check (verdict in ('lua_dao', 'nghi_ngo', 'an_toan')),
  risk int not null default 0,
  scenario_id bigint references scenarios(id) on delete set null,
  impersonated_entity text,
  tactics text[] not null default '{}',
  red_flags text[] not null default '{}',
  key_phrases text[] not null default '{}',
  summary text,
  -- true = dữ liệu mô phỏng/seed, KHÔNG được báo như số liệu thật
  is_simulated boolean not null default false
);
create index if not exists reports_scenario_idx on reports (scenario_id);
create index if not exists reports_created_idx on reports (created_at desc);

create table if not exists iocs (
  id bigint generated always as identity primary key,
  type text not null check (type in ('bank_account', 'phone', 'url', 'other')),
  value_normalized text not null,
  value_display text not null,
  bank text,
  scenario_id bigint references scenarios(id) on delete set null,
  report_count int not null default 1,
  real_count int not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (type, value_normalized)
);
create index if not exists iocs_value_idx on iocs (value_normalized);

create table if not exists bait_sessions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  turns int not null,
  duration_sec int not null default 0,
  transcript jsonb not null,
  report jsonb
);

create table if not exists rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

alter table scenarios enable row level security;
alter table reports enable row level security;
alter table iocs enable row level security;
alter table bait_sessions enable row level security;
alter table rate_limits enable row level security;

-- Thống kê theo kịch bản (tách lượt thật và lượt mô phỏng)
create or replace view scenario_stats with (security_invoker = true) as
select
  s.id,
  s.name,
  s.description,
  s.created_at,
  count(r.id) filter (where not r.is_simulated) as real_count,
  count(r.id) filter (where r.is_simulated) as sim_count,
  min(r.created_at) as first_report,
  max(r.created_at) as last_seen,
  (select r2.key_phrases from reports r2 where r2.scenario_id = s.id order by r2.created_at desc limit 1) as sample_phrases,
  (select r3.tactics from reports r3 where r3.scenario_id = s.id order by r3.created_at desc limit 1) as sample_tactics
from scenarios s
left join reports r on r.scenario_id = s.id
where not s.is_hidden
group by s.id;

-- Rate limit theo cửa sổ thời gian cố định. Trả true nếu còn được phép.
create or replace function hit_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz;
  c int;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into rate_limits (key, window_start, count)
  values (p_key, w, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into c;
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '2 days';
  end if;
  return c <= p_max;
end;
$$;

-- Ghi nhận 1 IOC (cộng dồn nếu đã có)
create or replace function record_ioc(
  p_type text,
  p_value text,
  p_display text,
  p_bank text,
  p_scenario_id bigint,
  p_is_simulated boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into iocs (type, value_normalized, value_display, bank, scenario_id, report_count, real_count)
  values (p_type, p_value, p_display, p_bank, p_scenario_id, 1, case when p_is_simulated then 0 else 1 end)
  on conflict (type, value_normalized) do update set
    report_count = iocs.report_count + 1,
    real_count = iocs.real_count + case when p_is_simulated then 0 else 1 end,
    last_seen = now(),
    bank = coalesce(iocs.bank, excluded.bank),
    scenario_id = coalesce(excluded.scenario_id, iocs.scenario_id);
end;
$$;

revoke execute on function hit_rate_limit(text, int, int) from public, anon, authenticated;
revoke execute on function record_ioc(text, text, text, text, bigint, boolean) from public, anon, authenticated;
grant execute on function hit_rate_limit(text, int, int) to service_role;
grant execute on function record_ioc(text, text, text, text, bigint, boolean) to service_role;
