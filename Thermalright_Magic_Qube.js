import LCD from "@SignalRGB/lcd";
import udpModule from "@SignalRGB/udp";
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
faceSensor:readonly
faceTextColor:readonly
rotateSeconds:readonly
*/
export function ControllableParameters() {
	return [
		{property:"showReadings", group:"display", label:"Show CPU/GPU Readings", description:"With the optional Magic Qube helper installed, the digits show CPU/GPU temperature and load. Off, or without a reading, the effect shows on every LED.", type:"boolean", default:"true"},
		{property:"rotateSeconds", group:"display", label:"Seconds Per Reading", description:"How long each helper reading stays on before the next one.", step:"1", type:"number", min:"1", max:"30", default:"3"},
		{property:"faceSensor", group:"display", label:"LCD Face Sensor (Pro)", description:"SignalRGB Pro only: which corner label to light for the number read off the LCD tab's Simple Sensor face.", type:"combobox", values:["CPU Temperature", "GPU Temperature", "GPU Load", "CPU Load"], default:"CPU Temperature"},
		{property:"faceTextColor", group:"display", label:"LCD Face Text Color (Pro)", description:"SignalRGB Pro only: must match the Simple Sensor face's Text Color, and differ from your effect's colors.", min:"0", max:"360", type:"color", default:"#00ff00"},
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

// Corner label LED pairs, clockwise from top-left.
const INDICATORS = {
	"CPU Temperature": [42, 43],
	"GPU Temperature": [44, 45],
	"GPU Load": [46, 47],
	"CPU Load": [48, 49],
};
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

// ---- Reading the sensor value off an LCD face ------------------------------------------------
// Device plugins can't read sensors, but LCD faces can. The plugin registers a small LCD, the
// user picks SignalRGB's built-in "Simple Sensor" face for it, and the plugin reads the number
// that face draws: text pixels are found by the face's text color, the tallest line of text is
// the value, and each digit in it is matched against bold Arial templates.

const LCD_SIZE = 240;
const DECODE_INTERVAL_MS = 500;
const VALUE_TIMEOUT_MS = 10000;  // stop showing a value this long after it was last read

// Ink coverage (0-9) on a 6x9 grid per digit, from tools/make_digit_templates.py.
const GRID_W = 6, GRID_H = 9;
const DIGIT_TEMPLATES = {
	"0": { aspect: 0.65, cells: "048950397694791097890088980079890089791097496594059960" },
	"1": { aspect: 0.46, cells: "000499016999699899762599000599000599000599000599000599" },
	"2": { aspect: 0.68, cells: "058971496597580069000087000693017940079300498666899999" },
	"3": { aspect: 0.67, cells: "069950596694340195002782005882000087560079595596069961" },
	"4": { aspect: 0.74, cells: "000680003980008980058680292680773782999998222682000680" },
	"5": { aspect: 0.69, cells: "089995197663393100499971695596000078670088596695059950" },
	"6": { aspect: 0.67, cells: "048971397595691043884640998895891078790068496496058961" },
	"7": { aspect: 0.67, cells: "999998777797000581002940006800019500049200059000068000" },
	"8": { aspect: 0.66, cells: "169960595594780095396692289981781187970078794496169961" },
	"9": { aspect: 0.67, cells: "169850695793970097970098597898057588230097695694179840" },
};

function textMask(frame, key) {
	const mask = new Uint8Array(LCD_SIZE * LCD_SIZE);
	for (let p = 0, i = 0; p < mask.length; p++, i += 3) {
		const d = Math.abs(frame[i] - key[0]) + Math.abs(frame[i + 1] - key[1]) + Math.abs(frame[i + 2] - key[2]);
		mask[p] = d < 120 ? 1 : 0;
	}
	return mask;
}

// Runs of indices whose count is non-zero, bridging gaps up to maxGap.
function runs(counts, maxGap) {
	const out = [];
	let start = -1, last = -1;
	counts.forEach((c, i) => {
		if (!c) { return; }
		if (start >= 0 && i - last > maxGap + 1) { out.push([start, last]); start = -1; }
		if (start < 0) { start = i; }
		last = i;
	});
	if (start >= 0) { out.push([start, last]); }
	return out;
}

function classifyDigit(mask, x0, x1, y0, y1) {
	const w = x1 - x0 + 1, h = y1 - y0 + 1;
	const aspect = w / h;
	const cells = [];
	for (let gy = 0; gy < GRID_H; gy++) {
		for (let gx = 0; gx < GRID_W; gx++) {
			let on = 0, n = 0;
			const ya = y0 + Math.floor(gy * h / GRID_H), yb = y0 + Math.floor((gy + 1) * h / GRID_H);
			const xa = x0 + Math.floor(gx * w / GRID_W), xb = x0 + Math.floor((gx + 1) * w / GRID_W);
			for (let y = ya; y < Math.max(yb, ya + 1); y++) {
				for (let x = xa; x < Math.max(xb, xa + 1); x++) { n++; on += mask[y * LCD_SIZE + x]; }
			}
			cells.push(Math.round(9 * on / n));
		}
	}
	let best = null, bestScore = Infinity;
	for (const [digit, t] of Object.entries(DIGIT_TEMPLATES)) {
		let score = Math.abs(aspect - t.aspect) * 60;
		for (let k = 0; k < cells.length; k++) { score += Math.abs(cells[k] - Number(t.cells[k])); }
		if (score < bestScore) { bestScore = score; best = digit; }
	}
	return best;
}

// The number drawn on the frame, or null if no readable number is there.
export function decodeValue(frame, key) {
	const mask = textMask(frame, key);
	const rowCounts = new Array(LCD_SIZE).fill(0);
	for (let y = 0; y < LCD_SIZE; y++) {
		for (let x = 0; x < LCD_SIZE; x++) { rowCounts[y] += mask[y * LCD_SIZE + x]; }
	}
	// The value is the tallest line of text; the label and unit lines are much smaller.
	const lines = runs(rowCounts, 1).filter(([a, b]) => b - a >= 30);
	if (!lines.length) { return null; }
	const [ly0, ly1] = lines.reduce((m, r) => (r[1] - r[0] > m[1] - m[0] ? r : m));

	const colCounts = new Array(LCD_SIZE).fill(0);
	for (let y = ly0; y <= ly1; y++) {
		for (let x = 0; x < LCD_SIZE; x++) { colCounts[x] += mask[y * LCD_SIZE + x]; }
	}
	const glyphs = runs(colCounts, 1).filter(([a, b]) => b - a >= 3);
	if (!glyphs.length || glyphs.length > 3) { return null; }

	let text = "";
	for (const [gx0, gx1] of glyphs) {
		let gy0 = ly1, gy1 = ly0;  // tighten to this glyph's own ink rows
		for (let y = ly0; y <= ly1; y++) {
			for (let x = gx0; x <= gx1; x++) {
				if (mask[y * LCD_SIZE + x]) { gy0 = Math.min(gy0, y); gy1 = Math.max(gy1, y); break; }
			}
		}
		text += classifyDigit(mask, gx0, gx1, gy0, gy1);
	}
	return Number(text);
}

let lastDecode = 0;
let faceValue = null;
let faceValueAt = 0;

function updateFaceValue(now) {
	if (now - lastDecode < DECODE_INTERVAL_MS) {
		return;
	}
	lastDecode = now;
	let frame = null;
	try { frame = LCD.getFrame({ format: "RGB" }); } catch (e) { frame = null; }
	if (!frame || frame.length !== LCD_SIZE * LCD_SIZE * 3) {
		return;
	}
	const value = decodeValue(frame, hexToRgb(faceTextColor || "#00ff00"));
	if (value !== null) {
		faceValue = value;
		faceValueAt = now;
	}
}

// ---- Readings from the optional helper --------------------------------------------------------
// helper/magic_qube_helper.py reads CPU/GPU sensors (which free SignalRGB keeps from plugins) and
// sends them once a second as JSON over UDP to this PC only, e.g.
// {"cpu_temp": 63.0, "gpu_temp": 45.0, "gpu_load": 23.0, "cpu_load": 12.5}.

const HELPER_PORT = 51867;
const HELPER_TIMEOUT_MS = 5000;  // fall back once the helper has been quiet this long
const HELPER_ROTATION = [
	["cpu_temp", "CPU Temperature"],
	["gpu_temp", "GPU Temperature"],
	["gpu_load", "GPU Load"],
	["cpu_load", "CPU Load"],
];

let helperValues = null;
let helperValuesAt = 0;
let helperSocket = null;

function onHelperMessage(msg) {
	try {
		let text = msg && msg.data !== undefined ? msg.data : msg;
		if (Array.isArray(text)) { text = String.fromCharCode(...text); }
		const values = JSON.parse(String(text));
		if (values && typeof values === "object") {
			helperValues = values;
			helperValuesAt = Date.now();
		}
	} catch (e) {
		// not one of ours
	}
}

function startHelperListener() {
	try {
		helperSocket = udpModule.createSocket();
		helperSocket.on("message", onHelperMessage);
		helperSocket.on("error", e => device.log(`Helper socket error: ${e}`));
		helperSocket.bind(HELPER_PORT);
		device.log(`Listening for the Magic Qube helper on UDP ${HELPER_PORT}`);
	} catch (e) {
		helperSocket = null;
		device.log(`Can't listen for the helper: ${e}`);
	}
}

// The helper reading to show now, rotating through those it sends: {value, label} or null.
function helperReading(now) {
	if (!helperValues || now - helperValuesAt > HELPER_TIMEOUT_MS) {
		return null;
	}
	const available = HELPER_ROTATION.filter(([key]) => typeof helperValues[key] === "number");
	if (!available.length) {
		return null;
	}
	const period = Math.max(1, Number(rotateSeconds) || 3) * 1000;
	const [key, label] = available[Math.floor(now / period) % available.length];
	return { value: helperValues[key], label };
}

function digitLeds(ch, base, lit) {
	for (const seg of DIGIT_SEGMENTS[ch] || "") {
		const start = base + SEGMENT_WIRE_ORDER.indexOf(seg) * 3;
		lit[start] = lit[start + 1] = lit[start + 2] = true;
	}
}

// The reading to show: the helper's if it's running, else a number read off the LCD face.
function currentReading(now) {
	const fromHelper = helperReading(now);
	if (fromHelper) {
		return fromHelper;
	}
	if (faceValue !== null && now - faceValueAt <= VALUE_TIMEOUT_MS) {
		return { value: faceValue, label: faceSensor };
	}
	return null;
}

// Which LEDs are on: the reading's digits and its corner label, plus border and strip.
// Returns null (every LED lit) when readings are off or there is nothing to show.
function litMask(now) {
	const reading = String(showReadings) === "false" ? null : currentReading(now);
	if (!reading) {
		return null;
	}
	const lit = new Array(LED_COUNT).fill(false);
	for (const i of ALWAYS_LIT) { lit[i] = true; }
	for (const i of INDICATORS[reading.label] || INDICATORS["CPU Temperature"]) { lit[i] = true; }
	const text = String(Math.min(99, Math.max(0, Math.round(reading.value)))).padStart(2, " ");
	digitLeds(text[0], TENS_BASE, lit);
	digitLeds(text[1], UNITS_BASE, lit);
	return lit;
}

// ---- Device -----------------------------------------------------------------------------------

let lastFrame = 0;

export function Initialize() {
	device.setName("Thermalright Magic Qube");
	startHelperListener();
	try {
		LCD.initialize({ width: LCD_SIZE, height: LCD_SIZE });
	} catch (e) {
		device.log(`LCD.initialize failed: ${e}`);
	}
}

export function Render() {
	const now = Date.now();
	if (now - lastFrame < MIN_FRAME_MS) {
		return;
	}
	lastFrame = now;
	updateFaceValue(now);
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
