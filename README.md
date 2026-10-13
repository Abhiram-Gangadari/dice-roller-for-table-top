# 🎲 Virtual Dice Roller for Tabletop

Interactive dice platform for D&D, RPGs, board games & classrooms. Next.js 14 + Tailwind + Local Storage + Gemini AI.

## Features
- Animated dashboard: D4, D6, D8, D10, D12, D20, D100, quantity, modifier, advantage/disadvantage, reroll/reset
- Custom notation parser (`2d6+3`, `1d20+5`, `4d8`, `1d100`, `2d6+1d8+2`) with secure RNG
- History + stats (total, avg, high, low), search/filter, CSV export, clear
- **Dice Master AI** (`/api/ai`) via Gemini `gemini-1.5-flash`, with offline fallback math

## Quickstart
```bash
npm install
cp .env.example .env.local   # fill GEMINI_API_KEY
npm run dev
```

## Gemini setup
1. Get key at Google AI Studio
2. Set `GEMINI_API_KEY` (server-only). Without it, AI uses offline math/encounter fallback.

## Deploy to Vercel
```bash
vercel
```
Add the `GEMINI_API_KEY` env var in Vercel dashboard. `vercel.json` uses `next build`.