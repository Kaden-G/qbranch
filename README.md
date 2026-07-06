# Q Branch — Training HQ

Local-first strength training app. All data lives in the browser's storage on YOUR device —
this repo only serves the static shell. No server, no accounts, no external requests
(enforced by CSP). Works offline after first load via service worker.

## Deploy (GitHub Pages)
1. Push these files to the repo root (branch: main)
2. Settings → Pages → Source: "Deploy from a branch" → main / (root) → Save
3. Open the URL on your phone → Share → Add to Home Screen

## Files
- index.html — the entire app (UI, storage, progression engine)
- manifest.json + icons — installable app identity
- sw.js — offline cache

Back up regularly: Vault tab → Export backup (JSON).
