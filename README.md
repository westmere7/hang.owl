# 🦉 HangOwl

Plan hangouts, save places, split the bill.

HangOwl is a mobile-first (fully desktop-friendly) web app for teams that travel and eat together:

- **Bookmarks** — a global, team-wide list of places to visit / eat / drink / do. Paste a link and HangOwl auto-fills the title + thumbnail.
- **Hangouts** — a trip or a dining night. Rename it, set dates, expected guests and currency. Guests join by scanning the hangout's **QR code**; first-timers are asked for their name once (cached in a cookie), no accounts, no passwords.
- **Spend** — log who paid for what (stay, eat & drink, transport, activity, misc), when, with an optional **bill photo**, and choose *who shares each spend* — full share, half share (e.g. skipped the drinks), or skip.
- **Recap** — everyone's final share, accounting for **partial shares**, **deposits** (money handed to the organizer up front) and **manual share overrides** (someone generously covers more), plus a minimal list of "who pays whom" transfers.
- The organizer (whoever created the hangout) controls what guests may add or edit.
- Light/dark/system theme, clean purple-and-orange UI.

**Stack:** React + Vite + TypeScript + Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, Edge Functions) · Vercel · GitHub Actions keep-alive cron.

---

## 1. Supabase setup

1. Create a project at [database.new](https://database.new).
2. **Enable anonymous sign-ins**: Dashboard → *Authentication → Sign In / Up → Anonymous sign-ins* → ON.
   (HangOwl has no login screens — every device silently gets an anonymous session, and people are identified by the name they type once.)
3. Run the schema: Dashboard → *SQL Editor* → paste and run
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   This creates all tables, row-level-security policies and the public `bills` storage bucket.
4. *(Optional but recommended)* Deploy the link-preview Edge Function so bookmark auto-fill works reliably:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase functions deploy link-preview --no-verify-jwt
   ```

   Without it, the app falls back to the public microlink.io API (rate-limited).

## 2. Run locally

```bash
cp .env.example .env   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

The URL and anon key live under Dashboard → *Settings → API*.

## 3. Deploy on Vercel

1. Push this repo to GitHub (GitHub is the source of truth; no CI commits anything back).
2. In Vercel: **Add New Project** → import the repo. Vite is auto-detected
   (`npm run build`, output `dist/`; SPA rewrites are in [`vercel.json`](vercel.json)).
3. Add the two environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. QR codes embed the deployed origin automatically.

## 4. Keep-alive cron (free-tier pause prevention)

Free Supabase projects pause after ~7 days of inactivity.
[`.github/workflows/supabase-keepalive.yml`](.github/workflows/supabase-keepalive.yml)
pings the REST API every 3 days.

In the GitHub repo: *Settings → Secrets and variables → Actions* → add:

| Secret | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | the anon public key |

You can test it from the *Actions* tab via **Run workflow**.

---

## How the money math works

For each spend, the amount is divided among its participants **proportionally to
their weights** (1 = full share, ½ = half share, 2 = double, skip = excluded).

In the recap, for every member:

```
balance = final share − deposit − amount they fronted
```

- **Deposits** are treated as cash handed to the *organizer*, so the organizer's
  balance absorbs everyone else's deposits (the totals always sum to zero).
- **Overrides** pin a member's share to a fixed amount; the difference is
  redistributed across the non-overridden members proportionally to their
  computed shares.
- Positive balance → they still owe money; negative → they get money back.
  "Settle up" lists a minimal set of transfers.

## Permissions

The hangout admin can always do everything. Per-hangout toggles control whether guests can:

- add spendings,
- edit *anyone's* spendings (their own entries are always editable),
- add/edit bookmarks,
- edit recap adjustments (deposits & overrides).

These are enforced **in the database** (RLS policies mirror the flags), not just in the UI.

## Project layout

```
src/
  components/        UI primitives, layout, bookmark & hangout components
  components/hangout/  Bookmarks / Spend / Recap tabs, QR + settings modals
  context/           app-wide state (anonymous session, profile, theme)
  lib/               supabase client, split math, link preview, permissions
  pages/             Home, Bookmarks, Hangout, Join (QR landing), setup screen
supabase/
  migrations/        full schema + RLS
  functions/         link-preview edge function
.github/workflows/   Supabase keep-alive cron
```
