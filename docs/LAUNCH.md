# Launch status — what's done, what's left

Verified against the repo, not from memory. Anything marked **not built** was
checked and genuinely is not there.

---

## At a glance

| Area | State |
|:--|:--|
| Game | Complete and playable |
| Backend | Built and emulator-verified; **never deployed** |
| Backend hosting | Ported to a plain Node server for Render — Blaze no longer needed |
| Native apps | Both compile; **never signed or installed on a device** |
| Ads | Whole chain built; **cannot pay out until the API is deployed** |
| Analytics / crash reporting | Built; analytics live, crash reporting needs one `npm i` |
| Store listings | Not started |

**Nothing is live.** No API has a public URL yet, so ad verification has
nowhere to call. That single fact still orders most of what follows.

---

## Done

### Game
- 34 phases of gameplay: endless seeded levels, 8 brick types, 6 power-ups,
  combo ladder, 6 worlds, boss fights with a per-world rival character
- Portrait framing solved by fitting the camera to the paddle's real travel
- Persistent best score, near-miss hook, fast retry
- Cosmetic shop, 7 ball skins and 6 paddle skins
- Per-world soundtracks plus a boss metal track, all synthesised
- **Arena unlock gating** — locked worlds render with their level requirement
  and refuse the tap, resolved from the union of local progress and the
  server's grant so offline players still earn them

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
- **Remote Config** resolved server-side with a 5-minute cache, a 1.5s
  timeout and every value range-clamped; `bootstrap` and `submitRun` read the
  same resolution so the advertised payout and the paid one cannot diverge

### Hosting — three targets, one app
`src/app.ts` builds the API as an ordinary Express app; three thin entry
points serve it, and only their last few lines differ:

| Entry point | Target | Notes |
|:--|:--|:--|
| `src/index.ts` | Cloud Functions | Needs the paid Blaze plan |
| `src/server.ts` | Node process (Render, Fly, VPS) | `render.yaml` included |
| `src/lambda.ts` | **AWS Lambda + Function URL** | `template.yaml` (SAM) included |

- `onCall` already returns an Express handler that speaks the callable
  protocol, so every callable, security check and line of domain logic is
  shared rather than forked
- Client picks the host with one variable, `VITE_BACKEND_URL` — no code change
- **Firebase Blaze is not required.** Firestore, Auth, App Check and Remote
  Config are all free on Spark; Functions was the only paid part
- Both the server and the Lambda handler are smoke-tested against the
  emulators: health, an unauthenticated callable, 404 and CORS preflight all
  behave identically
- See [AWS.md](AWS.md) or [RENDER.md](RENDER.md)

### Instrumentation
- **Analytics**: the full PRODUCTION_SPEC §9 taxonomy as a typed event map,
  consent-gated, buffered across cold start, no-op without a sink. Wired at
  every state transition, the whole ad funnel, the shop, and quality
  downgrades
- **Crash reporting**: global handlers always installed, Sentry upload gated
  on a DSN, duplicate messages reported once per session

### Native
- Capacitor Android + iOS; both compile
- Portrait locked, background pauses and suspends audio, Android back steps
  through screens instead of quitting a run
- Both AdMob app ids in their native manifests; unit ids per-platform from env
- **UMP + ATT**: Google's certified CMP runs first on store builds and
  replaces the in-house dialog there; ATT follows it on iOS; the privacy
  screen carries the mandatory reopen entry point
- **App icons and splash screens** drawn and generated across all densities
  (`npm run assets` regenerates them)
- **Android release signing** from a gitignored `keystore.properties`;
  `npm run android:bundle` produces the AAB
- **iOS**: Google's 50 SKAdNetwork ids, `ITSAppUsesNonExemptEncryption`,
  `armv7` → `arm64`

### Fixed along the way
- Plugin imports hid their specifier in a variable, so the bundler left a bare
  module name in the output that a WebView cannot resolve at runtime. Every
  Capacitor plugin silently failed to load on device: **no rewarded ads at
  all**, no Android back button, no background pause. Now imported literally

---

## Remaining — things I can build

| # | Item | Why it matters | Size |
|:--|:--|:--|:--|
| 1 | **Missions UI** | Server evaluates progress and `claimMission` works; there is no screen to see or claim them | M |
| 2 | **RevenueCat client** | Only the webhook exists. No purchase flow, no product fetch, no restore | M |
| 3 | **Push notification client** | Token registry exists server-side; nothing registers or sends | M |
| 4 | **Seeded PRNG refactor** | Five gameplay `Math.random()` calls block replay-based anti-cheat (Appendix C) | S |

None of these block a launch. 2 in particular should wait until retention is
proven.

---

## Resolved: the repo had to move off exFAT

`/Volumes/Moon` is exFAT, which cannot store the metadata macOS wants, so
macOS writes an AppleDouble companion beside every directory created on it —
and Gradle's resource parser dies on the `._drawable` inside its own
intermediates. Deleting them does not help; the build recreates them as it
goes.

