/**
 * Submit sitemap URLs to IndexNow.
 * Local: npm run indexnow:dry && npm run indexnow
 * Production builds can call: node scripts/indexnow.mjs --if-prod
 */
import "dotenv/config";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const dry = process.argv.includes("--dry-run");
const ifProd = process.argv.includes("--if-prod");

if (ifProd && process.env.VERCEL_ENV !== "production") {
  console.log(JSON.stringify({ skipped: true, reason: "not production" }));
  process.exit(0);
}

const SITE_URL = (process.env.SITE_URL || "https://hourlytoannual.au").replace(/\/$/, "");
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "8e413ef7c09641319bb8d6a28741008f";
const host = new URL(SITE_URL).host;
const keyLocation = `${SITE_URL}/${INDEXNOW_KEY}.txt`;
const endpoints = ["https://www.bing.com/indexnow", "https://api.indexnow.org/indexnow"];

function urlsFromSitemap(xml) {
  const urls = [];
  const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match = locRe.exec(xml);
  while (match) {
    const url = match[1].trim();
    if (url.includes(host) && !/sitemap.*\.xml$/i.test(url)) urls.push(url.replace(/\/$/, ""));
    match = locRe.exec(xml);
  }
  return urls;
}

function collect() {
  if (!existsSync(distDir)) throw new Error("dist/ missing. Run npm run build first.");
  const files = readdirSync(distDir).filter((name) => /^sitemap.*\.xml$/i.test(name));
  const set = new Set([SITE_URL]);
  for (const file of files) {
    for (const url of urlsFromSitemap(readFileSync(join(distDir, file), "utf8"))) set.add(url);
  }
  return [...set];
}

async function submit(endpoint, urlList) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation, urlList }),
  });
  if (![200, 202].includes(res.status)) {
    const text = await res.text().catch(() => "");
    throw new Error(`${endpoint} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.status;
}

const urls = collect();
console.log(JSON.stringify({ host, keyLocation, urls: urls.length, dry }));
if (dry) process.exit(0);

for (const endpoint of endpoints) {
  try {
    for (let i = 0; i < urls.length; i += 10000) {
      const chunk = urls.slice(i, i + 10000);
      const status = await submit(endpoint, chunk);
      console.log(JSON.stringify({ endpoint, status, submitted: chunk.length }));
    }
  } catch (error) {
    console.warn(JSON.stringify({ endpoint, error: error instanceof Error ? error.message : String(error) }));
  }
}
