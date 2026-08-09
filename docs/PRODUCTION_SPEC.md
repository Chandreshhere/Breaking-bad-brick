# Breaking Bad Brick — Production Spec

Everything needed to take the game from "a client-side web build" to "a
shippable, monetised product on web, App Store and Play Store".

This is written against the **actual codebase**, not a generic template. Field
names, screen names, game states and storage keys below match what is in
`src/` today.

---

## 0. Where the game is today

**Everything is client-side.** There is no server, no account, no sync.

| Concern | Today | Consequence |
|:--|:--|:--|
| Player profile | `localStorage['acb-profile']` | Clearing site data wipes progress. New phone = start over. |
| Settings | `localStorage['acb-settings']` | Same. |
| Score / coins | Computed and stored on the client | Trivially editable in devtools |
| Ads | `PlaceholderRewardedAd` in `src/game/Ads.ts` | Not a real network. Interface is ready. |
| Purchases | None | — |
| Analytics | None | You are blind to why players churn |
| Crash reporting | None | You cannot see failures on devices you don't own |

**What this means:** the current design is *safe* only because the shop is
cosmetic-only and there is no leaderboard. The moment you add either, the
client-authoritative model becomes a problem. Section 8 deals with this.

---

# PART 1 — FRONTEND SCREENS

## 1.1 Screens that exist today

All live in `src/ui/Screens.ts` as HTML/CSS overlays over the canvas.

| Screen | Method | Purpose | Needs backend? |
|:--|:--|:--|:--|
| Intro / title | `showIntro` | PLAY, ARENA picker, SHOP, settings gear, BEST + coin readout | **Yes** — best score, coins, cloud-save status |
| Arena select | `showMapSelect` | Pick one of 6 worlds or AUTO CYCLE | **Yes** — locked/unlocked state |
| Bonuses explainer | `showBonuses` | The 6 power-ups, then START GAME | No |
| Countdown | `setCountdown` | 3-2-1 before serve, and on resume | No |
| Pause | `showPause` | RESUME, settings, MAIN MENU | No |
| Results | `showResults` | Score count-up, NEW BEST / near-miss banner, stats, rewarded continue, REPLAY, MAIN MENU | **Yes** — score submit, best, leaderboard rank |
| Settings | `showSettings` | Music, SFX, screen shake, bloom, rain quality, graphics | **Yes** — settings sync |
| Shop | `showShop` | Ball and paddle skins, coin balance, buy/equip | **Yes** — inventory, purchases |

Game states driving them (`src/game/Game.ts`):
`intro · bonuses · countdown · playing · lifeLost · levelClear · paused · gameOver · win`

## 1.2 Screens still to build

| Screen | Purpose | Priority |
|:--|:--|:--|
| **Consent / privacy gate** | GDPR (UMP) + iOS ATT prompt, on first run in applicable regions | **Blocking for ads** |
| **Sign-in / account** | Anonymous by default; "Link account" via Apple / Google | **Blocking for IAP** |
| **Leaderboard** | Global · Friends · Daily tabs, your rank pinned | High |
| **Daily challenge** | Today's seed, one attempt, your result, countdown to next | High |
| **Missions / challenges** | 3 rotating goals with progress bars and coin rewards | Medium |
| **Store (real money)** | Coin packs, remove-ads, starter bundle | Only if you do IAP |
| **Profile / stats** | Lifetime runs, best per world, total bricks, unlock gallery | Medium |
| **Offline / error state** | "Playing offline — progress will sync" | **Required** — never block play on network |
| **Maintenance / force-update** | Server-driven kill switch for broken builds | High |
| **Data & privacy** | View data, export, **delete account** | **Legally required** |
| **Credits / legal** | Licences, privacy policy, terms links | Required by stores |

## 1.3 Screen rules (non-negotiable)

1. **The game must be fully playable offline.** Every backend call is
   best-effort. A failed request never blocks a run. Queue and retry.
2. **No screen may block on a network call without a timeout** (3s) and a
   working fallback.
3. **Every backend-fed screen needs three states:** loading, loaded, failed.
   The current screens have none of these — they assume synchronous local data.
