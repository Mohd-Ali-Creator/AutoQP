-- ============================================================
-- EXAM PLATFORM — DATABASE SCHEMA
-- Fresh-install script for Supabase / Postgres
-- ============================================================

-- ============================================================
-- ENUM TYPES
-- ============================================================

create type public.user_role as enum ('instructor', 'admin');
create type public.difficulty_level as enum ('easy', 'medium', 'hard');
create type public.staging_source as enum ('ai_generated', 'ocr_extracted', 'manual');
create type public.paper_status as enum ('draft', 'compiled', 'archived');


-- ============================================================
-- 1. PROFILES
-- ============================================================

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        public.user_role not null default 'instructor',
  created_at  timestamptz not null default now()
);


-- ============================================================
-- 2. SUBJECTS
-- ============================================================

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  code        text,
  created_at  timestamptz not null default now()
);


-- ============================================================
-- 3. INSTRUCTOR_SUBJECTS
-- ============================================================

create table public.instructor_subjects (
  instructor_id  uuid not null references public.profiles(id) on delete cascade,
  subject_id     uuid not null references public.subjects(id) on delete cascade,
  primary key (instructor_id, subject_id)
);

create index idx_instructor_subjects_subject
  on public.instructor_subjects (subject_id);


-- ============================================================
-- 4. TOPICS
-- ============================================================

create table public.topics (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  name        text not null,
  unique (subject_id, name),

  -- Required as the referenced key for the composite topic FKs below.
  unique (subject_id, id)
);


-- ============================================================
-- 5. QUESTIONS
-- ============================================================

create table public.questions (
  id                  uuid primary key default gen_random_uuid(),
  subject_id          uuid not null references public.subjects(id) on delete restrict,
  topic_id            uuid,
  type                text not null,
  difficulty          public.difficulty_level not null,
  marks               integer not null check (marks > 0),
  text                text not null,
  image_refs          jsonb not null default '[]',
  type_data           jsonb not null,
  forked_from         uuid references public.questions(id) on delete set null,
  created_by          uuid not null references public.profiles(id),
  last_edited_by      uuid references public.profiles(id),
  version             integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Ensures a question's topic belongs to the same subject.
  -- Deleting the topic clears topic_id but leaves subject_id intact.
  foreign key (subject_id, topic_id)
    references public.topics(subject_id, id)
    on delete set null (topic_id)
);

create index idx_questions_filter
  on public.questions (subject_id, topic_id, difficulty);

create index idx_questions_text_search
  on public.questions using gin (to_tsvector('english', text));


-- ============================================================
-- 6. STAGING_QUESTIONS
-- ============================================================

create table public.staging_questions (
  id                  uuid primary key default gen_random_uuid(),
  subject_id          uuid not null references public.subjects(id) on delete cascade,
  topic_id            uuid,
  type                text,
  difficulty          public.difficulty_level,
  marks               integer check (marks > 0),
  text                text,
  image_refs          jsonb default '[]',
  type_data           jsonb default '{}',
  source              public.staging_source not null,
  confidence_score    numeric,
  raw_ai_output       jsonb,
  created_by          uuid not null references public.profiles(id),
  created_at          timestamptz not null default now(),
  last_edited_by      uuid references public.profiles(id),
  updated_at          timestamptz not null default now(),

  foreign key (subject_id, topic_id)
    references public.topics(subject_id, id)
    on delete set null (topic_id)
);

create index idx_staging_subject
  on public.staging_questions (subject_id);


-- ============================================================
-- 7. PAPERS
-- ============================================================

create table public.papers (
  id                     uuid primary key default gen_random_uuid(),
  subject_id             uuid not null references public.subjects(id) on delete restrict,
  title                  text not null,
  created_by             uuid not null references public.profiles(id),
  total_marks            integer check (total_marks > 0),
  time_limit_minutes     integer check (time_limit_minutes > 0),
  instructions           text,
  layout_preset          text not null default 'standard',
  status                 public.paper_status not null default 'draft',
  compiled_pdf_ref       text,
  compiled_source_ref    text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index idx_papers_subject on public.papers (subject_id);
create index idx_papers_created_by on public.papers (created_by);


-- ============================================================
-- 8. PAPER_SECTIONS
-- ============================================================

create table public.paper_sections (
  id            uuid primary key default gen_random_uuid(),
  paper_id      uuid not null references public.papers(id) on delete cascade,
  name          text not null,
  order_index   integer not null check (order_index >= 0),
  instructions  text,
  unique (paper_id, order_index),

  -- Required as the referenced key for paper_questions.
  unique (id, paper_id)
);

-- The unique (paper_id, order_index) constraint already indexes paper_id.


-- ============================================================
-- 9. PAPER_QUESTIONS
-- ============================================================

create table public.paper_questions (
  id                    uuid primary key default gen_random_uuid(),
  paper_id              uuid not null references public.papers(id) on delete cascade,
  section_id            uuid not null,
  order_index           integer not null,
  marks_used            integer not null check (marks_used > 0),
  source_question_id    uuid references public.questions(id) on delete set null,
  question_snapshot     jsonb not null,
  source_version        integer,
  snapshot_captured_at  timestamptz not null default now(),

  foreign key (section_id, paper_id)
    references public.paper_sections(id, paper_id)
    on delete cascade,

  -- This also provides an index beginning with section_id.
  unique (section_id, order_index)
);

create index idx_paper_questions_paper
  on public.paper_questions (paper_id);


-- ============================================================
-- 10. SECURITY HELPERS
-- Keep security-definer helpers in an unexposed schema.
-- ============================================================

create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'::public.user_role
  );
