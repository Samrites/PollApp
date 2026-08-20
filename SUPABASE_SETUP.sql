-- PollApp Supabase setup
-- Run this once in Supabase Dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.surveys (
  id bigint primary key,
  category text not null,
  title text not null,
  description text not null default '',
  days_left integer not null default 0,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.survey_stats (
  survey_id bigint primary key references public.surveys(id) on delete cascade,
  total_responses integer not null default 0,
  counts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.surveys enable row level security;
alter table public.survey_stats enable row level security;

drop policy if exists "PollApp public surveys read" on public.surveys;
drop policy if exists "PollApp public surveys insert" on public.surveys;
drop policy if exists "PollApp public surveys update" on public.surveys;
drop policy if exists "PollApp public stats read" on public.survey_stats;
drop policy if exists "PollApp public stats insert" on public.survey_stats;
drop policy if exists "PollApp public stats update" on public.survey_stats;

create policy "PollApp public surveys read"
on public.surveys for select to anon, authenticated using (true);

create policy "PollApp public surveys insert"
on public.surveys for insert to anon, authenticated with check (true);

create policy "PollApp public surveys update"
on public.surveys for update to anon, authenticated using (true) with check (true);

create policy "PollApp public stats read"
on public.survey_stats for select to anon, authenticated using (true);

create policy "PollApp public stats insert"
on public.survey_stats for insert to anon, authenticated with check (true);

create policy "PollApp public stats update"
on public.survey_stats for update to anon, authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'surveys'
  ) then
    alter publication supabase_realtime add table public.surveys;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'survey_stats'
  ) then
    alter publication supabase_realtime add table public.survey_stats;
  end if;
end $$;

insert into public.surveys (id, category, title, description, days_left, questions)
values
  (1, 'Team Activities', 'Weekend activity', 'Choose the best day for a team activity.', 1,
   '[{"id":1,"prompt":"Which day works best?","allowMultiple":true,"answers":["Friday","Saturday","Sunday"]}]'::jsonb),
  (2, 'Technology & Innovation', 'JavaScript or Python?', 'A quick technology preference survey.', 7,
   '[{"id":1,"prompt":"Which language do you prefer?","allowMultiple":false,"answers":["JavaScript","Python"]}]'::jsonb),
  (3, 'Education & Learning', 'Past learning survey', 'Example finished survey for the Past Survey tab.', -2,
   '[{"id":1,"prompt":"Which format helped most?","allowMultiple":false,"answers":["Video","Reading","Practice"]}]'::jsonb)
on conflict (id) do nothing;

insert into public.survey_stats (survey_id, total_responses, counts)
values
  (1, 0, '{"1":[0,0,0]}'::jsonb),
  (2, 0, '{"1":[0,0]}'::jsonb),
  (3, 4, '{"1":[1,1,2]}'::jsonb)
on conflict (survey_id) do nothing;
