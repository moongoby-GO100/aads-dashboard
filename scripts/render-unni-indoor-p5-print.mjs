import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const root = process.cwd();
const outputRoot = path.join(root, "public/brands/unni-naengmyeon/banners-20260722/print/300dpi");
const pageUrl = process.env.UNNI_BANNER_URL || "http://127.0.0.1:3100/unni-naengmyeon/brand/banners";
const printPixels = 7087; // 600mm at 300DPI, rounded to the nearest whole pixel.
const printDensity = 300;

await fs.mkdir(outputRoot, { recursive: true });

async function writePng(sourcePath, outputPath) {
  const image = sharp(sourcePath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || Math.abs(metadata.width - printPixels) > 1 || Math.abs(metadata.height - printPixels) > 1) {
    throw new Error(`Unexpected P5 artwork dimensions: ${metadata.width}×${metadata.height}`);
  }
  await image
    // Chromium can round a CSS width to one additional output pixel. Normalize
    // that harmless rounding variance to the print specification exactly.
    .resize(printPixels, printPixels, { fit: "fill" })
    .withMetadata({ density: printDensity })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function writeHoleGuide(artworkPath, outputPath) {
  const pixelsPerMillimeter = printDensity / 25.4;
  const holeCenter = Math.round(25 * pixelsPerMillimeter);
  const holeRadius = Math.round(5 * pixelsPerMillimeter);
  const safeInset = Math.round(35 * pixelsPerMillimeter);
  const circles = [
    [holeCenter, holeCenter],
    [printPixels - holeCenter, holeCenter],
    [holeCenter, printPixels - holeCenter],
    [printPixels - holeCenter, printPixels - holeCenter],
  ].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${holeRadius}"/>`).join("");
  const overlay = `<svg width="${printPixels}" height="${printPixels}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${safeInset}" y="${safeInset}" width="${printPixels - safeInset * 2}" height="${printPixels - safeInset * 2}" fill="none" stroke="#ff715d" stroke-width="10" stroke-dasharray="30 22"/>
    <g fill="rgba(255,255,255,.3)" stroke="#ff715d" stroke-width="14">${circles}</g>
  </svg>`;
  await sharp(artworkPath)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .withMetadata({ density: printDensity })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: printPixels + 160, height: printPixels + 160 },
    deviceScaleFactor: 1,
  });
  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 30_000 });

  const banner = page.locator('[data-export="indoor-p5"]');
  await banner.evaluate((element, pixels) => {
    const target = element;
    target.style.width = `${pixels}px`;
    target.style.height = `${pixels}px`;
    target.style.maxWidth = "none";
    target.style.aspectRatio = "auto";
  }, printPixels);
  await banner.locator("img").evaluateAll((images) => Promise.all(images.map((image) => image.decode().catch(() => undefined))));
  await page.waitForTimeout(500);

  const artworkTemp = path.join(outputRoot, ".indoor-p5-artwork.png");
  await page.addStyleTag({ content: '[data-export="indoor-p5"] [class*="guides"] { display: none !important; }' });
  await banner.screenshot({ path: artworkTemp, animations: "disabled", timeout: 180_000 });
  await writePng(artworkTemp, path.join(outputRoot, "indoor-p5-glass-pickup-300dpi.png"));
  await fs.unlink(artworkTemp);
  console.log("rendered indoor P5 300DPI artwork");

  console.log("rendering indoor P5 hole guide");
  await writeHoleGuide(
    path.join(outputRoot, "indoor-p5-glass-pickup-300dpi.png"),
    path.join(outputRoot, "indoor-p5-glass-pickup-hole-guide-300dpi.png"),
  );
  console.log("rendered indoor P5 300DPI hole guide");
} finally {
  await browser.close();
}
