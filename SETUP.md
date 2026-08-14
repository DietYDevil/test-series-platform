# Test Series Platform — Setup Guide

A secure online test website. Students sign up with **name + phone + password**.
You approve each account. You upload your test files. Students take the tests and
get a full report. Name and phone are **locked after signup**.

**Cost: ₹0 / $0.** Hosting on Vercel (free) + database on Supabase (free tier).

---

## Part 1 — Create the database (Supabase, ~10 minutes)

1. Go to <https://supabase.com> and sign up (free).
2. Click **New project**.
   - Give it a name, e.g. `test-series`.
   - Choose a strong database password (store it safely — you won't need it again).
   - Pick a region close to your students (e.g. `Singapore` for India).
   - Wait ~2 minutes for it to finish creating.
3. In the left sidebar go to **Authentication → Providers**.
   - Find **Phone** and turn it **ON** (do NOT configure an SMS provider).
4. Go to **Authentication → Settings → Auth Settings**.
   - Turn **OFF** "Confirm phone". (This lets students sign up with just phone + password — no SMS needed, no cost.)
   - Set **Site URL** to your website URL (add it after Part 3).
5. In the left sidebar open **SQL Editor → New query**.
   - Paste the **entire** contents of `sql/schema.sql`.
   - Click **Run**.
   - You should see "Success. No rows returned." — that's correct.

> This creates the tables (profiles, tests, results) with strict security rules.
> Students can never change their own name/phone; only you (admin) can approve users.

## Part 2 — Connect the app (2 minutes)

1. In Supabase go to **Project Settings → API**.
2. Copy the **Project URL** (like `https://abc123xyz.supabase.co`).
3. Copy the **anon public** key (long `eyJ...` string).
4. Open `js/config.js` and paste both values in place of the placeholders.
   Also set your institute name in `APP_NAME` and your country code in
   `DEFAULT_COUNTRY_CODE` (default `+91`).

## Part 3 — Deploy to Vercel (free, ~5 minutes)

**Option A — easiest (drag & drop):**
1. Go to <https://vercel.com> and sign up (free, with GitHub).
2. Click **New Project → Dashboard → New Project**.
3. Upload the whole `testseries` folder (the ZIP or drag the folder).
4. Vercel detects a plain static site. Click **Deploy**.
5. After it finishes you get a URL like `https://test-series.vercel.app`.

**Option B — via GitHub (recommended, auto-updates on every change):**
1. Create a repository on GitHub and push this `testseries` folder.
2. In Vercel click **Add New → Project → Import** your repo.
3. No build command needed (static site). Deploy.
4. Every time you `git push`, the site updates automatically.

After deploying, copy your Vercel URL back into Supabase
**Authentication → Settings → Site URL**.

## Part 4 — Create your admin account (the important step!)

1. Open your website URL.
2. Go to the **Sign Up** tab.
3. Enter **your** name, phone number, and a password.
4. Submit. **Because you are the very first account, you automatically become
   the ADMIN.** (This only works for the first ever account — so sign yourself
   up before giving the site to anyone else.)
5. You will be taken to the **Admin Panel**.

If someone else already signed up before you (or you messed up), run this in the
Supabase SQL Editor to promote yourself:
```sql
update public.profiles set role = 'admin', approved = true
where phone = 'your_phone_with_country_code';
```

## Part 5 — Upload your first test

1. In the **Admin Panel → Tests** tab, click the upload zone and choose your
   existing test file, e.g.
   `PHYSICS_THERMODYNAMICS_CLASS_TEST_10-08-2026.html`.
   The app automatically extracts the questions from it.
2. Check the title/duration, and choose **"Visible to all approved students"**
   (or uncheck it and use **Assign Users** to restrict it to specific students).
3. Click **Save Test**.

Your students will now see this test on their dashboard after you approve them.

## Part 6 — Approve students

1. **Admin Panel → Users** shows everyone who signed up.
2. Click **Approve** next to each student. They can then log in and take tests.
3. Use **Revoke** to remove access, or **Remove** to delete the student.

## Everyday use

- **Add a test:** Admin → Tests → upload your HTML/JSON file → Save.
- **See who attempted what:** Admin → Results → pick a test.
- **Let a student retake a test:** Admin → Results → **Reset** their attempt.
- **Your students:** they sign up (pending), you approve, they see available
  tests and get detailed reports (correct/incorrect, time, topper comparison,
  PDF / Markdown / HTML export).

---

## Security notes (important to know)

- The site only works over HTTPS and every table is protected by database-level
  security. Strangers cannot see your tests or students.
- Like your original HTML file, the questions (including correct answers) are
  loaded into the student's browser so they can be graded instantly. A determined
  student can always inspect the page source. If you need hard anti-cheating
  (server-side grading, question shuffling, per-student question sets), the paid
  tier of a real test platform is required. The free setup already prevents:
  shared-password leakage (each student has their own account), name/phone
  tampering, and unauthorized access.
- The Supabase free tier is generous: 2 projects, 500 MB database — fine for a
  few thousand students.

## Project structure

```
testseries/
  index.html       main app (login, dashboards, test, admin)
  css/styles.css   styling
  js/config.js     <-- fill in Supabase URL + key here
  js/app.js        auth, dashboard, admin panel
  js/test.js       the test engine (timer, calculator, grading, reports)
  sql/schema.sql   <-- run this once in Supabase SQL Editor
  vercel.json      Vercel hosting config
```