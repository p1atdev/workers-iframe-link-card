import { getDynamicUserAgent } from "./user-agent";

// thanks: https://zenn.dev/uyas/articles/0b7dcbb46d8031

export interface OGPData {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  url?: string | null;
  siteName?: string | null;
  type?: string | null;
  favicon?: string | null;
}

class OGPParser {
  origin: string = "";
  ogp: OGPData = {};

  constructor(url: string) {
    this.origin = new URL(url).origin;
  }

  meta(element: Element) {
    const property = element.getAttribute("property");
    const content = element.getAttribute("content");

    switch (property) {
      case "og:title": {
        this.ogp.title = content;
        break;
      }
      case "og:description": {
        this.ogp.description = content;
        break;
      }
      case "og:image": {
        this.ogp.image = new URL(content || "", this.origin).href;
        break;
      }
      case "og:url": {
        this.ogp.url = new URL(content || "", this.origin).href;
        break;
      }
      case "og:site_name": {
        this.ogp.siteName = content;
        break;
      }
      case "og:type": {
        this.ogp.type = content;
        break;
      }
    }
  }

  link(element: Element) {
    const rel = element.getAttribute("rel") ?? "";
    const href = element.getAttribute("href");

    const rels = rel.split(" ").map((r) => r.toLowerCase());

    if (rels.includes("icon")) {
      this.ogp.favicon = new URL(href || "", this.origin).href;
    }
  }

  element(element: Element) {
    console.dir(element, { depth: null });
    const tagName = element.tagName.toLowerCase();

    switch (tagName) {
      case "meta": {
        this.meta(element);
        break;
      }
      case "link": {
        this.link(element);
        break;
      }
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

  const ogpParser = new OGPParser(url);

  // https://github.com/oven-sh/bun/issues/4408#issuecomment-1736976282
  const _res = new HTMLRewriter().on("meta, link", ogpParser).transform(res);
  await _res.text();

  // パースしたものを取得
  const ogp = ogpParser.ogp;

  // check ogp image exists
  if (ogp.image) {
    const res = await fetch(ogp.image, {
      method: "HEAD",
      headers: {
        "User-Agent": userAgent,
      },
      redirect: "follow",
    });

    // 適切に取得できなかったら削除
    if (!res.ok) {
      delete ogp.image;
    }
  }

  // check favicon
  if (ogp.favicon) {
    const res = await fetch(ogp.favicon, {
      method: "HEAD",
      headers: {
        "User-Agent": userAgent,
      },
      redirect: "follow",
    });

    // 適切に取得できなかったら削除
    if (!res.ok) {
      delete ogp.favicon;
    }
  }

  return ogp;
}
