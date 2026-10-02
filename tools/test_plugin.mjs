// Loads the plugin with a fake SignalRGB runtime and checks the UDP packets it sends the helper.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const sent = [];
const controllers = new Map();
// Like SignalRGB, `udp` only appears once the plugin asks for the feature.
globalThis.device = {
  setName() {}, setImageFromUrl() {}, setSize() {}, setControllableLeds() {},
  color: () => [0, 0, 255],
  addFeature(name) {
    if (name === "udp") {
      globalThis.udp = { createSocket: () => ({ write: (data, ip, port) => sent.push({ data, ip, port }) }) };
    }
  },
};
globalThis.service = {
  log() {},
  getController: id => controllers.get(id),
  addController: c => controllers.set(c.id, c),
  updateController() {},
  announceController() {},
};
Object.assign(globalThis, { shutdownColor: "#000000", LightingMode: "Canvas", forcedColor: "#009bde", brightnessScale: 40 });

const src = readFileSync(new URL("../Thermalright_Magic_Qube.js", import.meta.url), "utf8");
const plugin = await import("data:text/javascript," + encodeURIComponent(src));

assert.equal(plugin.Type(), "network");
const names = plugin.LedNames(), pos = plugin.LedPositions();
assert.equal(names.length, 66); assert.equal(pos.length, 66);
const [w, h] = plugin.Size();
for (const [x, y] of pos) assert.ok(x >= 0 && x < w && y >= 0 && y < h, `out of canvas: ${x},${y}`);
assert.equal(new Set(pos.map(String)).size, 66, "duplicate LED positions");

plugin.Initialize();
plugin.Render();
assert.equal(sent.length, 1, "one UDP packet per frame");
const { data, ip, port } = sent[0];
assert.equal(ip, "127.0.0.1"); assert.equal(port, 51866);
assert.equal(data.length, 3 + 66 * 3);
assert.deepEqual(data.slice(0, 3), [0x4d, 0x51, 0x01]);
assert.deepEqual(data.slice(3, 6), [0, 0, 102]);            // 255 * 0.4
assert.deepEqual(data.slice(3 + 65 * 3), [0, 0, 102]);

sent.length = 0; plugin.Render();
assert.equal(sent.length, 0, "second Render within 30 ms should be throttled");

plugin.Shutdown(true);
assert.deepEqual(sent.at(-1).data.slice(3, 6), [0, 0, 0]);

const discovery = new plugin.DiscoveryService();
discovery.Initialize(); discovery.Update(); discovery.Update();
assert.equal(controllers.size, 1, "discovery announces exactly one device");
console.log("all plugin checks passed");
