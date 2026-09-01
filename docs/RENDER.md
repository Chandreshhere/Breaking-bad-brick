# Hosting the backend on Render

Cloud Functions 2nd gen requires Firebase's paid **Blaze** plan. Nothing else
this game uses does — Firestore, Authentication, App Check and Remote Config
are all free on **Spark**. So only the compute moves; the data stays where it
is.

```
   Game client  ──callable protocol──▶  Render web service  ──Admin SDK──▶  Firestore
        │                                                                   (Spark, free)
        └──anonymous sign-in──▶  Firebase Auth (Spark, free)
```

The API is byte-identical to the Cloud Functions one. `onCall` already returns
an ordinary Express handler that implements the callable wire protocol —
verifying the ID token, verifying App Check, answering CORS preflight, and
encoding `{data}` in and `{result}`/`{error}` out — so
[`functions/src/server.ts`](../functions/src/server.ts) just mounts those same
handlers on Express. Every callable, every security check and all the domain
logic is shared with `index.ts` rather than forked, and moving back onto Cloud
Functions later is a deploy, not a rewrite.

---

## Read this before you start

**The free plan sleeps.** Render stops a free web service after 15 minutes
with no traffic, and waking it takes about a minute. The game's launch call
gives up after 3 seconds — deliberately, because stalling the intro screen for
every player to help the unlucky first one is the wrong trade.

The consequence, honestly stated: **the first player to open the game after a
quiet spell gets an offline session.** They can play everything; they just get
no cloud save, no leaderboard and no rewarded coins until the retries land.
The client now retries quietly at 8s, 25s and 45s, so most such sessions
recover within a minute without the player noticing.

Rewarded ads are the part that suffers most. AdMob's verification callback
hits a sleeping instance, times out, and relies on AdMob's own retry — so a
reward can be minutes late or, occasionally, lost.

Three ways to deal with it, in order of how much I would recommend them:

| Option | Cost | Result |
|:--|:--|:--|
| **Render Starter plan** | $7/mo | No sleeping. Behaves like the Cloud Functions version. The right answer once real players exist. |
| **Uptime pinger** hitting `/healthz` every 10 min | free | Keeps it awake. Uses ~730 of your 750 monthly free instance hours, so it only works if this is your *only* free service — and it leaves no headroom. |
| **Accept it** | free | Fine for a closed test. Not fine for a public launch with ads. |

**Firestore's free quotas are the other ceiling:** 50,000 document reads,
20,000 writes and 20,000 deletes per day, and 1 GiB stored. Launch reads about
four documents per player, so roughly 12,000 launches a day before reads run
out. Watch it in the Firebase console under Usage.

---

## 1. Firebase, on the free plan

No billing required for any of this.

1. In the [Firebase console](https://console.firebase.google.com), open
   **`breaking-bad-bricks`**.
2. **Build → Authentication → Sign-in method → Anonymous → Enable.**
3. **Build → Firestore Database → Create database.** Production mode; pick a
   region close to your Render region and note it — this is permanent.
4. Deploy the security rules and indexes. Both are free:
   ```sh
   firebase login
   firebase deploy --only firestore:rules,firestore:indexes -P dev
   ```
   The rules deny every client write; all writes go through the API.
5. **Project settings → General → Your apps → Web app.** Register one and copy
   the config values into `.env.local` (see `.env.example`).

> Do **not** run `firebase deploy --only functions`. That is the part that
> needs Blaze, and it is the part Render is replacing.

## 2. A service account for the server

The Admin SDK finds its credentials automatically inside Google's runtime.
Outside it, you have to supply them.

1. **Project settings → Service accounts → Generate new private key.**
2. A JSON file downloads. **Treat it as a password**: it grants full
   read/write access to your database, bypassing every security rule. Never
   commit it, never paste it into a chat or an issue.
3. Keep the file somewhere private — you will paste its contents in step 3.

## 3. The Render service

The repository already contains [`render.yaml`](../render.yaml), so:

1. In the [Render dashboard](https://dashboard.render.com) choose
   **New → Blueprint** and connect this repository. Render reads
   `render.yaml` and proposes the `breaking-bad-brick-api` service.
2. It will ask for the two values marked `sync: false`:
   - **`FIREBASE_SERVICE_ACCOUNT`** — paste the *entire contents* of the JSON
     key file from step 2. The server also accepts base64 of that JSON, and it
     repairs the `\n`-instead-of-newline mangling that pasting through some
     forms causes, so you are unlikely to hit the classic `error:1E08010C`.
   - **`REVENUECAT_WEBHOOK_SECRET`** — leave blank until you switch on
     real-money purchases. The webhook rejects every call until it is set,
     which is the correct default.
3. Deploy. When it is live, confirm it:
   ```sh
   curl https://<your-service>.onrender.com/healthz
   # {"ok":true,"service":"breaking-bad-brick-api"}
   ```
   An unauthenticated callable should be refused, not crash:
   ```sh
   curl -X POST https://<your-service>.onrender.com/bootstrap \
        -H 'Content-Type: application/json' -d '{"data":{}}'
   # {"error":{"message":"Sign-in required.","status":"UNAUTHENTICATED"}}
   ```
   Both of those are what a healthy deployment looks like.

## 4. Point the game at it

In `.env.local` (and in whatever builds your store releases):

```sh
VITE_BACKEND_URL=https://<your-service>.onrender.com
```

That is the whole client change. `getFunctions` accepts either a region or a
full origin and speaks the same protocol to both, so no game code knows the
difference. Leave it unset and the client goes back to
`us-central1-<project>.cloudfunctions.net`.

## 5. Point AdMob at it

In the AdMob console, for **both** rewarded ad units (Android and iOS), set
**server-side verification** to:

```
https://<your-service>.onrender.com/admobSsv
```

Rewards are minted by that callback, never by the client. Until this is set, a
completed ad grants nothing — and note the sleeping-instance caveat above.

---

## Local development

Unchanged, and it does not need a service-account key:

```sh
npm run emulators          # auth + firestore + functions emulators
npm run dev:emulator       # client pointed at them
```

To exercise the Express server itself against the emulators:

```sh
npm --prefix functions run build
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-bbb \
node functions/lib/server.js
```

The server detects the emulator variables and initialises without credentials,
so nobody has to hold a production key to work on the API.

---

## Things that are now your responsibility

Cloud Functions did some of this for free.

- **Scaling.** One free instance is one process. It will handle early traffic
  comfortably; it will not handle a spike.
- **Firestore TTL.** `runTickets` and idempotency records write an expiry
  field, but the policy that actually deletes them is configured per-collection
  in the Firebase console under Firestore → TTL. Without it those collections
  grow forever and eventually eat the 1 GiB free quota.
- **The country flag on leaderboards.** Google set `x-appengine-country`
  automatically. A bare `*.onrender.com` host sets no geo header at all, so
  country comes back null and the flag simply does not render. A Render custom
  domain fronted by Cloudflare provides `cf-ipcountry`, which the server also
  reads.
- **Logs.** They are in the Render dashboard now, not the Firebase console.
