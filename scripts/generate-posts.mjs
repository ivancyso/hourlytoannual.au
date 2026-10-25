import "dotenv/config";
import { jsonrepair } from "jsonrepair";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { rebuildIndex } from "./rebuild-index.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const keywordsPath = path.join(root, "data", "keywords.json");
const postsDir = path.join(root, "data", "posts");
const salaryPath = path.join(root, "data", "salary-index.json");
const statePath = path.join(root, ".generate-blog-state.json");

const SITE = process.env.SITE_URL || "https://hourlytoannual.au";
const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";
const POSTS_PER_MINUTE = Number(process.env.POSTS_PER_MINUTE || 30);
const CONCURRENCY = Number(process.env.CONCURRENCY || 30);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : 1500;
const WEB_SEARCH_MODE = (process.env.WEB_SEARCH_MODE || "auto").toLowerCase();
const WEB_SEARCH_MAX_RESULTS = Number(process.env.WEB_SEARCH_MAX_RESULTS || 3);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 120000);

const ANGLES = [
  "a 38-hour week, a fortnight, and a 52-week year",
  "casual loading of 25% and super paid on top",
  "the National Minimum Wage versus an award",
  "state differences in ordinary-time earnings",
  "resident tax and the Medicare levy on the annual figure",
];

const LOCAL_SKIP =
  /minimum wage|living wage|take[- ]?home|after[- ]?tax|salary calculator|pay calculator|income tax|medicare|superannuation|super guarantee|salary sacrifice|salary packaging|average salary|median salary|average australian|hourly rate|per hour|fortnight|casual loading|award wage|national minimum/i;

const FORCE_SEARCH =
  /smart ?salary|maxxia|visa|immigration|celebrity|net worth|per second|premier league|\b(usa|uk|united kingdom|canada|dubai|india|japan|new zealand)\b/i;

function loadKeywords() {
  if (!fs.existsSync(keywordsPath)) {
    console.error("Run npm run data:keywords first");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(keywordsPath, "utf8")).keywords;
}

function loadSalary() {
  return JSON.parse(fs.readFileSync(salaryPath, "utf8"));
}

function needsWebSearch(keyword, salary) {
  if (WEB_SEARCH_MODE === "always") return { use: true, reason: "mode=always" };
  if (WEB_SEARCH_MODE === "never") return { use: false, reason: "mode=never" };

  const k = String(keyword || "").toLowerCase();

  // Covered by salary-index.json: do not call the web plugin.
  if (LOCAL_SKIP.test(k)) return { use: false, reason: "local-salary-db" };

  const industryHit = (salary.industries || []).some((row) =>
    (row.aliases || []).some((alias) => alias.length > 3 && k.includes(alias)),
  );
  if (industryHit) return { use: false, reason: "local-industry" };

  const stateHit = (salary.states || []).some((row) => new RegExp(row.match, "i").test(k));
  if (stateHit) return { use: false, reason: "local-state" };

  if (FORCE_SEARCH.test(k)) return { use: true, reason: "named-or-off-market" };
  if (/\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(keyword)) return { use: true, reason: "possible-person" };

  return { use: true, reason: "unknown-role" };
}

function existingSlugs() {
  const set = new Set();
  if (!fs.existsSync(postsDir)) return set;
  for (const name of fs.readdirSync(postsDir)) {
    if (name.endsWith(".json")) set.add(name.replace(/\.json$/, ""));
  }
  return set;
}

function pickJobs() {
  const existing = existingSlugs();
  return loadKeywords()
    .slice(0, LIMIT)
    .filter((row) => !existing.has(row.slug));
}

