import { defineConfig } from "@playwright/test";

const baseURL = process.env.PAGES_TEST_URL ?? "http://127.0.0.1:4174/Forma/";
export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    launchOptions: process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH, args: ["--no-sandbox"] } : {},
  },
  webServer: process.env.PAGES_TEST_URL ? undefined : {
    command: "npm run serve:pages",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30_000,
    env: { PORT: "4174", NEXT_PUBLIC_BASE_PATH: "/Forma" },
  },
});
