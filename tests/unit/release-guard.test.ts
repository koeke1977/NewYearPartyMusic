import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const guardPath = fileURLToPath(new URL("../../scripts/release-guard.mjs", import.meta.url));

describe("production release guard", () => {
  it("blocks preflight while the dedicated production environment is not configured", () => {
    const result = spawnSync(process.execPath, [guardPath, "preflight"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PartyQueue release preflight BLOCKED");
    expect(result.stderr).toContain("Missing Wrangler production section");
    expect(result.stderr).toContain("No Cloudflare command was run.");
  });

  it("never starts Wrangler deployment while production configuration is incomplete", () => {
    const result = spawnSync(process.execPath, [guardPath, "deploy"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, PARTYQUEUE_ALLOW_PRODUCTION_DEPLOY: "YES" },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PartyQueue release preflight BLOCKED");
    expect(result.stderr).toContain("No Cloudflare command was run.");
    expect(result.stdout).not.toContain("Static production configuration checks passed.");
  });
});
