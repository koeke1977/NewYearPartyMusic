import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const webRoot = join(process.cwd(), "apps/web");
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

const overview = {
  settings: { requestsPaused: false, autoApprove: true, autoQueue: true },
  queueOrder: ["queued-1"],
  requests: [
    {
      id: "queued-1",
      status: "queued",
      track_name: "Music Sounds Better With You",
      artist_name: "Stardust",
      nickname: "Disco Koen",
      duration_ms: 240000,
      album_image_url: "",
    },
  ],
};

const spotifyStatus = {
  connected: true,
  playing: true,
  fallbackActive: false,
  track: { name: "Music Sounds Better With You", artists: ["Stardust"], image: "", durationMs: 240000 },
  progressMs: 78000,
  device: { name: "PartyQueue Browser Test", type: "Computer", volume: 72 },
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relative = normalize(pathname === "/" ? "index.html" : pathname.slice(1));
    if (relative.startsWith("..")) throw new Error("Invalid path");
    const file = await readFile(join(webRoot, relative));
    response.writeHead(200, { "Content-Type": mimeTypes[extname(relative)] || "application/octet-stream" });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

async function mockApi(page, onRequest) {
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postData() ? request.postDataJSON() : null;
    const result = await onRequest({ path: url.pathname, method: request.method(), url, body, request });
    await route.fulfill({
      status: result.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(result.body ?? {}),
    });
  });
}

async function testGuestJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const calls = [];
  page.on("pageerror", error => calls.push({ type: "pageerror", message: error.message }));

  await mockApi(page, async call => {
    calls.push({ path: call.path, method: call.method, body: call.body });
    if (call.path === "/api/guests/join" && call.method === "POST") {
      assert.deepEqual(call.body, { nickname: "Disco Koen", eventCode: "NYE2026" });
      return { body: { sessionToken: "guest-test-token", guest: { nickname: "Disco Koen" }, expiresAt: 1893456000 } };
    }
    if (call.path === "/api/spotify/search" && call.method === "GET") {
      assert.equal(call.url.searchParams.get("q"), "Music Sounds Better");
      return {
        body: {
          tracks: [{
            id: "1234567890123456789012",
            name: "Music Sounds Better With You",
            artists: ["Stardust"],
            durationMs: 240000,
            albumImageUrl: "",
          }],
        },
      };
    }
    if (call.path === "/api/requests" && call.method === "POST") {
      assert.equal(call.request.headers()["authorization"], "Bearer guest-test-token");
      assert.deepEqual(call.body, { trackId: "1234567890123456789012" });
      return { body: { request: { name: "Music Sounds Better With You", status: "approved" } } };
    }
    throw new Error("Unexpected guest API call: " + call.method + " " + call.path);
  });

  await page.goto("http://127.0.0.1:4174/", { waitUntil: "networkidle" });
  await page.locator("#nickname").fill("Disco Koen");
  await page.locator("#event-code").fill("NYE2026");
  await page.locator('#join-form button[type="submit"]').click();

  await page.locator("#guest-track-search").waitFor({ state: "visible" });
  assert.match(await page.locator(".join-card").innerText(), /Welkom, Disco Koen/);

  await page.locator("#guest-track-search").fill("Music Sounds Better");
  await page.locator(".track-item").waitFor({ state: "visible", timeout: 5000 });
  assert.match(await page.locator(".track-item").innerText(), /Stardust/);

  await page.locator(".request-button").click();
  await page.getByText(/goedgekeurd en klaar voor de DJ/).waitFor({ state: "visible", timeout: 5000 });
  assert.equal(calls.filter(call => call.path === "/api/requests").length, 1);
  assert.equal(calls.filter(call => call.type === "pageerror").length, 0);

  await context.close();
  process.stdout.write("PASS guest join → Spotify search → track request\n");
}

async function testDjJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const calls = [];
  page.on("pageerror", error => calls.push({ type: "pageerror", message: error.message }));

  await mockApi(page, async call => {
    calls.push({ path: call.path, method: call.method, body: call.body });
    if (call.path === "/api/dj/login" && call.method === "POST") {
      assert.deepEqual(call.body, { code: "dj-test-code" });
      return { body: { token: "dj-browser-test-token" } };
    }
    if (call.path === "/api/dj/overview") return { body: overview };
    if (call.path === "/api/dj/spotify/status") return { body: spotifyStatus };
    if (call.path === "/api/dj/spotify/devices") return { body: { devices: [] } };
    throw new Error("Unexpected DJ API call: " + call.method + " " + call.path);
  });

  await page.goto("http://127.0.0.1:4174/dj.html", { waitUntil: "networkidle" });
  await page.locator("#dj-code").fill("dj-test-code");
  await page.locator('#dj-login-form button[type="submit"]').click();

  await page.waitForFunction(() => {
    const view = document.querySelector("#dj-console");
    return view && !view.hidden;
  }, null, { timeout: 5000 });
  await page.getByText("Music Sounds Better With You").first().waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("partyqueue_dj_token")), "dj-browser-test-token");
  assert.ok(calls.some(call => call.path === "/api/dj/overview"));
  assert.ok(calls.some(call => call.path === "/api/dj/spotify/status"));
  const aiStyles = await page.evaluate(() => ({
    actionsDisplay: getComputedStyle(document.querySelector(".dj-ai-actions")).display,
    chatGptDisplay: getComputedStyle(document.querySelector(".dj-ai-chatgpt")).display,
  }));
  assert.deepEqual(aiStyles, { actionsDisplay: "grid", chatGptDisplay: "block" });

  await page.locator("#dj-logout").click();
  await page.waitForFunction(() => {
    const login = document.querySelector("#dj-login-card");
    const view = document.querySelector("#dj-console");
    return login && !login.hidden && view?.hidden;
  }, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("partyqueue_dj_token")), null);
  assert.equal(calls.filter(call => call.type === "pageerror").length, 0);

  await context.close();
  process.stdout.write("PASS DJ login → dashboard/polling → logout\n");
}

async function main() {
  await new Promise(resolve => server.listen(4174, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    await testGuestJourney(browser);
    await testDjJourney(browser);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
