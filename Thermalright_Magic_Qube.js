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
*/
export function ControllableParameters() {
	return [
		{property:"shutdownColor", group:"lighting", label:"Shutdown Color", description:"Color applied when SignalRGB or the system shuts down", min:"0", max:"360", type:"color", default:"#000000"},
		{property:"LightingMode", group:"lighting", label:"Lighting Mode", description:"Canvas follows the active effect, Forced uses one color", type:"combobox", values:["Canvas", "Forced"], default:"Canvas"},
		{property:"forcedColor", group:"lighting", label:"Forced Color", description:"Color used in Forced mode", min:"0", max:"360", type:"color", default:"#009bde"},
		{property:"brightnessScale", group:"lighting", label:"Hardware Brightness (%)", description:"Thermalright's own software sends colors at 40% of full value. Raise with care.", step:"1", type:"number", min:"10", max:"100", default:"40"},
	];
}

// Protocol (from thermalright-trcc-linux, doc/PROTOCOL_USBLED.md):
// 20-byte header DA DB DC DD .. cmd 0x02 at [12], payload length LE16 at [16],
// then one RGB triplet per LED in wire order, sent as 64-byte HID reports.
const LED_COUNT = 65;
const REPORT_SIZE = 64;
const MIN_FRAME_MS = 30; // the firmware needs ~30 ms between frames

// Wire order of the 7 segments inside one digit, 3 LEDs per segment.
const SEGMENT_WIRE_ORDER = ["c", "d", "e", "g", "b", "a", "f"];

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
}

buildLayout();

export function LedNames() { return vLedNames; }
export function LedPositions() { return vLedPositions; }

let lastFrame = 0;

export function Initialize() {
	device.setName("Thermalright Magic Qube");
}

export function Render() {
	const now = Date.now();
	if (now - lastFrame < MIN_FRAME_MS) {
		return;
	}
	lastFrame = now;
	sendColors();
}

export function Shutdown(SystemSuspending) {
	sendColors(SystemSuspending ? "#000000" : shutdownColor);
}

function sendColors(overrideColor) {
	const scale = Math.min(100, Math.max(10, Number(brightnessScale) || 40)) / 100;
	const fixed = overrideColor ? hexToRgb(overrideColor)
		: LightingMode === "Forced" ? hexToRgb(forcedColor) : null;

	const frame = new Array(20).fill(0);
	frame[0] = 0xDA; frame[1] = 0xDB; frame[2] = 0xDC; frame[3] = 0xDD;
	frame[12] = 0x02;
	frame[16] = (LED_COUNT * 3) & 0xFF;
	frame[17] = (LED_COUNT * 3) >> 8;

	for (let i = 0; i < LED_COUNT; i++) {
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
	return "https://assets.signalrgb.com/devices/default/misc/usb-drive-render.png";
}
