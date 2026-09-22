import * as assert from "node:assert/strict";
import { mapFramePoint } from "./liveBrowserCoordinates";

assert.deepEqual(
  mapFramePoint(683, 384, { left: 0, top: 0, width: 1366, height: 768 }, { width: 1366, height: 768 }),
  { x: 683, y: 384 },
  "normal scale",
);

assert.deepEqual(
  mapFramePoint(351.5, 212, { left: 10, top: 20, width: 683, height: 384 }, { width: 1366, height: 768 }),
  { x: 683, y: 384 },
  "downscaled render",
);

assert.deepEqual(
  mapFramePoint(-20, 900, { left: 10, top: 20, width: 683, height: 384 }, { width: 1366, height: 768 }),
  { x: 0, y: 767 },
  "boundary clamp",
);

assert.equal(
  mapFramePoint(0, 0, { left: 0, top: 0, width: 0, height: 10 }, { width: 100, height: 100 }),
  null,
  "invalid render bounds",
);

console.log("liveBrowserCoordinates.selftest: ok");

assert.equal(mapFramePoint(NaN, 0, { left: 0, top: 0, width: 100, height: 100 }, { width: 100, height: 100 }), null);
