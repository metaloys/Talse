// One-off backfill for the payload fix.
//
// Legacy listings still hold full-size base64 images (up to 11 MB per listing)
// because they were created before lib/image-compress.ts existed. This script,
// run once by a developer, re-encodes every stored image to display size and
// generates the cover thumbnail used by catalogue cards.
//
// It uses Playwright (already a devDependency) purely as an image codec: the
// browser's canvas does the decode/resize/encode, so no native image library is
// needed. Requires Chromium, which Playwright already installed for tests.
//
//   node scripts/backfill-covers.mjs           # dry run, reports sizes
//   node scripts/backfill-covers.mjs --write   # applies changes
//
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.

import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const WRITE = process.argv.includes("--write");
const MAX_DIM = 1000;
const QUALITY = 0.82;
const COVER_MAX_DIM = 320;
const COVER_QUALITY = 0.72;

function loadEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const base = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");

const headers = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };

const res = await fetch(`${base}/rest/v1/services?select=id,title,images,cover_image&order=created_at.asc`, { headers });
if (!res.ok) throw new Error(`load services failed: ${res.status} ${await res.text()}`);
const services = await res.json();

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");

async function resize(dataUrl, maxDim, quality) {
  return page.evaluate(
    async ([src, max, q]) => {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode failed"));
        el.src = src;
      });
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      if (!/^data:image\/png/i.test(src)) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      const webp = canvas.toDataURL("image/webp", q);
      return { out: webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png"), w, h };
    },
    [dataUrl, maxDim, quality],
  );
}

let beforeTotal = 0;
let afterTotal = 0;

for (const svc of services) {
  const images = Array.isArray(svc.images) ? svc.images : [];
  if (images.length === 0 && !svc.cover_image) continue;

  const before = images.reduce((s, i) => s + (i?.length ?? 0), 0) + (svc.cover_image?.length ?? 0);
  beforeTotal += before;

  const next = [];
  for (const img of images) {
    if (typeof img !== "string" || !img.startsWith("data:image/")) {
      next.push(img);
      continue;
    }
    const { out } = await resize(img, MAX_DIM, QUALITY);
    // Keep whichever is smaller: re-encoding an already-compressed small image
    // can produce a larger file, and a size regression here would be silent.
    next.push(out.length < img.length ? out : img);
  }

  let cover = svc.cover_image ?? null;
  if (next[0]?.startsWith("data:image/")) {
    const { out } = await resize(next[0], COVER_MAX_DIM, COVER_QUALITY);
    cover = out;
  }

  const after = next.reduce((s, i) => s + (i?.length ?? 0), 0) + (cover?.length ?? 0);
  afterTotal += after;

  const patch = { images: next, cover_image: cover };
  console.log(
    `${WRITE ? "updating" : "would update"} ${svc.id} "${svc.title}" ` +
      `${images.length} img: ${(before / 1024 / 1024).toFixed(2)} MB -> ${(after / 1024).toFixed(0)} KB ` +
      `(cover ${(cover?.length ?? 0) / 1024 > 0 ? ((cover?.length ?? 0) / 1024).toFixed(0) : 0} KB)`,
  );

  if (WRITE) {
    const put = await fetch(`${base}/rest/v1/services?id=eq.${svc.id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    if (!put.ok) throw new Error(`update ${svc.id} failed: ${put.status} ${await put.text()}`);
  }
}

console.log(
  `\n${WRITE ? "done" : "dry run"}: ${services.length} listings checked, ` +
    `${(beforeTotal / 1024 / 1024).toFixed(2)} MB -> ${(afterTotal / 1024).toFixed(0)} KB`,
);
if (!WRITE) console.log("re-run with --write to apply");

await browser.close();