4. **Consent must precede any ad or analytics call** in regulated regions.

---

# PART 2 — FEATURES

## 2.1 Shipped

- Endless seeded levels — 11 formation templates, deterministic per level
- 8 brick types, 6 power-ups (22% drop), combo ladder to ×5 overdrive
- 6 worlds on a 3-level rotation, each with its own soundtrack
- Boss every 4th level — giant rival character, per-world variants, metal track
- Persistent best score, best level, best combo, coins, owned cosmetics
- Cosmetic shop: 7 ball skins, 6 paddle skins
- Rewarded continue (placeholder ad), one per run
- Adaptive graphics tiers, accessibility (screen shake OFF), portrait support

## 2.2 To build, by value

| Feature | Why | Backend |
|:--|:--|:--|
| **Daily seeded run** | Strongest single retention mechanic; generator is already deterministic | Seed + score submit |
| **Leaderboards** | Competition drives repeat play | Submit + query + anti-cheat |
| **Cloud save** | Protects progress and purchases across devices | Profile sync |
| **Missions** | Direction beyond "bigger number" | Definitions + progress |
| **Arena unlocks** | All 6 worlds are handed over on day one — gating them stretches novelty | Unlock state |
| **Real rewarded ads** | Primary revenue | Ad network + verification |
| **IAP** | Secondary revenue | Receipt validation |
| **Push notifications** | Retention | Token registry + scheduler |
| **Remote config** | Tune without a store release | Config service |

---

# PART 3 — BACKEND ARCHITECTURE

## 3.1 Recommended stack

For a solo/small team shipping to web + both stores:

| Concern | Choice | Why |
|:--|:--|:--|
| Auth | **Firebase Auth** (anonymous → Apple/Google link) | Anonymous-first is essential; stores require Apple sign-in if you offer Google |
| Database | **Firestore** | Per-document security rules, offline cache built in |
| Server logic | **Cloud Functions** | Score validation, receipt validation, leaderboard writes |
| Remote config | **Firebase Remote Config** | Tune drop rates and prices without a release |
| Analytics | **Firebase Analytics** (+ BigQuery export) | Free, integrates with AdMob |
| Crash reporting | **Crashlytics** | |
| Ads | **AdMob** + mediation | Same Google account; fill rates outside US/EU need mediation |
| IAP | **RevenueCat** | Server-side receipt validation across both stores; saves weeks |
| Web hosting | **Vercel** (already there) | |

**Alternative:** PlayFab gives leaderboards, live ops and inventory
out-of-the-box — better if leaderboards are central, heavier to learn.

**Do not build:** your own auth, your own ad mediation, or a custom realtime
game server. This is a single-player game; you need storage and validation.

## 3.2 Environments

`dev` → `staging` → `prod`, separate projects, separate keys. Store builds must
never point at dev. Keep a `FORCE_UPDATE` and `MAINTENANCE` flag in remote
config from day one.

---

# PART 4 — DATA MODELS

## 4.1 Player profile (cloud mirror of `src/game/Progress.ts`)

The local shape today:

```ts
interface Profile {
  bestScore: number;
  bestLevel: number;
  bestCombo: number;
  coins: number;
  runs: number;
  ownedBalls: string[];   // e.g. ['CLASSIC','EMBER']
  ownedPaddles: string[];
  ball: string;           // equipped
  paddle: string;
}
```

Cloud document `players/{uid}`:

