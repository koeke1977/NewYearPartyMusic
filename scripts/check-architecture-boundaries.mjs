import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const moduleRoot = join(root, "apps/worker/src/modules");
const applicationRoots = [
  join(moduleRoot, "ai/application"),
  join(moduleRoot, "music/application"),
  join(moduleRoot, "music/domain"),
  join(moduleRoot, "playback/application"),
  join(moduleRoot, "queue/application"),
  join(moduleRoot, "requests/application"),
  join(moduleRoot, "identity"),
];
const webRoot = join(root, "apps/web");
const webTransportOwners = new Set([
  "apps/web/modules/dj-api.js",
  "apps/web/modules/guest-music-api.js",
]);
const webStorageOwners = new Set([
  "apps/web/modules/dj-session.js",
  "apps/web/modules/guest-session.js",
]);

const forbiddenImport = /(?:^|\/)(?:integrations|infrastructure|platform|routes)(?:\/|$)/;
const forbiddenPackage = /^(?:hono|cloudflare|wrangler)(?:\/|$)/;

async function collectFiles(directory, extension) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [path] : [];
  }));
  return nested.flat();
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const violations = [];
let workerFilesInspected = 0;
for (const directory of applicationRoots) {
  const files = await collectFiles(directory, ".ts");
  for (const file of files) {
    workerFilesInspected += 1;
    const code = stripComments(await readFile(file, "utf8"));
    for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (forbiddenImport.test(specifier) || forbiddenPackage.test(specifier)) {
        violations.push(relative(root, file) + ": forbidden dependency " + specifier);
      }
    }
    if (/\bD1Database\b|\bResponse\b|\.prepare\s*\(/.test(code)) {
      violations.push(relative(root, file) + ": application/domain code must not depend on D1 or Fetch Response APIs");
    }
  }
}

const webFiles = await collectFiles(webRoot, ".js");
for (const file of webFiles) {
  const relativePath = relative(root, file).split("\\").join("/");
  const code = stripComments(await readFile(file, "utf8"));
  if (/\bfetch\s*\(/.test(code) && !webTransportOwners.has(relativePath)) {
    violations.push(relativePath + ": browser HTTP transport must go through the owned API client");
  }
  if (/\blocalStorage\b/.test(code) && !webStorageOwners.has(relativePath)) {
    violations.push(relativePath + ": browser persistence must go through the owned session module");
  }
  if (/api\.spotify\.com/i.test(code)) {
    violations.push(relativePath + ": browser code must not call Spotify directly");
  }
}

const htmlFiles = await collectFiles(webRoot, ".html");
for (const file of htmlFiles) {
  const markup = await readFile(file, "utf8");
  if (/\sstyle\s*=|\son[a-z]+\s*=|<style\b|<script\b(?![^>]*\bsrc\s*=)/i.test(markup)) {
    violations.push(relative(root, file) + ": inline styles, event handlers or scripts are not allowed");
  }
}

if (violations.length) {
  console.error("Architecture boundary check failed:");
  for (const violation of violations) console.error(" - " + violation);
  process.exit(1);
}

console.log(
  "Architecture boundary check passed (" + workerFilesInspected + " Worker TypeScript files, "
  + webFiles.length + " browser JavaScript files and " + htmlFiles.length + " HTML files inspected).",
);
