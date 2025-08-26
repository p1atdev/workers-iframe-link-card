import { getDynamicUserAgent } from "./user-agent";

// thanks: https://zenn.dev/uyas/articles/0b7dcbb46d8031

export interface OGPData {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  url?: string | null;
  siteName?: string | null;
  type?: string | null;
}

class OGPParser {
  ogp: OGPData = {};

  element(element: Element) {
    const property = element.getAttribute("property");
    const content = element.getAttribute("content");

    switch (property) {
      case "og:title":
        this.ogp.title = content;
        break;
      case "og:description":
        this.ogp.description = content;
        break;
      case "og:image":
        this.ogp.image = content;
        break;
      case "og:url":
        this.ogp.url = content;
        break;
      case "og:site_name":
        this.ogp.siteName = content;
        break;
      case "og:type":
        this.ogp.type = content;
        break;
    }
  }
}

export async function getOGP(url: string): Promise<OGPData> {
  const host = new URL(url).host;
  const userAgent = getDynamicUserAgent(host);

  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch OGP data from ${url}`);
  }

  const contentType = res.headers.get("content-type");
  if (contentType?.startsWith("image/")) {
    throw new Error(`The URL ${url} points to an image, not a webpage.`);
  }

  const ogpParser = new OGPParser();

  // https://github.com/oven-sh/bun/issues/4408#issuecomment-1736976282
  const _res = new HTMLRewriter().on("meta", ogpParser).transform(res);
  await _res.text();

  // パースしたものを取得
  const ogp = ogpParser.ogp;

  return ogp;
}
