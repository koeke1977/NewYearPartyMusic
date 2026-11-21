import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";

const mode = process.argv[2] || "preflight";
const config = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
const blockers = [];
const requiredSections = [
  "[env.production]",
  "[env.production.assets]",
  "[[env.production.d1_databases]]",
  "[env.production.durable_objects]",
  "[[env.production.migrations]]",
  "[env.production.vars]",
  "[env.production.triggers]",
  "[env.production.ai]",
];
for (const section of requiredSections) {
  if (!config.includes(section)) blockers.push("Missing Wrangler production section: " + section);
}
const productionEnv = config.split("[env.production]")[1] || "";
if (!/APP_ENV\s*=\s*"production"/.test(productionEnv)) blockers.push('Production environment must set APP_ENV = "production".');
if (!/PUBLIC_ORIGIN\s*=\s*"https:\/\//.test(productionEnv)) blockers.push("Production PUBLIC_ORIGIN must be an HTTPS origin.");
const productionDb = productionEnv.match(/\[\[env\.production\.d1_databases\]\]([\s\S]*?)(?=\n\[|$)/)?.[1] || "";
if (!/binding\s*=\s*"DB"/.test(productionDb) || !/database_id\s*=\s*"[0-9a-f-]{36}"/i.test(productionDb)) blockers.push("Production D1 binding must have its own real database UUID.");
const defaultDb = config.match(/\[\[d1_databases\]\]([\s\S]*?)(?=\n\[|$)/)?.[1] || "";
const defaultId = defaultDb.match(/database_id\s*=\s*"([^"]+)"/)?.[1];
const productionId = productionDb.match(/database_id\s*=\s*"([^"]+)"/)?.[1];
if (productionId && defaultId && productionId === defaultId) blockers.push("Production D1 must not reuse the default database ID.");
if (mode !== "preflight" && mode !== "deploy") { console.error("Usage: node scripts/release-guard.mjs [preflight|deploy]"); process.exit(2); }
if (blockers.length) {
  console.error("PartyQueue release preflight BLOCKED:");
  for (const blocker of blockers) console.error(" - " + blocker);
  console.error("No Cloudflare command was run.");
  process.exit(1);
}
console.log("Static production configuration checks passed.");
if (mode === "preflight") { console.log("Local-only check. Secrets, DNS, OAuth, D1 state and account limits still require the manual runbook checks."); process.exit(0); }
if (process.env.PARTYQUEUE_ALLOW_PRODUCTION_DEPLOY !== "YES") { console.error("Deployment blocked. Set PARTYQUEUE_ALLOW_PRODUCTION_DEPLOY=YES only after a separately approved release."); process.exit(1); }

// Apply only pending, forward-compatible schema additions. Historical migrations that
// rewrite or delete data are never silently executed by the routine release pipeline.
const list = spawnSync("npx", ["wrangler", "d1", "migrations", "list", "partyqueue-production-db", "--remote", "--env", "production"], {
  encoding: "utf8", shell: process.platform === "win32",
});
if (list.status !== 0) {
  console.error("Could not inspect production D1 migration state. Deployment blocked.");
  process.exit(list.status ?? 1);
}
const migrationOutput = (list.stdout || "") + "\n" + (list.stderr || "");
const pendingNames = [...migrationOutput.matchAll(/(\d{4}_[A-Za-z0-9_-]+\.sql)[^\n]*Not applied/gi)].map(match => match[1]);
if (/Not applied/i.test(migrationOutput) && pendingNames.length === 0) {
  console.error("Could not safely identify pending production migrations. Deployment blocked.");
  process.exit(1);
}
for (const name of pendingNames) {
  const sql = (await readFile(new URL("../db/migrations/" + name, import.meta.url), "utf8"))
    .replace(/--[^\n]*/g, "").trim();
  const statements = sql.split(";").map(statement => statement.trim()).filter(Boolean);
  const safe = statements.every(statement =>
    /^(CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX)\b/i.test(statement) ||
    /^ALTER TABLE\s+[A-Za-z0-9_]+\s+ADD COLUMN\b/i.test(statement));
  if (!safe) {
    console.error("Pending migration " + name + " is not a strictly additive schema change. Deployment blocked for manual review.");
    process.exit(1);
  }
}
if (pendingNames.length) {
  console.log("Applying verified additive production D1 migrations:", pendingNames.join(", "));
  const migration = spawnSync("npx", ["wrangler", "d1", "migrations", "apply", "partyqueue-production-db", "--remote", "--env", "production"], {
    stdio: "inherit", shell: process.platform === "win32",
  });
  if (migration.status !== 0) process.exit(migration.status ?? 1);
} else {
  console.log("Production D1 schema is up to date.");
}
const child = spawn("npx", ["wrangler", "deploy", "--env", "production"], { stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", code => process.exit(code ?? 1));
