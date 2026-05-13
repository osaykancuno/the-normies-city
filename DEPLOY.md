# Deployment guide — The Normies City

This project is a Next.js 16 app. The cleanest, free, zero-maintenance way to put it online is **Vercel** (the company behind Next.js). Auto-deploys every time you push to GitHub.

Total time, end to end: **~10 minutes**.

---

## What you'll do (3 steps)

1. Create a GitHub repository and push the code into it.
2. Sign up at Vercel and import that repository.
3. Wait ~2 minutes for the first deploy.

Optional:
- Add an `ALCHEMY_API_KEY` env var for cleaner on-chain transfer detection.

---

## Step 1 — Push the code to GitHub

### 1a. Make sure you have a GitHub account

Go to https://github.com and sign in (or sign up for free).

### 1b. Create a new empty repository

1. Go to https://github.com/new
2. Repository name: `the-normies-city` (or anything you prefer)
3. Visibility: **Public** (or Private — both work with Vercel free tier)
4. **Do NOT initialize with README/license/gitignore** — the local repo already has these. Just click **"Create repository"**.

GitHub then shows a page with quick-setup instructions. Ignore the boilerplate and copy your repo URL (the `https://github.com/USERNAME/the-normies-city.git` line).

### 1c. Push from your machine

Open PowerShell in the project folder (`C:\Users\Utente\Desktop\Normie City`) and run:

```powershell
git remote add origin https://github.com/USERNAME/the-normies-city.git
git push -u origin main
```

Replace `USERNAME/the-normies-city.git` with whatever GitHub gave you.

The first push will ask you to authenticate. Sign in through the browser pop-up; Git Credential Manager handles it automatically.

When it finishes, refresh your GitHub repo page — the 61 files should appear.

---

## Step 2 — Deploy on Vercel

### 2a. Sign up

1. Go to https://vercel.com/signup
2. Click **"Continue with GitHub"**. Authorize Vercel to access your GitHub.

### 2b. Import the repo

1. After signing in you land on the dashboard. Click **"Add New…" → "Project"** (top right).
2. Find `the-normies-city` in the list of your repos and click **"Import"**.
3. Vercel auto-detects Next.js. You don't need to change anything.
4. **(Optional)** Expand "Environment Variables" and add:

   | Name | Value |
   | --- | --- |
   | `ALCHEMY_API_KEY` | (your Alchemy mainnet key, free at https://www.alchemy.com/) |

   Without this, the app falls back to a free public Ethereum RPC that is slower and occasionally rate-limited but still works.

5. Click **"Deploy"**.

### 2c. Wait ~2 minutes

You'll see a build log. When it finishes, Vercel shows a confetti animation and a URL like `https://the-normies-city-xxxx.vercel.app/`.

That's your live app.

---

## Step 3 — Verify

Open the URL. You should see:
- The Normies City loading splash
- Real buildings (one per known holder)
- Live Burns / Transforms / Action Points ticker
- Click the central monument → City Hall opens
- Click the TAG BATTLE wall → the game loads in an iframe

---

## How to update later

Anytime you change something on your machine:

```powershell
git add .
git commit -m "describe what you changed"
git push
```

Vercel auto-detects the new commit and re-deploys in ~2 minutes. Your live URL stays the same.

### Updating the on-chain data

The holders snapshot at `public/holders.json` is currently partial (only 790/10000 holders synced — the upstream API was throttling). To sync more:

```powershell
npm run build:holders   # ~3h, resumable
npm run build:atlas     # ~3h, generates the real Normie facades
git add public/
git commit -m "refresh holders + atlas snapshot"
git push
```

Vercel re-deploys, and the city has more buildings + real Normie faces.

---

## Custom domain (later, optional)

In Vercel project settings → Domains, you can attach `normiecity.com` or any domain you own. Vercel handles SSL automatically.

---

## Troubleshooting

**The build fails on Vercel with a TypeScript error.** Run `npm run build` locally first; fix the error, commit, push again.

**The TAG Battle iframe is blank.** Check the browser console; it might be a CORS issue with Firebase. The game runs inside the iframe scope so its service worker registers at `/tag-battle/sw.js` — this works on HTTPS (Vercel) but may not on plain HTTP.

**The city is empty.** `public/holders.json` is missing or has zero non-null entries. Make sure it's committed (it should be ~80 KB).