$$;

create or replace function private.has_subject_access(sub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.instructor_subjects i
    where i.instructor_id = (select auth.uid())
      and i.subject_id = $1
  )
  or private.is_admin();
$$;

grant usage on schema private to authenticated;

revoke all on function private.is_admin()
  from public, anon, authenticated;
revoke all on function private.has_subject_access(uuid)
  from public, anon, authenticated;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.has_subject_access(uuid) to authenticated;


-- ============================================================
-- 11. UPDATE METADATA TRIGGERS
-- ============================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.touch_question_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  new.last_edited_by := auth.uid();
  return new;
end;
$$;

create or replace function public.touch_staging_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.last_edited_by := auth.uid();
  return new;
end;
$$;

create trigger questions_touch_metadata
  before update on public.questions
  for each row execute function public.touch_question_metadata();

create trigger staging_questions_touch_metadata
  before update on public.staging_questions
  for each row execute function public.touch_staging_metadata();

create trigger papers_touch_updated_at
  before update on public.papers
  for each row execute function public.touch_updated_at();


-- ============================================================
-- 12. AUTH PROFILE TRIGGER
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'New user'
    ),
    'instructor'::public.user_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- 13. ENABLE RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.instructor_subjects enable row level security;
alter table public.topics enable row level security;
alter table public.questions enable row level security;
alter table public.staging_questions enable row level security;
alter table public.papers enable row level security;
alter table public.paper_sections enable row level security;
alter table public.paper_questions enable row level security;


-- ============================================================
-- 14. RLS POLICIES
-- ============================================================

-- Profiles: users can read their own profile; admins can read all.
create policy profiles_select
  on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()));

create policy profiles_update
  on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()))
  with check ((select auth.uid()) = id or (select private.is_admin()));


-- Subjects
create policy subjects_select
  on public.subjects
  for select to authenticated
  using ((select private.has_subject_access(id)));

create policy subjects_admin_manage
  on public.subjects
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));


-- Instructor-subject assignments
create policy instructor_subjects_select
  on public.instructor_subjects
  for select to authenticated
  using (instructor_id = (select auth.uid()) or (select private.is_admin()));

create policy instructor_subjects_admin_manage
  on public.instructor_subjects
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));


-- Topics
create policy topics_select
  on public.topics
  for select to authenticated
  using ((select private.has_subject_access(subject_id)));

create policy topics_insert
  on public.topics
  for insert to authenticated
  with check ((select private.has_subject_access(subject_id)));

create policy topics_admin_update
  on public.topics
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy topics_admin_delete
  on public.topics
  for delete to authenticated
  using ((select private.is_admin()));


-- Questions
create policy questions_select
  on public.questions
  for select to authenticated
  using ((select private.has_subject_access(subject_id)));

create policy questions_insert
  on public.questions
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.has_subject_access(subject_id))
  );

create policy questions_update
  on public.questions
  for update to authenticated
  using ((select private.has_subject_access(subject_id)))
  with check ((select private.has_subject_access(subject_id)));

create policy questions_delete
  on public.questions
  for delete to authenticated
  using (
    (select private.is_admin())
    or (
      created_by = (select auth.uid())
      and (select private.has_subject_access(subject_id))
    )
  );


-- Staging questions
create policy staging_questions_select
  on public.staging_questions
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.has_subject_access(subject_id))
  );

create policy staging_questions_insert
  on public.staging_questions
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.has_subject_access(subject_id))
  );

create policy staging_questions_update
  on public.staging_questions
  for update to authenticated
  using (
    (select private.has_subject_access(subject_id))
    or (select private.is_admin())
  )
  with check (
    (select private.has_subject_access(subject_id))
    or (select private.is_admin())
  );

create policy staging_questions_delete
  on public.staging_questions
  for delete to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.is_admin())
  );


-- Papers
create policy papers_select
  on public.papers
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.has_subject_access(subject_id))
  );

create policy papers_insert
  on public.papers
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.has_subject_access(subject_id))
  );

create policy papers_update
  on public.papers
  for update to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.has_subject_access(subject_id))
  )
  with check (
    created_by = (select auth.uid())
    or (select private.has_subject_access(subject_id))
  );

create policy papers_delete
  on public.papers
  for delete to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.is_admin())
  );


