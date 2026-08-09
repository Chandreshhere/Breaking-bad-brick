# Backend — status and setup

Implements **Phases 0–11** of [PRODUCTION_SPEC.md](PRODUCTION_SPEC.md):
Firebase foundation, client abstraction, anonymous auth, bootstrap, cloud
save, run validation, a server-authoritative economy, leaderboards, the
daily challenge, consent, verified ad rewards, missions, purchases and
account deletion.

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
  src/domain/dailies/          date-derived seed + one-attempt tracking
  src/callable/consent.ts      records the consent choice with a timestamp
  src/callable/missions.ts     claims a completed mission's reward
  src/callable/privacy.ts      export + full account deletion
  src/callable/push.ts         device token registry
  src/http/admobSsv.ts         AdMob signature check + one-time reward grant
  src/http/revenuecatWebhook.ts  entitlements from verified purchases
  src/domain/missions/         mission definitions + world unlock rules
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
| 7 — Leaderboards + daily | Done |
| 8 — Consent + verified ad rewards | Done (needs your AdMob ids) |
| 9 — Missions, unlocks, push | Done |
| 10 — IAP / RevenueCat | Webhook done (needs your products) |
| 11 — Privacy, export, deletion | Done |
| 12 — Release hardening | Checklist below |

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
- Two players get the identical daily seed; a second attempt is blocked;
  daily scores land on `daily_YYYYMMDD` and never on the endless boards
- SSV rejects a tampered `reward_amount`, a tampered `user_id`, a signature
  from the wrong key and an unknown key id; accepts a valid one
- The same ad transaction pays 25 then 0 — replays are worthless
- A mission claims once (150 coins), then `ALREADY_CLAIMED`
- Worlds unlock from the validated best level (level 8 → CLAY, NEON, HELL)
- The RevenueCat webhook returns `401` without the shared secret
- Deletion removes the player, runs, subcollections and leaderboard entry,
  and scrubs the uid from the ad ledger while keeping the transaction
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

## Daily challenge

One run, one seed, everyone on the identical layout — a score only means
something when the other scores came from the same game.

The seed is **derived from the UTC date**, not written by a scheduled job. A
cron that must run before anyone can play is a single point of failure across
timezones; deriving it means the challenge exists the moment the date rolls
over, everywhere, with nothing to babysit. UTC specifically, so nobody gets a
second attempt by changing timezone.

`LevelDirector.setSeedOverride` swaps the generator's base seed, and the
override is cleared on the way back to the menu so a daily layout can never
leak into endless play. Daily scores go only to `daily_YYYYMMDD`; mixing a
fixed-layout run into the endless boards would compare different games.

## Ads, and what is still missing

The whole chain is built: a consent gate, a consent-gated provider, a
Capacitor-ready `AdMobRewardedAd`, and an SSV endpoint that verifies Google's
signature and grants the reward exactly once.

**The reward is never granted by the client.** `show()` only reports that the
ad finished; the coins arrive when AdMob calls `admobSsv`. A client that
grants its own reward can grant itself infinite rewards.

### AdMob setup

Publisher ID `pub-4951837849307649` exists. A publisher account alone cannot
serve ads — inventory hangs off an **app** and an **ad unit** inside it.

1. **Apps → Add app.** One entry per platform: Android and iOS are separate
   apps with separate ids. Answer "is it listed on a store?" honestly; you can
   add the store listing later.
2. **Ad units → Add ad unit → Rewarded.** Name it something like
   `rewarded_continue`. Copy the unit id (`ca-app-pub-…/…`, with a slash) and
   the app id (`ca-app-pub-…~…`, with a tilde).
3. **On that ad unit → Server-side verification**, set the callback to your
   deployed function:
   `https://us-central1-<project-id>.cloudfunctions.net/admobSsv`
4. Put the ids in the deploy environment as `VITE_ADMOB_APP_ID` and
   `VITE_ADMOB_REWARDED_ID`.

**Leave them blank until you are ready to go live.** With no ids the game uses
Google's published test units, which always fill and never earn. Testing
against real units is the classic way to lose an AdMob account: Google cannot
distinguish your testing from click fraud, and the suspension applies to the
whole account, not one app. `AdConfig` also refuses real ids in a dev build
for the same reason.

Still outstanding:
- **Capacitor**, since AdMob rewarded video is native-only. On web the
  provider reports unavailable and the placeholder stands in.
- The consent gate here is deliberately simple. EU store traffic needs
  Google's **UMP SDK**, which produces the TCF strings ad networks require —
  this gate is honest about the choice but does not emit those.

## Purchases

`revenuecatWebhook` verifies the shared secret from Secret Manager, grants
entitlements and coin packs once per event id, and revokes on cancellation,
expiry or refund. Consumable coins are not clawed back on refund — that
creates negative balances; store policy handles abuse instead.

Needs from you: RevenueCat products matching the ids in the webhook, and
`firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET`.

## Privacy

`exportPlayer` returns everything held; `deletePlayer` removes the player
document, subcollections, run history, leaderboard identity and the auth
user, then scrubs the uid from the ad ledger — the transaction id stays so
replay protection survives a delete-and-recreate, the person does not.

Deletion is reachable in-app from the consent screen, which both stores
require for any app that creates an account, including an automatic
anonymous one.

## Phase 12 — before you ship

- [ ] Create `bbb-dev` / `bbb-staging` / `bbb-prod`, update `.firebaserc`
- [ ] Enable Anonymous auth + Firestore in each
- [ ] `npm run deploy:rules:dev` then `deploy:functions:dev`
- [ ] Set a **billing budget alert** (Functions 2nd gen needs Blaze)
- [ ] Register App Check, watch metrics, then enable enforcement
      (`checkAppAttestation(req, true)`)
- [ ] Publish a privacy policy URL and link it from the consent screen
- [ ] Add Sentry for browser errors (Crashlytics is native-only)
- [ ] Capacitor wrap, then AdMob + UMP + ATT
- [ ] Seed `catalogue/cosmetics` if you want prices tunable without a deploy
- [ ] Replace the five gameplay `Math.random()` calls with a seeded PRNG
      before attempting replay validation (PRODUCTION_SPEC Appendix C)
