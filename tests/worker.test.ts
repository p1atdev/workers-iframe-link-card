import { afterEach, describe, expect, it } from "vitest";
import { Miniflare, NoOpLog } from "miniflare";
import type { Awaitable } from "miniflare";
import { getDynamicUserAgent, UserAgentForWebsites } from "../src/lib/user-agent";

type OutboundRequest = {
  method: string;
  url: string;
  userAgent: string | null;
};

type RouteHandler = (request: Request) => Awaitable<Response>;

type TestWorker = {
  mf: Miniflare;
  requests: OutboundRequest[];
  unexpectedRequests: OutboundRequest[];
};

const workers: Miniflare[] = [];

const workerOptions = {
  scriptPath: "dist/iframe_link_card/index.js",
  modulesRoot: "dist/iframe_link_card",
  modules: true,
  compatibilityDate: "2025-07-28",
  compatibilityFlags: ["nodejs_compat"],
  kvNamespaces: ["OGP_CACHE"],
  kvPersist: false,
  cachePersist: false,
  log: new NoOpLog(),
} as const;

const html = (body: string) =>
  new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });

const okHead = () => new Response(null, { status: 200 });

const embedUrl = (target: string) =>
  `http://iframe-link-card.test/embed?url=${encodeURIComponent(target)}`;

const createWorker = (routes: Record<string, RouteHandler>): TestWorker => {
  const requests: OutboundRequest[] = [];
  const unexpectedRequests: OutboundRequest[] = [];

  const mf = new Miniflare({
    ...workerOptions,
    outboundService: async (request) => {
      const record = {
        method: request.method,
        url: request.url,
        userAgent: request.headers.get("User-Agent"),
      };
      requests.push(record);

      const key = `${request.method.toUpperCase()} ${request.url}`;
      const handler = routes[key];
      if (!handler) {
        unexpectedRequests.push(record);
        return new Response(`Unexpected outbound request: ${key}`, { status: 599 });
      }

      return handler(request);
    },
  });

  workers.push(mf);
  return { mf, requests, unexpectedRequests };
};

afterEach(async () => {
  await Promise.all(workers.splice(0).map((mf) => mf.dispose()));
});

describe("User-Agent selection", () => {
  it("uses Facebook crawler UA for common YouTube hosts", () => {
    expect(getDynamicUserAgent("youtube.com")).toBe(UserAgentForWebsites.youtube);
    expect(getDynamicUserAgent("www.youtube.com")).toBe(UserAgentForWebsites.youtube);
    expect(getDynamicUserAgent("youtu.be")).toBe(UserAgentForWebsites.youtube);
  });
});

