import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173'
const chromiumChannel = process.platform === 'win32' ? 'msedge' : undefined

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'artifacts/test-results.json' }],
  ],
  use: {
    baseURL,
    colorScheme: 'light',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        channel: chromiumChannel,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        channel: chromiumChannel,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox', viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit', viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit-mobile',
      use: {
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
})
