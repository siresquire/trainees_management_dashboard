# Trainees Dashboard — Project Handoff

**Date:** 16 May 2026  
**Stack:** Next.js 16.2.4 · React 19.2.4 · Supabase 2.104.x · TypeScript · Tailwind CSS  
**Local Supabase:** API `http://127.0.0.1:54400` · Studio `http://127.0.0.1:54402` · Mailpit `http://127.0.0.1:54403`

---

## 1. Project Overview

An internal training dashboard for AWS Cloud Engineering trainees at Amalitech (Ghana), replacing manual Excel-based weekly reporting. Trainers manage cohorts; trainees see their own progress. There are two cohort tracks:

| Level | Target Exam | Pass Score |
|-------|------------|------------|
| Practitioner | CCP | 700 / 1000 (70%) |
| Associate | SAA-C03 or DVA-C02 | 720 / 1000 (72%) |
| Professional | SAP-C02 or DOP-C02 | 750 / 1000 (75%) |

---

## 2. Architecture

```
src/
  actions/          # Server Actions (Next.js "use server")
    exams.ts        # All exam/voucher/outcome actions
    quiz-assignments.ts
    ...
  app/
    trainer/cohorts/[id]/
      exams/
        page.tsx          # Server component — fetches all data
        ExamsClient.tsx   # Client component — tabs, forms, mutations
      quizzes/
      tasks/
      attendance/
      whizlabs/
    trainee/
      exams/
        page.tsx              # Server component
        TraineeExamsClient.tsx # Client component (NEW)
      dashboard/
      quizzes/
    superadmin/
    api/
      templates/
        exam-scores/route.ts   # GET → .xlsx score upload template
        vouchers/route.ts      # GET → .xlsx voucher code template
  types/
    database.ts    # Manually maintained Supabase type definitions
  lib/
    supabase/
      server.ts
      client.ts
    toast.ts

supabase/
  migrations/       # All schema changes live here as .sql files
```

> **Important:** This is Next.js 16 (breaking API changes from v13/14). Before writing any Next.js code, read `node_modules/next/dist/docs/`. `params` in page/layout props is now a `Promise<{...}>` — always `await params`.

---

## 3. What Has Been Built (Completed Features)

### 3.1 Core Infrastructure
- Auth (Supabase Auth + `profiles` table with roles: `trainer`, `quiz_creator`, `super_admin`, `trainee`)
- Cohort management (create, edit, status)
- Trainee management (add, soft-delete, CSV import)
- Attendance tracking
- Weekly task / lab tracking
- Whizlabs score tracking
- Role-based routing middleware

### 3.2 Quiz Engine
- Trainers create quizzes via Canvas API sync or manual entry
- Quiz assignments published to exam quizzes
- `publishQuizToExams` stores **raw score** (not percentage) in `exam_scores`; `max_score` on `exam_quizzes` is updated simultaneously — the dashboard then computes `(raw / max_score) * 100`

### 3.3 Exam Tracking — Trainer Side (`/trainer/cohorts/[id]/exams`)
Three tabs:

**Quiz Scores tab**
- Add/delete quizzes (name, focus type, week, date, max score)
- Upload scores via `.xlsx`/`.csv` template (columns: `email`, `score`, optional `name`, `date_taken`)
- Score matrix table: best attempt per trainee per quiz, avg %, eligibility label (Ready / Borderline / Not yet)

