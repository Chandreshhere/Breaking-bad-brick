# Backend — status and setup

Implements **Phases 0–3** of [PRODUCTION_SPEC.md](PRODUCTION_SPEC.md):
Firebase foundation, client abstraction, anonymous auth and bootstrap.

The game runs **exactly as before with no backend configured**. That is the
designed fallback, not a degraded mode — see "Offline is the default" below.

---

## What exists

```
functions/                     Cloud Functions (TypeScript, Node 22, 2nd gen)
  src/index.ts                 exports the callables
  src/callable/bootstrap.ts    the single launch call
  src/domain/players/model.ts  authoritative player document
  src/security/                auth · idempotency · rateLimit · validation
  src/utils/                   firestore · errors · logging

src/backend/                   the only client code that knows Firebase exists
  FirebaseClient.ts            lazy, optional SDK init + emulator wiring
  AuthService.ts               anonymous sign-in
  BackendApi.ts                callable wrappers, all fail-soft
  Outbox.ts                    IndexedDB queue for offline mutations
  RemoteProgress.ts            the seam injected into Experience
  BackendTypes.ts              shared shapes, no Firebase imports

firestore.rules                default deny; clients never write
firestore.indexes.json         leaderboard + run history indexes
firebase.json / .firebaserc    emulators and the dev/staging/prod projects
```

| Phase | State |
|:--|:--|
| 0 — Audit | Done |
| 1 — Firebase foundation | Done |
| 2 — Client abstraction | Done |
| 3 — Anonymous auth + bootstrap | Done |
| 4 — Cloud save + migration | **Not started** |
| 5 — Server-authoritative economy | Not started |
| 6 — Run submission + anti-cheat | Not started |
| 7 — Leaderboards + daily | Not started |
| 8–12 | Not started |

**Nothing yet writes to the cloud.** `bootstrap` creates and reads the player
document; local `ProgressStore` is still the only thing that persists
progress. Phase 4 reconciles them.

---

## Offline is the default

Three independent guards, so a backend problem can never cost a run:

1. **Unconfigured → disabled.** No `VITE_FIREBASE_*` values means
   `RemoteProgress.enabled === false` and the SDK is never imported.
2. **Lazy-loaded.** Firebase is behind a dynamic `import()`, so it is
   code-split. Verified: the SDK adds **0 bytes** to the main chunk and the
   abstraction adds ~5.8 kB (787.3 kB → 793.1 kB).
3. **Fail-soft.** `bootstrap()` has a 3 s timeout and returns `null` on any
   failure. `Experience.startBackend()` is never awaited.

---

## Run it locally

```bash
npm install
npm --prefix functions install

npm run emulators        # auth + firestore + functions on demo-bbb
npm run dev:emulator     # game pointed at the emulators
```

`demo-` project ids run fully offline and never touch real Firebase.

Emulator UI: <http://127.0.0.1:4000>

**Expected on launch:** one console line —
`[backend] bootstrap ok {uid: …, serverBest: 0, localBest: …}` — and one
document in Firestore under `players/`. Reloading reuses the same uid.

### Verified

- Anonymous sign-in returns a durable uid, stable across reloads
- `bootstrap` creates `players/{uid}` with the Phase-4 schema, `coins: 0`
- No console errors; no Firebase requests at all when unconfigured

---

## What you must do in the consoles

I cannot create these — they need your Google account.

### Firebase (three separate projects)

Create `bbb-dev`, `bbb-staging`, `bbb-prod`, then update `.firebaserc` with
the real ids. **Never point a dev build at prod.**

For each project:

1. **Authentication** → enable **Anonymous**. (Apple/Google later, for linking.)
2. **Firestore** → create in Native mode, pick a region close to your players.
3. **Project settings → General** → register a **Web app**, copy the config
   into `.env.local` (see `.env.example`).
4. **App Check** → register the web app with reCAPTCHA Enterprise. Leave
   enforcement **off**; watch the metrics first (`checkAppAttestation` is
   already monitor-only in code).
5. **Analytics** → enable, and link BigQuery for retention queries.

Then deploy the rules so the default-deny takes effect:

```bash
npm run deploy:rules:dev
npm run deploy:functions:dev
```

### Billing

Cloud Functions 2nd gen requires the **Blaze** plan. Set a **budget alert**
before you deploy anything.

---

## Decisions worth knowing

**Callables, not REST.** Firebase verifies the auth token and App Check
attestation before our code runs, so there is no hand-written auth
middleware. Plain HTTP is reserved for inbound webhooks (AdMob SSV,
RevenueCat) in later phases.

**No `/auth/anonymous` endpoint.** Firebase Auth already owns anonymous
identity and later linking; reimplementing it would mean owning token
rotation and revocation for no gain.

**Coins are server-authoritative from day one.** The player document
separates `wallet` from everything the client may influence, and
`firestore.rules` denies all client writes. This is the field that must never
become client-owned, because retro-fitting authority after launch means
either resetting balances or honouring forged ones.

**Legacy coin migration is deliberately not implemented.** The existing
`localStorage['acb-profile']` is editable, so uploading its balance would let
anyone mint currency by setting `coins` before first sign-in. Phase 4 must
migrate best score / levels / cosmetics and start the wallet from a
server-controlled amount. **If the game has not publicly launched, migrate no
coins at all.**

**Sentry, not Crashlytics, for the web build.** Crashlytics targets native
Apple/Android/Flutter/Unity, not browser JS. Store builds can use Crashlytics
for native crashes; the web bundle needs a browser SDK.

---

## Next: Phase 4

Cloud save and the offline outbox. It must implement the merge rules in
[PRODUCTION_SPEC.md §6](PRODUCTION_SPEC.md) — `max` for bests, `union` for
inventory, last-write-wins for equipment and settings, and **server always
wins for coins** — plus the one-time legacy migration with the coin policy
above.
