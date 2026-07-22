import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const assetRoot = path.join(root, "public/brands/unni-naengmyeon");
const bannerRoot = path.join(assetRoot, "banners-20260722");
const logoPath = path.join(assetRoot, "bowlcut-logo-concepts-20260722/concept-h-wordmark-noodles.png");

const concepts = [
  {
    id: "p1",
    background: "concept-p1-ice-blue.png",
    foreground: "#173e35",
    accent: "#f45d48",
    eyebrow: "DELIVERY · TAKE OUT",
    guide: "주문번호 확인 후 픽업",
    guideBackground: "#173e35",
    guideColor: "#ffffff",
  },
  {
    id: "p2",
    background: "concept-p2-rider-arrow.png",
    foreground: "#ffffff",
    accent: "#ff684f",
    eyebrow: "배달기사님, 여기입니다",
    guide: "픽업은 이쪽  →",
    guideBackground: "#ffffff",
    guideColor: "#173e35",
  },
  {
    id: "p3",
    background: "concept-p3-friendly-pack.png",
    foreground: "#173e35",
    accent: "#f45d48",
    eyebrow: "어서 오세요",
    guide: "포장 주문 · 배달 픽업",
    guideBackground: "#f45d48",
    guideColor: "#ffffff",
  },
];

const escapeXml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function overlaySvg(concept) {
  const font = "WenQuanYi Zen Hei, Unifont, sans-serif";
  return Buffer.from(`
    <svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="readability" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${concept.id === "p2" ? "#05231d" : "#ffffff"}" stop-opacity="${concept.id === "p2" ? ".12" : ".18"}"/>
          <stop offset=".58" stop-color="${concept.id === "p2" ? "#05231d" : "#ffffff"}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="1200" fill="url(#readability)"/>
      <text x="286" y="183" fill="${concept.foreground}" font-family="${font}" font-size="118" font-weight="900" letter-spacing="-10" stroke="${concept.foreground}" stroke-width="2.5" paint-order="stroke">언니냉면</text>
      <text x="72" y="315" fill="${concept.accent}" font-family="${font}" font-size="38" font-weight="900" letter-spacing="5" stroke="${concept.accent}" stroke-width="1" paint-order="stroke">${escapeXml(concept.eyebrow)}</text>
      <text x="68" y="478" fill="${concept.foreground}" font-family="${font}" font-size="128" font-weight="900" letter-spacing="-10" stroke="${concept.foreground}" stroke-width="3" paint-order="stroke">배달·포장</text>
      <text x="66" y="642" fill="${concept.accent}" font-family="${font}" font-size="176" font-weight="900" letter-spacing="-13" stroke="${concept.accent}" stroke-width="4" paint-order="stroke">픽업존</text>
      <rect x="72" y="1010" width="1056" height="126" rx="28" fill="${concept.guideBackground}"/>
      <text x="600" y="1095" fill="${concept.guideColor}" font-family="${font}" font-size="48" font-weight="900" text-anchor="middle" letter-spacing="-2" stroke="${concept.guideColor}" stroke-width="1.5" paint-order="stroke">${escapeXml(concept.guide)}</text>
      <rect x="30" y="30" width="1140" height="1140" fill="none" stroke="#f45d48" stroke-width="2" stroke-dasharray="10 8" opacity=".82"/>
      <rect x="974" y="1115" width="176" height="36" rx="10" fill="#ffffff" fill-opacity=".86"/>
      <text x="1062" y="1140" fill="#b33729" font-family="${font}" font-size="17" font-weight="900" text-anchor="middle">사방 30mm 안전영역</text>
    </svg>
  `);
}

const logo = await sharp(logoPath)
  .resize(180, 180, { fit: "cover" })
  .png()
  .toBuffer();

for (const concept of concepts) {
  const input = path.join(bannerRoot, "pickup", concept.background);
  const output = path.join(bannerRoot, "print", `indoor-${concept.id}.png`);
  await sharp(input)
    .resize(1200, 1200, { fit: "cover" })
    .composite([
      { input: overlaySvg(concept), top: 0, left: 0 },
      { input: logo, top: 55, left: 72 },
    ])
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9, palette: false })
    .toFile(output);
  console.log(`rendered ${path.relative(root, output)}`);
}
