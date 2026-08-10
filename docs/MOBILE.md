# Native app (Capacitor)

The web build wrapped as Android and iOS apps. Same game, same code — the
shell only adds what a browser gives for free and an app does not.

Both platforms **compile today**: Android produces an 8.9 MB debug APK, iOS
builds for the simulator.

---

## Why this exists

AdMob rewarded video is a **native SDK**. There is no AdMob for a plain
website, so no ad unit id will ever serve on the web build. Wrapping in
Capacitor is what turns the AdMob account into revenue — and it is the same
work needed for the App Store and Play Store anyway.

`isNativeShell()` decides at runtime: AdMob inside the shell, the visible
placeholder on web. One code path, no platform branching in the game.

---

## Commands

```bash
npm run cap:sync        # build web assets and copy into both native projects
npm run android:build   # sync + assemble a debug APK
npm run android:open    # open Android Studio
npm run ios:open        # open Xcode
```

**Capacitor 8 requires JDK 21.** The system JDK here is 17, so the scripts
use the JDK that ships inside Android Studio when it is present rather than
making every machine install a second one. Building by hand:

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  ./gradlew assembleDebug
```

---

## What the shell adds

| Behaviour | Why |
|:--|:--|
| Backgrounding pauses the game | A rally continuing off-screen means returning to a life you never saw lose |
| Backgrounding suspends audio | Music playing behind another app is the most complained-about mobile behaviour. The context is *suspended*, not muted, so the scheduler stops rather than running unheard |
| Android back steps through screens | Back during a rally pauses; at the menu it exits. Quitting straight out of a run loses it |
| Portrait locked | Both platforms. The framing was built for portrait |
| Splash held ~1.2s | WebGL plus a stadium rebuild takes a moment; otherwise you see an empty canvas first |

All of it no-ops on web, so there is one path rather than two.

---

## AdMob

Publisher `pub-4951837849307649`. Android and iOS are **separate AdMob apps**
with separate unit ids — one platform's unit simply never fills on the other.

| | Android | iOS |
|:--|:--|:--|
| App id | `…~8549571254` | `…~3144221393` |
| Rewarded unit | `…/8476439121` | `…/8357999563` |
| App id lives in | `AndroidManifest.xml` | `Info.plist` |

The **app ids live in the native manifests** because the SDKs read them there
and throw on startup without them. The **unit ids come from the environment**
(`VITE_ADMOB_REWARDED_ID_ANDROID` / `_IOS`) and default to Google's test
units; `AdConfig` also refuses real ids in a dev build.

That split is deliberate. Serving live ads to yourself is the classic way to
lose an AdMob account — Google cannot distinguish your testing from click
fraud, and the suspension covers the whole account, not one app. The SDK is
additionally initialised with `initializeForTesting` while on test inventory.

**The reward is never granted by the client.** `show()` only reports that the
ad finished; coins arrive when AdMob calls the `admobSsv` function.

### Still needed

- [ ] Point **both** rewarded units' **server-side verification** at
      `https://us-central1-<project-id>.cloudfunctions.net/admobSsv`
- [ ] Set `VITE_ADMOB_REWARDED_ID_ANDROID` / `_IOS` in the production
      environment only
- [ ] **UMP SDK** for EU consent — the in-game gate blocks ads until answered
      but does not emit the TCF strings networks require

---

## Firebase native config

`android/app/google-services.json` — **module level, not `android/`**.
Capacitor's generated `app/build.gradle` applies the Google Services plugin
only if the file is sitting next to it, and silently logs a note if it is
not, so a misplaced file looks like nothing happened.

It is **gitignored**. It carries project identifiers and belongs in your
deploy environment, not a public repo. Anyone cloning this needs to download
their own from the Firebase console.

iOS needs the equivalent `GoogleService-Info.plist` once an iOS app is added
to the Firebase project.

Firebase Analytics is included via the BoM. It auto-collects sessions and
retention with no code — that is what fills DAU and D1 in the console.
Custom events will go through a Capacitor plugin rather than the web SDK, so
they are attributed to the app instead of counting as web traffic from a
WebView.

## Before a store release

- [ ] `appId` is `com.breakingbadbrick.game`. Change it now if you want
      something else — **it is permanent once published.**
- [ ] Android signing keystore — **back it up permanently**. Lose it and the
      listing can never be updated again.
- [ ] Apple signing: team, bundle id, provisioning
- [ ] App icons and splash art at every density; store screenshots per device
- [ ] Privacy policy URL, Play Data Safety form, App Store privacy labels
- [ ] Test on real low-end Android hardware. `AdaptiveQuality` steps the tier
      down under load; confirm it actually fires rather than trusting it
