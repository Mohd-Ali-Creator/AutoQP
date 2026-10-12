-- ============================================================
-- AUTOQP — DEVELOPMENT SEED DATA
-- Run in Supabase SQL Editor after running schema.sql
-- ============================================================

-- 1. SEED SUBJECTS
insert into public.subjects (id, name, code)
values
  ('11111111-1111-1111-1111-111111111111', 'Computer Science I', 'CS101'),
  ('22222222-2222-2222-2222-222222222222', 'Data Structures & Algorithms', 'CS301')
on conflict (id) do nothing;

-- 2. SEED TOPICS
insert into public.topics (id, subject_id, name)
values
  -- CS101 Topics
  ('aaaaaaaa-0001-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'Variables & Data Types'),
  ('aaaaaaaa-0002-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'Control Flow & Loops'),
  ('aaaaaaaa-0003-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'Functions & Scope'),
  ('aaaaaaaa-0004-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'Arrays & Strings'),

  -- CS301 Topics
  ('bbbbbbbb-0001-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'Asymptotic Analysis & Big-O'),
  ('bbbbbbbb-0002-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'Divide & Conquer Sorting'),
  ('bbbbbbbb-0003-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'Dynamic Programming'),
  ('bbbbbbbb-0004-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'Graph Traversals (BFS/DFS)')
on conflict (id) do nothing;

-- 3. ASSIGN ALL CURRENT PROFILES TO SEED SUBJECTS
-- Automatically assigns any user profile already in the database to CS101 and CS301
-- so you can test immediately without manual SQL joins.
insert into public.instructor_subjects (instructor_id, subject_id)
select p.id, s.id
from public.profiles p
cross join public.subjects s
on conflict do nothing;
