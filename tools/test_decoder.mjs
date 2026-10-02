// Checks the plugin's LCD-face number decoder against frames drawn by make_face_frames.py.
//   python tools/make_face_frames.py build/frames && node tools/test_decoder.mjs build/frames
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

globalThis.LCD = { initialize() {}, getFrame() { return null; } };
globalThis.device = { setName() {}, log() {}, color: () => [0, 0, 0], write() {} };
const src = readFileSync(new URL("../Thermalright_Magic_Qube.js", import.meta.url), "utf8")
  .replace('import LCD from "@SignalRGB/lcd";', "const LCD = globalThis.LCD;")
  .replace('import udpModule from "@SignalRGB/udp";', "const udpModule = globalThis.udpModule;");
const { decodeValue } = await import("data:text/javascript," + encodeURIComponent(src));

const dir = process.argv[2] || "build/frames";
const files = readdirSync(dir).filter(f => f.endsWith(".rgb"));
const wrong = [];
for (const f of files) {
  const expected = Number(f.split("_")[0]);
  const got = decodeValue(readFileSync(join(dir, f)), [0, 255, 0]);
  if (got !== expected) wrong.push(`${f}: got ${got}`);
}
console.log(`${files.length - wrong.length}/${files.length} frames decoded correctly`);
if (wrong.length) { console.log(wrong.slice(0, 20).join("\n")); process.exit(1); }
