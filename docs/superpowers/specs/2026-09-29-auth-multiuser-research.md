# Multi-User Auth (Google / Apple Sign-In) — Research & Options

**Date:** 2026-09-29
**Status:** Decisions made (2026-09-29) — see §0. Ready to turn into an implementation plan.

## 0. Decisions (locked)

1. **Library:** **Better Auth** (self-hosted in Neon, free, handles Apple secret).
2. **Providers:** **Google at launch; Apple in a follow-up** (defer the $99 Apple
   Developer Program + `.p8` setup). Design the provider layer so adding Apple later
   is drop-in.
3. **Existing entries:** assign `jon`/`genevieve`/`elliot` to **Jon's personal user**
   (created on his first sign-in / seeded). **`entries.owner_id` is NOT NULL** — every
   entry belongs to exactly one user.
4. **Sharing model:** **strictly one owner** per entry. No shared/commissioner view
   for now (can add later).
5. **Klaviyo agent:** requests authenticate with the **trusted service credential**
   (`AGENT_WRITE_TOKEN`) **and** carry an **on-behalf-of user identifier**; the server
   trusts the credential, then scopes the write to that user id. The id alone is NOT
   trusted (spoofing risk).
6. **IDs:** use **ULIDs** for new primary keys (`users`, new `entries`, etc.) —
   time-sortable, index-friendly. Existing seed entry ids (`jon`/`genevieve`/`elliot`,
   referenced by `picks.entry_id`) stay as-is; only newly created ids are ULIDs.

## 1. Where the app is today

- **No users, no auth.** `entries` is a flat, global table (`id TEXT PK, name,
  settings JSONB`), seeded with `jon` / `genevieve` / `elliot`. Anyone who opens
  the site sees and can edit *every* entry.
- **Reads** (`GET /api/*`) are fully public.
- **Writes** are optionally gated by one shared bearer token `AGENT_WRITE_TOKEN`
  (see `src/lib/agent-auth.ts`), used by the Klaviyo automation agent. When unset,
  all writes are public. **This machine-to-machine path must keep working** after
  we add human auth.
- **Stack:** Next.js 15 (App Router) + React 19, **Neon serverless Postgres**
  (`@neondatabase/serverless`), deployed on **Vercel** (daily cron in `vercel.json`).

Adding "multiple users, each tracking their own entries" is really **three** pieces
of work, and only the first is "login":

1. **Authentication** — prove who a visitor is (Google / Apple OIDC).
2. **Data model / multi-tenancy** — attach entries (and picks) to an owner.
3. **Authorization** — every read/write is scoped to the signed-in owner.

The auth library is the easy part. The multi-tenancy + authorization refactor
touches every entry/pick route and the dashboard. That's the bulk of the effort.

## 2. Auth library options

All three support Google + Apple and secure sessions. Trade-offs for *this* app:

### Option A — Better Auth  ⭐ recommended
- TypeScript-native, **runs in our app and stores users in our existing Neon
  Postgres** (no new vendor, no per-user fee, we own the data).
- First-class Google + Apple social providers; **handles the Apple client-secret
  JWT generation** (see §4) so we avoid the 6-month rotation footgun.
- Good fit with the current "own the DB, minimal deps" style of the codebase.
- Cost: free (just our DB). Downside: slightly more wiring than a hosted service;
  we build our own sign-in UI (fine — we already have a strong design system).

### Option B — Auth.js v5 (formerly NextAuth)
- Most widely used; works with Next.js App Router; adapters for Postgres/Neon.
- **Caveats:** v5 is still shipped as `next-auth@beta`; the middleware-runs-on-edge
  vs. DB-adapter-can't-run-on-edge split forces an `auth.config` split that's a
  known source of friction. Env vars renamed (`AUTH_SECRET`, `AUTH_URL`).
- Reasonable, but v5's beta status + edge/adapter friction make it less appealing
  than Better Auth for a fresh integration.

### Option C — Clerk (hosted)
- Fastest to ship: drop-in `<SignIn/>` UI, hosted user management, handles Apple
  secret rotation for us.
