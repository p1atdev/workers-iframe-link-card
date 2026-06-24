import { describe, expect, it } from "vitest";
import { OGPParser } from "../src/lib/ogp";

const element = (tagName: string, attributes: Record<string, string | null>) => ({
  tagName,
  getAttribute: (name: string) => attributes[name] ?? null,
});

describe("OGPParser", () => {
  it("parses supported OGP meta tags", () => {
    const parser = new OGPParser("https://example.com/articles/post");

    parser.element(element("meta", { property: "og:title", content: "Example Title" }));
    parser.element(element("meta", { property: "og:description", content: "Example Description" }));
    parser.element(element("meta", { property: "og:site_name", content: "Example Site" }));
    parser.element(element("meta", { property: "og:type", content: "article" }));

    expect(parser.ogp).toEqual({
      title: "Example Title",
      description: "Example Description",
      siteName: "Example Site",
      type: "article",
    });
  });

  it("parses OGP tags exposed through name attributes", () => {
    const parser = new OGPParser("https://bun.sh/");

    parser.element(element("meta", { name: "og:title", content: "Bun" }));
    parser.element(
      element("meta", { name: "og:description", content: "All-in-one JavaScript runtime." }),
    );
    parser.element(element("meta", { name: "og:image", content: "https://bun.com/share.png" }));
    parser.element(element("meta", { name: "og:url", content: "https://bun.com" }));

    expect(parser.ogp).toEqual({
      title: "Bun",
      description: "All-in-one JavaScript runtime.",
      image: "https://bun.com/share.png",
      url: "https://bun.com/",
    });
  });

  it("uses lower-priority metadata only when OGP fields are missing", () => {
    const parser = new OGPParser("https://example.com/");

    parser.element(element("meta", { name: "twitter:title", content: "Twitter Title" }));
    parser.element(element("meta", { name: "description", content: "HTML description" }));
    parser.element(element("meta", { property: "og:title", content: "OG Title" }));
    parser.element(element("meta", { property: "og:description", content: "OG description" }));

    expect(parser.ogp).toEqual({
      title: "OG Title",
      description: "OG description",
    });
  });

  it("resolves image, canonical URL, and favicon relative to the source origin", () => {
    const parser = new OGPParser("https://example.com/articles/post?ref=card");

    parser.element(element("meta", { property: "og:image", content: "/assets/card.png" }));
    parser.element(element("meta", { property: "og:url", content: "/articles/canonical" }));
    parser.element(element("link", { rel: "shortcut icon", href: "/favicon.ico" }));

    expect(parser.ogp).toEqual({
      image: "https://example.com/assets/card.png",
      url: "https://example.com/articles/canonical",
      favicon: "https://example.com/favicon.ico",
    });
  });

  it("resolves relative URLs against the document URL", () => {
    const parser = new OGPParser("https://example.com/articles/post?ref=card");

    parser.element(element("meta", { property: "og:image", content: "card.png" }));
    parser.element(element("link", { rel: "icon", href: "favicon.ico" }));

    expect(parser.ogp).toEqual({
      image: "https://example.com/articles/card.png",
      favicon: "https://example.com/articles/favicon.ico",
    });
  });

  it("handles uppercase tag names and mixed-case icon rel values", () => {
    const parser = new OGPParser("https://example.com/");

    parser.element(element("META", { property: "og:title", content: "Uppercase Tag" }));
    parser.element(element("LINK", { rel: "Shortcut ICON", href: "icon.svg" }));

    expect(parser.ogp).toEqual({
      title: "Uppercase Tag",
      favicon: "https://example.com/icon.svg",
    });
  });

  it("parses title text and canonical links", () => {
    const parser = new OGPParser("https://example.com/");

    parser.text({ text: "Example " });
    parser.text({ text: "Title" });
    parser.element(element("link", { rel: "canonical", href: "https://example.com/canonical" }));

    expect(parser.ogp).toEqual({
      title: "Example Title",
      url: "https://example.com/canonical",
    });
  });

  it("ignores empty or invalid URL values", () => {
    const parser = new OGPParser("https://www.youtube.com/?feature=youtu.be");

    parser.element(element("link", { rel: "canonical", href: "undefined" }));
    parser.element(element("link", { rel: "canonical", href: "https://www.youtube.com/" }));

    expect(parser.ogp).toEqual({
      url: "https://www.youtube.com/",
    });
  });

  it("ignores unsupported tags and attributes", () => {
    const parser = new OGPParser("https://example.com/");

    parser.element(element("meta", { name: "viewport", content: "width=device-width" }));
    parser.element(element("link", { rel: "stylesheet", href: "/style.css" }));
    parser.element(element("title", {}));

    expect(parser.ogp).toEqual({});
  });
});
