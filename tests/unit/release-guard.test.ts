import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const guardPath = fileURLToPath(new URL("../../scripts/release-guard.mjs", import.meta.url));
const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));

describe("production release guard", () => {
  it("uses the default Wrangler environment for test deploys and a separate guard for real-event releases", () => {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    expect(packageJson.scripts.deploy).toBe("wrangler deploy");
    expect(packageJson.scripts["deploy:production"]).toBe("node scripts/release-guard.mjs deploy");
  });

  it("accepts the dedicated production configuration in static preflight without deploying", () => {
    const result = spawnSync(process.execPath, [guardPath, "preflight"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Static production configuration checks passed.");
    expect(result.stdout).toContain("Local-only check.");
    expect(result.stderr).toBe("");
  });

  it("never starts Wrangler deployment without the explicit production release latch", () => {
    const env = { ...process.env };
    delete env.PARTYQUEUE_ALLOW_PRODUCTION_DEPLOY;
    const result = spawnSync(process.execPath, [guardPath, "deploy"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Static production configuration checks passed.");
    expect(result.stderr).toContain("Deployment blocked.");
    expect(result.stderr).toContain("PARTYQUEUE_ALLOW_PRODUCTION_DEPLOY=YES");
    expect(result.stderr).not.toContain("CLOUDFLARE_API_TOKEN");
  });
});
