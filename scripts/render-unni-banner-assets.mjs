import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const root = process.cwd();
const outputRoot = path.join(
  root,
  process.env.UNNI_BANNER_OUTPUT_DIR || "public/brands/unni-naengmyeon/banners-20260722/print",
);
const pageUrl = process.env.UNNI_BANNER_URL || "http://127.0.0.1:3100/unni-naengmyeon/brand/banners";
const targetWidth = Number(process.env.UNNI_BANNER_TARGET_WIDTH || 1200);
const outdoorTargetHeight = Number(process.env.UNNI_BANNER_OUTDOOR_TARGET_HEIGHT || targetWidth * 3);
const indoorTargetHeight = Number(process.env.UNNI_BANNER_INDOOR_TARGET_HEIGHT || targetWidth);
const printDensity = Number(process.env.UNNI_BANNER_DENSITY || 72);
const renderWidth = Number(process.env.UNNI_BANNER_RENDER_WIDTH || 600);
const outdoorRenderHeight = Number(process.env.UNNI_BANNER_OUTDOOR_RENDER_HEIGHT || renderWidth * 3);
const indoorRenderHeight = Number(process.env.UNNI_BANNER_INDOOR_RENDER_HEIGHT || renderWidth);
const deviceScaleFactor = Number(process.env.UNNI_BANNER_DEVICE_SCALE_FACTOR || 2);
const requestedExports = new Set(
  (process.env.UNNI_BANNER_EXPORTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

await fs.mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: Math.max(1500, renderWidth + 100), height: 1100 },
    deviceScaleFactor,
  });
  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 20_000 });
  await page.addStyleTag({ content: "header { visibility: hidden !important; }" });

  const exports = await page.locator("[data-export]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-export")).filter(Boolean),
  );

  for (const name of exports.filter((exportName) => requestedExports.size === 0 || requestedExports.has(exportName))) {
    const locator = page.locator(`[data-export="${name}"]`);
    await locator.evaluate((element, exportConfig) => {
      const htmlElement = element;
      htmlElement.style.width = `${exportConfig.width}px`;
      htmlElement.style.maxWidth = "none";
      htmlElement.style.height = `${
        exportConfig.name.startsWith("outdoor-")
          ? exportConfig.outdoorHeight
          : exportConfig.indoorHeight
      }px`;
      htmlElement.style.aspectRatio = "auto";
    }, {
      name,
      width: renderWidth,
      outdoorHeight: outdoorRenderHeight,
      indoorHeight: indoorRenderHeight,
    });
    await locator.scrollIntoViewIfNeeded();
    await locator.locator("img").evaluateAll((images) => Promise.all(
      images.map((image) => image.decode().catch(() => undefined)),
    ));
    await page.waitForTimeout(350);
    const outputPath = path.join(outputRoot, `${name}.png`);
    await locator.screenshot({
      path: outputPath,
      animations: "disabled",
      timeout: 120_000,
    });
    const targetHeight = name.startsWith("outdoor-") ? outdoorTargetHeight : indoorTargetHeight;
    const normalized = await sharp(outputPath)
      .resize(targetWidth, targetHeight, { fit: "fill" })
      .withMetadata({ density: printDensity })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await fs.writeFile(outputPath, normalized);
    console.log(`rendered ${name}.png`);
  }
} finally {
  await browser.close();
}
