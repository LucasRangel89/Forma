import { spawnSync } from "node:child_process";

// Keep this separate from `next build` so server deployments retain their API.
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  env: { ...process.env, FORMA_STATIC_EXPORT: "1", NEXT_PUBLIC_FORMA_STORAGE: "local", NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? "/Forma" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
