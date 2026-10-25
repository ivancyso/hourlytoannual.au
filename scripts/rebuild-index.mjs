import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "data", "posts");
const indexPath = path.join(root, "data", "posts-index.json");
const searchPath = path.join(root, "public", "search-index.json");

export function rebuildIndex() {
  if (!fs.existsSync(postsDir)) {
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify({ count: 0, posts: [] }, null, 2));
    fs.writeFileSync(searchPath, "[]\n");
    return;
  }

  const posts = fs
    .readdirSync(postsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(postsDir, name), "utf8")))
    .filter((post) => post && post.slug && (post.bodyMarkdown || "").trim().length >= 400)
    .map((post) => ({
      id: post.id,
      slug: post.slug,
      keyword: post.keyword,
      title: post.title,
      description: post.description,
      salarySummary: post.salarySummary || "",
    }))
    .sort((a, b) => a.id - b.id);

  fs.writeFileSync(indexPath, JSON.stringify({ count: posts.length, posts }, null, 2));
  fs.writeFileSync(
    searchPath,
    JSON.stringify(posts.map(({ slug, title, keyword }) => ({ slug, title, keyword }))),
  );
  return posts.length;
}

if (process.argv[1] && process.argv[1].endsWith("rebuild-index.mjs")) {
  const count = rebuildIndex();
  console.log(JSON.stringify({ count }));
}