- **Downsides:** users live in Clerk (external to our Neon DB — we'd store a
  `clerk_user_id` and reconcile), and it's **paid at scale** (free ~10k MAU, then
  ~$25/mo + $0.02/MAU). For a small pool this is cheap, but it's vendor lock-in and
  data-off-platform for something we could self-host for free.

**Recommendation:** **Better Auth.** It keeps users in our own Neon DB, is free,
is TS-native, and specifically smooths the Apple secret problem. Clerk is the
fallback if you'd rather trade money for shipping speed and never touching auth UI.

## 3. Data model changes (applies to any option)

New tables (Better Auth manages most of these; names illustrative):

- `users` — id, email, name, image, created_at.
- `accounts` — links a user to a provider identity (google/apple), provider tokens.
- `sessions` — server-side session records (if using DB sessions).
- `verification` — for OAuth state / tokens.

Then the app-owned change:

- `entries` gains **`owner_id TEXT REFERENCES users(id)`** (nullable during
  migration, then enforced). Every entries/picks query filters by `owner_id`.
- `pick_overrides` / `picks` inherit scoping through `entry_id` (already FK'd to
  `entries`), so scoping at the `entries` level is enough for reads, but **write
  routes must verify the entry's `owner_id` == session user** before mutating.

**Migrating the existing seed data:** decide what happens to `jon` / `genevieve` /
`elliot`. Options: (a) assign all three to Jon's account on first login; (b) a
one-time "claim this entry" flow; (c) wipe and start fresh. (a) is simplest.

## 4. Google + Apple specifics (the real gotchas)

- **Google:** straightforward — create an OAuth 2.0 Client ID in Google Cloud,
  set authorized redirect URI, drop client id/secret into Vercel env. Low risk.
- **Apple ("Sign in with Apple"):** more involved and has an operational trap:
  - Requires the **Apple Developer Program ($99/year)**.
  - There is no static client secret. You generate an **ES256 JWT signed with a
    `.p8` private key** from the Apple Developer account. **Apple rejects any client
    secret JWT that expires >6 months out.** If you mint a long-lived secret and
    forget it, **every Apple login silently breaks with `invalid_client` after 6
    months** — no warning.
  - **Mitigation:** generate the client-secret JWT **per request** (fast, ES256),
    so there's nothing to rotate. Better Auth and Clerk do this for you; with
    Auth.js you wire it yourself. This is a strong point in Better Auth's favor.

## 5. Security requirements (must-haves)

- **Session cookies:** `httpOnly`, `Secure`, `SameSite=Lax`, signed; short-lived
  with rotation/refresh. Never expose session tokens to client JS.
- **CSRF protection** on state-changing routes (the chosen lib provides this;
  don't hand-roll).
- **`AUTH_SECRET`** and all provider secrets live only in **Vercel env vars**
  (not in the repo). Apple `.p8` stored as an env var / secret, not committed.
- **Authorization on every mutation:** re-check `entry.owner_id === session.userId`
  server-side. Never trust an `entryId` from the client alone.
- **Reconcile `AGENT_WRITE_TOKEN`:** keep it as a *service* credential that bypasses
  the human session gate for the Klaviyo agent, but scope which entries it may write
  (e.g. an agent acts on behalf of a specific owner, or a designated service user).
  Decide this explicitly so automation doesn't become a backdoor to all users' data.
- **HTTPS only** (Vercel default). Set OAuth redirect URIs to the production domain
  + preview/localhost as needed.
- **PII:** we'll now store emails/names — keep it minimal, and note it in any
  privacy copy.

## 6. Rough rollout shape (for the eventual plan)

1. Add auth library + `users/accounts/sessions` tables; wire Google first (easier),
   Apple second.
2. Add `owner_id` to `entries` (nullable), backfill seed rows to Jon.
3. Gate the app behind sign-in; scope all entry/pick reads + writes to the session
   user; add owner checks on mutations.
4. Reconcile the agent token path.
5. Make `owner_id` non-null; add a simple sign-in screen using the existing design
   system; add sign-out + basic account menu (fits nicely in the new nav).

## 7. Open questions for Jon

All resolved — see §0 (Decisions).
