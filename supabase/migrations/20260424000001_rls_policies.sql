-- =============================================================
-- Amalitech Trainees Dashboard — Row Level Security Policies
-- =============================================================
-- Helper: get the current user's role from profiles
create or replace function auth_role()
returns user_role language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;

-- Helper: check if user is super_admin
create or replace function is_super_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin')
$$;

-- Helper: check if user has trainer access to a cohort
create or replace function has_cohort_access(p_cohort_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from cohort_access
    where cohort_id = p_cohort_id
      and trainer_id = auth.uid()
  )
$$;

-- Helper: get trainee record for current user
create or replace function my_trainee_id()
returns uuid language sql stable security definer as $$
  select id from trainees where user_id = auth.uid() limit 1
$$;

-- =============================================================
-- Enable RLS on all tables
-- =============================================================
alter table profiles                  enable row level security;
alter table audit_logs                enable row level security;
alter table cohorts                   enable row level security;
alter table cohort_access             enable row level security;
alter table trainees                  enable row level security;
alter table curriculum_templates      enable row level security;
alter table template_tasks            enable row level security;
alter table cohort_week_tasks         enable row level security;
alter table completions               enable row level security;
alter table sessions                  enable row level security;
alter table attendance                enable row level security;
alter table teams_chats               enable row level security;
alter table teams_chat_analysis       enable row level security;
alter table exam_quizzes              enable row level security;
alter table exam_scores               enable row level security;
alter table vouchers                  enable row level security;
alter table exam_outcomes             enable row level security;
alter table devops_phases             enable row level security;
alter table devops_labs               enable row level security;
alter table devops_lab_completions    enable row level security;
alter table devops_projects           enable row level security;
alter table devops_project_submissions enable row level security;
alter table devops_assessments        enable row level security;
alter table devops_phase_reports      enable row level security;
alter table devops_phase_rankings     enable row level security;
alter table devops_outcomes           enable row level security;
alter table question_banks            enable row level security;
alter table questions                 enable row level security;
alter table quiz_assignments          enable row level security;
alter table quiz_attempts             enable row level security;
alter table quiz_answers              enable row level security;
alter table quiz_violations           enable row level security;
alter table quizdesk_organizations    enable row level security;
alter table quizdesk_classes          enable row level security;
alter table quizdesk_students         enable row level security;
alter table usage_limits              enable row level security;
alter table waiver_requests           enable row level security;
alter table prediction_snapshots      enable row level security;
alter table devops_readiness_snapshots enable row level security;
alter table badges                    enable row level security;
alter table trainee_badges            enable row level security;

-- =============================================================
-- PROFILES
-- =============================================================
create policy "profiles: users read own" on profiles
  for select using (id = auth.uid() or is_super_admin());

create policy "profiles: users update own" on profiles
  for update using (id = auth.uid() or is_super_admin());

create policy "profiles: super_admin insert" on profiles
  for insert with check (is_super_admin() or id = auth.uid());

-- =============================================================
-- AUDIT LOGS — insert only, no update/delete by anyone
-- =============================================================
create policy "audit_logs: super_admin read all" on audit_logs
  for select using (is_super_admin());

create policy "audit_logs: service role insert" on audit_logs
  for insert with check (true);

-- No update or delete policies = immutable

-- =============================================================
-- COHORTS
-- =============================================================
create policy "cohorts: trainer reads own and shared" on cohorts
  for select using (
    is_super_admin()
    or created_by = auth.uid()
    or has_cohort_access(id)
  );

create policy "cohorts: trainer creates" on cohorts
  for insert with check (
    auth_role() in ('trainer') and created_by = auth.uid()
    or is_super_admin()
  );

create policy "cohorts: owner or super_admin updates" on cohorts
  for update using (
    created_by = auth.uid() or is_super_admin()
  );

create policy "cohorts: super_admin deletes" on cohorts
  for delete using (is_super_admin());

-- =============================================================
-- COHORT ACCESS
-- =============================================================
create policy "cohort_access: trainer sees own" on cohort_access
  for select using (
    trainer_id = auth.uid()
    or has_cohort_access(cohort_id)
    or is_super_admin()
  );

create policy "cohort_access: cohort owner manages" on cohort_access
  for all using (
    is_super_admin()
    or exists (
      select 1 from cohorts c
      where c.id = cohort_id and c.created_by = auth.uid()
    )
  );

-- =============================================================
-- TRAINEES
-- =============================================================
create policy "trainees: trainer reads cohort trainees" on trainees
  for select using (
    is_super_admin()
    or has_cohort_access(cohort_id)
    or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
    or user_id = auth.uid()                                   -- trainee reads own record
  );