```jsonc
{
  "uid": "abc123",
  "createdAt": 1786200000,
  "updatedAt": 1786290000,
  "schemaVersion": 2,

  "displayName": "Player4821",     // generated; profanity-filtered if editable
  "country": "IN",                 // from request, for regional leaderboards

  "stats": {
    "bestScore": 12400,
    "bestLevel": 9,
    "bestCombo": 27,
    "runs": 142,
    "totalBricks": 8210,
    "totalPlaySeconds": 15400,
    "bestPerWorld": { "CLAY": 12400, "NEON": 9800 }
  },

  "wallet": { "coins": 1830, "lifetimeCoinsEarned": 5200 },

  "inventory": {
    "ownedBalls":   ["CLASSIC", "EMBER", "ICE"],
    "ownedPaddles": ["CLASSIC", "CARBON"],
    "equippedBall": "EMBER",
    "equippedPaddle": "CARBON",
    "unlockedWorlds": ["CLAY", "NEON"]
  },

  "entitlements": { "removeAds": false, "premium": false },

  "settings": {                    // mirrors localStorage['acb-settings']
    "musicVolume": 0.7, "sfxVolume": 0.8,
    "screenShake": "FULL",         // FULL | REDUCED | OFF
    "bloom": 0.6,
    "rainQuality": "MEDIUM",       // LOW | MEDIUM | HIGH
    "graphics": "AUTO"             // AUTO | LOW | MEDIUM | HIGH
  },

  "flags": { "consentAds": true, "consentAnalytics": true, "atGdprRegion": true }
}
```

> **`coins` is server-authoritative.** The client may display it and predict
> changes, but only the server may increase it. See §8.

## 4.2 Run record `runs/{runId}`

One per completed run. This is both your leaderboard source and your
anti-cheat evidence.

```jsonc
{
  "runId": "uuid",
  "uid": "abc123",
  "mode": "ENDLESS",               // ENDLESS | DAILY
  "seed": 20260808,                // daily runs use the date seed
  "score": 12400,
  "levelReached": 9,
  "bestCombo": 27,
  "bricksDestroyed": 412,
  "durationSeconds": 480,
  "continuesUsed": 1,              // rewarded-ad continues
  "world": "NEON",
  "clientVersion": "1.2.0",
  "submittedAt": 1786290000,
  "validation": { "status": "VERIFIED", "method": "REPLAY", "score": 0.98 }
}
```

## 4.3 Leaderboard entry `leaderboards/{board}/entries/{uid}`

Boards: `global_alltime`, `global_weekly`, `daily_{YYYYMMDD}`, `friends`.

```jsonc
{ "uid": "abc123", "displayName": "Player4821", "country": "IN",
  "score": 12400, "levelReached": 9, "runId": "uuid",
  "achievedAt": 1786290000, "verified": true }
```

Keep only the player's **best** per board. Write via Cloud Function only.

## 4.4 Daily challenge `dailies/{YYYYMMDD}`

```jsonc
{ "date": "20260809", "seed": 918273645, "startWorld": "HELL",
  "modifiers": { "lives": 1, "dropChance": 0.3 },
  "opensAt": 1786204800, "closesAt": 1786291200 }
```

## 4.5 Missions `missions/{missionId}` + `players/{uid}/missions/{id}`

```jsonc
{ "id": "combo_25", "text": "Reach a ×4 combo",
  "type": "BEST_COMBO", "target": 25, "reward": { "coins": 150 },
  "activeFrom": 1786204800, "activeTo": 1786291200 }
```

## 4.6 Catalogue `catalogue/cosmetics`

Mirror of `src/game/Cosmetics.ts`, served remotely so prices can change
without a release. Client keeps the local table as an offline fallback.

```jsonc
{ "balls": [ { "id": "EMBER", "price": 150 }, { "id": "SOLAR", "price": 1000 } ],
  "paddles": [ { "id": "CARBON", "price": 150 } ],
  "version": 7 }
```

---

# PART 5 — API

REST shapes below; map 1:1 onto Cloud Functions callables if you use Firebase.

All authenticated endpoints take a Firebase ID token in
`Authorization: Bearer <token>`.

## 5.1 Session

| Method | Path | Purpose |
|:--|:--|:--|
| `POST` | `/v1/auth/anonymous` | Create anonymous player, return uid + token |
| `POST` | `/v1/auth/link` | Link Apple/Google to the anonymous uid |
| `GET` | `/v1/bootstrap` | **One call on launch.** Returns profile, remote config, daily, missions, catalogue, force-update flag |

`GET /v1/bootstrap` response:

