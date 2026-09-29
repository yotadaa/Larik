import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const steps = [
  ["run", "build"],
  // Fail closed before publishing code that expects password-auth columns which
  // may not exist in the remote D1 yet. This is read-only; migrations remain an
  // explicit operator action via `npm run db:migrate:remote`.
  ["run", "cf:verify-schema"],
  ["exec", "wrangler", "--", "deploy"],
];

for (const args of steps) {
  const result = spawnSync(npm, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    if (args.includes("cf:verify-schema")) {
      console.error("Remote D1 auth schema verification failed. If migrations are pending, run: npm run db:migrate:remote");
    }
    process.exit(result.status ?? 1);
  }
}