**Official Exams tab**
- **Voucher Code Pool**: bulk upload `.xlsx` with `name`, `email`, `voucher_code` columns → codes stay private in `voucher_pool` table until explicitly issued
- **Issue Voucher**: pre-fills voucher code from pool if uploaded; allows manual entry/override; stores code on `vouchers.voucher_code`
- **Add score**: trainer records official exam result (exam type, score, pass/fail, date, attempt #, notes)
- **Edit score (pencil icon)**: opens pre-filled inline form; clears `self_reported` flag on save
- **Readiness toggle (eye icon)**: per-trainee toggle — green eye = trainee can see their readiness banner; grey eye = hidden. Calls `toggleReadiness()` action
- **Self-reported badge**: violet "Self-reported" tag on outcomes submitted by the trainee

**Analytics tab** *(NEW)*
- Summary bar: counts of Very likely / Likely / Borderline / At risk / Unlikely
- Per-trainee table sorted by quiz avg: pass probability label, confidence bar, actual outcome if taken
- 3 insight cards: cohort average, count above threshold, trainees needing most support
- Pass probability logic (vs exam threshold %):
  - `gap >= 15pp` → Very likely (bar 90%)
  - `gap >= 5pp`  → Likely (bar 70%)
  - `gap >= -5pp` → Borderline (bar 50%)
  - `gap >= -15pp`→ At risk (bar 30%)
  - `gap < -15pp` → Unlikely (bar 12%)

### 3.4 Exam Tracking — Trainee Side (`/trainee/exams`)
- Quiz results with rank
- Voucher display: large monospace code box when code is issued
- **Readiness banner**: only shown when `trainee.show_readiness = true` (hidden by default until trainer toggles on)
- **Record Result button**: inline form for self-reporting exam results (`self_reported = true`); exam types filtered to cohort level
- Self-reported outcomes show "Self-reported · pending trainer review" badge with ✕ delete button

---

## 4. What We Are Currently Doing

The session just completed implementing **three linked features** in one pass:

1. **Trainee self-report** — trainees enter their own official exam result from `/trainee/exams`; it appears on the trainer dashboard with a "Self-reported" badge; trainer can edit/overwrite (overwrites clear the flag).

2. **Readiness toggle** — `show_readiness` boolean per trainee on the `trainees` table; trainer flips it via the eye icon in the Official Exams tab; until toggled on, the eligibility banner is completely invisible to the trainee.

3. **Performance Analytics tab** — pass probability prediction per trainee using quiz averages vs the target exam's pass threshold.

All code is written and TypeScript-clean (0 errors on `tsc --noEmit`).

---

## 5. ⚠️ PENDING — Migrations Must Be Applied

Two migration files are written but **not yet applied to the database**. The app will error at runtime until these are run.

### How to apply
1. Start local Supabase (requires Docker Desktop): open a terminal and run `supabase start` from the project root, or start Docker Desktop and ensure Supabase containers are running.
2. Open Supabase Studio: `http://127.0.0.1:54402`
3. Go to **SQL Editor**
4. Run the two files below in order:

---

**Migration 1:** `supabase/migrations/20260512000001_voucher_pool_and_code.sql`

```sql
-- Adds voucher_code to vouchers table + creates voucher_pool staging table
-- (full content is in the file)
```

**What it does:**
- `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS voucher_code text`
- Creates `voucher_pool` table (cohort_id, trainee_id, email, name, voucher_code, is_used, uploaded_by, created_at)
- RLS: staff (trainer/quiz_creator/super_admin) full access; trainees have zero access

---

**Migration 2:** `supabase/migrations/20260512000002_exam_self_report_readiness.sql`

```sql
-- Adds self_reported + show_readiness columns + trainee RLS policies
-- (full content is in the file)
```

**What it does:**
- `ALTER TABLE exam_outcomes ADD COLUMN IF NOT EXISTS self_reported boolean NOT NULL DEFAULT false`
- `ALTER TABLE trainees ADD COLUMN IF NOT EXISTS show_readiness boolean NOT NULL DEFAULT false`
- RLS policy: trainee can INSERT own outcomes (active, non-deleted trainee only)
- RLS policy: trainee can DELETE own self-reported outcomes only

---

## 6. Key Files Changed in This Session

| File | Change |
|------|--------|
| `src/types/database.ts` | Added `self_reported` to `exam_outcomes`; `show_readiness` to `trainees` |
| `src/actions/exams.ts` | Added `toggleReadiness`, `updateOfficialScore`, `submitMyExamResult`, `deleteMyExamResult` |
| `src/app/trainer/cohorts/[id]/exams/page.tsx` | Selects `show_readiness` + `exam_type`; passes to ExamsClient |
| `src/app/trainer/cohorts/[id]/exams/ExamsClient.tsx` | Analytics tab; readiness eye-toggle; edit-outcome form; self-reported badge |
| `src/app/trainee/exams/page.tsx` | Converted to pure server component passing props to client |
| `src/app/trainee/exams/TraineeExamsClient.tsx` | **NEW** — interactive client with record-result form, conditional banner |

---

## 7. What Comes Next (Backlog)

These items have been discussed but not started:

### High priority
- [ ] **Super admin cohort exam type field** — the `cohorts.exam_type` column already exists in the DB, but there is no UI to set it when creating/editing a cohort. The analytics tab falls back to level-based defaults (practitioner→CCP, associate→SAA-C03, professional→SAP-C02) if `exam_type` is null, but setting it explicitly would be more accurate for cohorts that target DVA-C02 or DOP-C02.
- [ ] **Apply pending migrations** (see §5 above) — required before any of the new features work.

### Medium priority
- [ ] **Trainer notification when trainee self-reports** — currently silent. Could add an in-app badge or email via Supabase Edge Function.
- [ ] **Readiness banner bulk toggle** — "Show readiness to all trainees in cohort" button instead of per-trainee.
- [ ] **Analytics export** — download the pass-probability table as CSV/Excel.

### Low priority / nice-to-have
- [ ] **Quiz score trend chart** — line chart per trainee across weeks (recharts or similar).
- [ ] **Trainee result upload proof** — optional screenshot/PDF attachment when self-reporting.

---

## 8. Dev Environment Quick-Start (New Machine)

```bash
# 1. Install dependencies
npm install

# 2. Environment — copy and fill in values
cp .env.example .env.local
# Set: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 3. Start local Supabase (needs Docker Desktop running)
npx supabase start
# Note ports from output — API is usually 54400, Studio 54402

# 4. Apply ALL migrations in Supabase Studio SQL Editor (http://127.0.0.1:54402)
#    Run each file in supabase/migrations/ in filename order

# 5. Start the dev server
npm run dev
# Runs on http://localhost:3000
```

> **Stale cache issue:** If routes give 404 after copying the project, delete the `.next` folder and restart the dev server. Turbopack's dev manifest can get stale.

---

## 9. Database Schema Overview (Key Tables)

```
cohorts          — cohort metadata (level, exam_type, dates, canvas config)
trainees         — trainee records (cohort_id, user_id, show_readiness ← NEW)
profiles         — auth user metadata (role: trainer/trainee/super_admin/quiz_creator)

exam_quizzes     — quiz/test definitions per cohort (max_score, focus_type, week_number)
exam_scores      — raw scores per trainee per quiz (score = raw points, NOT percentage)
exam_outcomes    — official exam results (self_reported ← NEW, outcome, actual_score)
vouchers         — issued vouchers (voucher_code ← added recently)
voucher_pool     — pre-uploaded codes not yet issued (private, trainee has no access) ← NEW

sessions         — training sessions
attendance       — per-session attendance
tasks            — weekly task/lab assignments
quiz_assignments — Canvas quiz → cohort mapping
```

---

*Generated 16 May 2026 — copy this file and the entire project folder to the new machine.*