```jsonc
{
  "player": { /* §4.1 */ },
  "config": { "adsEnabled": true, "dropChance": 0.22, "coinsPer100": 1 },
  "daily": { /* §4.4 */ },
  "missions": [ /* §4.5 */ ],
  "catalogue": { /* §4.6 */ },
  "app": { "minVersion": "1.1.0", "maintenance": false, "message": null },
  "serverTime": 1786290000
}
```

> One bootstrap call keeps cold start fast. Everything after is incremental.

## 5.2 Runs & leaderboards

| Method | Path | Purpose |
|:--|:--|:--|
| `POST` | `/v1/runs` | Submit a finished run. Returns awarded coins, verification status, new best, leaderboard rank |
| `GET` | `/v1/leaderboards/{board}?limit=50&around=me` | Page of entries plus the player's own rank |
| `GET` | `/v1/runs/me?limit=20` | Run history |

`POST /v1/runs` request:

```jsonc
{ "runId": "uuid", "mode": "ENDLESS", "seed": 20260808,
  "score": 12400, "levelReached": 9, "bestCombo": 27,
  "bricksDestroyed": 412, "durationSeconds": 480, "continuesUsed": 1,
  "clientVersion": "1.2.0",
  "checksum": "hmac...",
  "replay": { "inputs": "base64", "steps": 57600 }   // optional; see §8
}
```

Response:

```jsonc
{ "accepted": true, "verification": "VERIFIED",
  "coinsAwarded": 124, "walletCoins": 1954,
  "isBest": true, "previousBest": 11800,
  "ranks": { "global_alltime": 8421, "daily_20260809": 132 } }
```

## 5.3 Economy

| Method | Path | Purpose |
|:--|:--|:--|
| `POST` | `/v1/shop/purchase` | Spend coins on a cosmetic. **Server checks price and balance.** |
| `POST` | `/v1/shop/equip` | Equip an owned cosmetic |
| `POST` | `/v1/ads/reward` | Claim a rewarded-ad payout, verified via SSV (§7) |
| `POST` | `/v1/iap/validate` | Validate a store receipt, grant entitlement/coins |

`POST /v1/shop/purchase`:

```jsonc
// request
{ "kind": "ball", "id": "EMBER", "idempotencyKey": "uuid" }
// response
{ "ok": true, "walletCoins": 1680, "inventory": { /* … */ } }
// failure
{ "ok": false, "reason": "INSUFFICIENT_FUNDS" }   // or ALREADY_OWNED, UNKNOWN_ITEM
```

> **Every mutating call takes an `idempotencyKey`.** Mobile networks retry;
> without it a player is charged twice for one skin.

## 5.4 Profile & compliance

| Method | Path | Purpose |
|:--|:--|:--|
| `PATCH` | `/v1/player/settings` | Sync settings (debounced, ~5s) |
| `PATCH` | `/v1/player/name` | Change display name (profanity filter) |
| `POST` | `/v1/player/consent` | Record ad/analytics consent + timestamp |
| `GET` | `/v1/player/export` | GDPR data export |
| `DELETE` | `/v1/player` | **Account deletion.** Required by Apple and GDPR |
| `POST` | `/v1/push/token` | Register push token |

---

# PART 6 — CLOUD SAVE & CONFLICTS

The client must keep working offline, so conflicts are guaranteed.

**Rules:**

1. **Local is the play surface; cloud is the record.** Never block a run.
2. **Merge, don't overwrite.** Field-level rules:
   - `bestScore`, `bestLevel`, `bestCombo`, `totalBricks` → **max**
   - `runs`, `lifetimeCoinsEarned` → **max** (monotonic counters)
   - `ownedBalls`, `ownedPaddles`, `unlockedWorlds` → **union**
   - `equippedBall`, `equippedPaddle`, `settings` → **last write wins** by `updatedAt`
   - `coins` → **server value wins, always**
3. **Queue mutations offline** in an outbox with idempotency keys; flush on
   reconnect.
4. **Migration on first sign-in:** upload the existing `localStorage`
   profile once, then mark it migrated. Never re-upload — that would let a
   player farm coins by clearing storage.