-- Paper sections
create policy paper_sections_select
  on public.paper_sections
  for select to authenticated
  using (
    exists (
      select 1
      from public.papers p
      where p.id = paper_sections.paper_id
        and (
          p.created_by = (select auth.uid())
          or (select private.has_subject_access(p.subject_id))
        )
    )
  );

create policy paper_sections_modify
  on public.paper_sections
  for all to authenticated
  using (
    exists (
      select 1
      from public.papers p
      where p.id = paper_sections.paper_id
        and (
          p.created_by = (select auth.uid())
          or (select private.has_subject_access(p.subject_id))
        )
    )
  )
  with check (
    exists (
      select 1
      from public.papers p
      where p.id = paper_sections.paper_id
        and (
          p.created_by = (select auth.uid())
          or (select private.has_subject_access(p.subject_id))
        )
    )
  );


-- Paper questions
create policy paper_questions_select
  on public.paper_questions
  for select to authenticated
  using (
    exists (
      select 1
      from public.papers p
      where p.id = paper_questions.paper_id
        and (
          p.created_by = (select auth.uid())
          or (select private.has_subject_access(p.subject_id))
        )
    )
  );

create policy paper_questions_modify
  on public.paper_questions
  for all to authenticated
  using (
    exists (
      select 1
      from public.papers p
      where p.id = paper_questions.paper_id
        and (
          p.created_by = (select auth.uid())
          or (select private.has_subject_access(p.subject_id))
        )
    )
  )
  with check (
    exists (
      select 1
      from public.papers p
      where p.id = paper_questions.paper_id
        and (
          p.created_by = (select auth.uid())
          or (select private.has_subject_access(p.subject_id))
        )
    )
  );


-- ============================================================
-- 15. GRANTS
-- RLS filters rows; grants determine which operations are possible.
-- ============================================================

grant usage on schema public to authenticated;

grant select on
  public.profiles,
  public.subjects,
  public.instructor_subjects,
  public.topics,
  public.questions,
  public.staging_questions,
  public.papers,
  public.paper_sections,
  public.paper_questions
to authenticated;

-- No client-side profile inserts. Users can update only full_name.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Revoke broad UPDATE grants before issuing column-level grants.
revoke update on
  public.subjects,
  public.instructor_subjects,
  public.topics,
  public.questions,
  public.staging_questions,
  public.papers,
  public.paper_sections,
  public.paper_questions
from authenticated;

grant insert (name, code), delete
  on public.subjects to authenticated;

grant insert (instructor_id, subject_id), delete
  on public.instructor_subjects to authenticated;

grant insert (subject_id, name), delete
  on public.topics to authenticated;
grant update (name)
  on public.topics to authenticated;

grant insert (
  subject_id, topic_id, type, difficulty, marks, text,
  image_refs, type_data, forked_from, created_by
), delete
  on public.questions to authenticated;
grant update (
  topic_id, type, difficulty, marks, text,
  image_refs, type_data, forked_from
)
  on public.questions to authenticated;

grant insert (
  subject_id, topic_id, type, difficulty, marks, text, image_refs,
  type_data, source, confidence_score, raw_ai_output, created_by
), delete
  on public.staging_questions to authenticated;
grant update (
  topic_id, type, difficulty, marks, text, image_refs,
  type_data, confidence_score, raw_ai_output
)
  on public.staging_questions to authenticated;

grant insert (
  subject_id, title, created_by, total_marks, time_limit_minutes,
  instructions, layout_preset, status
), delete
  on public.papers to authenticated;
grant update (
  title, total_marks, time_limit_minutes, instructions,
  layout_preset, status
)
  on public.papers to authenticated;

grant insert (paper_id, name, order_index, instructions), delete
  on public.paper_sections to authenticated;
grant update (name, order_index, instructions)
  on public.paper_sections to authenticated;

grant insert (
  paper_id, section_id, order_index, marks_used,
  source_question_id, question_snapshot, source_version
), delete
  on public.paper_questions to authenticated;
grant update (
  paper_id, section_id, order_index, marks_used,
  source_question_id, question_snapshot, source_version
)
  on public.paper_questions to authenticated;


-- ============================================================
-- 16. STORAGE BUCKETS AND POLICIES
-- ============================================================

insert into storage.buckets (id, name, public)
values
  ('question-images', 'question-images', true),
  ('compiled-papers', 'compiled-papers', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

-- question-images is public for reads. This policy only allows
-- authenticated uploads and checks Storage's current owner_id field.
create policy question_images_auth_upload
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'question-images'
    and owner_id = (select auth.uid()::text)
  );

-- The compile worker should store files at:
-- compiled-papers/<paper-uuid>/<filename>
-- This gives users access only to papers they own or whose subject
-- they are assigned to. Service-role uploads bypass Storage RLS.
create policy compiled_papers_read_authorized_papers
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'compiled-papers'
    and exists (
      select 1
      from public.papers p
      where p.id::text = (storage.foldername(name))[1]
        and (
          p.created_by = (select auth.uid())
          or (select private.has_subject_access(p.subject_id))
        )
    )
  );