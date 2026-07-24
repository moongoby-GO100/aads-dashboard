import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const root = process.cwd();
const outputRoot = path.join(root, "public/brands/unni-naengmyeon/banners-20260722/print/300dpi");
const pageUrl = process.env.UNNI_BANNER_URL || "http://127.0.0.1:3100/unni-naengmyeon/brand/banners";
const printPixels = 7087; // 600mm at 300DPI, rounded to the nearest whole pixel.
const printDensity = 300;
const renderPixels = Number(process.env.UNNI_PRINT_RENDER_PIXELS || printPixels);
const conceptIds = (process.env.UNNI_INDOOR_IDS || "p5,p6,p7").split(",").map((id) => id.trim()).filter(Boolean);

await fs.mkdir(outputRoot, { recursive: true });

async function writePng(sourcePath, outputPath, { removeTopLeftPreview = false } = {}) {
  const image = sharp(sourcePath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || Math.abs(metadata.width - renderPixels) > 1 || Math.abs(metadata.height - renderPixels) > 1) {
    throw new Error(`Unexpected indoor artwork dimensions: ${metadata.width}×${metadata.height}`);
  }
  const normalized = image
    // Chromium can round a CSS width to one additional output pixel. Normalize
    // that harmless rounding variance to the print specification exactly.
    .resize(printPixels, printPixels, { fit: "fill" });
  // Some legacy B-1 background exports include a tiny preview of the whole
  // design in their top-left corner. Remove it in the final print asset as a
  // defensive output step; the live P5 layout also masks that region.
  if (removeTopLeftPreview) {
    normalized.composite([{
      input: {
        create: { width: 1300, height: 600, channels: 4, background: "#031613" },
      },
      top: 0,
      left: 0,
    }]);
  }
  await normalized.withMetadata({ density: printDensity }).png({ compressionLevel: 9 }).toFile(outputPath);
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

async function writePreview(artworkPath, id) {
  await sharp(artworkPath)
    .resize(1200, 1200, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(root, `public/brands/unni-naengmyeon/banners-20260722/print/indoor-${id}.png`));
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: renderPixels + 160, height: renderPixels + 160 },
    deviceScaleFactor: 1,
  });
  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 30_000 });

  for (const id of conceptIds) {
    const banner = page.locator(`[data-export="indoor-${id}"]`);
    await banner.evaluate((element, pixels) => {
      const target = element;
      target.style.width = `${pixels}px`;
      target.style.height = `${pixels}px`;
      target.style.maxWidth = "none";
      target.style.aspectRatio = "auto";
    }, renderPixels);
    await banner.locator("img").evaluateAll((images) => Promise.all(images.map((image) => image.decode().catch(() => undefined))));
    await page.waitForTimeout(500);

    const artworkTemp = path.join(outputRoot, `.indoor-${id}-artwork.png`);
    await page.addStyleTag({ content: `[data-export="indoor-${id}"] [class*="guides"] { display: none !important; }` });
    await banner.screenshot({ path: artworkTemp, animations: "disabled", timeout: 180_000 });
    const artworkPath = path.join(outputRoot, `indoor-${id}-glass-pickup-300dpi.png`);
    await writePng(artworkTemp, artworkPath, { removeTopLeftPreview: id === "p5" });
    await fs.unlink(artworkTemp);
    await writeHoleGuide(artworkPath, path.join(outputRoot, `indoor-${id}-glass-pickup-hole-guide-300dpi.png`));
    await writePreview(artworkPath, id);
    console.log(`rendered indoor ${id.toUpperCase()} 300DPI artwork and hole guide`);
  }
} finally {
  await browser.close();
}
