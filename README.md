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
- pomodoro.html — Focus Forge: a standalone gamified pomodoro timer + daily break planner (open directly)
- manifest.json + icons — installable app identity
- sw.js — offline cache
- test/ — regression suite (`node test/run-tests.js`); no dependencies, no build step

## Focus Forge (pomodoro.html)
A self-contained pomodoro timer with a daily "break menu" you fill in each morning.
Finish a focus round, then pick a reward activity for your break. Earn XP, level up,
build a daily streak, and unlock badges. Same local-first rules: no accounts, no network
requests, all state in this device's localStorage. Just open the file (or host it on Pages).

## Training blocks
A fresh install (and any install upgraded to schema 6) starts in **Block 0 "Show Up"** —
two four-card templates, flat loads, every working set at RPE 6, roughly 25 minutes.
It rotates A-B-A / B-A-B and unlocks the full A/B/C program after **6 completed
sessions** (every card marked done). The gate is cumulative: a missed week costs
time, never progress. Loads set in Block 0 carry into Block 1 as the baseline.

## Tests
`node test/run-tests.js` — runs the app's own inline script inside a `node:vm`
context backed by a DOM stub, so the suite exercises the shipped index.html
directly rather than a copy of its logic. Nothing to install.

Back up regularly: Vault tab → Export backup (JSON).
