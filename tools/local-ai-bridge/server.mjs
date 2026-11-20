import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOST = process.env.LOCAL_AI_HOST || "127.0.0.1";
const PORT = Number(process.env.LOCAL_AI_PORT || 8787);
const TOKEN = process.env.LOCAL_AI_BRIDGE_TOKEN || "";
const CLI = process.env.CLAUDE_CLI || (process.platform === "win32" ? "claude.cmd" : "claude");
const TIMEOUT_MS = Math.min(Math.max(Number(process.env.LOCAL_AI_TIMEOUT_MS || 90000), 10000), 180000);
const MAX_BODY_BYTES = 24 * 1024;
const MAX_OUTPUT_BYTES = 48 * 1024;
let activeTurn = false;

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function safeTokenMatch(candidate) {
  if (!TOKEN || !candidate) return false;
  const expected = Buffer.from(TOKEN);
  const received = Buffer.from(candidate);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function runClaude(system, user) {
  const tempDir = await mkdtemp(join(tmpdir(), "partyqueue-ai-"));
  const systemPromptPath = join(tempDir, "system-prompt.txt");
  await writeFile(systemPromptPath, system, { encoding: "utf8", mode: 0o600 });

  try {
    return await new Promise((resolve, reject) => {
      const args = ["-p", "--output-format", "text", "--no-session-persistence", "--system-prompt-file", systemPromptPath, "--tools", "", "--disallowedTools", "mcp__*"];
      const childEnv = { ...process.env };
      for (const key of [
        "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
        "ANTHROPIC_CUSTOM_HEADERS", "CLAUDE_CODE_USE_BEDROCK",
        "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY",
      ]) delete childEnv[key];
      const child = spawn(CLI, args, {
        shell: process.platform === "win32",
        windowsHide: true,
        cwd: tempDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: childEnv,
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error("Claude Code timed out."));
      }, TIMEOUT_MS);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", chunk => {
        stdout += chunk;
        if (Buffer.byteLength(stdout, "utf8") > MAX_OUTPUT_BYTES) {
          child.kill();
          finish(new Error("Claude output exceeded the response limit."));
        }
      });
      child.stderr.on("data", chunk => {
        stderr += chunk;
        if (stderr.length > 8000) stderr = stderr.slice(-8000);
      });
      child.on("error", error => finish(new Error("Claude Code could not start. Is it installed and logged in? " + error.message)));
      child.on("close", code => {
        if (code !== 0) return finish(new Error(stderr.trim() || "Claude Code exited with code " + code));
        const answer = stdout.trim();
        if (!answer) return finish(new Error("Claude Code returned an empty answer."));
        finish(null, answer);
      });
      child.stdin.end(user);
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://" + HOST + ":" + PORT);
  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, 200, { ok: true, service: "partyqueue-local-ai-bridge", provider: "claude-code", busy: activeTurn });
  }
  if (request.method !== "POST" || url.pathname !== "/v1/dj/turn") {
    return json(response, 404, { error: "Not found." });
  }
  const authorization = request.headers.authorization || "";
  if (!safeTokenMatch(authorization.startsWith("Bearer ") ? authorization.slice(7) : "")) {
    return json(response, 401, { error: "Unauthorized." });
  }
  if (activeTurn) return json(response, 429, { error: "Local AI is busy. Retry shortly." });

  let payload;
  try {
    payload = await readJson(request);
  } catch (error) {
    return json(response, error.message === "BODY_TOO_LARGE" ? 413 : 400, { error: "Invalid JSON request." });
  }
  if (!payload || typeof payload !== "object" ||
      typeof payload.system !== "string" || typeof payload.user !== "string" ||
      !payload.system.trim() || !payload.user.trim() ||
      payload.system.length > 12000 || payload.user.length > 12000 ||
      Object.keys(payload).some(key => !["system", "user"].includes(key))) {
    return json(response, 400, { error: "Expected only non-empty system and user strings (max. 12,000 characters each)." });
  }

  activeTurn = true;
  try {
    const answer = await runClaude(payload.system, payload.user);
    return json(response, 200, { ok: true, provider: "claude-code-local", answer });
  } catch (error) {
    return json(response, 502, { error: error instanceof Error ? error.message : "Local AI failed." });
  } finally {
    activeTurn = false;
  }
});

if (!TOKEN || TOKEN.length < 32) {
  console.error("Set LOCAL_AI_BRIDGE_TOKEN to a random secret of at least 32 characters.");
  process.exit(1);
}
server.listen(PORT, HOST, () => {
  console.log("PartyQueue Local AI Bridge listening on http://" + HOST + ":" + PORT);
  console.log("Claude Code CLI: " + CLI);
});
