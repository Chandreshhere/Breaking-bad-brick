# Hosting the backend on AWS Lambda

The API runs as a single Lambda behind a Function URL. **Data stays in
Firestore on Firebase's free Spark plan** — only compute moves. Firestore,
Authentication, App Check and Remote Config are all free; Cloud Functions was
the only part that required the paid Blaze plan.

```
   Game client  ──callable protocol──▶  Lambda Function URL  ──Admin SDK──▶  Firestore
        │                                                                   (Spark, free)
        └──anonymous sign-in──▶  Firebase Auth (Spark, free)
```

Nothing about the API changes. `onCall` returns an ordinary Express handler
that already speaks the callable wire protocol — verifying the Firebase ID
token, verifying App Check, answering CORS preflight, encoding `{data}` in and
`{result}`/`{error}` out — so [`src/app.ts`](../functions/src/app.ts) mounts
those same handlers on Express and three thin entry points serve it:

| Entry point | Target |
|:--|:--|
| `src/index.ts` | Cloud Functions (needs Blaze) |
| `src/server.ts` | A long-lived Node process (Render, Fly, a VPS) |
| `src/lambda.ts` | **AWS Lambda behind a Function URL** |

Only the last few lines of each differ. Switching hosts is a deploy and one
environment variable, not a rewrite.

---

## Why Lambda suits this workload

The traffic is bursty and idle most of the time, which is the worst possible
shape for a rented instance and the best possible shape for Lambda.

A Render free instance sleeps after 15 minutes and takes about a minute to
wake — far outside the client's 3-second launch budget, so the first player
after a quiet spell gets an offline session and rewarded-ad callbacks arrive
late or not at all. A Lambda cold start is a few hundred milliseconds and
comfortably inside that budget.

The free allowance is **1M requests and 400,000 GB-seconds per month**. At
this app's roughly four calls per session and 512 MB, that is on the order of
250,000 sessions a month before you pay anything. Check whether your account's
Lambda free tier is perpetual or 12-month — AWS has changed this.

**Lambda is usage-billed with no hard cap**, exactly like Blaze. Set an AWS
Budgets alert before you deploy. An alert notifies, it does not stop spend.

---

## 1. Firebase, on the free plan

No billing required for any of this.

1. In the [Firebase console](https://console.firebase.google.com), open
   **`breaking-bad-bricks`**.
2. **Build → Authentication → Sign-in method → Anonymous → Enable.**
3. **Build → Firestore Database → Create database.** Production mode; pick a
   region near your AWS region and note it — this is permanent.
4. Deploy the rules and indexes. Both are free:
   ```sh
   firebase login
   firebase deploy --only firestore:rules,firestore:indexes
   ```
   The rules deny every client write; all writes go through this API.
5. **Project settings → General → Your apps → Web app.** Register one and copy
   the config into `.env.local` (see `.env.example`).

> Do **not** run `firebase deploy --only functions`. That is the part that
> needs Blaze, and it is the part Lambda is replacing.

## 2. A service account

The Admin SDK finds credentials automatically inside Google's runtime. Outside
it, you supply them.

**Project settings → Service accounts → Generate new private key.** Treat the
downloaded JSON as a password: it grants full read/write to your database and
bypasses every security rule. It is already covered by `.gitignore`.

## 3. Deploy

Needs the [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
(`brew install aws-sam-cli`) and credentials (`aws configure`).

```sh
cd functions
npm run aws:deploy      # sam build && sam deploy --guided
```

The guided deploy asks for the three parameters. For `FirebaseServiceAccount`,
paste the entire contents of the JSON key — the server also accepts base64 of
it, and repairs the `\n`-instead-of-newline mangling that pasting through some
forms causes. Answer **yes** to "ApiFunction Function Url may not have
authorization defined": that is intentional, and explained in `template.yaml`.

It prints the Function URL when it finishes. Confirm it:

```sh
curl https://<id>.lambda-url.<region>.on.aws/healthz
# {"ok":true,"service":"breaking-bad-brick-api"}

curl -X POST https://<id>.lambda-url.<region>.on.aws/bootstrap \
     -H 'Content-Type: application/json' -d '{"data":{}}'
# {"error":{"message":"Sign-in required.","status":"UNAUTHENTICATED"}}
```

Both of those are what a healthy deployment looks like — the second one proves
token verification is running.

## 4. Point the game at it

In `.env.local`, and in whatever builds your store releases:

```sh
VITE_BACKEND_URL=https://<id>.lambda-url.<region>.on.aws
```

That is the whole client change. `getFunctions` accepts either a region or a
full origin and speaks the same protocol to both, so no game code knows the
difference.

## 5. Point AdMob at it

In the AdMob console, for **both** rewarded ad units (Android and iOS), set
server-side verification to:

```
https://<id>.lambda-url.<region>.on.aws/admobSsv
```

Rewards are minted by that callback, never by the client. Until it is set, a
completed ad grants nothing.

---

## Local development

Unchanged, and it needs no service-account key:

```sh
npm run emulators          # auth + firestore + functions emulators
npm run dev:emulator       # client pointed at them
```

To run the same Express app as a plain server against the emulators:

```sh
npm --prefix functions run build
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-bbb \
node functions/lib/server.js
```

It detects the emulator variables and initialises without credentials, so
nobody needs a production key to work on the API.

---

## Things worth knowing

- **The service-account key lives in a Lambda environment variable.** They are
  encrypted at rest, and the CloudFormation parameter is `NoEcho`, but anyone
  with `lambda:GetFunctionConfiguration` can read it. If that matters, move it
  to an SSM SecureString parameter (free for standard parameters) and fetch it
  at cold start — `initAdmin` in `src/app.ts` is the only place that reads it.
- **Cold starts get slower as the bundle grows.** The build ships production
  dependencies only (~60 MB); `firebase-admin` and its gRPC stack are most of
  that. Adding heavy dependencies is the main way to regress launch latency.
- **Logs are in CloudWatch**, not the Firebase console. The template caps
  retention at 14 days; without that they are kept forever and quietly billed.
- **Firestore TTL policies** on `runTickets` and `idempotency` are still
  configured in the Firebase console. Without them those collections grow
  until they eat the 1 GiB free quota.
- **The country flag on leaderboards** comes back null. Google set
  `x-appengine-country` automatically; a Lambda Function URL sets no geo
  header, so the flag simply does not render. CloudFront in front of the
  function would provide `cloudfront-viewer-country` if you ever want it.
