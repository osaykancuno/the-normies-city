# Deployment guide — The Normies City (with TAG Battle)

Three-phase rollout. Each phase produces something working — you choose how far to go.

| Phase | Result | Time | Required? |
| --- | --- | --- | --- |
| **1. Vercel deploy** | Live URL with the full 3D city + single-player TAG Battle | ~10 min | **Yes** |
| **2. TAG Battle multiplayer** | Real-time territorial graffiti with crews + holder-gated wallet auth | ~35 min | Optional |
| **3. Real Normies snapshot** | All 8,181 holders + their actual on-chain bitmaps on the city facades | ~5 h (mostly background) | Recommended |

After Phase 1 you're live. Phases 2 and 3 are added later by committing + pushing — Vercel auto re-deploys.

---

# PHASE 1 — Go live on Vercel (10 min)

This puts the city + the game (in solo mode) on a public URL.

## 1.1 — Create a GitHub repo

1. Go to **https://github.com** and sign in (or sign up — free).
2. Go to **https://github.com/new**.
3. Repository name: `the-normies-city` (or any name).
4. Visibility: **Public** or **Private** — both work with Vercel free tier.
5. **Do NOT** tick the "Add README/license/.gitignore" boxes — the local repo already has them.
6. Click **Create repository**.
7. Copy the URL it shows (looks like `https://github.com/YOURNAME/the-normies-city.git`).

## 1.2 — Push the code

Open PowerShell in the project folder (`C:\Users\Utente\Desktop\Normie City`) and run:

```powershell
git remote add origin https://github.com/YOURNAME/the-normies-city.git
git push -u origin main
```

A browser pop-up will ask you to authenticate to GitHub — log in once and it's done forever.

Refresh the GitHub page — your 64 files should appear.

## 1.3 — Deploy on Vercel

