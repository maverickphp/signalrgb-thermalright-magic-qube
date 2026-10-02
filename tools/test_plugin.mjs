// Loads the plugin with a fake SignalRGB runtime and checks the HID frames it writes.
// Needs face frames from make_face_frames.py:
//   python tools/make_face_frames.py build/frames && node tools/test_plugin.mjs build/frames
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const framesDir = process.argv[2] || "build/frames";
const writes = [];
globalThis.device = {
  setName() {}, log() {},
  color: () => [0, 0, 255],
  write: (data, len) => writes.push({ data, len }),
};
Object.assign(globalThis, {
  shutdownColor: "#000000", LightingMode: "Canvas", forcedColor: "#009bde", brightnessScale: 40,
  showReadings: true, faceSensor: "CPU Temperature", faceTextColor: "#00ff00", rotateSeconds: 3,
});

// The real @SignalRGB/lcd module only exists inside SignalRGB; this one serves a chosen frame.
let lcdFrame = null;
globalThis.LCD = { initialize() {}, getFrame: () => lcdFrame };
// Stand-in @SignalRGB/udp: keeps the plugin's message handler so tests can deliver packets.
let deliver = null;
globalThis.udpModule = {
  createSocket: () => ({ on(event, fn) { if (event === "message") deliver = fn; }, bind() {} }),
};
const src = readFileSync(new URL("../Thermalright_Magic_Qube.js", import.meta.url), "utf8")
  .replace('import LCD from "@SignalRGB/lcd";', "const LCD = globalThis.LCD;")
  .replace('import udpModule from "@SignalRGB/udp";', "const udpModule = globalThis.udpModule;");
const load = async tag => import("data:text/javascript," + encodeURIComponent(src + `\n// ${tag}`));

function frameOf(plugin) {
  writes.length = 0;
  plugin.Render();
  assert.equal(writes.length, 4, "expected 4 HID reports");
  for (const w of writes) { assert.equal(w.data.length, 65); assert.equal(w.len, 65); assert.equal(w.data[0], 0); }
  const frame = writes.flatMap(w => w.data.slice(1));
  assert.deepEqual(frame.slice(0, 4), [0xda, 0xdb, 0xdc, 0xdd]);
  assert.equal(frame[12], 2); assert.equal(frame[16] | frame[17] << 8, 198);
  return frame;
}
const isLit = (frame, led) => frame[20 + led * 3 + 2] !== 0;
const seg = s => [0, 1, 2].map(k => "cdegbaf".indexOf(s) * 3 + k);

// Layout.
{
  const plugin = await load("layout");
  const names = plugin.LedNames(), pos = plugin.LedPositions();
  assert.equal(names.length, 66); assert.equal(pos.length, 66);
  const [w, h] = plugin.Size();
  for (const [x, y] of pos) assert.ok(x >= 0 && x < w && y >= 0 && y < h, `out of canvas: ${x},${y}`);
  assert.equal(new Set(pos.map(String)).size, 66, "duplicate LED positions");
  assert.ok(plugin.Validate({ interface: -1, usage: 1, usage_page: 0xff00 }));
}

// No face frame yet: every LED shows the effect.
{
  lcdFrame = null;
  const plugin = await load("no-face");
  plugin.Initialize();
  const frame = frameOf(plugin);
  for (let i = 0; i < 66; i++) assert.ok(isLit(frame, i), `LED ${i} should be lit`);
  assert.deepEqual(frame.slice(20, 23), [0, 0, 102]);  // 255 * 0.4
}

// Simple Sensor face showing 54: digits spell 54, the CPU temperature label is lit.
{
  lcdFrame = readFileSync(join(framesDir, "54_126.rgb"));
  const plugin = await load("face");
  plugin.Initialize();
  const frame = frameOf(plugin);
  writes.length = 0; plugin.Render();
  assert.equal(writes.length, 0, "second Render within 30 ms should be throttled");

  const tens = new Set([..."acdfg"].flatMap(seg).map(i => i + 21));
  const units = new Set([..."bcfg"].flatMap(seg));
  for (let i = 0; i < 21; i++) assert.equal(isLit(frame, i), units.has(i), `units LED ${i}`);
  for (let i = 21; i < 42; i++) assert.equal(isLit(frame, i), tens.has(i), `tens LED ${i}`);
  for (let i = 42; i < 50; i++) assert.equal(isLit(frame, i), i === 42 || i === 43, `indicator LED ${i}`);
  for (let i = 50; i < 66; i++) assert.ok(isLit(frame, i), `border/strip LED ${i}`);

  writes.length = 0; plugin.Shutdown(true);
  assert.deepEqual(writes.flatMap(w => w.data.slice(1)).slice(20, 23), [0, 0, 0]);
}

// Helper readings win over the face and rotate: CPU temp 63 first, then GPU temp 45.
{
  lcdFrame = readFileSync(join(framesDir, "54_126.rgb"));
  const realNow = Date.now;
  let now = 3000 * 4 * 1000;  // start of a rotation cycle -> CPU temperature
  Date.now = () => now;
  const plugin = await load("helper");
  plugin.Initialize();
  deliver(JSON.stringify({ cpu_temp: 63.2, gpu_temp: 45.0, gpu_load: 23, cpu_load: 12.5 }));

  const showsDigits = (frame, tensDigit, unitsDigit, indicatorLeds) => {
    const segs = { 4: "bcfg", 5: "acdfg", 6: "acdefg", 3: "abcdg" };
    const tens = new Set([...segs[tensDigit]].flatMap(seg).map(i => i + 21));
    const units = new Set([...segs[unitsDigit]].flatMap(seg));
    for (let i = 0; i < 21; i++) assert.equal(isLit(frame, i), units.has(i), `units LED ${i}`);
    for (let i = 21; i < 42; i++) assert.equal(isLit(frame, i), tens.has(i), `tens LED ${i}`);
    for (let i = 42; i < 50; i++) assert.equal(isLit(frame, i), indicatorLeds.includes(i), `indicator LED ${i}`);
  };
  showsDigits(frameOf(plugin), 6, 3, [42, 43]);   // CPU °C 63
  now += 3000;
  showsDigits(frameOf(plugin), 4, 5, [44, 45]);   // GPU °C 45
  now += 10000;                                    // helper gone quiet: back to the face's 54
  showsDigits(frameOf(plugin), 5, 4, [42, 43]);
  Date.now = realNow;
}
console.log("all plugin checks passed");