```ts
// Suggested client seam, sitting next to ProgressStore
interface RemoteProgress {
  bootstrap(): Promise<BootstrapResponse>;
  submitRun(run: RunSubmission): Promise<RunResult>;
  purchase(kind: 'ball' | 'paddle', id: string): Promise<PurchaseResult>;
  syncSettings(s: Settings): void;   // debounced, fire and forget
}
```

`ProgressStore` stays the single source of truth for the UI; the remote layer
reconciles behind it.

---

# PART 7 — ADS

## 7.1 Integration points

The seam already exists — `RewardedAdProvider` in `src/game/Ads.ts`:

```ts
export interface RewardedAdProvider {
  isAvailable(): boolean;
  show(): Promise<'completed' | 'dismissed' | 'unavailable'>;
}
```

Implement it against AdMob (via Capacitor for stores) and hand it to
`Experience`. **Nothing else in the game changes.**

## 7.2 Placements

| Placement | Type | Rule |
|:--|:--|:--|
| Continue run | Rewarded | Once per run (already enforced) |
| Double coins | Rewarded | Offered on the results screen |
| Free skin trial | Rewarded | Try a locked skin for one run |
| Between runs | Interstitial | **Max 1 per 3 runs, never after a first run, never mid-rally** |

## 7.3 Server-side verification (SSV)

Client-reported ad completion is spoofable. AdMob SSV posts to your callback
with a signed payload; grant the reward **there**, not on the client:

```
POST /v1/ads/ssv?ad_network=…&reward_amount=…&user_id=<uid>&signature=…
```

Verify the signature against Google's public keys, then credit the wallet and
let the client poll or receive a push.

## 7.4 Consent

- **EU/UK:** Google UMP consent form before any ad request.
- **iOS:** ATT prompt before IDFA access; ads still serve non-personalised if refused.
- **Under-13:** if you target children, ads must be non-personalised and
  COPPA-compliant. Otherwise age-gate at first run.

---

# PART 8 — ANTI-CHEAT

The honest position: **your scoring is fully client-side**, and coins live in
`localStorage`. Today that only lets someone cheat themselves. A global
leaderboard changes that overnight.

You have a *partial* advantage: the physics is deterministic (fixed `1/120 s`
timestep) and level layouts are seeded. But runs are **not** reproducible
today — five `Math.random()` calls feed serve angle, ball nudges and power-up
drops. See Appendix C. Replay validation needs a seeded PRNG first.

Three tiers, cheapest first:

### Tier 1 — Plausibility checks (do this at minimum)

Cloud Function rejects runs that violate invariants:

- `score ≤ maxTheoretical(levelReached, bestCombo)`
- `bricksDestroyed × 100 ≤ score` and score is consistent with the multipliers
- `durationSeconds ≥ minPlausible(bricksDestroyed)` — bricks take time to reach
- `levelReached` consistent with duration
- Rate limit: N runs per hour per uid
- Client version allow-list

Cheap, catches the lazy 99%.

### Tier 2 — Signed payload

HMAC the run payload with a key delivered at bootstrap. Raises the bar past
"edit the JSON in devtools". Not unbreakable — the key ships to the client —
but combined with Tier 1 it removes casual tampering.

### Tier 3 — Replay validation (for verified leaderboards)

Client uploads the input log (pointer positions per fixed step, serves, dashes).
The server re-runs the **same deterministic simulation headlessly** and compares
the resulting score. Mark only these `verified: true` and show a badge.

- Input log for a 10-minute run at 120Hz ≈ 72k steps; delta-encoded and
  gzipped this is a few hundred KB — acceptable on submit.
- Run it async: accept the score as `PENDING`, verify in a queue, promote or
  drop.

**Recommendation:** ship Tier 1 + 2 with the first leaderboard. Add Tier 3 only
for a "verified" board if cheating becomes visible. Do not put unverified
scores on the same board as verified ones.

---

# PART 9 — ANALYTICS

Without these you cannot tune monetisation. Event names and payloads:

