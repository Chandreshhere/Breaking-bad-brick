# Backend — status and setup

Implements **Phases 0–7** of [PRODUCTION_SPEC.md](PRODUCTION_SPEC.md):
Firebase foundation, client abstraction, anonymous auth, bootstrap, cloud
save, run validation, a server-authoritative economy and leaderboards.

The game runs **exactly as before with no backend configured**. That is the
designed fallback, not a degraded mode — see "Offline is the default" below.

---

## What exists

```
functions/                     Cloud Functions (TypeScript, Node 22, 2nd gen)
  src/index.ts                 exports the callables
  src/callable/bootstrap.ts    the single launch call
  src/callable/syncProfile.ts  reconciles a device into the record
  src/callable/runs.ts         startRun ticket + validated submitRun
  src/callable/shop.ts         purchaseCosmetic / equipCosmetic
  src/callable/leaderboard.ts  top-N plus the caller's own rank
  src/domain/leaderboards/     board ids and best-entry writes
  src/domain/runs/validate.ts  Tier 1 plausibility + coin award
  src/domain/economy/          server-held catalogue prices
  src/domain/players/model.ts  authoritative player document
  src/domain/players/merge.ts  the per-field merge rules
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
| 4 — Cloud save + migration | Done |
| 5 — Server-authoritative economy | Done |
| 6 — Run submission + anti-cheat | Done (Tier 1 + ticket) |
| 7 — Leaderboards | Done (daily challenge still to do) |
| 8–12 | Not started |

**The wallet is now server-owned when a backend is configured.** `submitRun`
is the only thing that mints coins and `purchaseCosmetic` the only thing that
spends them; the client displays the balance and never sets it. With no
backend configured the client remains the authority, exactly as before —
`ProgressStore.serverAuthoritative` selects between the two, and it only
flips after the server has answered once and folded this device's history in.

Purchases require connectivity. Offline with a server-owned wallet the shop
refuses and says so, rather than granting an item the server would later take
back.

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
- `bootstrap` creates `players/{uid}` with `coins: 0`
- A local profile carrying `bestScore 7777`, `coins 999999` and a forged
  `SOLAR` skin syncs to: server `bestScore 7777`, `coins 0`,
  `ownedBalls ["CLASSIC"]` — record kept, currency and skin refused, and
  `inventory_claim_rejected` logged on both sides
- The client adopts the server's inventory rather than re-merging its own,
  so a refused item does not survive locally
- A run submits `VERIFIED` with a ticket, `UNVERIFIED` without one (offline
  start), and awards score/100 coins — computed server-side
- Forged runs rejected: `SCORE_EXCEEDS_CEILING`, `COMBO_EXCEEDS_BRICKS`,
  `DURATION_TOO_SHORT`; unauthenticated calls `401`
- Replaying an accepted run pays once (36 coins, not 72)
- A local wallet forged to 500,000 is replaced by the server's balance
- Buying EMBER while claiming `price: 1` charges the real 150 (600 → 450)
- Equipping an unowned item is refused
- Only `VERIFIED` runs rank: an offline run scored, paid 990 coins and
  stayed off the board
- One entry per player, their best: improving 5000 → 20000 moved them to #1
  without growing the board
- Ranks and "you" highlighting correct; weekly board keys to the Monday
- Production build with a `demo-*` config makes **no** network requests
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

**Legacy migration imports nothing forgeable.** Coins are never imported, and
`LEGACY_COSMETIC_IMPORT` in `merge.ts` is **false**: pre-backend inventory
lived in editable localStorage, so honouring those claims would let anyone
grant themselves the whole catalogue by writing one key before first sign-in
— the coin hole wearing a different hat. Only records and settings migrate.
Set it true only if a real player base earned cosmetics on the old build.

**A `demo-*` project id is rejected in production builds.** `.env.local` is
read by `vite build` too, so a developer's emulator config can otherwise ship
to players and point the game at a project that does not exist.

**Sentry, not Crashlytics, for the web build.** Crashlytics targets native
Apple/Android/Flutter/Unity, not browser JS. Store builds can use Crashlytics
for native crashes; the web bundle needs a browser SDK.

---

## Anti-cheat, honestly

Tier 1 (plausibility) and the run ticket are in. Together they mean a forged
score has to be internally consistent — score, bricks, level and duration all
agreeing — rather than just large, and it has to be claimed against a ticket
the server issued and has not seen before.

This does not *prove* a run happened. The simulation is on the client, so it
cannot. Tier 3 (deterministic replay) is the only thing that would, and it is
blocked on the RNG refactor in PRODUCTION_SPEC Appendix C.

Bounds are deliberately generous: a false reject costs a real player their
run and their coins, a false accept costs a leaderboard slot. Ties go to the
player.

## Leaderboards

Two boards: `global_alltime` and a Monday-anchored `global_weekly_YYYYMMDD`.
One entry per player per board, holding their best — a board ranks people,
not attempts, and keeping every run would let one player fill the top ten.

**Only `VERIFIED` runs rank.** A run started offline has no server ticket, so
it cannot be told apart from a fabricated one. It still earns coins, records
and stats; it just does not sit next to runs that can be checked. The player
sees their score either way.

The caller's own rank comes from a `count()` aggregation rather than reading
every row above them, so it costs the same at rank 10 and rank 400,000 —
"where am I" is the question that makes a board motivating, and a top-25 list
alone cannot answer it.

## Next: daily challenge

The remaining half of Phase 7, and the strongest retention feature left. It
needs a gameplay change rather than just a backend one: `LevelDirector` must
accept a server-supplied seed so everyone plays the identical run, plus
one-attempt-per-day enforcement and a `daily_YYYYMMDD` board (the board id
helper already exists).
