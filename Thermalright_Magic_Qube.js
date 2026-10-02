export function Name() { return "Thermalright Magic Qube"; }
export function VendorId() { return 0x0416; }
export function ProductId() { return 0x8001; }
export function Publisher() { return "Community"; }
export function Size() { return [17, 13]; }
export function DefaultPosition() { return [120, 80]; }
export function DefaultScale() { return 6.0; }
export function Type() { return "Hid"; }
export function DeviceType() { return "aio"; }
export function ConflictingProcesses() { return ["TRCC.exe"]; }
/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
brightnessScale:readonly
showReadings:readonly
rotateSeconds:readonly
*/
export function ControllableParameters() {
	return [
		{property:"showReadings", group:"display", label:"Show CPU/GPU Readings", description:"Spell the current temperature or load on the digits, rotating like Thermalright's software. Off shows the effect on every LED.", type:"boolean", default:"true"},
		{property:"rotateSeconds", group:"display", label:"Seconds Per Reading", step:"1", type:"number", min:"1", max:"30", default:"3"},
		{property:"shutdownColor", group:"lighting", label:"Shutdown Color", description:"Color applied when SignalRGB or the system shuts down", min:"0", max:"360", type:"color", default:"#000000"},
		{property:"LightingMode", group:"lighting", label:"Lighting Mode", description:"Canvas follows the active effect, Forced uses one color", type:"combobox", values:["Canvas", "Forced"], default:"Canvas"},
		{property:"forcedColor", group:"lighting", label:"Forced Color", description:"Color used in Forced mode", min:"0", max:"360", type:"color", default:"#009bde"},
		{property:"brightnessScale", group:"lighting", label:"Hardware Brightness (%)", description:"Thermalright's own software sends colors at 40% of full value. Raise with care.", step:"1", type:"number", min:"10", max:"100", default:"40"},
	];
}

// Protocol (from thermalright-trcc-linux, doc/PROTOCOL_USBLED.md):
// 20-byte header DA DB DC DD .. cmd 0x02 at [12], payload length LE16 at [16],
// then one RGB triplet per LED in wire order, sent as 64-byte HID reports.
const LED_COUNT = 66;
const REPORT_SIZE = 64;
const MIN_FRAME_MS = 30; // the firmware needs ~30 ms between frames

// Wire order of the 7 segments inside one digit, 3 LEDs per segment.
const SEGMENT_WIRE_ORDER = ["c", "d", "e", "g", "b", "a", "f"];
const UNITS_BASE = 0;  // right digit, LEDs 0-20
const TENS_BASE = 21;  // left digit, LEDs 21-41
const DIGIT_SEGMENTS = {
	"0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg",
	"5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg",
};

// The four readings, in Thermalright's rotation order, with the indicator LEDs that label them
// and the SignalRGB sensor names to try (as shown on SignalRGB's Monitoring page).
const READINGS = [
	{ leds: [42, 43], sensors: ["CPU Temperature", "CPU Package", "CPU Package Temperature"] },
	{ leds: [44, 45], sensors: ["GPU Core Temperature", "GPU Temperature", "GPU Core"] },
	{ leds: [46, 47], sensors: ["GPU Load", "GPU Core Load"] },
	{ leds: [48, 49], sensors: ["CPU Load", "CPU Total"] },
];
const ALWAYS_LIT = Array.from({ length: 16 }, (_, i) => 50 + i); // border outline + side strip

// Segment LED positions for a 5x9 digit cell, relative to its top-left corner.
const SEGMENT_CELLS = {
	a: [[1, 0], [2, 0], [3, 0]],
	b: [[4, 1], [4, 2], [4, 3]],
	c: [[4, 5], [4, 6], [4, 7]],
	d: [[3, 8], [2, 8], [1, 8]],
	e: [[0, 7], [0, 6], [0, 5]],
	f: [[0, 3], [0, 2], [0, 1]],
	g: [[1, 4], [2, 4], [3, 4]],
};

const vLedNames = [];
const vLedPositions = [];

function addDigit(label, originX, originY) {
	for (const seg of SEGMENT_WIRE_ORDER) {
		SEGMENT_CELLS[seg].forEach(([x, y], i) => {
			vLedNames.push(`${label} ${seg.toUpperCase()}${i + 1}`);
			vLedPositions.push([originX + x, originY + y]);
		});
	}
}

function buildLayout() {
	addDigit("Right Digit", 9, 2);   // LEDs 0-20
	addDigit("Left Digit", 3, 2);    // LEDs 21-41

	// LEDs 42-49: indicator pairs, clockwise from top-left.
	const indicators = [
		["CPU Temp", [[1, 1], [2, 1]]],
		["GPU Temp", [[14, 1], [15, 1]]],
		["GPU Load", [[15, 11], [14, 11]]],
		["CPU Load", [[2, 11], [1, 11]]],
	];
	for (const [label, cells] of indicators) {
		cells.forEach((pos, i) => {
			vLedNames.push(`${label} ${i + 1}`);
			vLedPositions.push(pos);
		});
	}

	// LEDs 50-64: border outline, spread clockwise around the canvas edge.
	const [w, h] = Size();
	const perimeter = 2 * ((w - 1) + (h - 1));
	for (let i = 0; i < 15; i++) {
		let d = Math.round(i * perimeter / 15);
		let pos;
		if (d < w - 1) { pos = [d, 0]; }
		else if ((d -= w - 1) < h - 1) { pos = [w - 1, d]; }
		else if ((d -= h - 1) < w - 1) { pos = [w - 1 - d, h - 1]; }
		else { d -= w - 1; pos = [0, h - 1 - d]; }
		vLedNames.push(`Border ${i + 1}`);
		vLedPositions.push(pos);
	}

	// LED 65: light strip on the side of the pump head (found by testing; not in the trcc-linux map).
	vLedNames.push("Side Strip");
	vLedPositions.push([15, 6]);
}

