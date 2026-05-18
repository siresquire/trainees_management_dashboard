-- ── Phase 5: Associate (Whizlabs) support ─────────────────────────────────

-- Seed a default Associate (SAA) curriculum template so initFromTemplate works.
-- Task names here are generic placeholders; the trainer renames them to match
-- their actual Whizlabs lab titles via the Tasks editor.
do $$
declare
  v_tmpl_id uuid;
begin
  -- Only insert if no associate default exists yet
  if not exists (
    select 1 from curriculum_templates where level = 'associate' and is_default = true
  ) then
    insert into curriculum_templates (name, level, platform, is_default)
    values ('Default SAA', 'associate', 'whizlabs', true)
    returning id into v_tmpl_id;

    -- Weeks 1-10, 3-4 labs each (placeholder names — trainer should rename to match Whizlabs)
    insert into template_tasks (template_id, week_number, task_name, task_type, display_order) values
      (v_tmpl_id, 1, 'Introduction to AWS Cloud',                  'lab', 1),
      (v_tmpl_id, 1, 'Launching your first EC2 instance',          'lab', 2),
      (v_tmpl_id, 1, 'AWS Management Console walkthrough',         'lab', 3),
      (v_tmpl_id, 2, 'S3 Storage fundamentals',                    'lab', 1),
      (v_tmpl_id, 2, 'S3 Versioning and lifecycle policies',       'lab', 2),
      (v_tmpl_id, 2, 'IAM Users, Groups and Policies',             'lab', 3),
      (v_tmpl_id, 3, 'VPC and Subnet configuration',               'lab', 1),
      (v_tmpl_id, 3, 'Security Groups and NACLs',                  'lab', 2),
      (v_tmpl_id, 3, 'Internet Gateway and NAT Gateway',           'lab', 3),
      (v_tmpl_id, 4, 'RDS database setup and configuration',       'lab', 1),
      (v_tmpl_id, 4, 'DynamoDB basics',                            'lab', 2),
      (v_tmpl_id, 4, 'ElastiCache overview',                       'lab', 3),
      (v_tmpl_id, 5, 'ELB — Application Load Balancer',            'lab', 1),
      (v_tmpl_id, 5, 'Auto Scaling Groups',                        'lab', 2),
      (v_tmpl_id, 5, 'CloudWatch alarms and dashboards',           'lab', 3),
      (v_tmpl_id, 6, 'Route 53 DNS and routing policies',          'lab', 1),
      (v_tmpl_id, 6, 'CloudFront CDN setup',                       'lab', 2),
      (v_tmpl_id, 6, 'ACM certificates and HTTPS',                 'lab', 3),
      (v_tmpl_id, 7, 'SQS and SNS messaging',                      'lab', 1),
      (v_tmpl_id, 7, 'Lambda functions and triggers',              'lab', 2),
      (v_tmpl_id, 7, 'API Gateway REST API',                       'lab', 3),
      (v_tmpl_id, 8, 'ECS containers and task definitions',        'lab', 1),
      (v_tmpl_id, 8, 'ECR container registry',                     'lab', 2),
      (v_tmpl_id, 8, 'Elastic Beanstalk deployment',               'lab', 3),
      (v_tmpl_id, 9, 'CloudFormation stacks',                      'lab', 1),
      (v_tmpl_id, 9, 'AWS CDK basics',                             'lab', 2),
      (v_tmpl_id, 9, 'CodePipeline and CodeDeploy',                'lab', 3),
      (v_tmpl_id, 10,'AWS Cost Explorer and Budgets',              'lab', 1),
      (v_tmpl_id, 10,'AWS Trusted Advisor',                        'lab', 2),
      (v_tmpl_id, 10,'Well-Architected Framework review',          'lab', 3);
  end if;
end $$;

-- ── Updated leaderboard RPC — level-aware ranking ─────────────────────────
-- Must drop first because we are adding a column to the return type.
drop function if exists get_cohort_leaderboard(uuid);
-- Practitioner (has KCs): ranked by KC avg score (labs as tiebreaker)
-- Associate (no KCs):     ranked by labs completed
create or replace function get_cohort_leaderboard(p_cohort_id uuid)
returns table (
  trainee_id      uuid,
  full_name       text,
  kcs_completed   bigint,
  avg_kc_score    numeric,
  labs_completed  bigint,
  total_lab_tasks bigint,
  rank            bigint
) language plpgsql security definer set search_path = public as $$
declare
  v_kc_task_count bigint;
  v_lab_task_count bigint;
begin
  if not (
    is_super_admin()
    or has_cohort_access(p_cohort_id)
    or exists (select 1 from cohorts c where c.id = p_cohort_id and c.created_by = auth.uid())
    or exists (select 1 from trainees t where t.cohort_id = p_cohort_id and t.user_id = auth.uid())
  ) then
    raise exception 'access denied';
  end if;

  select
    count(*) filter (where task_type = 'kc'),
    count(*) filter (where task_type = 'lab')
  into v_kc_task_count, v_lab_task_count
  from cohort_week_tasks
  where cohort_id = p_cohort_id;

  return query
  with scores as (
    select
      t.id                                                             as trainee_id,
      t.full_name,
      count(c.id) filter (where cwt.task_type = 'kc')                as kcs_completed,
      round(avg(c.score) filter (where cwt.task_type = 'kc'), 1)     as avg_kc_score,
      count(c.id) filter (where cwt.task_type = 'lab')               as labs_completed
    from trainees t
    left join cohort_week_tasks cwt on cwt.cohort_id = t.cohort_id
    left join completions c         on c.trainee_id = t.id and c.task_id = cwt.id
    where t.cohort_id = p_cohort_id
      and t.status    = 'active'
      and t.deleted_at is null
    group by t.id, t.full_name
  )
  select
    s.trainee_id,
    s.full_name,
    s.kcs_completed,
    s.avg_kc_score,
    s.labs_completed,
    v_lab_task_count                                                   as total_lab_tasks,
    rank() over (
      order by
        case
          when v_kc_task_count > 0
          -- Practitioner: KC avg dominates, labs break ties
          then coalesce(s.avg_kc_score, 0) * 10000 + s.labs_completed
          -- Associate: pure lab count
          else s.labs_completed * 10000
        end desc
    )                                                                  as rank
  from scores s
  order by rank, s.full_name;
end;
$$;

grant execute on function get_cohort_leaderboard(uuid) to authenticated;
