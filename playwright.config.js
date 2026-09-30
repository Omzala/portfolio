import { defineConfig } from '@playwright/test';

// Uses locally installed Google Chrome. Set PW_CHROMIUM_PATH to point at another Chromium build instead.
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    ...(executablePath ? {} : { channel: 'chrome' }),
    viewport: { width: 1440, height: 900 },
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
