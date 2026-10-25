// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const lastmod = new Date().toISOString();

export default defineConfig({
  site: "https://hourlytoannual.au",
  output: "static",
  trailingSlash: "never",
  integrations: [
    sitemap({
      serialize(item) {
        const url = item.url;
        let priority = 0.6;
        let changefreq = "monthly";
        if (/hourlytoannual\.au\/?$/.test(url)) {
          priority = 1;
          changefreq = "weekly";
        } else if (/\/blog\/?$/.test(url)) {
          priority = 0.9;
          changefreq = "daily";
        } else if (url.includes("/blog/")) {
          priority = 0.75;
          changefreq = "monthly";
        } else if (url.includes("/topics")) {
          priority = 0.8;
          changefreq = "weekly";
        } else if (url.includes("/data") || url.includes("/about")) {
          priority = 0.7;
        }
        return { ...item, lastmod, priority, changefreq };
      },
    }),
  ],
});
