# Phantom landing page

Minimal Next.js App Router site for the Phantom download page. Designed for Vercel deploy.

## Local dev

```bash
cd web
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Sign in at https://vercel.com with your GitHub account
2. **Import Project** → select `karki011/phantom`
3. **Root Directory:** `web`
4. **Framework Preset:** Next.js (auto-detected)
5. Build & Output settings: leave defaults
6. Deploy

The page fetches the latest GitHub release server-side (cached 1h via Next's data cache) and renders a download button pointing at the latest `Phantom-X.Y.Z.zip` asset.

## Notes

- If the `karki011/phantom` repo is **private**, the GitHub API call returns 404 and the page falls back to a "View releases on GitHub" link
- Once the repo is public and a release is cut, the download button activates automatically (revalidates hourly)
- Universal binary means one button — no arch detection needed
