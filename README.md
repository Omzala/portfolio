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

Deploy the generated `dist` directory to any static host. On Vercel or Netlify, pick Vite, use `npm run build`, and set the output directory to `dist`.

## What's on the page

- **Launch intro**: a short countdown that lifts away like a curtain.
- **Hero**: meet **Bandit**, an original raccoon astronaut built in Three.js, who has a helmet, jetpack and ringed tail. Bandit tracks your cursor, blinks, waves and does a barrel roll when poked. The giant name letters rise in on load and drift apart as you scroll, while Bandit flies up and away.
- **Starfield**: the whole page flies through a WebGL star tunnel. Scrolling pushes the camera forward, fast scrolls stretch into warp, and planets and nebulae drift past with parallax.
- **Marquee**: two tool bands that speed up and reverse with your scroll velocity.
- **Mission control** (about): a working terminal (`help`, `projects`, `open 3`, `play`, `hire`, `resume`…), a live Vadodara clock, a status card and a toolbelt of tech pills with real physics (matter-js). You can drag and fling them, or flip on Zero-G.
- **Mission files** (projects): a pinned horizontal-scroll gallery with tilt-on-hover browser mockups tinted per project, animated filters, and a detail view that morphs out of the card. The detail view supports arrow-key and next/previous navigation. On phones it becomes a vertical stack with a bottom sheet.
- **Space Scavenger** (arcade): a 3D Three.js game. Pilots sign in with a name, steer Bandit's rocket with the mouse, touch or arrow keys, and chain cyan scrap into combos. Orange cores are rare bonuses, shield pickups repair one hit, and rocks cost a shield. Every flight lands on the **Top pilots** leaderboard.
- **Contact**: copy-to-clipboard email, social tiles, and a form that opens the visitor's email app with the message prefilled (no server needed).
- **Footer**: the outlined name fills in as you reach the bottom.

Across the page: Lenis smooth scrolling, a custom cursor with contextual labels, magnetic buttons, word-by-word heading reveals and a scroll progress bar.

## The leaderboard

Scores are always saved in the visitor's browser, so the arcade works on any static host.

For a **global** board shared by everyone, deploy on Vercel and connect an Upstash Redis database (Vercel → Storage → Upstash/Redis). The integration sets `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL`/`KV_REST_API_TOKEN`), and `api/scores.js` picks them up. The function:

- validates names and scores;
- rejects scores that are impossible for the flight time;
- rate-limits each IP;
- keeps the top 100.

To use a different backend, set `VITE_SCORES_URL` to any endpoint that answers `GET` and `POST` with `{ scores: [...] }`.

## Code map

- `src/data.js`: projects, filters, contact details, toolbelt and Bandit's lines.
- `src/main.jsx`: page composition, smooth scrolling and in-page link handling.
- `src/sections/`: `Hero`, `About`, `Work`, `Arcade` and `Contact` (plus the footer).
- `src/components/`: header, cursor, preloader, marquee, terminal, toolbelt physics, the flat Bandit drawing and shared motion helpers (`ui.jsx`).
- `src/three/stage.js`: shared renderer setup, lighting and a render loop that pauses offscreen or in hidden tabs.
- `src/three/Raccoon.jsx`: Bandit.
- `src/three/Starfield.jsx`: the scroll-driven background.
- `src/three/scavenger.js`: the arcade engine, with no React inside.
- `src/lib/leaderboard.js`: the global/local leaderboard client.
- `src/lib/scroll.js`: the Lenis wrapper.
- `api/scores.js`: the optional global leaderboard function.
- `src/styles.css`: theme tokens, layout, animation and responsive rules.

Every 3D piece has a fallback when WebGL is unavailable or a chunk fails to load. With `prefers-reduced-motion`, the intro, smooth scrolling, physics and decorative motion are all turned off.

## Browser checks

```sh
npm run test:e2e
```

The Playwright configuration uses locally installed Google Chrome. To use another Chromium build, set `PW_CHROMIUM_PATH` to its executable.

The suite covers:

- the intro and 3D hero;
- the terminal and the toolbelt physics;
- project filters, the detail view and keyboard focus;
- a full arcade flight through to the leaderboard;
- contact and social links;
- mobile navigation;
- horizontal overflow at six widths;
- reduced motion and the WebGL fallback.

Screenshots are written to `test-results/`.
