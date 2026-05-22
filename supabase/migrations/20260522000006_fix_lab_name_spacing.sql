-- Canvas exports two lab names with a space before the parenthetical suffix that
-- the original template tasks were missing.  The name mismatch causes those labs
-- to be silently skipped during Canvas sync (normaliseName strips the numeric ID
-- but leaves the rest of the name unchanged).
--
-- Fix both template_tasks (future inits) and every existing cohort_week_tasks row.

-- 1. Using Auto Scaling in AWS (Linux)  [was AWS(Linux)]
UPDATE template_tasks
SET task_name = '175-[JAWS]-Lab - Using Auto Scaling in AWS (Linux)'
WHERE task_name = '175-[JAWS]-Lab - Using Auto Scaling in AWS(Linux)';

UPDATE cohort_week_tasks
SET task_name = '175-[JAWS]-Lab - Using Auto Scaling in AWS (Linux)'
WHERE task_name = '175-[JAWS]-Lab - Using Auto Scaling in AWS(Linux)';

-- 2. Introduction to Identity and Access Management (IAM)  [was Management(IAM)]
UPDATE template_tasks
SET task_name = '279-[SF]-Lab - Introduction to Identity and Access Management (IAM)'
WHERE task_name = '279-[SF]-Lab - Introduction to Identity and Access Management(IAM)';

UPDATE cohort_week_tasks
SET task_name = '279-[SF]-Lab - Introduction to Identity and Access Management (IAM)'
WHERE task_name = '279-[SF]-Lab - Introduction to Identity and Access Management(IAM)';
