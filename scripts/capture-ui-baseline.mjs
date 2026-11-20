import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = join(process.cwd(), "apps/web");
const output = join(process.cwd(), "artifacts/ui-baseline");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relative = normalize(pathname === "/" ? "index.html" : pathname.slice(1));
    if (relative.startsWith("..")) throw new Error("Invalid path");
    const file = await readFile(join(root, relative));
    response.writeHead(200, { "Content-Type": mime[extname(relative)] || "application/octet-stream" });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

const overview = {
  settings: { requestsPaused: false, autoApprove: true, autoQueue: true },
  queueOrder: ["q1", "q2", "q3"],
  requests: [
    { id: "q1", status: "queued", track_name: "Music Sounds Better With You", artist_name: "Stardust", nickname: "Disco Lisa", duration_ms: 240000, album_image_url: "" },
    { id: "q2", status: "queued", track_name: "Murder on the Dancefloor", artist_name: "Sophie Ellis-Bextor", nickname: "Emma", duration_ms: 230000, album_image_url: "" },
    { id: "q3", status: "queued", track_name: "Freed From Desire", artist_name: "Gala", nickname: "Party Crew", duration_ms: 215000, album_image_url: "" },
    { id: "p1", status: "pending", track_name: "Danza Kuduro", artist_name: "Don Omar", nickname: "Fiesta", duration_ms: 200000, album_image_url: "" },
    { id: "a1", status: "approved", track_name: "September", artist_name: "Earth, Wind & Fire", nickname: "Groove", duration_ms: 215000, album_image_url: "" },
    { id: "p2", status: "pending", track_name: "Alors on danse", artist_name: "Stromae", nickname: "Belgian Beats", duration_ms: 205000, album_image_url: "" },
  ],
};

const spotifyStatus = {
  connected: true,
  playing: true,
  fallbackActive: false,
  track: { name: "Music Sounds Better With You", artists: ["Stardust"], image: "", durationMs: 240000 },
  progressMs: 78000,
  device: { name: "PartyQueue Demo Player", type: "Computer", volume: 72 },
};

async function main() {
  await new Promise(resolve => server.listen(4173, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const cases = [
      { name: "guest-desktop", path: "/", viewport: { width: 1440, height: 1000 }, dj: false },
      { name: "guest-mobile", path: "/", viewport: { width: 390, height: 844 }, dj: false },
      { name: "dj-desktop", path: "/dj.html", viewport: { width: 1600, height: 1100 }, dj: true },
      { name: "dj-responsive-check", path: "/dj.html", viewport: { width: 1024, height: 768 }, dj: true },
    ];
    const { mkdir } = await import("node:fs/promises");
    await mkdir(output, { recursive: true });
    for (const item of cases) {
      const page = await browser.newPage({ viewport: item.viewport, deviceScaleFactor: 1 });
      if (item.dj) {
        await page.addInitScript(() => localStorage.setItem("partyqueue_dj_token", "visual-baseline-token"));
        await page.route("**/api/**", async route => {
          const url = new URL(route.request().url());
          let body = {};
          if (url.pathname === "/api/dj/overview") body = overview;
          else if (url.pathname === "/api/dj/spotify/status") body = spotifyStatus;
          else if (url.pathname === "/api/dj/spotify/volume") body = {};
          else body = { ok: true };
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        });
      }
      await page.goto("http://127.0.0.1:4173" + item.path, { waitUntil: "networkidle" });
      if (item.dj) await page.locator("#dj-console").waitFor({ state: "visible" });
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(output, item.name + ".png"), fullPage: true, animations: "disabled" });
      await page.close();
      process.stdout.write("Captured " + item.name + "\n");
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
