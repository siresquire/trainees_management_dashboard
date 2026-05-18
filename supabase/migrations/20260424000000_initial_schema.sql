-- =============================================================
-- Amalitech Trainees Dashboard â€” Initial Schema
-- =============================================================
-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================================
-- ENUMS
-- =============================================================
create type user_role as enum ('super_admin', 'trainer', 'trainee', 'quiz_creator', 'quiz_taker');
create type cohort_level as enum ('practitioner', 'associate', 'devops');
create type cohort_platform as enum ('canvas', 'whizlabs', 'devops');
create type cohort_type as enum ('university', 'external', 'graduate');
create type trainee_status as enum ('active', 'completed', 'dropped', 'suspended');
create type session_platform as enum ('zoom', 'teams');
create type attendance_status as enum ('present', 'partial', 'brief', 'absent');
create type exam_type as enum ('CCP', 'SAA-C03', 'DVA-C02');
create type exam_outcome as enum ('passed', 'failed', 'pending');
create type devops_outcome as enum ('placed_client', 'hired_fulltime', 'completed_left', 'dropped', 'suspended');
create type devops_recommendation as enum ('proceed', 'watch', 'drop');
create type task_type as enum ('kc', 'lab');
create type quiz_question_type as enum ('mcq', 'multi_select', 'true_false', 'short_answer');
create type quiz_mode as enum ('practice', 'exam');
create type quiz_violation_type as enum ('tab_switch', 'fullscreen_exit', 'blur', 'secondary_monitor', 'eye_away', 'lockout');
create type waiver_status as enum ('pending', 'approved', 'rejected');
create type cohort_access_role as enum ('owner', 'trainer');
create type devops_lab_platform as enum ('kodekloud', 'github', 'other');
create type ghana_region as enum (
  'Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central',
  'Volta', 'Northern', 'Upper East', 'Upper West', 'Brong-Ahafo',
  'Oti', 'Ahafo', 'Bono East', 'North East', 'Savannah', 'Western North'
);

-- =============================================================
-- PROFILES (extends auth.users)
-- =============================================================
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  role         user_role not null default 'trainee',
  avatar_url   text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- =============================================================
-- AUDIT LOG (immutable â€” no update/delete permitted via RLS)
-- =============================================================
create table audit_logs (
  id          bigserial primary key,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text,
  action      text not null,
  target_type text,
  target_id   text,
  metadata    jsonb default '{}',
  ip_address  inet,
  created_at  timestamptz not null default now()
);

-- =============================================================
-- COHORTS
-- =============================================================
create table cohorts (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null,
  level                      cohort_level not null,
  platform                   cohort_platform not null,
  exam_type                  exam_type,
  canvas_course_id           text,
  canvas_api_token_encrypted text,                          -- AES-256 encrypted
  start_date                 date not null,
  training_weeks             integer not null check (training_weeks > 0),
  exam_prep_weeks            integer not null default 2 check (exam_prep_weeks >= 0 and exam_prep_weeks <= 6),
  exam_readiness_threshold   integer not null default 70 check (exam_readiness_threshold between 1 and 100),
  attendance_present_pct     integer not null default 75 check (attendance_present_pct between 1 and 100),
  attendance_partial_pct     integer not null default 50 check (attendance_partial_pct between 1 and 100),
  is_archived                boolean not null default false,
  created_by                 uuid not null references auth.users(id),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint canvas_requires_course_id check (
    platform <> 'canvas' or canvas_course_id is not null
  )
);

-- =============================================================
-- COHORT ACCESS (sharing between trainers)
-- =============================================================
create table cohort_access (
  id          uuid primary key default gen_random_uuid(),
  cohort_id   uuid not null references cohorts(id) on delete cascade,
  trainer_id  uuid not null references auth.users(id) on delete cascade,
  role        cohort_access_role not null default 'trainer',
  invited_by  uuid references auth.users(id),
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (cohort_id, trainer_id)
);

-- =============================================================
-- TRAINEES
-- =============================================================
create table trainees (
  id                  uuid primary key default gen_random_uuid(),
  cohort_id           uuid not null references cohorts(id) on delete cascade,
  full_name           text not null,
  personal_email      text not null,
  amalitech_email     text,                                  -- Associate/DevOps only
  gender              text,
  phone               text,
  cohort_type         cohort_type,
  university          text,
  town                text,
  region              ghana_region,
  serial_no           integer,
  status              trainee_status not null default 'active',
  user_id             uuid references auth.users(id),        -- set when trainee creates account
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (cohort_id, personal_email)
);

