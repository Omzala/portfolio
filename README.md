# Om Zala — Portfolio

A dark, deep-space 3D portfolio built with React, Vite, Three.js and Framer Motion.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173). Add `?nointro` to skip the launch countdown while developing.

## Build and preview

```sh
npm run build
npm run preview
```

On Vercel, pick Vite, use `npm run build`, and set the output directory to `dist`. Vercel also deploys the Node functions in `api/`. A plain static host serves the portfolio, but needs a separately hosted backend for the Gemini chat and global leaderboard.

## What's on the page

- **Launch intro**: a short countdown that lifts away like a curtain.
- **Hero**: meet **Bandit**, an original raccoon astronaut built in Three.js, who has a helmet, jetpack and ringed tail. Bandit tracks your cursor, blinks, waves and does a barrel roll when poked. The giant name letters rise in on load and drift apart as you scroll, while Bandit flies up and away.
- **Starfield**: the whole page flies through a WebGL star tunnel. Scrolling pushes the camera forward, fast scrolls stretch into warp, and planets and nebulae drift past with parallax.
- **Marquee**: two tool bands that speed up and reverse with your scroll velocity.
- **Mission control** (about): an AI avatar powered by Gemini that answers in Om's voice using his resume and portfolio, a live Vadodara clock, a status card and a toolbelt of tech pills with real physics (matter-js). The chat includes follow-up context, suggested questions, retry, reset and a resume download. Its transcript scrolls internally and passes scrolling back to the page at either edge.
- **Mission files** (projects): a pinned horizontal-scroll gallery with tilt-on-hover browser mockups tinted per project, animated filters, and a detail view that morphs out of the card. The detail view supports arrow-key and next/previous navigation. On phones it becomes a vertical stack with a bottom sheet.
- **Space Scavenger** (arcade): a 3D Three.js game. Anyone can launch straight away, no name needed. Steer Bandit's rocket with the mouse, touch or arrow keys, and chain cyan scrap into combos. Orange cores are rare bonuses, shield pickups repair one hit, and rocks cost a shield. After a flight, pilots see where it would place and can claim it under a callsign to join the **Top pilots** leaderboard.
- **Contact**: copy-to-clipboard email, social tiles, and a form that opens the visitor's email app with the message prefilled (no server needed).
- **Footer**: the outlined name fills in as you reach the bottom.

Across the page: Lenis smooth scrolling, a custom cursor with contextual labels, magnetic buttons, word-by-word heading reveals and a scroll progress bar.

## Gemini chat

