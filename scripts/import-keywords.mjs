import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = process.env.KEYWORDS_CSV || path.join(root, "au_salary_keywords_combined.csv");
const outPath = path.join(root, "data", "keywords.json");

const EXCLUDE_RE = /\b(porn|xxx|onlyfans|nude|escort)\b/i;

function readCsvText(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf[0] === 0xfe && buf[1] === 0xff) return buf.subarray(2).swap16().toString("utf16le");
  return buf.toString("utf8").replace(/^\uFEFF/, "");
}

function parseLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else quoted = false;
      } else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells;
}

function slugify(keyword, id) {
  const base = String(keyword)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `keyword-${id}`;
}

const lines = readCsvText(csvPath).split(/\r?\n/).filter((line) => line.trim());
const rows = [];
const used = new Map();

for (let i = 1; i < lines.length; i += 1) {
  const cells = parseLine(lines[i]);
  if (cells.length < 3) continue;
  const id = Number(cells[0]);
  const keyword = (cells[2] || "").trim();
  if (!keyword || !Number.isFinite(id) || EXCLUDE_RE.test(keyword)) continue;
  let slug = slugify(keyword, id);
  if (used.has(slug)) slug = `${slug}-${id}`;
  used.set(slug, id);
  rows.push({
    id,
    keyword,
    slug,
    country: (cells[3] || "au").trim().toLowerCase(),
    difficulty: Number(cells[4] || 0) || 0,
    volume: Number(cells[5] || 0) || 0,
  });
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify({ count: rows.length, keywords: rows }, null, 2),
);
console.log(JSON.stringify({ imported: rows.length, first: rows[0]?.keyword, at1500: rows[1499]?.keyword }));
