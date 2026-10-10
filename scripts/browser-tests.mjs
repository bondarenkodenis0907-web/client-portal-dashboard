import { execSync, spawnSync } from "node:child_process";

const status = JSON.parse(
  execSync("npx --yes supabase status --output json", { encoding: "utf8" }),
);
const url = new URL(status.API_URL);
if (!["127.0.0.1", "localhost"].includes(url.hostname))
  throw new Error("Browser tests require a local Supabase instance.");
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  TEST_SUPABASE_SECRET_KEY: status.SECRET_KEY,
};
function run(command) {
  const result = spawnSync(command, { shell: true, stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (process.env.SKIP_BROWSER_BUILD !== "1") run("npm run build");
run("npx playwright test");