| Event | When | Payload |
|:--|:--|:--|
| `app_open` | Launch | `version, platform, isFirstRun` |
| `run_start` | Serve on level 1 | `mode, world, equippedBall, equippedPaddle` |
| `level_start` | Each level | `level, world, isBoss` |
| `level_clear` | Field cleared | `level, seconds, bestCombo, noMiss` |
| `life_lost` | Ball crosses loss line | `level, score, livesLeft` |
| `run_end` | Game over / quit | `score, levelReached, bestCombo, seconds, continuesUsed` |
| `powerup_collected` | Capsule caught | `type, level` |
| `boss_engaged` / `boss_defeated` | Boss level | `level, world, secondsToKill` |
| `ad_offered` / `ad_started` / `ad_completed` / `ad_dismissed` | Ad flow | `placement` |
| `shop_opened` | Shop | `coins, tab` |
| `item_purchased` | Coin spend | `kind, id, price, coinsAfter` |
| `iap_purchased` | Real money | `sku, priceLocal, currency` |
| `settings_changed` | Settings | `key, value` |
| `quality_downgraded` | AUTO tier steps down | `fromTier, toTier, frameMs` |
| `error` | Caught exception | `message, stack, state` |

**The four numbers that decide whether this makes money:**
D1 retention · D7 retention · ad completion rate · ARPDAU.

**Funnels to build:** install → first run → first level clear → first return;
and results screen → ad offered → ad completed → run continued.

`quality_downgraded` is worth special attention — it tells you which real
devices can't hold frame rate, which no lab test will.

---

# PART 10 — REMOTE CONFIG

Ship these keys from day one so you can tune without a store release
(review takes days).

| Key | Default | Maps to |
|:--|:--|:--|
| `dropChance` | `0.22` | `game.powerups.dropChance` |
| `coinsPer100Points` | `1` | `ProgressStore.finishRun` |
| `livesPerRun` | `3` | `game.rules.lives` |
| `adsEnabled` | `true` | `Experience.ads` |
| `interstitialEveryNRuns` | `3` | — |
| `continuesPerRun` | `1` | `Game.continueUsed` |
| `shopPrices` | catalogue | `Cosmetics.ts` |
| `dailyEnabled` | `false` | — |
| `minClientVersion` | `1.0.0` | force-update gate |
| `maintenanceMode` | `false` | maintenance screen |

Rule: **anything you might want to tune after launch is a remote config key.**
Retro-fitting one costs a release cycle.

---

# PART 11 — SECURITY

**Firestore rules (sketch):**

```
match /players/{uid} {
  allow read:  if request.auth.uid == uid;
  allow write: if false;          // clients never write directly
}
match /leaderboards/{board}/entries/{uid} {
  allow read:  if true;
  allow write: if false;          // Cloud Functions only
}
```

**Non-negotiables:**

- Clients never write `coins`, `inventory`, `entitlements` or leaderboards.
- All mutations go through Cloud Functions with auth + idempotency.
- Rate limit per uid and per IP; reject absurd submission frequencies.
- Never trust `clientVersion`, `country` or timestamps from the client for
  anything that matters — derive server-side.
- Store no PII you don't need. You need none beyond an auth identifier.

---

# PART 12 — MOBILE APP (App Store / Play Store)

The game is a Vite web build, so store builds mean **Capacitor**.

**Work required:**

1. `npm i @capacitor/core @capacitor/cli`, `npx cap init`, add `ios` + `android`
2. Plugins: AdMob, Purchases (RevenueCat), Push, App (deep links), StatusBar,
   SplashScreen
3. Native config: bundle ID, versioning, signing (Apple cert + provisioning,
   Android keystore — **back the keystore up; losing it means you can never
   update the app**)
4. Icons and splash for every density; store screenshots per device class
5. Orientation: portrait-primary (portrait framing is done)
6. Safe areas — already handled in CSS via `env(safe-area-inset-*)`
7. WebGL on low-end Android: test real devices, not just emulators.
   `AdaptiveQuality` already steps down; verify it actually fires
8. App lifecycle: pause the game and mute audio on background
   (`Game.togglePause` + `AudioFx`)
9. Back button on Android must map to pause / menu, never exit mid-run

**Store requirements:**

