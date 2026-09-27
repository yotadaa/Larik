import { defineConfig, devices } from "@playwright/test";

// Uses a LOCAL D1 database. Do not point this suite at production.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run db:local:setup && npm run dev -- --port 4173 --strictPort",
    url: "http://localhost:4173/library",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