describe("/embed", () => {
  it("requires a url query parameter", async () => {
    const { mf, requests, unexpectedRequests } = createWorker({});

    const response = await mf.dispatchFetch("http://iframe-link-card.test/embed");

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Please provide a URL query parameter.");
    expect(requests).toEqual([]);
    expect(unexpectedRequests).toEqual([]);
  });

  it("renders OGP data from a webpage and stores the parsed data in KV", async () => {
    const pageUrl = "https://docs.example/articles/workers-vitest";
    const imageUrl = "https://docs.example/assets/card.png";
    const faviconUrl = "https://docs.example/favicon.ico";
    const canonicalUrl = "https://docs.example/articles/canonical";
    const { mf, requests, unexpectedRequests } = createWorker({
      [`GET ${pageUrl}`]: () =>
        html(`
          <html>
            <head>
              <meta property="og:title" content="Workers Vitest Guide">
              <meta property="og:description" content="Testing a link card in Workers runtime.">
              <meta property="og:image" content="/assets/card.png">
              <meta property="og:url" content="/articles/canonical">
              <meta property="og:site_name" content="Docs Example">
              <link rel="shortcut icon" href="/favicon.ico">
            </head>
          </html>
        `),
      [`HEAD ${imageUrl}`]: okHead,
      [`HEAD ${faviconUrl}`]: okHead,
    });

    const response = await mf.dispatchFetch(embedUrl(pageUrl));
    const body = await response.text();
    const cache = await mf.getKVNamespace("OGP_CACHE");
    const cached = await cache.get(pageUrl, "json");

    expect(response.status).toBe(200);
    expect(body).toContain("Workers Vitest Guide");
    expect(body).toContain("Testing a link card in Workers runtime.");
    expect(body).toContain(canonicalUrl);
    expect(body).toContain(`src="${imageUrl}"`);
    expect(cached).toMatchObject({
      title: "Workers Vitest Guide",
      description: "Testing a link card in Workers runtime.",
      image: imageUrl,
      url: canonicalUrl,
      siteName: "Docs Example",
      favicon: faviconUrl,
    });
    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      `GET ${pageUrl}`,
      `HEAD ${imageUrl}`,
      `HEAD ${faviconUrl}`,
    ]);
    expect(unexpectedRequests).toEqual([]);
  });

  it("serves cached OGP data without fetching the target page", async () => {
    const pageUrl = "https://cached.example/post";
    const cachedTitle = "Cached Title";
    const { mf, requests, unexpectedRequests } = createWorker({});
    const cache = await mf.getKVNamespace("OGP_CACHE");
    await cache.put(
      pageUrl,
      JSON.stringify({
        title: cachedTitle,
        description: "Cached Description",
        url: pageUrl,
      }),
    );

    const response = await mf.dispatchFetch(embedUrl(pageUrl));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain(cachedTitle);
    expect(body).toContain("Cached Description");
    expect(requests).toEqual([]);
    expect(unexpectedRequests).toEqual([]);
  });

  it("removes an OGP image when its HEAD check fails", async () => {
    const pageUrl = "https://broken-image.example/post";
    const imageUrl = "https://broken-image.example/card.png";
    const { mf, unexpectedRequests } = createWorker({
      [`GET ${pageUrl}`]: () =>
        html(`
          <html>
            <head>
              <meta property="og:title" content="No Image Card">
              <meta property="og:description" content="The image endpoint rejects HEAD.">
              <meta property="og:image" content="/card.png">
              <meta property="og:url" content="${pageUrl}">
            </head>
          </html>
        `),
      [`HEAD ${imageUrl}`]: () => new Response(null, { status: 404 }),
    });

    const response = await mf.dispatchFetch(embedUrl(pageUrl));
    const body = await response.text();
    const cache = await mf.getKVNamespace("OGP_CACHE");
    const cached = await cache.get(pageUrl, "json");

    expect(response.status).toBe(200);
    expect(body).toContain("No Image Card");
    expect(body).not.toContain("<img");
    expect(cached).toMatchObject({
      title: "No Image Card",
    });
    expect(cached).not.toHaveProperty("image");
    expect(unexpectedRequests).toEqual([]);
  });

  it("renders a useful error card when the target URL is an image", async () => {
    const imagePageUrl = "https://media.example/photo.png";
    const { mf, unexpectedRequests } = createWorker({
      [`GET ${imagePageUrl}`]: () =>
        new Response("not parsed as html", {
          headers: {
            "content-type": "image/png",
          },
        }),
    });

    const response = await mf.dispatchFetch(embedUrl(imagePageUrl));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain(`The URL ${imagePageUrl} points to an image, not a webpage.`);
    expect(body).toContain(`url=${imagePageUrl}`);
    expect(unexpectedRequests).toEqual([]);
  });

  it("uses the YouTube-specific User-Agent when fetching YouTube pages", async () => {
    const pageUrl = "https://www.youtube.com/watch?v=test-video";
    const thumbnailUrl = "https://i.ytimg.com/vi/test-video/maxresdefault.jpg";
    const { mf, requests, unexpectedRequests } = createWorker({
      [`GET ${pageUrl}`]: () => {
        return html(`
          <html>
            <head>
              <meta property="og:title" content="YouTube fixture">
              <meta property="og:description" content="A mocked YouTube page.">
              <meta property="og:image" content="${thumbnailUrl}">
              <meta property="og:url" content="${pageUrl}">
            </head>
          </html>
        `);
      },
      [`HEAD ${thumbnailUrl}`]: okHead,
    });

    const response = await mf.dispatchFetch(embedUrl(pageUrl));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("YouTube fixture");
    expect(requests.map(({ userAgent }) => userAgent)).toEqual([
      UserAgentForWebsites.youtube,
      UserAgentForWebsites.youtube,
    ]);
    expect(unexpectedRequests).toEqual([]);
  });
});
