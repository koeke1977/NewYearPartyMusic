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

const forbiddenImport = /(?:^|\/)(?:integrations|infrastructure|platform|routes)(?:\/|$)/;
const forbiddenPackage = /^(?:hono|cloudflare|wrangler)(?:\/|$)/;

async function collectTypeScript(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScript(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  }));
  return nested.flat();
}

const violations = [];
let inspected = 0;

for (const directory of applicationRoots) {
  const files = await collectTypeScript(directory);
  for (const file of files) {
    inspected += 1;
    const source = await readFile(file, "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (forbiddenImport.test(specifier) || forbiddenPackage.test(specifier)) {
        violations.push(relative(root, file) + ": forbidden dependency " + specifier);
      }
    }

    if (/\bD1Database\b|\bResponse\b|\.prepare\s*\(/.test(code)) {
      violations.push(relative(root, file) + ": application/policy code must not depend on D1 or Fetch Response APIs");
    }
  }
}

if (violations.length) {
  console.error("Architecture boundary check failed:");
  for (const violation of violations) console.error(" - " + violation);
  process.exit(1);
}

console.log("Architecture boundary check passed (" + inspected + " TypeScript files inspected).");