-- =============================================================
-- CURRICULUM TEMPLATES (global KC/Lab week mapping)
-- =============================================================
create table curriculum_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  level        cohort_level not null,
  platform     cohort_platform not null,
  is_default   boolean not null default false,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table template_tasks (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references curriculum_templates(id) on delete cascade,
  week_number   integer not null check (week_number >= 0),
  task_name     text not null,
  task_type     task_type not null,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

-- =============================================================
-- COHORT WEEK TASKS (per-cohort, copied from template, editable)
-- =============================================================
create table cohort_week_tasks (
  id                    uuid primary key default gen_random_uuid(),
  cohort_id             uuid not null references cohorts(id) on delete cascade,
  week_number           integer not null check (week_number >= 0),
  task_name             text not null,
  task_type             task_type not null,
  canvas_assignment_id  text,
  display_order         integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- =============================================================
-- COMPLETIONS (KC scores + Lab completions)
-- =============================================================
create table completions (
  id           uuid primary key default gen_random_uuid(),
  trainee_id   uuid not null references trainees(id) on delete cascade,
  task_id      uuid not null references cohort_week_tasks(id) on delete cascade,
  score        numeric(6,2),                                 -- 0-100 for KC, null for lab
  completed_at timestamptz,
  source       text not null default 'canvas',              -- canvas | whizlabs_csv | manual
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (trainee_id, task_id)
);

-- =============================================================
-- SESSIONS (Zoom / Teams meetings)
-- =============================================================
create table sessions (
  id                  uuid primary key default gen_random_uuid(),
  cohort_id           uuid not null references cohorts(id) on delete cascade,
  platform            session_platform not null,
  topic               text not null,
  external_meeting_id text,
  host_email          text,
  total_duration_mins integer not null,
  started_at          timestamptz not null,
  ended_at            timestamptz,
  week_number         integer,
  session_number      integer,
  created_at          timestamptz not null default now()
);

-- =============================================================
-- ATTENDANCE
-- =============================================================
create table attendance (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references sessions(id) on delete cascade,
  trainee_id            uuid not null references trainees(id) on delete cascade,
  duration_mins         integer not null default 0,
  total_session_mins    integer not null default 1,              -- denormalised from sessions for generated col
  attendance_pct        numeric(5,2) generated always as (
    least(duration_mins::numeric / nullif(total_session_mins, 0) * 100, 100)
  ) stored,
  status                attendance_status not null default 'absent',
  created_at            timestamptz not null default now(),
  unique (session_id, trainee_id)
);

-- =============================================================
-- TEAMS CHAT RECORDS (DevOps)
-- =============================================================
create table teams_chats (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  raw_content  text,
  ai_summary   text,
  uploaded_at  timestamptz not null default now()
);

create table teams_chat_analysis (
  id                      uuid primary key default gen_random_uuid(),
  session_id              uuid not null references sessions(id) on delete cascade,
  trainee_id              uuid not null references trainees(id) on delete cascade,
  message_count           integer not null default 0,
  questions_asked         integer not null default 0,
  responses_given         integer not null default 0,
  helped_others           integer not null default 0,
  technical_depth_score   numeric(4,2),                     -- 0-10
  engagement_score        numeric(4,2),                     -- 0-10
  action_items_completed  integer not null default 0,
  analyzed_at             timestamptz not null default now(),
  unique (session_id, trainee_id)
);

-- =============================================================
-- EXAM PREP
-- =============================================================
create table exam_quizzes (
  id              uuid primary key default gen_random_uuid(),
  cohort_id       uuid not null references cohorts(id) on delete cascade,
  quiz_name       text not null,
  source_platform text not null default 'built_in',          -- built_in | google_forms | ms_forms | kahoot | other
  week_number     integer not null,
  quiz_date       date,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create table exam_scores (
  id           uuid primary key default gen_random_uuid(),
  trainee_id   uuid not null references trainees(id) on delete cascade,
  quiz_id      uuid not null references exam_quizzes(id) on delete cascade,
  attempt_no   integer not null default 1,
  score        numeric(6,2) not null check (score >= 0 and score <= 100),
  uploaded_at  timestamptz not null default now(),
  unique (trainee_id, quiz_id, attempt_no)
);

-- =============================================================
-- VOUCHERS & EXAM OUTCOMES
-- =============================================================
create table vouchers (
  id            uuid primary key default gen_random_uuid(),
  trainee_id    uuid not null references trainees(id) on delete cascade,
  exam_type     exam_type not null,
  issued_date   date not null,
  issued_by     uuid references auth.users(id),
  attempt_no    integer not null default 1,
  created_at    timestamptz not null default now()
);

create table exam_outcomes (
  id           uuid primary key default gen_random_uuid(),
  trainee_id   uuid not null references trainees(id) on delete cascade,
  voucher_id   uuid references vouchers(id),
  exam_type    exam_type not null,
  exam_date    date,
  actual_score numeric(6,2),
  outcome      exam_outcome not null default 'pending',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- =============================================================
-- DEVOPS PHASES & LABS
-- =============================================================
create table devops_phases (
  id           uuid primary key default gen_random_uuid(),
  cohort_id    uuid not null references cohorts(id) on delete cascade,
  phase_number integer not null,
  name         text not null,
  start_date   date,
  end_date     date,
  is_completed boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (cohort_id, phase_number)
);

create table devops_labs (
  id           uuid primary key default gen_random_uuid(),
  phase_id     uuid not null references devops_phases(id) on delete cascade,
  lab_name     text not null,
  platform     devops_lab_platform not null default 'kodekloud',
  due_date     date,
  display_order integer not null default 0,
  created_at   timestamptz not null default now()
);

create table devops_lab_completions (
  id              uuid primary key default gen_random_uuid(),
  trainee_id      uuid not null references trainees(id) on delete cascade,
  lab_id          uuid not null references devops_labs(id) on delete cascade,
  score           numeric(6,2),
  completed_at    timestamptz,
  platform_ref    text,                                      -- external ID or URL
  created_at      timestamptz not null default now(),
  unique (trainee_id, lab_id)
);

-- =============================================================
-- DEVOPS PROJECTS
-- =============================================================
create table devops_projects (
  id            uuid primary key default gen_random_uuid(),
  phase_id      uuid not null references devops_phases(id) on delete cascade,
  project_name  text not null,
  description   text,
  due_date      date,
  max_score     numeric(6,2) not null default 100,
  created_at    timestamptz not null default now()
);

create table devops_project_submissions (
  id                uuid primary key default gen_random_uuid(),
  trainee_id        uuid not null references trainees(id) on delete cascade,
  project_id        uuid not null references devops_projects(id) on delete cascade,
  github_url        text,
  quality_score     numeric(6,2),
  timeliness_score  numeric(6,2),
  trainer_notes     text,
  submitted_at      timestamptz,
  reviewed_at       timestamptz,
  reviewed_by       uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  unique (trainee_id, project_id)
);

-- =============================================================
-- DEVOPS TRAINER ASSESSMENTS
-- =============================================================
create table devops_assessments (
  id                   uuid primary key default gen_random_uuid(),
  trainee_id           uuid not null references trainees(id) on delete cascade,
  phase_id             uuid not null references devops_phases(id) on delete cascade,
  technical_score      numeric(4,2) check (technical_score between 0 and 10),
  communication_score  numeric(4,2) check (communication_score between 0 and 10),
  attitude_score       numeric(4,2) check (attitude_score between 0 and 10),
  initiative_score     numeric(4,2) check (initiative_score between 0 and 10),
  overall_notes        text,
  assessed_by          uuid references auth.users(id),
  assessed_at          timestamptz not null default now(),
  unique (trainee_id, phase_id)
);

-- =============================================================
-- DEVOPS PHASE REPORTS
-- =============================================================
create table devops_phase_reports (
  id            uuid primary key default gen_random_uuid(),
  phase_id      uuid not null references devops_phases(id) on delete cascade,
  notes         text,
  generated_by  uuid references auth.users(id),
  generated_at  timestamptz not null default now()
);

create table devops_phase_rankings (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null references devops_phase_reports(id) on delete cascade,
  trainee_id        uuid not null references trainees(id) on delete cascade,
  rank              integer not null,
  composite_score   numeric(6,2),
  recommendation    devops_recommendation not null,
  notes             text,
  unique (report_id, trainee_id)
);

create table devops_outcomes (
  id           uuid primary key default gen_random_uuid(),
  trainee_id   uuid not null references trainees(id) on delete cascade,
  outcome      devops_outcome not null,
  outcome_date date,
  notes        text,
  recorded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

-- =============================================================
-- QUESTION BANKS & QUESTIONS
-- =============================================================
create table question_banks (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  level        cohort_level,
  tags         text[],
  created_by   uuid not null references auth.users(id),
  is_public    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table questions (
  id              uuid primary key default gen_random_uuid(),
  bank_id         uuid not null references question_banks(id) on delete cascade,
  question_text   text not null,
  question_type   quiz_question_type not null,
  option_a        text,
  option_b        text,
  option_c        text,
  option_d        text,
  option_e        text,
  option_f        text,
  correct_answers text[],                                    -- e.g. ['A','C'] for multi-select
  points          numeric(5,2) not null default 1,
  time_seconds    integer,
  explanation     text,                                      -- shown after grading
  display_order   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================
-- QUIZ ASSIGNMENTS (quiz assigned to a cohort or class)
-- =============================================================
create table quiz_assignments (
  id                    uuid primary key default gen_random_uuid(),
  bank_id               uuid not null references question_banks(id),
  cohort_id             uuid references cohorts(id) on delete cascade,
  quizdesk_class_id     uuid,                               -- FK added after QuizDesk tables
  title                 text not null,
  week_number           integer,
  mode                  quiz_mode not null default 'practice',
  questions_per_student integer not null default 10,
  time_limit_mins       integer,
  attempts_allowed      integer not null default 1,
  randomise             boolean not null default true,
  show_results          boolean not null default true,
  show_answers          boolean not null default false,
  open_at               timestamptz,
  close_at              timestamptz,
  -- anti-cheat config
  webcam_required       boolean not null default false,
  eye_away_warn_secs    integer not null default 5,
  strike_limit          integer not null default 3,
  lockout_duration_mins integer not null default 1440,       -- 24 hours default
  created_by            uuid not null references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table quiz_attempts (
  id               uuid primary key default gen_random_uuid(),
  assignment_id    uuid not null references quiz_assignments(id) on delete cascade,
  trainee_id       uuid references trainees(id) on delete cascade,
  quizdesk_student_id uuid,                                 -- FK added after QuizDesk tables
  attempt_no       integer not null default 1,
  mode             quiz_mode not null,
  started_at       timestamptz not null default now(),
  submitted_at     timestamptz,
  auto_score       numeric(6,2),
  manual_score     numeric(6,2),
  final_score      numeric(6,2) generated always as (
    coalesce(manual_score, auto_score)
  ) stored,
  is_locked        boolean not null default false,
  locked_until     timestamptz,
  question_order   uuid[],                                  -- randomised question IDs for this attempt
  created_at       timestamptz not null default now(),
  unique (assignment_id, trainee_id, attempt_no),
  unique (assignment_id, quizdesk_student_id, attempt_no)
);

create table quiz_answers (
  id               uuid primary key default gen_random_uuid(),
  attempt_id       uuid not null references quiz_attempts(id) on delete cascade,
  question_id      uuid not null references questions(id),
  selected_options text[],
  text_answer      text,                                    -- for short_answer type
  is_correct       boolean,
  score_awarded    numeric(5,2),
  graded_by        uuid references auth.users(id),          -- null = auto-graded
  graded_at        timestamptz,
  created_at       timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table quiz_violations (
  id             uuid primary key default gen_random_uuid(),
  attempt_id     uuid not null references quiz_attempts(id) on delete cascade,
  violation_type quiz_violation_type not null,
  strike_no      integer,
  metadata       jsonb default '{}',
  detected_at    timestamptz not null default now()
);

-- =============================================================
-- QUIZDESK â€” STANDALONE MODULE
-- =============================================================
create table quizdesk_organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  institution   text,
  owner_id      uuid not null references auth.users(id),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table quizdesk_classes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references quizdesk_organizations(id) on delete cascade,
  name        text not null,
  description text,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

create table quizdesk_students (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references quizdesk_classes(id) on delete cascade,
  full_name    text not null,
  email        text not null,
  index_number text,
  user_id      uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  unique (class_id, email)
);

-- Wire deferred FKs now that QuizDesk tables exist
alter table quiz_assignments
  add constraint fk_quizdesk_class
  foreign key (quizdesk_class_id) references quizdesk_classes(id) on delete cascade;

alter table quiz_attempts
  add constraint fk_quizdesk_student
  foreign key (quizdesk_student_id) references quizdesk_students(id) on delete cascade;

-- =============================================================
-- USAGE LIMITS & WAIVERS
-- =============================================================
create table usage_limits (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade unique,
  max_quiz_takers     integer not null default 30,
  is_waived           boolean not null default false,
  waived_by           uuid references auth.users(id),
  waived_at           timestamptz,
  notes               text,
  updated_at          timestamptz not null default now()
);

create table waiver_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users(id),
  reason        text not null,
  status        waiver_status not null default 'pending',
  reviewed_by   uuid references auth.users(id),
  reviewed_at   timestamptz,
  reviewer_note text,
  created_at    timestamptz not null default now()
);

-- =============================================================
-- PREDICTION SNAPSHOTS
-- =============================================================
create table prediction_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  trainee_id            uuid not null references trainees(id) on delete cascade,
  snapshot_date         date not null default current_date,
  dropout_risk_score    numeric(5,2),
  dropout_risk_level    text,                               -- low | medium | high
  exam_readiness_score  numeric(5,2),
  predicted_exam_score  numeric(5,2),
  prediction_stage      integer not null default 1,         -- 1=heuristic, 2=regression
  confidence_pct        numeric(5,2),
  model_version         text,
  created_at            timestamptz not null default now()
);

create table devops_readiness_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  trainee_id            uuid not null references trainees(id) on delete cascade,
  snapshot_date         date not null default current_date,
  technical_score       numeric(5,2),
  consistency_score     numeric(5,2),
  professionalism_score numeric(5,2),
  initiative_score      numeric(5,2),
  overall_readiness     numeric(5,2),
  recommendation        text,                               -- ready | needs_more_time | not_recommended
  model_version         text,
  created_at            timestamptz not null default now()
);

-- =============================================================
-- BADGES
-- =============================================================
create table badges (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  icon        text,
  criteria    jsonb not null default '{}'
);

create table trainee_badges (
  id          uuid primary key default gen_random_uuid(),
  trainee_id  uuid not null references trainees(id) on delete cascade,
  badge_id    uuid not null references badges(id),
  awarded_at  timestamptz not null default now(),
  unique (trainee_id, badge_id)
);

-- =============================================================
-- INDEXES
-- =============================================================
create index idx_trainees_cohort_id          on trainees(cohort_id);
create index idx_trainees_personal_email     on trainees(personal_email);
create index idx_trainees_amalitech_email    on trainees(amalitech_email);
create index idx_completions_trainee_id      on completions(trainee_id);
create index idx_completions_task_id         on completions(task_id);
create index idx_cohort_week_tasks_cohort_id on cohort_week_tasks(cohort_id);
create index idx_attendance_session_id       on attendance(session_id);
create index idx_attendance_trainee_id       on attendance(trainee_id);
create index idx_exam_scores_trainee_id      on exam_scores(trainee_id);
create index idx_exam_scores_quiz_id         on exam_scores(quiz_id);
create index idx_quiz_attempts_assignment_id on quiz_attempts(assignment_id);
create index idx_quiz_attempts_trainee_id    on quiz_attempts(trainee_id);
create index idx_quiz_answers_attempt_id     on quiz_answers(attempt_id);
create index idx_quiz_violations_attempt_id  on quiz_violations(attempt_id);
create index idx_audit_logs_actor_id         on audit_logs(actor_id);
create index idx_audit_logs_created_at       on audit_logs(created_at desc);
create index idx_questions_bank_id           on questions(bank_id);
create index idx_prediction_trainee_date     on prediction_snapshots(trainee_id, snapshot_date desc);
create index idx_cohort_access_trainer       on cohort_access(trainer_id);
create index idx_sessions_cohort_id          on sessions(cohort_id);

-- =============================================================
-- UPDATED_AT TRIGGER
-- =============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at           before update on profiles           for each row execute function update_updated_at();
create trigger trg_cohorts_updated_at            before update on cohorts            for each row execute function update_updated_at();
create trigger trg_trainees_updated_at           before update on trainees           for each row execute function update_updated_at();
create trigger trg_curriculum_templates_updated  before update on curriculum_templates for each row execute function update_updated_at();
create trigger trg_cohort_week_tasks_updated     before update on cohort_week_tasks  for each row execute function update_updated_at();
create trigger trg_completions_updated_at        before update on completions        for each row execute function update_updated_at();
create trigger trg_question_banks_updated_at     before update on question_banks     for each row execute function update_updated_at();
create trigger trg_questions_updated_at          before update on questions          for each row execute function update_updated_at();
create trigger trg_quiz_assignments_updated_at   before update on quiz_assignments   for each row execute function update_updated_at();
create trigger trg_usage_limits_updated_at       before update on usage_limits       for each row execute function update_updated_at();
create trigger trg_exam_outcomes_updated_at      before update on exam_outcomes      for each row execute function update_updated_at();
