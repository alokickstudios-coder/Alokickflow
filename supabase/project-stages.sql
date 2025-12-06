-- Project stages for production workflow
-- Stages: translation, dubbing, mixing, subtitling

create table if not exists project_stages (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  stage text not null check (stage in ('translation', 'dubbing', 'mixing', 'subtitling')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  assigned_to uuid references profiles(id) on delete set null,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, stage)
);

-- Basic indexes
create index if not exists idx_project_stages_org on project_stages (organization_id);
create index if not exists idx_project_stages_project on project_stages (project_id);
create index if not exists idx_project_stages_stage on project_stages (stage);

-- RLS is optional here because service role is used in APIs; add minimal safety
alter table project_stages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_stages'
      and policyname = 'Users can view project stages'
  ) then
    create policy "Users can view project stages"
    on project_stages for select
    to authenticated
    using (organization_id = get_user_organization_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_stages'
      and policyname = 'Users can update project stages'
  ) then
    create policy "Users can update project stages"
    on project_stages for update
    to authenticated
    using (organization_id = get_user_organization_id());
  end if;
end $$;