buildLayout();

export function LedNames() { return vLedNames; }
export function LedPositions() { return vLedPositions; }

// ---- Sensor readings from SignalRGB ----------------------------------------------------------
// Effects read sensors with engine.getSensorValue(name) -> {value, min, max}. Plugins aren't
// documented to have it, so look for it and fall back to effect-only lighting without it.

function findSensorReader() {
	const candidates = [
		["engine.getSensorValue", () => typeof engine !== "undefined" && engine.getSensorValue],
		["device.getSensorValue", () => device.getSensorValue],
	];
	for (const [label, get] of candidates) {
		let fn;
		try { fn = get(); } catch (e) { fn = undefined; }
		if (typeof fn === "function") {
			device.log(`Sensor API found: ${label}`);
			return label.startsWith("engine") ? name => engine.getSensorValue(name) : name => device.getSensorValue(name);
		}
	}
	device.log("No sensor API available to this plugin; showing the effect only.");
	return null;
}

let readSensor = null;
const resolvedNames = READINGS.map(() => null);

function readValue(index) {
	if (!readSensor) {
		return null;
	}
	const names = resolvedNames[index] ? [resolvedNames[index]] : READINGS[index].sensors;
	for (const name of names) {
		let info;
		try { info = readSensor(name); } catch (e) { info = undefined; }
		const value = info && typeof info === "object" ? info.value : info;
		if (typeof value === "number" && isFinite(value)) {
			if (!resolvedNames[index]) {
				resolvedNames[index] = name;
				device.log(`Reading ${index}: using sensor "${name}" = ${value}`);
			}
			return value;
		}
	}
	return null;
}

function digitLeds(ch, base, lit) {
	for (const seg of DIGIT_SEGMENTS[ch] || "") {
		const start = base + SEGMENT_WIRE_ORDER.indexOf(seg) * 3;
		lit[start] = lit[start + 1] = lit[start + 2] = true;
	}
}

// Which LEDs are on: the current reading's digits and indicator, plus border and strip.
// Returns null (every LED lit) when readings are off or no sensor could be read.
function litMask(now) {
	if (String(showReadings) === "false" || !readSensor) {
		return null;
	}
	const period = Math.max(1, Number(rotateSeconds) || 3) * 1000;
	const index = Math.floor(now / period) % READINGS.length;
	const value = readValue(index);
	if (value === null) {
		return null;
	}
	const lit = new Array(LED_COUNT).fill(false);
	for (const i of ALWAYS_LIT) { lit[i] = true; }
	for (const i of READINGS[index].leds) { lit[i] = true; }
	const text = String(Math.min(99, Math.max(0, Math.round(value)))).padStart(2, " ");
	digitLeds(text[0], TENS_BASE, lit);
	digitLeds(text[1], UNITS_BASE, lit);
	return lit;
}

// ---- Device -----------------------------------------------------------------------------------

let lastFrame = 0;

export function Initialize() {
	device.setName("Thermalright Magic Qube");
	readSensor = findSensorReader();
}

export function Render() {
	const now = Date.now();
	if (now - lastFrame < MIN_FRAME_MS) {
		return;
	}
	lastFrame = now;
	sendColors(null, litMask(now));
}

export function Shutdown(SystemSuspending) {
	sendColors(SystemSuspending ? "#000000" : shutdownColor, null);
}

function sendColors(overrideColor, lit) {
	const scale = Math.min(100, Math.max(10, Number(brightnessScale) || 40)) / 100;
	const fixed = overrideColor ? hexToRgb(overrideColor)
		: LightingMode === "Forced" ? hexToRgb(forcedColor) : null;

	const frame = new Array(20).fill(0);
	frame[0] = 0xDA; frame[1] = 0xDB; frame[2] = 0xDC; frame[3] = 0xDD;
	frame[12] = 0x02;
	frame[16] = (LED_COUNT * 3) & 0xFF;
	frame[17] = (LED_COUNT * 3) >> 8;

	for (let i = 0; i < LED_COUNT; i++) {
		if (lit && !lit[i]) {
			frame.push(0, 0, 0);
			continue;
		}
		const [x, y] = vLedPositions[i];
		const color = fixed || device.color(x, y);
		frame.push(
			Math.floor(color[0] * scale),
			Math.floor(color[1] * scale),
			Math.floor(color[2] * scale),
		);
	}

	for (let offset = 0; offset < frame.length; offset += REPORT_SIZE) {
		const chunk = frame.slice(offset, offset + REPORT_SIZE);
		while (chunk.length < REPORT_SIZE) { chunk.push(0); }
		device.write([0x00, ...chunk], REPORT_SIZE + 1); // report ID 0 + 64 data bytes
	}
}

function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

export function Validate(endpoint) {
	// Single-interface device: SignalRGB reports interface -1, so match on the vendor usage page only.
	return endpoint.usage_page === 0xFF00 && endpoint.usage === 0x0001;
}

export function ImageUrl() {
	// Official product image, linked from Thermalright's site (not copied into this repo).
	return "https://www.thermalright.com/wp-content/uploads/2026/08/magic-qube-360-argb-black-768x768.png";
}