create policy "trainees: trainer inserts" on trainees
  for insert with check (
    is_super_admin()
    or has_cohort_access(cohort_id)
    or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
  );

create policy "trainees: trainer updates" on trainees
  for update using (
    is_super_admin()
    or has_cohort_access(cohort_id)
    or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
  );

-- =============================================================
-- CURRICULUM TEMPLATES
-- =============================================================
create policy "curriculum_templates: all trainers read" on curriculum_templates
  for select using (
    auth_role() in ('trainer') or is_super_admin()
  );

create policy "curriculum_templates: trainer creates" on curriculum_templates
  for insert with check (
    auth_role() in ('trainer') or is_super_admin()
  );

create policy "curriculum_templates: creator or super_admin updates" on curriculum_templates
  for update using (
    created_by = auth.uid() or is_super_admin()
  );

create policy "template_tasks: follow template access" on template_tasks
  for select using (
    is_super_admin()
    or exists (
      select 1 from curriculum_templates t where t.id = template_id
      and (t.created_by = auth.uid() or auth_role() = 'trainer')
    )
  );

create policy "template_tasks: creator manages" on template_tasks
  for all using (
    is_super_admin()
    or exists (
      select 1 from curriculum_templates t where t.id = template_id
      and t.created_by = auth.uid()
    )
  );

-- =============================================================
-- COHORT WEEK TASKS
-- =============================================================
create policy "cohort_week_tasks: cohort access reads" on cohort_week_tasks
  for select using (
    is_super_admin()
    or has_cohort_access(cohort_id)
    or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
    or exists (                                               -- trainee reads own cohort tasks
      select 1 from trainees t
      where t.cohort_id = cohort_id and t.user_id = auth.uid()
    )
  );

create policy "cohort_week_tasks: trainer manages" on cohort_week_tasks
  for all using (
    is_super_admin()
    or has_cohort_access(cohort_id)
    or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
  );

