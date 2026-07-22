// Backward-compatible entrypoint. The unified Playwright renderer captures
// outdoor and indoor artwork with the exact same bundled Pretendard font used
// by the web page, preventing SVG/Pango fallback font differences in PNGs.
await import("./render-unni-banner-assets.mjs");
