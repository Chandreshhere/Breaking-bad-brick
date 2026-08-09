# Launch status — what's done, what's left

Verified against the repo, not from memory. Anything marked **not built** was
checked and genuinely is not there.

---

## At a glance

| Area | State |
|:--|:--|
| Game | Complete and playable |
| Backend | Built and emulator-verified; **never deployed** |
| Native apps | Both compile; **never signed or installed on a device** |
| Ads | Whole chain built; **cannot serve until the backend is deployed** |
| Analytics / crash reporting | **Not built** |
| Store listings | Not started |

**Nothing is live.** No Firebase project exists, so no function has a URL, so
ad verification has nowhere to call. That single fact orders most of what
follows.

---

## Done

### Game
- 34 phases of gameplay: endless seeded levels, 8 brick types, 6 power-ups,
  combo ladder, 6 worlds, boss fights with a per-world rival character
- Portrait framing solved by fitting the camera to the paddle's real travel
- Persistent best score, near-miss hook, fast retry
- Cosmetic shop, 7 ball skins and 6 paddle skins
- Per-world soundtracks plus a boss metal track, all synthesised

### Backend (built, emulator-verified, not deployed)
- Anonymous auth, one-call bootstrap, cloud save with per-field merge rules
- Server-authoritative wallet: `submitRun` mints, `purchaseCosmetic` spends
- Run validation (Tier 1 plausibility + server-issued ticket)
- Leaderboards: all-time, weekly, daily — verified runs only
- Daily challenge on a UTC-derived shared seed, one attempt
- Consent recording, AdMob SSV with signature verification and replay
  protection, RevenueCat webhook, missions, world-unlock rules
- Data export and full account deletion
- Firestore rules deny every client write

### Native
- Capacitor Android + iOS; both compile (8.7 MB APK, iOS simulator build)
- Portrait locked, background pauses and suspends audio, Android back steps
  through screens instead of quitting a run
- Both AdMob app ids in their native manifests; unit ids per-platform from env

---

## Remaining — things I can build

Ordered by how much they matter for launch.

| # | Item | Why it matters | Size |
|:--|:--|:--|:--|
| 1 | **Analytics** | Not built. Without D1/D7 retention and ad-completion numbers you are tuning blind. The event taxonomy is specced in PRODUCTION_SPEC §9; nothing emits it | M |
| 2 | **Crash/error reporting (Sentry)** | Not built. You cannot see failures on devices you don't own | S |
| 3 | **Remote Config wiring** | `bootstrap` returns *hardcoded* defaults. Until it reads Firebase Remote Config, every tuning change needs a store release | S |
| 4 | **Arena unlock gating in the UI** | The server computes `unlockedWorlds`, the client ignores it — all six worlds are still offered on day one, spending the novelty immediately | S |
| 5 | **Missions UI** | Server evaluates progress and `claimMission` works; there is no screen to see or claim them | M |
| 6 | **RevenueCat client** | Only the webhook exists. No purchase flow, no product fetch, no restore | M |
| 7 | **Push notification client** | Token registry exists server-side; nothing registers or sends | M |
| 8 | **Seeded PRNG refactor** | Five gameplay `Math.random()` calls block replay-based anti-cheat (Appendix C) | S |
| 9 | **App icons and splash art** | Currently Capacitor's default placeholder icons | S |

**Minimum for a credible launch: 1, 2, 3, 4.** The rest can follow real
players. 6 in particular should wait until retention is proven.

---

## Remaining — only you can do

### Accounts and infrastructure
- [ ] Create Firebase projects `bbb-dev`, `bbb-staging`, `bbb-prod`; update
      `.firebaserc`
- [ ] Enable **Anonymous auth** and **Firestore** in each
- [ ] Upgrade to **Blaze** (Functions 2nd gen requires it) and **set a budget
      alert before deploying anything**
- [ ] Register a Web app per project, copy config into the deploy environment
- [ ] Register **App Check**, watch metrics, then enable enforcement

### Ads
- [ ] Deploy functions, then set **server-side verification** on *both*
      rewarded units to
      `https://us-central1-<project-id>.cloudfunctions.net/admobSsv`
- [ ] Set `VITE_ADMOB_REWARDED_ID_ANDROID` / `_IOS` in production only
- [ ] Add the **UMP SDK** for EU consent — the in-game gate blocks ads until
      answered but does not emit the TCF strings networks require

### Store
- [ ] Apple Developer Program ($99/yr) and Google Play Console ($25 once)
- [ ] Android release **keystore** — *back it up permanently; losing it means
      that listing can never be updated again*
- [ ] Apple signing: team, provisioning, App Store Connect record
- [ ] Store screenshots per device class, description, category, age rating
- [ ] **Privacy policy at a public URL** — required by both stores and linked
      from the consent screen
- [ ] Play **Data Safety** form and App Store **privacy labels**
- [ ] Test on real low-end Android hardware

### Decisions
- [ ] Bundle id `com.breakingbadbrick.game` — permanent once published
- [ ] Whether the web build stays live alongside the apps

---

## Critical path

Dependencies, in order. Later steps are genuinely blocked by earlier ones.

```
1. Firebase projects + Blaze + budget alert
        │
        ▼
2. Deploy rules and functions  →  the admobSsv URL now exists
        │
        ├──────────────► 3. SSV callback set on both ad units
        │                        │
        ▼                        ▼
4. Analytics + Sentry       5. Real ad unit ids in prod env
        │                        │
        └────────┬───────────────┘
                 ▼
6. Signing (keystore + Apple), icons, store listings
                 ▼
7. Internal testing track / TestFlight on real devices
                 ▼
8. Production release
```

Two things people get wrong here:

- **Ads cannot be tested end-to-end before step 2.** The reward is granted by
  the SSV callback, and until the function is deployed there is no URL for
  AdMob to call. Test ads will *display* before then; they will not *pay*.
- **Analytics before launch, not after.** Retrofitting means your first
  cohort — the one that tells you whether any of this works — is invisible.

---

## Cost

| | |
|:--|:--|
| Firebase Blaze | Free tier covers early traffic; **set a budget alert** |
| Google Play | $25 one-off |
| Apple Developer | $99/year |
| AdMob / RevenueCat | Free; they take a revenue share |

---

## Known gaps, stated plainly

- **Anti-cheat is Tier 1 + ticket.** A forged score must be internally
  consistent and claimed against a server-issued ticket. It is not proof —
  the simulation runs on the client. Replay validation needs the PRNG
  refactor first.
- **The consent gate is not a CMP.** Honest and blocking, but it does not
  emit TCF strings. EU ad revenue needs UMP.
- **Web will not earn.** AdMob is native-only. The web build shows a
  placeholder and always will unless you add AdSense H5 Games Ads separately.
- **No backend has ever run outside the emulator.** Everything is verified,
  nothing is proven under real latency, cold starts or concurrency.
- **The app has never run on a physical device.** Both platforms compile;
  that is not the same as working, particularly for WebGL on low-end Android.

---

## Suggested next step

Create the Firebase projects and deploy to `dev`. It unblocks the SSV URL,
turns the emulator work into something real, and is the prerequisite for
almost everything else on this page.

While you do that, I can build analytics, Sentry, Remote Config wiring and
arena unlock gating — none of which need your accounts.