-- =============================================================
-- COMPLETIONS
-- =============================================================
create policy "completions: trainer reads cohort" on completions
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "completions: service and trainer upsert" on completions
  for insert with check (
    is_super_admin()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "completions: trainer updates" on completions
  for update using (
    is_super_admin()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

-- =============================================================
-- SESSIONS & ATTENDANCE
-- =============================================================
create policy "sessions: cohort access reads" on sessions
  for select using (
    is_super_admin()
    or has_cohort_access(cohort_id)
    or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
    or exists (
      select 1 from trainees t where t.cohort_id = cohort_id and t.user_id = auth.uid()
    )
  );

create policy "sessions: trainer manages" on sessions
  for all using (
    is_super_admin()
    or has_cohort_access(cohort_id)
    or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
  );

create policy "attendance: trainer reads" on attendance
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from sessions s
      join cohorts c on c.id = s.cohort_id
      where s.id = session_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "attendance: trainer manages" on attendance
  for all using (
    is_super_admin()
    or exists (
      select 1 from sessions s
      join cohorts c on c.id = s.cohort_id
      where s.id = session_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

-- =============================================================
-- TEAMS CHATS
-- =============================================================
create policy "teams_chats: trainer manages" on teams_chats
  for all using (
    is_super_admin()
    or exists (
      select 1 from sessions s
      join cohorts c on c.id = s.cohort_id
      where s.id = session_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "teams_chat_analysis: trainer reads" on teams_chat_analysis
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from sessions s
      join cohorts c on c.id = s.cohort_id
      where s.id = session_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

-- =============================================================
-- EXAM QUIZZES & SCORES
-- =============================================================
create policy "exam_quizzes: cohort access reads" on exam_quizzes
  for select using (
    is_super_admin()
    or has_cohort_access(cohort_id)
    or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
    or exists (
      select 1 from trainees t where t.cohort_id = cohort_id and t.user_id = auth.uid()
    )
  );

create policy "exam_quizzes: trainer manages" on exam_quizzes
  for all using (
    is_super_admin()
    or has_cohort_access(cohort_id)
    or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
  );

create policy "exam_scores: trainer reads cohort" on exam_scores
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      join exam_quizzes q on q.cohort_id = c.id
      where t.id = trainee_id and q.id = quiz_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "exam_scores: trainer manages" on exam_scores
  for all using (
    is_super_admin()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

-- =============================================================
-- VOUCHERS & EXAM OUTCOMES
-- =============================================================
create policy "vouchers: trainer manages, trainee reads own" on vouchers
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "vouchers: trainer inserts" on vouchers
  for insert with check (
    is_super_admin()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "exam_outcomes: trainer manages, trainee reads own" on exam_outcomes
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "exam_outcomes: trainer manages" on exam_outcomes
  for all using (
    is_super_admin()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

-- =============================================================
-- DEVOPS TABLES (phases follow cohort access pattern)
-- =============================================================
create policy "devops_phases: cohort access" on devops_phases
  for all using (
    is_super_admin()
    or has_cohort_access(cohort_id)
    or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
    or exists (
      select 1 from trainees t where t.cohort_id = cohort_id and t.user_id = auth.uid()
    )
  );

create policy "devops_labs: phase access" on devops_labs
  for all using (
    is_super_admin()
    or exists (
      select 1 from devops_phases p
      join cohorts c on c.id = p.cohort_id
      where p.id = phase_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id)
             or exists (select 1 from trainees t where t.cohort_id = c.id and t.user_id = auth.uid()))
    )
  );

create policy "devops_lab_completions: trainer manages, trainee reads own" on devops_lab_completions
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "devops_lab_completions: trainer manages" on devops_lab_completions
  for all using (
    is_super_admin()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "devops_projects: phase access" on devops_projects
  for all using (
    is_super_admin()
    or exists (
      select 1 from devops_phases p
      join cohorts c on c.id = p.cohort_id
      where p.id = phase_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id)
             or exists (select 1 from trainees t where t.cohort_id = c.id and t.user_id = auth.uid()))
    )
  );

create policy "devops_project_submissions: trainer manages, trainee reads own" on devops_project_submissions
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "devops_project_submissions: trainer manages" on devops_project_submissions
  for all using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "devops_assessments: trainer manages, trainee reads own" on devops_assessments
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "devops_assessments: trainer manages" on devops_assessments
  for all using (
    is_super_admin()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "devops_phase_reports: trainer manages" on devops_phase_reports
  for all using (
    is_super_admin()
    or exists (
      select 1 from devops_phases p
      join cohorts c on c.id = p.cohort_id
      where p.id = phase_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "devops_phase_rankings: trainer manages, trainee reads own" on devops_phase_rankings
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from devops_phase_reports r
      join devops_phases p on p.id = r.phase_id
      join cohorts c on c.id = p.cohort_id
      where r.id = report_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "devops_phase_rankings: trainer manages" on devops_phase_rankings
  for all using (
    is_super_admin()
    or exists (
      select 1 from devops_phase_reports r
      join devops_phases p on p.id = r.phase_id
      join cohorts c on c.id = p.cohort_id
      where r.id = report_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "devops_outcomes: trainer manages, trainee reads own" on devops_outcomes
  for all using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

-- =============================================================
-- QUESTION BANKS & QUESTIONS
-- =============================================================
create policy "question_banks: trainer reads own and public" on question_banks
  for select using (
    is_super_admin()
    or created_by = auth.uid()
    or is_public = true
  );

create policy "question_banks: trainer creates" on question_banks
  for insert with check (
    auth_role() in ('trainer', 'quiz_creator') or is_super_admin()
  );

create policy "question_banks: creator manages" on question_banks
  for all using (
    created_by = auth.uid() or is_super_admin()
  );

create policy "questions: bank access" on questions
  for select using (
    is_super_admin()
    or exists (
      select 1 from question_banks b
      where b.id = bank_id
        and (b.created_by = auth.uid() or b.is_public = true)
    )
  );

create policy "questions: bank creator manages" on questions
  for all using (
    is_super_admin()
    or exists (
      select 1 from question_banks b
      where b.id = bank_id and b.created_by = auth.uid()
    )
  );

-- =============================================================
-- QUIZ ASSIGNMENTS
-- =============================================================
create policy "quiz_assignments: trainer reads own cohort" on quiz_assignments
  for select using (
    is_super_admin()
    or created_by = auth.uid()
    or (cohort_id is not null and (
      has_cohort_access(cohort_id)
      or exists (select 1 from cohorts c where c.id = cohort_id and c.created_by = auth.uid())
      or exists (
        select 1 from trainees t where t.cohort_id = cohort_id and t.user_id = auth.uid()
      )
    ))
    or (quizdesk_class_id is not null and exists (
      select 1 from quizdesk_classes cl
      join quizdesk_organizations o on o.id = cl.org_id
      where cl.id = quizdesk_class_id and o.owner_id = auth.uid()
    ))
  );

create policy "quiz_assignments: trainer manages" on quiz_assignments
  for all using (
    is_super_admin() or created_by = auth.uid()
  );

-- =============================================================
-- QUIZ ATTEMPTS (answer keys never exposed to trainee)
-- =============================================================
create policy "quiz_attempts: trainee reads own" on quiz_attempts
  for select using (
    is_super_admin()
    or (trainee_id = my_trainee_id())
    or exists (
      select 1 from quiz_assignments qa
      join cohorts c on c.id = qa.cohort_id
      where qa.id = assignment_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "quiz_attempts: trainee creates own" on quiz_attempts
  for insert with check (
    trainee_id = my_trainee_id()
    or is_super_admin()
  );

create policy "quiz_attempts: trainee updates own (submit)" on quiz_attempts
  for update using (
    trainee_id = my_trainee_id()
    or is_super_admin()
    or exists (
      select 1 from quiz_assignments qa
      join cohorts c on c.id = qa.cohort_id
      where qa.id = assignment_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "quiz_answers: trainee manages own" on quiz_answers
  for all using (
    is_super_admin()
    or exists (
      select 1 from quiz_attempts a where a.id = attempt_id
        and (a.trainee_id = my_trainee_id()
          or exists (
            select 1 from quiz_assignments qa
            join cohorts c on c.id = qa.cohort_id
            where qa.id = a.assignment_id
              and (c.created_by = auth.uid() or has_cohort_access(c.id))
          ))
    )
  );

create policy "quiz_violations: trainer reads, system inserts" on quiz_violations
  for select using (
    is_super_admin()
    or exists (
      select 1 from quiz_attempts a
      join quiz_assignments qa on qa.id = a.assignment_id
      join cohorts c on c.id = qa.cohort_id
      where a.id = attempt_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "quiz_violations: system inserts" on quiz_violations
  for insert with check (true);

-- =============================================================
-- QUIZDESK
-- =============================================================
create policy "quizdesk_organizations: owner manages" on quizdesk_organizations
  for all using (owner_id = auth.uid() or is_super_admin());

create policy "quizdesk_organizations: super_admin reads all" on quizdesk_organizations
  for select using (is_super_admin() or owner_id = auth.uid());

create policy "quizdesk_classes: owner manages" on quizdesk_classes
  for all using (
    is_super_admin()
    or exists (
      select 1 from quizdesk_organizations o
      where o.id = org_id and o.owner_id = auth.uid()
    )
  );

create policy "quizdesk_students: owner manages, student reads own" on quizdesk_students
  for select using (
    is_super_admin()
    or user_id = auth.uid()
    or exists (
      select 1 from quizdesk_classes cl
      join quizdesk_organizations o on o.id = cl.org_id
      where cl.id = class_id and o.owner_id = auth.uid()
    )
  );

create policy "quizdesk_students: owner manages" on quizdesk_students
  for all using (
    is_super_admin()
    or exists (
      select 1 from quizdesk_classes cl
      join quizdesk_organizations o on o.id = cl.org_id
      where cl.id = class_id and o.owner_id = auth.uid()
    )
  );

-- =============================================================
-- USAGE LIMITS & WAIVERS
-- =============================================================
create policy "usage_limits: super_admin manages" on usage_limits
  for all using (is_super_admin());

create policy "usage_limits: owner reads own" on usage_limits
  for select using (owner_id = auth.uid() or is_super_admin());

create policy "waiver_requests: requester manages own" on waiver_requests
  for all using (requester_id = auth.uid() or is_super_admin());

create policy "waiver_requests: super_admin manages all" on waiver_requests
  for all using (is_super_admin());

-- =============================================================
-- PREDICTIONS
-- =============================================================
create policy "prediction_snapshots: trainer reads cohort, trainee reads own" on prediction_snapshots
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "prediction_snapshots: system inserts" on prediction_snapshots
  for insert with check (is_super_admin() or auth_role() = 'trainer');

create policy "devops_readiness: trainer reads cohort, trainee reads own" on devops_readiness_snapshots
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "devops_readiness_snapshots: system inserts" on devops_readiness_snapshots
  for insert with check (is_super_admin() or auth_role() = 'trainer');

-- =============================================================
-- BADGES
-- =============================================================
create policy "badges: all authenticated read" on badges
  for select using (auth.uid() is not null);

create policy "badges: super_admin manages" on badges
  for all using (is_super_admin());

create policy "trainee_badges: trainee reads own, trainer reads cohort" on trainee_badges
  for select using (
    is_super_admin()
    or trainee_id = my_trainee_id()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );

create policy "trainee_badges: system awards" on trainee_badges
  for insert with check (
    is_super_admin()
    or exists (
      select 1 from trainees t
      join cohorts c on c.id = t.cohort_id
      where t.id = trainee_id
        and (c.created_by = auth.uid() or has_cohort_access(c.id))
    )
  );