function salaryBrief(keyword, salary) {
  const k = keyword.toLowerCase();
  const lines = [
    `National Minimum Wage from 1 July 2026: $${salary.minimumWage.adultHourly}/hour, $${salary.minimumWage.adultWeekly}/week for 38 hours, casual $${salary.minimumWage.casualHourly}/hour including 25% loading.`,
    `ABS Average Weekly Earnings, May 2026: full-time adult ordinary time $${salary.national.fullTimeOrdinaryWeekly}/week. All employees total earnings $${salary.national.allEmployeesTotalWeekly}/week (includes part-time).`,
    `Resident tax 2026–27: nil to $18,200; 15% to $45,000; 30% to $135,000; 37% to $190,000; 45% above that. Medicare levy generally 2%.`,
    `Super guarantee 12% of ordinary earnings, paid on top, maximum contribution base $${salary.superMaxBase}. Formula: annual gross ≈ hourly × hours/week × 52.`,
  ];
  for (const state of salary.states || []) {
    if (new RegExp(state.match, "i").test(k)) {
      lines.push(`${state.name} full-time ordinary time, May 2026: $${state.weeklyAud}/week.`);
    }
  }
  for (const industry of salary.industries || []) {
    if ((industry.aliases || []).some((alias) => alias.length > 3 && k.includes(alias))) {
      lines.push(`${industry.name} full-time ordinary time, May 2026: $${industry.weeklyAud}/week. This is an industry average, not a job median.`);
    }
  }
  return lines.join(" ");
}

function buildWritePrompt(keyword, angle, salary, useSearch) {
  const researchStep = useSearch
    ? `Web search results are attached. Use them for "${keyword}", then check them against the on-site reference. Prefer the Fair Work Ombudsman, the Fair Work Commission, the ABS, and the ATO when they conflict with a recruiter survey.`
    : `Do not search. No web results are attached because this keyword is covered by the on-site reference below. Write only from that reference. If it is an industry or state average, say it is an average and not this job's median. Do not invent a job median.`;

  return `You are the Australian English editor for Hourly to annual (hourlytoannual.au).
Readers have an hourly rate, or a salary offer, and want the 38-hour year, the fortnight, tax, and super.

${researchStep}

Hard rules:
- Australian English
- Use the keyword "${keyword}" naturally in the title and body
- Explain hourly × hours per week × 52, and say when you assume 38 hours
- Mention the fortnight (weekly × 2) when it helps
- Distinguish the National Minimum Wage, award rates, casual loading, and super paid on top
- Markdown body uses ## and ### only
- Body 900–1400 words
- At least two internal markdown links. Use only these paths, exactly: [the timesheet](/) [pay guides](/blog) [reference tables](/data) [about the timesheet](/about) [minimum wage](/topics/minimum-wage) [take-home pay](/topics/take-home) [super and packaging](/topics/super-and-packaging) [average pay](/topics/average-pay) [hourly conversion](/topics/hourly-conversion) [casual loading](/topics/casual-loading) [job pay](/topics/job-pay)
- The timesheet is the home page. The reader types a base hourly rate. A checkbox adds 25% casual loading on top. Never tell the reader to type a rate that already includes casual loading.
- Do not invent paths such as /timesheet or /calculator
- Exactly 3 FAQs in the faqs array. Do not put a FAQ section in the body
- Never write an external URL, a full domain, or a bare domain
- Name organisations in words: Fair Work Ombudsman, Fair Work Commission, Australian Bureau of Statistics, Australian Taxation Office
- Never mention search volume, SEO, rankings, or traffic
- Never include a publish date, an updated-on line, a byline date, or the phrase "at the time of writing"
- Never ask for a password, login, or personal details
- If a precise figure is not supported, say so

On-site reference:
${salaryBrief(keyword, salary)}

Disclaimer to respect: ${salary.disclaimer}

Writing angle: ${angle}
Keyword: ${keyword}

Return valid JSON only:
{
  "title": "Natural title that includes the keyword",
  "description": "120-160 character meta description that includes the keyword",
  "salarySummary": "One sentence on the pay point, including the hours assumption",
  "faqs": [{"q":"Question","a":"Answer"},{"q":"Question","a":"Answer"},{"q":"Question","a":"Answer"}],
  "bodyMarkdown": "## Heading\\n\\nBody..."
}`;
}

async function callOpenRouter({ apiKey, prompt, useSearch }) {
  const payload = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content: useSearch
          ? "You are a careful Australian pay writer. Web results are attached. Return valid JSON only. Prefer Fair Work, ABS, and ATO figures. Never invent precise statistics. Never include URLs or domain names. Never mention search volume or article dates."
          : "You are a careful Australian pay writer. Web search is off. Do not search. Use only the reference in the user message. Return valid JSON only. Never invent precise statistics. Never include URLs or domain names. Never mention search volume or article dates.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
    response_format: { type: "json_object" },
    provider: {
      only: ["streamlake/fp8"],
      allow_fallbacks: false,
    },
  };

  if (useSearch) {
    payload.plugins = [{ id: "web", max_results: WEB_SEARCH_MAX_RESULTS }];
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": SITE,
    "X-Title": "Hourly to annual",
  };

  const send = () =>
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  let res = await send();
  if (!res.ok && res.status === 400) {
    const errText = await res.text();
    if (/response_format|json_object|plugins/i.test(errText)) {
      delete payload.response_format;
      if (/plugins/i.test(errText)) delete payload.plugins;
      res = await send();
    } else {
      throw new Error(`OpenRouter 400: ${errText.slice(0, 500)}`);
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in model response");
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return JSON.parse(jsonrepair(jsonMatch[0]));
  }
}

