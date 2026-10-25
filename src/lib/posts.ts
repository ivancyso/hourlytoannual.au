import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export type PostFaq = { q: string; a: string };

export type Post = {
  id: number;
  slug: string;
  keyword: string;
  title: string;
  description: string;
  salarySummary?: string;
  faqs: PostFaq[];
  bodyMarkdown: string;
};

export type PostIndexItem = {
  id: number;
  slug: string;
  keyword: string;
  title: string;
  description: string;
  salarySummary?: string;
};

const PostSchema = z.object({
  id: z.number(),
  slug: z.string().min(1),
  keyword: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  salarySummary: z.string().optional(),
  faqs: z
    .array(z.object({ q: z.string(), a: z.string() }))
    .default([]),
  bodyMarkdown: z.string(),
});

const IndexFileSchema = z.object({
  posts: z.array(
    z.object({
      id: z.number(),
      slug: z.string(),
      keyword: z.string(),
      title: z.string(),
      description: z.string(),
      salarySummary: z.string().optional(),
    }),
  ).default([]),
});

const root = process.cwd();
const postsDir = path.join(root, "data", "posts");
const indexPath = path.join(root, "data", "posts-index.json");

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parsePost(raw: unknown): Post | null {
  const parsed = PostSchema.safeParse(raw);
  if (!parsed.success) return null;
  if ((parsed.data.bodyMarkdown || "").trim().length < 400) return null;
  return parsed.data;
}

export function getPostIndex(): PostIndexItem[] {
  if (!fs.existsSync(indexPath)) return [];
  const parsed = IndexFileSchema.safeParse(readJson(indexPath));
  if (!parsed.success) return [];
  return parsed.data.posts.slice().sort((a, b) => a.id - b.id);
}

export function getAllPosts(): Post[] {
  if (!fs.existsSync(postsDir)) return [];
  return fs
    .readdirSync(postsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => parsePost(readJson(path.join(postsDir, name))))
    .filter((post): post is Post => post !== null)
    .sort((a, b) => a.id - b.id);
}

export function getPostBySlug(slug: string): Post | null {
  const file = path.join(postsDir, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  return parsePost(readJson(file));
}

export const PAGE_SIZE = 20;

export function pageCount(): number {
  return Math.max(1, Math.ceil(getPostIndex().length / PAGE_SIZE));
}

export function postsForPage(page: number): PostIndexItem[] {
  const start = (page - 1) * PAGE_SIZE;
  return getPostIndex().slice(start, start + PAGE_SIZE);
}

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

export function relatedPosts(post: Post, limit = 4): PostIndexItem[] {
  const seed = tokens(`${post.keyword} ${post.title}`);
  return getPostIndex()
    .filter((item) => item.slug !== post.slug)
    .map((item) => {
      const other = tokens(`${item.keyword} ${item.title}`);
      let score = 0;
      for (const token of seed) if (other.has(token)) score += 1;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score || a.item.id - b.item.id)
    .slice(0, limit)
    .map((row) => row.item);
}