1. Create a key in [Google AI Studio](https://aistudio.google.com/api-keys).
2. Add `GEMINI_API_KEY=your-key` to `.env.local`, then restart `npm run dev`. Keep this server-only: never use a `VITE_` prefix. See `.env.example`; both `.env` and `.env.local` are ignored by Git.
3. For the deployed site, set `GEMINI_API_KEY` in the Vercel project's environment variables and redeploy. No MongoDB configuration is needed for chat.
4. Optionally set `GEMINI_MODEL` to change the model. The default is `gemini-3.5-flash-lite`, a stable text model listed in [Google's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite). Requests use the [Gemini generateContent API](https://ai.google.dev/gemini-api/docs/generate-content/text-generation).

`POST /api/chat` sends the verified resume facts in `api/_lib/om-profile.js`, project/contact data from `src/data.js`, the visitor's question and up to six recent exchanges to Gemini. Instructions require first-person answers grounded in that profile, honest handling of unknown details and disclosure that the avatar is AI. When the PDF changes, update `om-profile.js` too; the PDF is not re-parsed at runtime. Conversations are kept only in the current page's memory and are sent to Google to generate replies.

The API validates message/history sizes and roles, times out upstream requests, hides provider errors and applies a best-effort limit of 12 requests per minute per IP per server instance. This in-memory limit is not shared across serverless instances; use hosting-level rate limits and Google quota controls for a public deployment if needed. Missing keys or provider failures show a retryable error rather than a fabricated AI response.

## The leaderboard

The leaderboard lives in MongoDB and is served by the Vercel functions in `api/`.

### Setup

1. Create a MongoDB database. On Vercel, add the **MongoDB Atlas** integration (Storage / Marketplace), which sets `MONGODB_URI`. Elsewhere, use any MongoDB 5.0+ connection string.
2. Optionally set `PILOT_COOKIE_SECRET` to a long random string, and `MONGODB_DB` to pick the database name (default `arcade`). See `.env.example`.
3. For local development, put the same values in `.env.local`. `npm run dev` serves the `api/` functions itself, so no extra tooling is needed. Restart the dev server after editing a function.

Collections and indexes are created on first use.

### How it works

- **Cookies identify pilots.** The first flight sets `sc_pilot`, a signed, HttpOnly, SameSite=Lax cookie holding a random pilot id. It lasts a year and renews on every flight. There are no accounts and no sign-up. A tampered cookie is ignored.
- **Play first, name later.** `POST /api/runs` starts a flight and the server starts timing it. `PATCH /api/runs` lands it with the score. The flight is stored *unclaimed*, and the response says where it would place. `POST /api/claim` puts a callsign on it and enters it into the boards. Unclaimed flights are deleted after 24 hours.
- **Board rules.**
  - Each pilot appears once per board, with their best claimed flight.
  - Ranking is competition style (1, 1, 3): equal scores share a rank, and the earlier score is listed first.
  - There are three boards: **All time**, **This week** (resets Monday 00:00 UTC) and **Today** (resets 00:00 UTC).
  - Callsigns are unique, ignoring case. Claiming under a new callsign renames the pilot everywhere.
- **Gamification.**
  - Medals for the top three.
  - Score tiers: Rookie, Cadet, Pilot, Ace and Legend, plus how far it is to the next tier.
  - Personal-best detection.
  - A projected rank before claiming, and rank movement after claiming ("Up 4 places").
  - Your own row, even when you're outside the top 10.
  - Points needed to pass the pilot above you, and a top-% percentile once a board has 10+ pilots.
- **Anti-cheat.**
  - The server rejects a score that is impossible for the flight's length.
  - The flight length is measured on the server, not reported by the client.
  - Each pilot can start at most 12 flights a minute.
  - A pilot can only land or claim their own flights.

`GET /api/leaderboard?period=all|week|day` returns the top 10, the total number of pilots, when the board resets, and the visitor's own standing.

Without a database (a plain static host, or no `MONGODB_URI`), the arcade runs the same flow against the visitor's browser storage, and the board is labelled "This device". Set `VITE_API_BASE` to serve the API from a different path.

## Code map

- `src/data.js`: projects, filters, contact details, toolbelt and Bandit's lines.
- `src/main.jsx`: page composition, smooth scrolling and in-page link handling.
- `src/sections/`: `Hero`, `About`, `Work`, `Arcade` and `Contact` (plus the footer).
- `src/components/`: header, cursor, preloader, marquee, Gemini chat (`Terminal.jsx`), toolbelt physics, the flat Bandit drawing and shared motion helpers (`ui.jsx`).
- `src/three/stage.js`: shared renderer setup, lighting and a render loop that pauses offscreen or in hidden tabs.
- `src/three/Raccoon.jsx`: Bandit.
- `src/three/Starfield.jsx`: the scroll-driven background.
- `src/three/scavenger.js`: the arcade engine, with no React inside.
- `src/lib/leaderboard.js`: the leaderboard client (API calls, tiers, and the this-device fallback).
- `src/lib/scroll.js`: the Lenis wrapper.
- `api/chat.js`, `api/_lib/om-profile.js`: Gemini endpoint and verified resume context.
- `api/leaderboard.js`, `api/runs.js`, `api/claim.js`: the leaderboard functions. Shared code is in `api/_lib/`: the MongoDB connection, the pilot cookie, board rules and HTTP helpers.
- `src/styles.css`: theme tokens, layout, animation and responsive rules.

Every 3D piece has a fallback when WebGL is unavailable or a chunk fails to load. With `prefers-reduced-motion`, the intro, smooth scrolling, physics and decorative motion are all turned off.

## Browser checks

```sh
npm run test:e2e
npm run test:api
```

The Playwright configuration uses locally installed Google Chrome. To use another Chromium build, set `PW_CHROMIUM_PATH` to its executable. If another app uses port 5173, set `PW_PORT=5180` before running the browser checks.

The suite covers:

- the intro and 3D hero;
- chat follow-ups, retries, reset, safe text rendering, mobile layout and scroll handoff (with and without reduced motion);
- Gemini request grounding, validation, secret handling, timeouts and throttling using mocked provider responses;
- the toolbelt physics;
- project filters, the detail view and keyboard focus;
- a full arcade flight, from nameless launch to claiming a spot on the leaderboard;
- contact and social links;
- mobile navigation;
- horizontal overflow at six widths;
- reduced motion and the WebGL fallback.

Screenshots are written to `test-results/`.