function isInternalHref(href) {
  if (!href) return false;
  if (href.startsWith("/") || href.startsWith("#")) return true;
  try {
    const host = new URL(href).hostname;
    return host === "hourlytoannual.au" || host === "www.hourlytoannual.au";
  } catch {
    return false;
  }
}

const KNOWN_PATHS = new Set([
  "/",
  "/blog",
  "/data",
  "/about",
  "/topics",
  "/topics/minimum-wage",
  "/topics/take-home",
  "/topics/super-and-packaging",
  "/topics/average-pay",
  "/topics/hourly-conversion",
  "/topics/casual-loading",
  "/topics/job-pay",
]);

function normaliseLinks(text) {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label, href) => {
    const raw = String(href).trim();
    if (!raw.startsWith("/")) return full;
    const target = raw.split(/[?#]/)[0].replace(/\/$/, "") || "/";
    if (KNOWN_PATHS.has(target) || target.startsWith("/blog/")) return `[${label}](${target})`;
    if (/time|calc|convert|home|sheet/.test(target)) return `[${label}](/)`;
    return `[${label}](/blog)`;
  });
}

function stripExternal(input) {
  if (typeof input !== "string" || !input) return "";
  let text = input;
  text = text.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (full, label, href) => {
    if (isInternalHref(String(href).trim())) return full;
    const clean = String(label).trim();
    if (/^https?:\/\//i.test(clean) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(clean)) return "";
    return clean;
  });
  text = text.replace(/https?:\/\/[^\s)\]>"']+/gi, "");
  text = text.replace(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\.(?:au|com|org|net|gov|uk|io)\b\/?\S*/gi, "");
  text = text.replace(/^\s*(published(?:\s+on)?|last\s+updated|updated\s+on|posted(?:\s+on)?)\s*:?.+$/gim, "");
  text = text.replace(/\b(search\s*volume|monthly\s*searches|seo\s*keyword)\b[^.]*\./gi, "");
  text = text.replace(/\bat the time of writing\b/gi, "in this estimate");
  text = normaliseLinks(text);
  return text
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function writePost(job, parsed, searchPlan) {
  const title = stripExternal(String(parsed.title || job.keyword));
  const description = stripExternal(String(parsed.description || "")).slice(0, 180);
  const salarySummary = stripExternal(String(parsed.salarySummary || ""));
  let body = stripExternal(String(parsed.bodyMarkdown || "").replace(/\\n/g, "\n"));
  body = body.replace(/\n##\s+(frequently\s+asked\s+questions|faqs?)\s*\n[\s\S]*$/i, "").trim();
  if (!body.includes("](/")) {
    body += "\n\nSee [the timesheet](/) and the [reference tables](/data) for the 38-hour working.";
  }
  if (body.length < 400) throw new Error(`bodyMarkdown too short (${body.length} chars)`);

  const faqs = Array.isArray(parsed.faqs)
    ? parsed.faqs
        .filter((item) => item && item.q && item.a)
        .slice(0, 3)
        .map((item) => ({
          q: stripExternal(String(item.q)),
          a: stripExternal(String(item.a)),
        }))
    : [];

  const post = {
    id: job.id,
    slug: job.slug,
    keyword: job.keyword,
    title,
    description,
    salarySummary,
    faqs,
    bodyMarkdown: body,
    model: MODEL,
    provider: "streamlake/fp8",
    webSearch: searchPlan.use,
    webSearchReason: searchPlan.reason,
  };

  fs.mkdirSync(postsDir, { recursive: true });
  fs.writeFileSync(path.join(postsDir, `${job.slug}.json`), JSON.stringify(post, null, 2));
  return post;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("Set OPENROUTER_API_KEY in .env");
    process.exit(1);
  }

  const salary = loadSalary();
  const jobs = pickJobs();
  const intervalMs = Math.ceil(60000 / Math.max(1, POSTS_PER_MINUTE));
  const limit = pLimit(CONCURRENCY);

  console.log(
    JSON.stringify({
      pending: jobs.length,
      postsPerMinute: POSTS_PER_MINUTE,
      concurrency: CONCURRENCY,
      intervalMs,
      model: MODEL,
      provider: { only: ["streamlake/fp8"], allow_fallbacks: false },
      webSearchMode: WEB_SEARCH_MODE,
      webSearchMaxResults: WEB_SEARCH_MAX_RESULTS,
      sample: jobs.slice(0, 8).map((job) => job.keyword),
    }),
  );

  if (!jobs.length) {
    rebuildIndex();
    return;
  }

  let created = 0;
  let failed = 0;
  let rateLimitHits = 0;
  let searched = 0;
  let localOnly = 0;
  let stopCredits = false;
  const started = Date.now();
  let nextSlot = Date.now();
  const failures = [];

  await Promise.all(
    jobs.map((job, index) =>
      limit(async () => {
        if (stopCredits) return;
        const wait = Math.max(0, nextSlot - Date.now());
        nextSlot += intervalMs;
        if (wait) await sleep(wait);

        const angle = ANGLES[(job.id + index) % ANGLES.length];
        const searchPlan = needsWebSearch(job.keyword, salary);
        const t0 = Date.now();
        try {
          let parsed;
          try {
            parsed = await callOpenRouter({
              apiKey,
              prompt: buildWritePrompt(job.keyword, angle, salary, searchPlan.use),
              useSearch: searchPlan.use,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/429|rate limit/i.test(message)) {
              rateLimitHits += 1;
              console.error(JSON.stringify({ status: "rate_limit", slug: job.slug, message: message.slice(0, 240) }));
              await sleep(15000);
              parsed = await callOpenRouter({
                apiKey,
                prompt: buildWritePrompt(job.keyword, angle, salary, searchPlan.use),
                useSearch: searchPlan.use,
              });
            } else {
              throw error;
            }
          }
          writePost(job, parsed, searchPlan);
          created += 1;
          if (searchPlan.use) searched += 1;
          else localOnly += 1;
          const rpm = created / ((Date.now() - started) / 60000 || 1);
          console.log(
            JSON.stringify({
              status: "ok",
              slug: job.slug,
              keyword: job.keyword,
              ms: Date.now() - t0,
              created,
              failed,
              rpm: Number(rpm.toFixed(2)),
              webSearch: searchPlan.use,
              webSearchReason: searchPlan.reason,
            }),
          );
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          if (/402|insufficient credits|requires more credits/i.test(message)) {
            stopCredits = true;
            console.error(JSON.stringify({ status: "credits_exhausted", slug: job.slug, message: message.slice(0, 300) }));
          } else if (/429|rate limit/i.test(message)) {
            rateLimitHits += 1;
            console.error(JSON.stringify({ status: "rate_limit", slug: job.slug, message: message.slice(0, 300) }));
          } else {
            console.error(JSON.stringify({ status: "fail", slug: job.slug, message: message.slice(0, 300) }));
          }
          failures.push({ slug: job.slug, message: message.slice(0, 240) });
        }

        if ((created + failed) % 10 === 0) rebuildIndex();
      }),
    ),
  );

  rebuildIndex();
  const elapsedMs = Date.now() - started;
  const summary = {
    ok: true,
    created,
    failed,
    rateLimitHits,
    searched,
    localOnly,
    creditsExhausted: stopCredits,
    elapsedMs,
    effectiveRpm: Number((created / (elapsedMs / 60000 || 1)).toFixed(2)),
    targetRpm: POSTS_PER_MINUTE,
    totalPosts: existingSlugs().size,
  };
  fs.writeFileSync(statePath, JSON.stringify({ ...summary, failures: failures.slice(0, 40) }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (stopCredits) process.exit(2);
}

process.on("uncaughtException", (error) => {
  console.error(JSON.stringify({ status: "uncaughtException", message: String(error?.stack || error).slice(0, 500) }));
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ status: "unhandledRejection", message: String(reason).slice(0, 500) }));
});

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
