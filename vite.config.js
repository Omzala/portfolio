import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Serves the Vercel functions in api/ from the dev and preview servers, so the MongoDB leaderboard
// works locally exactly as it does when deployed. Restart the server after editing a function.
function apiFunctions() {
  const middleware = async (req, res, next) => {
    const name = /^\/api\/([a-z][\w-]*)(?:[/?]|$)/i.exec(req.url ?? '')?.[1];
    const file = name && resolve('api', `${name}.js`);
    if (!file || !existsSync(file)) return next();
    try {
      const { default: handler } = await import(pathToFileURL(file).href);
      await handler(req, res);
    } catch (error) { next(error); }
  };
  return {
    name: 'api-functions',
    configureServer: server => { server.middlewares.use(middleware); },
    configurePreviewServer: server => { server.middlewares.use(middleware); },
  };
}

// Three.js ships as one lazily loaded chunk, so allow it past the default size warning.
export default defineConfig(({ mode }) => {
  // Make .env / .env.local values (MONGODB_URI, ...) visible to the functions above.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) process.env[key] ??= value;
  return { plugins: [react(), apiFunctions()], build: { chunkSizeWarningLimit: 700 } };
});
