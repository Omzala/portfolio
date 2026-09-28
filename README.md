# Om Zala — Portfolio

A responsive portfolio built from `Om_Zala_Resume_2026.pdf`, using React, Vite, Three.js, and CSS animations.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

## Build and preview

```sh
npm run build
npm run preview
```

Deploy the generated `dist` directory to any static hosting provider. On Vercel or Netlify, select Vite, use `npm run build`, and set the output directory to `dist`.

## Features

- Pointer-responsive, reflective Three.js sculpture with a CSS fallback when WebGL is unavailable.
- Nine resume projects, category filters, expandable project grid, and keyboard-accessible project dialogs.
- Custom illustrative project artwork; these previews are not screenshots of the linked products.
- About, technical skills, professional experience, and education sections.
- Downloadable original resume, email copy action, GitHub, and LinkedIn links.
- Responsive navigation, scroll reveals, hover animations, and reduced-motion support.
- 3D rendering pauses when the hero is offscreen or the tab is hidden.

## Content and styling

- `src/main.jsx`: resume content, project data, and page components.
- `src/Sculpture.jsx`: 3D scene, materials, lighting, and animation lifecycle.
- `src/styles.css`: responsive styles and animations.
- `public/Om_Zala_Resume_2026.pdf`: downloadable resume.

Google Fonts are loaded externally with local font fallbacks. Project links come from the resume. Travel CRM has no public URL in the resume, so its dialog presents project information without a demo link. The contact button opens the visitor's email client; no mail server or credentials are required.

## Browser checks

```sh
npm run test:e2e
```

The Playwright configuration uses locally installed Google Chrome. The suite checks 3D rendering, project filtering, dialog keyboard behavior, mobile navigation, horizontal overflow at six viewport widths, PDF downloads, clipboard interaction, reduced motion, and the WebGL fallback. Screenshots are generated under `test-results/`.
