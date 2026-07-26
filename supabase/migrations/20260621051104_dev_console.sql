-- Developer Console: code review reports from GitHub Actions CI
-- RLS: only admin role can read; service_role key writes (GitHub Actions)

create table if not exists public.dev_reports (
  id              uuid primary key default gen_random_uuid(),
  repo            text not null default 'TimoDesk',
  branch          text not null default 'main',
  commit_sha      text,
  commit_range    text,
  summary         text,
  total_issues    int not null default 0,
  critical_count  int not null default 0,
  high_count      int not null default 0,
  medium_count    int not null default 0,
  low_count       int not null default 0,
  info_count      int not null default 0,
  trigger_type    text not null default 'scheduled' check (trigger_type in ('scheduled', 'manual')),
  status          text not null default 'new' check (status in ('new', 'reviewed')),
  triggered_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table if not exists public.dev_report_issues (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null references public.dev_reports(id) on delete cascade,
  file_path         text,
  line_number       int,
  severity          text not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  category          text not null check (category in ('bug', 'security', 'performance', 'cleanup', 'architecture', 'style')),
  message           text not null,
  suggestion        text,
  code_snippet      text,
  resolution_status text not null default 'open' check (resolution_status in ('open', 'fixed', 'ignored', 'wontfix')),
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists dev_report_issues_report_id_idx on public.dev_report_issues(report_id);
create index if not exists dev_report_issues_severity_idx on public.dev_report_issues(severity);
create index if not exists dev_report_issues_resolution_idx on public.dev_report_issues(resolution_status);

alter table public.dev_reports enable row level security;
alter table public.dev_report_issues enable row level security;

-- Only users with admin role can read
create policy "admin_read_dev_reports"
  on public.dev_reports for select
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

create policy "admin_read_dev_report_issues"
  on public.dev_report_issues for select
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

-- Admin can update issue resolution status
create policy "admin_update_dev_report_issues"
  on public.dev_report_issues for update
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

-- Admin can update report status (new → reviewed)
create policy "admin_update_dev_reports"
  on public.dev_reports for update
  using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

-- service_role key (GitHub Actions) can insert reports and issues
-- service_role bypasses RLS by default — no explicit policy needed
