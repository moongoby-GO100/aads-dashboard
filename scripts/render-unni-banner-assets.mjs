import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const root = process.cwd();
const outputRoot = path.join(root, "public/brands/unni-naengmyeon/banners-20260722/print");
const pageUrl = process.env.UNNI_BANNER_URL || "http://127.0.0.1:3100/unni-naengmyeon/brand/banners";

await fs.mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1100 },
    deviceScaleFactor: 2,
  });
  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 20_000 });
  await page.addStyleTag({ content: "header { visibility: hidden !important; }" });

  const exports = await page.locator("[data-export]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-export")).filter(Boolean),
  );

  for (const name of exports) {
    const locator = page.locator(`[data-export="${name}"]`);
    await locator.evaluate((element, exportName) => {
      const htmlElement = element;
      htmlElement.style.width = "600px";
      htmlElement.style.maxWidth = "none";
      htmlElement.style.height = exportName.startsWith("outdoor-") ? "1800px" : "600px";
      htmlElement.style.aspectRatio = "auto";
    }, name);
    await locator.scrollIntoViewIfNeeded();
    await locator.locator("img").evaluateAll((images) => Promise.all(
      images.map((image) => image.decode().catch(() => undefined)),
    ));
    await page.waitForTimeout(350);
    const outputPath = path.join(outputRoot, `${name}.png`);
    await locator.screenshot({
      path: outputPath,
      animations: "disabled",
    });
    const targetHeight = name.startsWith("outdoor-") ? 3600 : 1200;
    const normalized = await sharp(outputPath)
      .resize(1200, targetHeight, { fit: "fill" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await fs.writeFile(outputPath, normalized);
    console.log(`rendered ${name}.png`);
  }
} finally {
  await browser.close();
}