**The working copy is now `~/Breaking-bad-brick`.** Both builds succeed there:
`assembleDebug` produces a 15.7 MB APK and `bundleRelease` a 12.4 MB
`app-release.aab`. The copy on `/Volumes/Moon` is stale — do not work from it.

---

## Remaining — only you can do

### Firebase (free plan, no card required)
- [ ] Enable **Anonymous auth** and **Firestore** on `breaking-bad-bricks`
- [ ] `firebase deploy --only firestore:rules,firestore:indexes`
- [ ] Register a Web app, copy the config into `.env.local`
- [ ] Configure **Firestore TTL policies** on `runTickets` and `idempotency`,
      or those collections grow until they eat the 1 GiB free quota
- [ ] Register **App Check**, watch metrics, then enable enforcement

### Hosting (AWS Lambda — chosen)
- [ ] Generate a service-account key (Project settings → Service accounts)
- [ ] `brew install aws-sam-cli`, `aws configure`
- [ ] **Set an AWS Budgets alert first** — Lambda is usage-billed with no cap
- [ ] `cd functions && npm run aws:deploy`
- [ ] Set `VITE_BACKEND_URL` to the printed Function URL

### Ads
- [ ] Set **server-side verification** on *both* rewarded units to
      `<VITE_BACKEND_URL>/admobSsv`
- [ ] Set `VITE_ADMOB_REWARDED_ID_ANDROID` / `_IOS` in production only
- [ ] Host `app-ads.txt` at the root of the developer domain you list

### Instrumentation
- [ ] `npm i @sentry/browser`, set `VITE_SENTRY_DSN`, and change the indirect
      import in `Crash.ts` to a literal one (the comment says so)
- [ ] Set `VITE_FIREBASE_MEASUREMENT_ID` for web analytics
- [ ] Optionally `npm i @capacitor-firebase/analytics` for native attribution
      — **only after** the two Firebase config files exist, or iOS aborts at
      launch

### Store
- [ ] Apple Developer Program ($99/yr) and Google Play Console ($25 once)
- [ ] Android release **keystore** — *back it up permanently; losing it means
      that listing can never be updated again*
- [ ] Apple signing: team, provisioning, App Store Connect record
- [ ] Fill the three placeholders in `public/privacy.html`, host it, and set
      `VITE_PRIVACY_POLICY_URL`
- [ ] Store screenshots per device class, description, category, age rating
- [ ] Play **Data Safety** form and App Store **privacy labels**
- [ ] Test on real low-end Android hardware

---

## Critical path

```
1. Firebase: enable Auth + Firestore, deploy rules      (free)
        │
        ▼
2. Service account  →  deploy to Lambda  →  the admobSsv URL now exists
        │
        ├──────────────► 3. SSV callback set on both ad units
        │                        │
        ▼                        ▼
4. VITE_BACKEND_URL         5. Real ad unit ids in prod env
   + Sentry DSN                  │
        └────────┬───────────────┘
                 ▼
6. Keystore + Apple signing, store listings, privacy policy hosted
                 ▼
7. Internal testing track / TestFlight on real devices
                 ▼
8. Production release
```

**Ads still cannot be tested end-to-end before step 2.** The reward is granted
by the SSV callback; until the service is deployed there is no URL for AdMob
to call. Test ads will *display* before then; they will not *pay*.

---

## Cost

| | |
|:--|:--|
| Firebase Spark | Free. 50k Firestore reads/day, 20k writes/day, 1 GiB |
| AWS Lambda | 1M requests + 400k GB-s/month free; no sleeping |
| Google Play | $25 one-off |
| Apple Developer | $99/year |
| AdMob / RevenueCat | Free; they take a revenue share |

---

## Known gaps, stated plainly

- **Lambda is usage-billed with no hard cap**, like Blaze. A Budgets alert
  notifies; it does not stop spend. Set one before deploying.
- The client's 8s/25s/45s launch retries were added for a host that sleeps.
  They are harmless on Lambda and worth keeping — they also cover a transient
  network failure.
- **Firestore's free quotas are a real ceiling** — roughly 12,000 launches a
  day on reads. Watch Usage in the console before it bites.
- **Anti-cheat is Tier 1 + ticket.** A forged score must be internally
  consistent and claimed against a server-issued ticket. It is not proof —
  the simulation runs on the client. Replay validation needs the PRNG
  refactor first.
- **Web will not earn.** AdMob is native-only. The web build shows a
  placeholder and always will unless you add AdSense H5 Games Ads separately.
- **Nothing has run outside the emulator.** Both the Express server and the
  Lambda handler are smoke-tested locally against synthetic requests; neither
  has served a real client under real latency. The SAM template has not been
  deployed — there are no AWS credentials on this machine.
- **The app has never run on a physical device.** Both platforms compile;
  that is not the same as working, particularly for WebGL on low-end Android.
- **`minifyEnabled` is off** for release builds, deliberately — see the
  comment in `android/app/build.gradle`. Turn it on once a release build has
  been proven on real hardware.