- Privacy policy URL (public, reachable)
- Data safety form (Play) and privacy nutrition labels (App Store)
- Age rating questionnaire — ads and purchases affect it
- Sign in with Apple **if** you offer any other social sign-in
- Account deletion reachable **in-app** (Apple requirement)

---

# PART 13 — BUILD ORDER

Each milestone is independently shippable.

### M1 — See what's happening (1–2 weeks)
Capacitor wrap · Crashlytics · Analytics · Remote config · force-update gate.
**Ship it.** Measure D1/D7 before building anything else.

### M2 — Legal + ads (1–2 weeks)
Privacy policy · consent (UMP + ATT) · account deletion · AdMob wired into the
existing seam · SSV endpoint. **First revenue.**

### M3 — Identity + cloud save (2 weeks)
Anonymous auth · profile sync with the merge rules in §6 · migration of the
existing local profile · offline outbox.

### M4 — Competition (2–3 weeks)
Run submission with Tier 1 + 2 validation · global and daily leaderboards ·
daily seeded challenge · leaderboard screen.

### M5 — Depth (2–3 weeks)
Missions · arena unlocks · profile/stats screen · push notifications.

### M6 — Real money (2 weeks, only after retention is proven)
RevenueCat · coin packs · remove-ads · receipt validation · restore purchases.

> **Do not reorder M6 earlier.** Monetising a game with unproven retention
> optimises the wrong number, and refunds and 1-star reviews cost more than
> the revenue.

---

# APPENDIX A — Client changes required

| File | Change |
|:--|:--|
| `src/game/Progress.ts` | Add `schemaVersion`, `updatedAt`, dirty-tracking, outbox hooks |
| `src/game/Ads.ts` | Add `AdMobRewardedAd implements RewardedAdProvider` |
| `src/core/Experience.ts` | Inject `RemoteProgress`; call `bootstrap()` on launch |
| `src/game/Game.ts` | Emit analytics at each state transition; return a run payload from `fileRun()` |
| `src/ui/Screens.ts` | Loading/error states; leaderboard, daily, consent, account screens |
| `src/game/Cosmetics.ts` | Accept a remote catalogue overriding local prices |
| `index.html` | CSP, deep links, store meta |

# APPENDIX B — Storage keys today

| Key | Contents | Cloud counterpart |
|:--|:--|:--|
| `acb-settings` | Volumes, shake, bloom, rain, graphics | `players/{uid}.settings` |
| `acb-profile` | Best score/level/combo, coins, runs, inventory | `players/{uid}` |

Both must be preserved and migrated once, never re-migrated.

# APPENDIX C — Determinism audit (prerequisite for replay validation)

**What is already deterministic:**

- Physics: fixed `1/120 s` timestep, accumulator clamped at `0.25 s`
- Level *layout*: seeded from `game.levels.baseSeed`; level N always builds the
  same formation

**What is not.** A run is **not reproducible today.** Seven `Math.random()`
call sites feed gameplay, not just cosmetics:

| Site | Effect on the run |
|:--|:--|
| `Game.ts:510` — serve angle | **Changes the entire run from the first ball** |
| `Game.ts:765` — multiball split angle | Diverges ball paths |
| `Game.ts:840` — ball nudge | Diverges ball paths |
| `Game.ts:289` — combo variant pick | Cosmetic |
| `Powerups.ts:173` — drop roll | Changes which power-ups you get |
| `Powerups.ts:174` — drop type | Changes which power-ups you get |
| `Powerups.ts:186` — capsule bob phase | Cosmetic |

**Consequence:** Tier 3 replay validation (§8) **cannot work** until the five
gameplay sites above are replaced with a seeded PRNG whose seed is generated
at run start and submitted with the run. `MusicEngine.rand()` already
implements a suitable LCG — lift that pattern into a shared `Rng` class,
instantiate one per run, and thread it through `Game` and `PowerupManager`.

Until that refactor lands, **Tier 1 + Tier 2 are the only viable anti-cheat**
(and they are sufficient for a first leaderboard). Budget roughly a day for
the PRNG refactor plus a regression pass, since it touches serve behaviour.
