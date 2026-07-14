# Changelog

HangOwl uses [semantic versioning](https://semver.org): `MAJOR.MINOR.PATCH`.
The running version is shown in **Settings** (`v0.0.0 · <commit>`), and the app
notifies users when a newer build has been deployed.

## How to cut a release

1. Update this file under a new version heading.
2. Bump the version — this also creates a git tag:
   - `npm run release:patch` — bug fixes
   - `npm run release:minor` — new features (backwards-compatible)
   - `npm run release:major` — breaking changes
3. Push (`git push --follow-tags`). Vercel builds the new version, and the
   build stamps `version` + commit + build time into the bundle and
   `version.json`, so open tabs get the "new version available" prompt.

---

## 0.2.0

- **Accounts** — email/password sign up, sign in, and sign out. Creating a
  hangout now requires an account; guests still join by QR with just a name.
  Signing up upgrades an anonymous guest in place, keeping their data.
- **Named guests** — name people when creating a hangout (or from the Guests
  panel) so they can be assigned spends and billed before they ever join;
  they claim their seat when they scan the QR.
- **Bookmark locations** — add an address / place name / maps link to a
  bookmark; the card shows a tappable pin that opens it in Google Maps.
- **Cleaner recap** — the recap now leads with "Settle up" (who pays whom)
  by default, with an expandable per-person breakdown. Each person is a
  single compact row (name + owes/gets) showing only non-zero contributions,
  replacing the tall three-tile grid per person.
- **Versioning** — visible app version in Settings and an "update available"
  prompt when a new build ships.
- **Fixes** — deposits: the organizer (deposit holder) no longer sees a
  no-op deposit field; the concept is explained instead.
- **Resilience** — the initial Supabase connection retries on a cold start
  instead of failing to an error screen.

## 0.1.0

- Initial release: global bookmarks, hangouts with QR guest join, spend
  tracking with bill photos and partial shares, and a recap that splits the
  bill accounting for partial shares, deposits, and overrides. Light/dark
  themes. Supabase backend, deployed on Vercel.
