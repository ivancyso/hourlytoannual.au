/** Keep on-site links. Drop external anchors and leave their text. */
export function stripExternalAnchors(html: string): string {
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (full, attrs: string, inner: string) => {
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    const href = hrefMatch?.[2] ?? "";
    if (!href || href.startsWith("/") || href.startsWith("#")) return full;
    try {
      const host = new URL(href, "https://hourlytoannual.au").hostname;
      if (host === "hourlytoannual.au" || host === "www.hourlytoannual.au") return full;
    } catch {
      return inner;
    }
    return inner;
  });
}
