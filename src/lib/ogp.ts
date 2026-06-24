import { getRequestHeaders } from "./user-agent";

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

type OGPElement = Pick<Element, "tagName" | "getAttribute">;
type OGPTextChunk = { text: string };
type OGPField = keyof OGPData;
type OGPUrlField = Extract<OGPField, "image" | "url" | "favicon">;

const priority = {
  og: 100,
  twitter: 80,
  htmlMeta: 70,
  htmlLink: 60,
  htmlTitle: 50,
} as const;

const fetchTimeoutMs = {
  page: 8000,
  supplemental: 5000,
  asset: 5000,
} as const;

const metaFields: Record<
  string,
  {
    field: OGPField;
    priority: number;
    url?: boolean;
  }
> = {
  "og:title": { field: "title", priority: priority.og },
  "og:description": { field: "description", priority: priority.og },
  "og:image": { field: "image", priority: priority.og, url: true },
  "og:image:secure_url": { field: "image", priority: priority.og, url: true },
  "og:url": { field: "url", priority: priority.og, url: true },
  "og:site_name": { field: "siteName", priority: priority.og },
  "og:type": { field: "type", priority: priority.og },
  "twitter:title": { field: "title", priority: priority.twitter },
  "twitter:description": { field: "description", priority: priority.twitter },
  "twitter:image": { field: "image", priority: priority.twitter, url: true },
  "twitter:image:src": { field: "image", priority: priority.twitter, url: true },
  "twitter:url": { field: "url", priority: priority.twitter, url: true },
  title: { field: "title", priority: priority.htmlMeta },
  description: { field: "description", priority: priority.htmlMeta },
  image: { field: "image", priority: priority.htmlMeta, url: true },
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const normalizeText = (value: string | null): string | null => {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
};

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  return await fetch(input, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
};

const isAbortError = (error: unknown): boolean => {
  return (
    error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")
  );
};

export class OGPParser {
  baseUrl: string = "";
  ogp: OGPData = {};
  private priorities: Partial<Record<OGPField, number>> = {};
  private titleText = "";

  constructor(url: string) {
    this.baseUrl = url;
  }

  private setTextField(
    field: OGPField,
    value: string | null,
    fieldPriority: number,
    replaceSamePriority = true,
  ) {
    const normalized = normalizeText(value);
    if (!normalized) {
      return;
    }

    const currentPriority = this.priorities[field] ?? Number.NEGATIVE_INFINITY;
    if (
      fieldPriority > currentPriority ||
      (replaceSamePriority && fieldPriority === currentPriority)
    ) {
      this.ogp[field] = normalized;
      this.priorities[field] = fieldPriority;
    }
  }

  private resolveUrl(value: string | null): string | null {
    const normalized = normalizeText(value);
    if (!normalized || normalized === "undefined" || normalized === "null") {
      return null;
    }

    try {
      return new URL(normalized, this.baseUrl).href;
    } catch {
      return null;
    }
  }

  private setUrlField(
    field: OGPUrlField,
    value: string | null,
    fieldPriority: number,
    replaceSamePriority = true,
  ) {
    const resolved = this.resolveUrl(value);
    if (!resolved) {
      return;
    }

    this.setTextField(field, resolved, fieldPriority, replaceSamePriority);
  }

  meta(element: OGPElement) {
    const property =
      element.getAttribute("property") ??
      element.getAttribute("name") ??
      element.getAttribute("itemprop");
    const content = element.getAttribute("content");
    const field = property ? metaFields[property.toLowerCase()] : undefined;

    if (!field) {
      return;
    }

    if (field.url) {
      this.setUrlField(field.field as OGPUrlField, content, field.priority);
      return;
    }

    this.setTextField(field.field, content, field.priority);
  }

  link(element: OGPElement) {
    const rel = element.getAttribute("rel") ?? "";
    const href = element.getAttribute("href");

    const rels = rel.split(/\s+/).map((r) => r.toLowerCase());

    if (rels.includes("canonical")) {
      this.setUrlField("url", href, priority.htmlLink, false);
    }

    if (rels.includes("icon") || rels.includes("apple-touch-icon")) {
      const iconPriority = rels.includes("icon") ? priority.htmlLink : priority.htmlLink - 1;
      this.setUrlField("favicon", href, iconPriority, false);
    }
  }

  text(text: OGPTextChunk) {
    this.titleText += text.text;
    this.setTextField("title", this.titleText, priority.htmlTitle);
  }

  element(element: OGPElement) {
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

const getWikipediaSummaryUrl = (url: string): string | null => {
  const parsedUrl = new URL(url);
  if (!parsedUrl.hostname.endsWith(".wikipedia.org") || !parsedUrl.pathname.startsWith("/wiki/")) {
    return null;
  }

  return new URL(
    `/api/rest_v1/page/summary/${parsedUrl.pathname.slice("/wiki/".length)}`,
    parsedUrl.origin,
  ).href;
};

const getNestedString = (value: unknown, path: string[]): string | null => {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }

  return typeof current === "string" ? current : null;
};

const applyWikipediaSummary = async (
  ogp: OGPData,
  pageUrl: string,
  requestHeaders: HeadersInit,
): Promise<void> => {
  if (ogp.description) {
    return;
  }

  const summaryUrl = getWikipediaSummaryUrl(pageUrl);
  if (!summaryUrl) {
    return;
  }

  const headers = new Headers(requestHeaders);
  headers.set("Accept", "application/json");

  let res: Response;
  try {
    res = await fetchWithTimeout(
      summaryUrl,
      {
        headers,
        redirect: "follow",
      },
      fetchTimeoutMs.supplemental,
    );
  } catch {
    return;
  }

  if (!res.ok) {
    return;
  }

  const summary: unknown = await res.json();
  const extract = getNestedString(summary, ["extract"]);
  const page = getNestedString(summary, ["content_urls", "desktop", "page"]);
  const image =
    getNestedString(summary, ["thumbnail", "source"]) ??
    getNestedString(summary, ["originalimage", "source"]);

  if (!ogp.description && extract) {
    ogp.description = normalizeText(extract);
  }
  if (!ogp.url && page) {
    ogp.url = page;
  }
  if (!ogp.image && image) {
    ogp.image = image;
  }
};

export async function getOGP(url: string): Promise<OGPData> {
  const host = new URL(url).hostname;
  const requestHeaders = getRequestHeaders(host);

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        headers: requestHeaders,
        redirect: "follow",
      },
      fetchTimeoutMs.page,
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Failed to fetch OGP data from ${url} (request timed out)`);
    }
    throw error;
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch OGP data from ${url} (${res.status} ${res.statusText})`);
  }

  const contentType = res.headers.get("content-type");
  if (contentType?.startsWith("image/")) {
    throw new Error(`The URL ${url} points to an image, not a webpage.`);
  }

  const responseUrl = res.url || url;
  const ogpParser = new OGPParser(responseUrl);

  // https://github.com/oven-sh/bun/issues/4408#issuecomment-1736976282
  const _res = new HTMLRewriter().on("meta, link, title", ogpParser).transform(res);
  await _res.text();

  // パースしたものを取得
  const ogp = ogpParser.ogp;
  await applyWikipediaSummary(ogp, responseUrl, requestHeaders);

  if (!ogp.url) {
    ogp.url = responseUrl;
  }

  // check ogp image exists
  if (ogp.image) {
    if (!(await existsAsset(ogp.image, requestHeaders))) {
      delete ogp.image;
    }
  }

  // check favicon
  if (ogp.favicon) {
    if (!(await existsAsset(ogp.favicon, requestHeaders))) {
      delete ogp.favicon;
    }
  }

  return ogp;
}

const existsAsset = async (url: string, requestHeaders: HeadersInit): Promise<boolean> => {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "HEAD",
        headers: requestHeaders,
        redirect: "follow",
      },
      fetchTimeoutMs.asset,
    );

    return res.ok;
  } catch {
    return false;
  }
};