1. Go to **https://vercel.com/signup**.
2. Click **Continue with GitHub** → authorize.
3. On the dashboard: **Add New… → Project**.
4. Find `the-normies-city`, click **Import**.
5. Leave all defaults (Vercel auto-detects Next.js).
6. **Optional**: under "Environment Variables" add `ALCHEMY_API_KEY` (free from https://www.alchemy.com/) for cleaner on-chain transfer detection.
7. Click **Deploy**.

Wait ~2 minutes. You'll get a URL like `https://the-normies-city-xxxx.vercel.app/`. **That's your site live.**

At this point:
- The city renders with the ~250 real holders we already have synced
- All live stats (burns, transforms, transfers, Canvas) come from `api.normies.art`
- Click the central monument → City Hall opens
- Click the TAG BATTLE wall → game opens in iframe — **single-player mode** (tags only visible to you)

To upgrade single-player → multiplayer, do Phase 2.
To populate the city with all 8,181 holders + real Normie faces, do Phase 3.

---

# PHASE 2 — Enable TAG Battle multiplayer (35 min, optional)

The game already supports multiplayer — it just needs a Firebase backend. Firebase free tier covers up to ~500 daily active users.

> **What you need before starting**: a Google account and a credit card. Google requires a card on the Blaze plan but won't charge you (free tier covers hackathon-scale usage). Recommended: set a $5/mo budget alert.

## 2.1 — Create the Firebase project (5 min)

1. Go to **https://console.firebase.google.com/**.
2. Click **Add project** (top right).
3. Name: `the-normies-tagbattle` (or anything).
4. **Disable** Google Analytics (simpler).
5. Click **Create project** → wait 30 s → **Continue**.

## 2.2 — Upgrade to Blaze plan (3 min)

Cloud Functions need this. Free tier still applies.

1. Bottom-left of the Firebase console: click **Spark plan** → **Modify plan**.
2. Pick **Blaze** → **Select plan**.
3. Add a payment method.
4. **Recommended**: set a budget alert at $5/mo from the link they provide.
5. Confirm.

## 2.3 — Enable the 3 services (3 min)

In the Firebase left menu:

- **Authentication** → **Get started** → leave all providers off (the game uses custom token auth).
- **Firestore Database** → **Create database** → **Production mode** → location **eur3 (europe-west)** → **Enable**.
- **Functions** → **Get started** → click through the prompts.

## 2.4 — Copy your Firebase web config (2 min)

1. Top-left of Firebase console: ⚙ icon → **Project settings**.
2. Scroll to **Your apps** → click the `</>` (Web) button.
3. Nickname: `tagbattle` → **Register app**.
4. You'll see code like:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "the-normies-tagbattle.firebaseapp.com",
  projectId: "the-normies-tagbattle",
  storageBucket: "the-normies-tagbattle.appspot.com",
  messagingSenderId: "1234567...",
  appId: "1:1234567...:web:abc..."
};
```

Keep this in a notepad — you need it in step 2.6.

## 2.5 — Install Firebase CLI (5 min)

Open PowerShell:

```powershell
npm install -g firebase-tools
firebase login
```

Login opens a browser — use the same Google account.

## 2.6 — Paste the config into TAG Battle source

Open `C:\Users\Utente\Desktop\TAG Battle\index.html` in **Notepad**.

1. Press **Ctrl+F**, search for `FIREBASE_CONFIG`.
2. Replace this line:
   ```js
   const FIREBASE_CONFIG = null;
   ```
   with your config object from step 2.4:
   ```js
   const FIREBASE_CONFIG = {
     apiKey: "AIzaSy...",
     authDomain: "the-normies-tagbattle.firebaseapp.com",
     projectId: "the-normies-tagbattle",
     storageBucket: "the-normies-tagbattle.appspot.com",
     messagingSenderId: "1234567...",
     appId: "1:1234567...:web:abc..."
   };
   ```
3. Save (**Ctrl+S**).

## 2.7 — Deploy Cloud Functions + Firestore rules (10 min)

In PowerShell:

```powershell
cd "C:\Users\Utente\Desktop\TAG Battle\production"
firebase use --add
```

Pick your `the-normies-tagbattle` project from the list. When asked for an alias, type `default`.

```powershell
cd functions
npm install
cd ..
firebase deploy --only functions,firestore
```

> ⚠️ We're **not** deploying `--only hosting` because the game is hosted by Vercel as part of The Normies City. We only need the Firebase backend (Functions + Firestore rules).

Takes 3-5 min. If Firebase asks you to enable APIs the first time, press Enter to confirm.

## 2.8 — Refresh the in-app bundle and re-publish

The Firebase-enabled `index.html` now lives at `Desktop\TAG Battle\index.html`. Copy it into the Next app's static folder:

```powershell
cd "C:\Users\Utente\Desktop\Normie City"
Copy-Item "C:\Users\Utente\Desktop\TAG Battle\index.html" "public\tag-battle\index.html" -Force
git add public/tag-battle/index.html
git commit -m "Enable TAG Battle multiplayer (Firebase backend)"
git push
```

Vercel re-deploys in ~2 min. Now opening the TAG Battle wall in the city loads the real multiplayer game — every player sees every tag in real time.

---

# PHASE 3 — Full Normies data sync (5 h, mostly background)

Right now `public/holders.json` has only 790 entries (~250 real wallets). The full set has 8,181 live holders (10,000 − 1,819 burned). The build script fetches them respecting the API's 60 req/min limit.

## 3.1 — Run holders sync (~2 h 15 m)

Open a dedicated PowerShell window (you can keep using the other one for anything else):

```powershell
cd "C:\Users\Utente\Desktop\Normie City"
npm run build:holders
```

Leave the window open. It will print progress every 100 ids. You can stop and resume (`Ctrl+C` then re-run) — it picks up from `.holders-progress.json`.

When it finishes:

```powershell
git add public/holders.json
git commit -m "Sync full holders snapshot from api.normies.art"
git push
```

Vercel re-deploys. The city goes from ~250 to ~3000+ buildings.

## 3.2 — Run atlas sync (~2 h 15 m, optional but recommended)

This generates the 4000×4000 PNG with every Normie's on-chain bitmap, so the buildings actually display the real Normie faces instead of the placeholder.

```powershell
npm run build:atlas
```

Same deal — resumable, takes ~2 h, then:

```powershell
git add public/atlas.png
git commit -m "Sync full Normie bitmap atlas"
git push
```

Vercel re-deploys. Buildings now show authentic pixel-art Normies on their facades.

---

# Updating the app later

Any change you make locally:

```powershell
git add .
git commit -m "describe what changed"
git push
```

Vercel auto-detects the new commit and re-deploys in ~2 min. The live URL stays the same.

---

# Custom domain (optional, anytime)

In Vercel project settings → **Domains**, you can attach `normiecity.xyz` (or whatever domain you own). Vercel provisions HTTPS automatically.

---

# Troubleshooting

**Vercel build fails with a TypeScript error.** Run `npm run build` locally first; fix the error, commit, push.

**TAG Battle iframe is blank.** Hard refresh (Ctrl+Shift+R). The game registers a service worker at `/tag-battle/sw.js`; it caches aggressively. Hard refresh forces it to re-fetch.

**TAG Battle multiplayer doesn't see other players.** Verify:
1. `public/tag-battle/index.html` has your Firebase config (not `null`).
2. You did `firebase deploy --only functions,firestore` in `Desktop\TAG Battle\production`.
3. Open browser console on the game page — should print `[TAG Battle] Multiplayer backend ONLINE` instead of `Local mode`.

**City is empty.** `public/holders.json` is missing or has no entries. Make sure it's in git (`git ls-files public/holders.json` should list it).

**API rate limit (429) during build.** The script handles this automatically with backoff. Just let it run — it'll catch up.
