import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("favicon wiring", () => {
  const indexHtml = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
  const manifest = JSON.parse(
    readFileSync(resolve(__dirname, "../../public/site.webmanifest"), "utf8"),
  );

  it("index.html declares /favicon.png as the primary icon", () => {
    expect(indexHtml).toMatch(
      /<link\s+rel="icon"[^>]*href="\/favicon\.png"[^>]*type="image\/png"/,
    );
  });

  it("index.html includes 16x16, 32x32, and 180x180 icon links", () => {
    expect(indexHtml).toMatch(/sizes="16x16"[^>]*href="\/favicon-16x16\.png"/);
    expect(indexHtml).toMatch(/sizes="32x32"[^>]*href="\/favicon-32x32\.png"/);
    expect(indexHtml).toMatch(
      /rel="apple-touch-icon"[^>]*sizes="180x180"[^>]*href="\/favicon-180x180\.png"/,
    );
  });

  it("index.html references the web manifest", () => {
    expect(indexHtml).toMatch(/rel="manifest"[^>]*href="\/site\.webmanifest"/);
  });

  it("site.webmanifest declares matching icon entries", () => {
    const sizes = new Set(manifest.icons.map((i: { sizes: string }) => i.sizes));
    ["16x16", "32x32", "180x180", "192x192", "512x512"].forEach((s) =>
      expect(sizes.has(s)).toBe(true),
    );
  });
});