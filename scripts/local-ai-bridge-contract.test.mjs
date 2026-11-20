import { test } from "node:test";
import assert from "node:assert/strict";

test("bridge source keeps the listener loopback-only by default", async () => {
  const source = await (await import("node:fs/promises")).readFile(
    new URL("../tools/local-ai-bridge/server.mjs", import.meta.url), "utf8",
  );
  assert.match(source, /process\.env\.LOCAL_AI_HOST \|\| "127\.0\.0\.1"/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /"--tools", ""/);
  assert.match(source, /MAX_BODY_BYTES/);
  assert.match(source, /TIMEOUT_MS/);
  assert.match(source, /ANTHROPIC_API_KEY/);
  assert.match(source, /delete childEnv\[key\]/);
});

test("bridge documentation forbids silent API billing fallback", async () => {
  const source = await (await import("node:fs/promises")).readFile(
    new URL("../../tools/local-ai-bridge/README.md", import.meta.url), "utf8",
  );
  assert.match(source, /does not switch to API billing/i);
  assert.match(source, /Spotify catalogue results/i);
});
