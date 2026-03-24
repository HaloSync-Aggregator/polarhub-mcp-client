import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 300_000, // 5 min per test (multiple LLM round-trips)
  expect: { timeout: 60_000 },
  fullyParallel: false, // sequential — real server, shared state
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    video: 'on',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 60_000,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/health',
    timeout: 30_000,
    reuseExistingServer: true,
  },
});
