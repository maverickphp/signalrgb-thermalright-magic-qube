// Loads the plugin with a fake SignalRGB `device` and checks the HID frames it writes.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const writes = [];
globalThis.device = {
  setName() {},
  color: () => [0, 0, 255],
  write: (data, len) => writes.push({ data, len }),
};
Object.assign(globalThis, { shutdownColor: "#000000", LightingMode: "Canvas", forcedColor: "#009bde", brightnessScale: 40 });

const src = readFileSync(new URL("../Thermalright_Magic_Qube.js", import.meta.url), "utf8");
const plugin = await import("data:text/javascript," + encodeURIComponent(src));

const names = plugin.LedNames(), pos = plugin.LedPositions();
assert.equal(names.length, 66); assert.equal(pos.length, 66);
const [w, h] = plugin.Size();
for (const [x, y] of pos) assert.ok(x >= 0 && x < w && y >= 0 && y < h, `out of canvas: ${x},${y}`);
assert.equal(new Set(pos.map(String)).size, 66, "duplicate LED positions");

plugin.Render();
assert.equal(writes.length, 4, "expected 4 HID reports");
for (const w of writes) { assert.equal(w.data.length, 65); assert.equal(w.len, 65); assert.equal(w.data[0], 0); }
const frame = writes.flatMap(w => w.data.slice(1));
assert.deepEqual(frame.slice(0, 4), [0xda, 0xdb, 0xdc, 0xdd]);
assert.equal(frame[12], 2); assert.equal(frame[16] | frame[17] << 8, 198);
assert.deepEqual(frame.slice(20, 23), [0, 0, 102]);           // 255 * 0.4
assert.deepEqual(frame.slice(20 + 65 * 3, 20 + 66 * 3), [0, 0, 102]);

writes.length = 0; plugin.Render();
assert.equal(writes.length, 0, "second Render within 30 ms should be throttled");

writes.length = 0; plugin.Shutdown(true);
assert.deepEqual(writes.flatMap(w => w.data.slice(1)).slice(20, 23), [0, 0, 0]);
assert.ok(plugin.Validate({ interface: -1, usage: 1, usage_page: 0xff00 }));
assert.ok(plugin.Validate({ interface: 0, usage: 1, usage_page: 0xff00 }));
console.log("all plugin checks passed");
