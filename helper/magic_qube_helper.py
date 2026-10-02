"""Drive the Thermalright Magic Qube display with SignalRGB colors and live temperatures.

SignalRGB's network plugin sends the effect colors for all 66 LEDs over UDP to 127.0.0.1.
This helper reads CPU/GPU temperature and load through LibreHardwareMonitorLib, lights only the
digit segments that spell the current value, and writes the frame to the display over USB HID.
The four metrics rotate like Thermalright's own software: CPU temp, GPU temp, GPU load, CPU load.

Run as administrator (CPU temperatures need it):
  pythonw magic_qube_helper.py --lhm "C:\\path\\to\\LibreHardwareMonitor"
"""
import argparse
import logging
import os
import socket
import struct
import sys
import threading
import time

import hid

VID, PID = 0x0416, 0x8001
LED_COUNT = 66
REPORT = 64
UDP_PORT = 51866
PACKET_MAGIC = b"MQ\x01"           # plugin -> helper: magic + 66 x RGB
SIGNALRGB_TIMEOUT = 2.0            # seconds without a packet before falling back to FALLBACK_COLOR
FALLBACK_COLOR = (0, 62, 89)       # #009bde at Thermalright's 40% level
FRAME_INTERVAL = 0.033

# LED layout (see README): units digit 0-20, tens digit 21-41, 3 LEDs per segment.
SEGMENT_WIRE_ORDER = "cdegbaf"
UNITS_BASE, TENS_BASE = 0, 21
INDICATORS = {"cpu_temp": (42, 43), "gpu_temp": (44, 45), "gpu_load": (46, 47), "cpu_load": (48, 49)}
ALWAYS_ON = tuple(range(50, 66))   # border outline + side strip
DIGIT_SEGMENTS = {
    "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg",
    "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg",
}

log = logging.getLogger("magic_qube")


def digit_leds(ch, base):
    for seg in DIGIT_SEGMENTS.get(ch, ""):
        start = base + SEGMENT_WIRE_ORDER.index(seg) * 3
        yield from range(start, start + 3)


def lit_mask(metric, value):
    """Which LEDs are on for this metric/value: two digits, its indicator, border and strip."""
    lit = set(ALWAYS_ON) | set(INDICATORS[metric])
    if value is not None:
        text = f"{min(99, max(0, round(value))):2d}"   # leading blank instead of zero
        lit.update(digit_leds(text[0], TENS_BASE))
        lit.update(digit_leds(text[1], UNITS_BASE))
    return lit


class Sensors:
    """Polls CPU/GPU temperature and load once a second on a background thread."""

    def __init__(self, lhm_dir):
        from pythonnet import load
        load("netfx")
        import clr
        sys.path.append(lhm_dir)
        clr.AddReference("LibreHardwareMonitorLib")
        from LibreHardwareMonitor.Hardware import Computer, HardwareType, SensorType

        self._types = (HardwareType, SensorType)
        self._pc = Computer()
        self._pc.IsCpuEnabled = True
        self._pc.IsGpuEnabled = True
        self._pc.Open()
        self.values = {k: None for k in INDICATORS}
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        while True:
            try:
                self._poll()
            except Exception:
                log.exception("sensor poll failed")
            time.sleep(1)

    def _poll(self):
        HardwareType, SensorType = self._types
        found = {}
        for hw in self._pc.Hardware:
            hw.Update()
            is_cpu = hw.HardwareType == HardwareType.Cpu
            is_gpu = hw.HardwareType in (HardwareType.GpuNvidia, HardwareType.GpuAmd)
            for s in hw.Sensors:
                if s.Value is None:
                    continue
                if is_cpu and s.SensorType == SensorType.Temperature and s.Name == "CPU Package":
                    found["cpu_temp"] = float(s.Value)
                elif is_cpu and s.SensorType == SensorType.Load and s.Name == "CPU Total":
                    found["cpu_load"] = float(s.Value)
                elif is_gpu and s.SensorType == SensorType.Temperature and s.Name == "GPU Core":
                    found.setdefault("gpu_temp", float(s.Value))
                elif is_gpu and s.SensorType == SensorType.Load and s.Name == "GPU Core":
                    found.setdefault("gpu_load", float(s.Value))
        self.values = {k: found.get(k) for k in INDICATORS}


class Display:
    """The USB HID display. Reopens itself if the device goes away."""

    def __init__(self):
        self._dev = None

    def send(self, colors):
        if self._dev is None:
            try:
                self._dev = hid.device()
                self._dev.open(VID, PID)
                log.info("display opened")
            except OSError:
                self._dev = None
                return
        header = bytearray(20)
        header[0:4] = b"\xda\xdb\xdc\xdd"
        header[12] = 0x02
        struct.pack_into("<H", header, 16, LED_COUNT * 3)
        data = bytes(header) + bytes(c for rgb in colors for c in rgb)
        try:
            for i in range(0, len(data), REPORT):
                chunk = data[i:i + REPORT]
                self._dev.write(b"\x00" + chunk + b"\x00" * (REPORT - len(chunk)))
        except OSError:
            log.warning("display write failed; reopening")
            self._dev.close()
            self._dev = None


class ColorFeed:
    """Receives effect colors from the SignalRGB plugin."""

    def __init__(self, port):
        self.colors = None
        self.received_at = 0.0
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._sock.bind(("127.0.0.1", port))
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        size = len(PACKET_MAGIC) + LED_COUNT * 3
        while True:
            data, _ = self._sock.recvfrom(1024)
            if len(data) == size and data.startswith(PACKET_MAGIC):
                body = data[len(PACKET_MAGIC):]
                self.colors = [tuple(body[i:i + 3]) for i in range(0, len(body), 3)]
                self.received_at = time.time()

    def current(self):
        if self.colors and time.time() - self.received_at < SIGNALRGB_TIMEOUT:
            return self.colors
        return [FALLBACK_COLOR] * LED_COUNT


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lhm", required=True, help="folder containing LibreHardwareMonitorLib.dll")
    parser.add_argument("--rotate", type=float, default=3.0, help="seconds per metric (default 3)")
    parser.add_argument("--port", type=int, default=UDP_PORT)
    args = parser.parse_args()

    log_dir = os.path.join(os.environ.get("LOCALAPPDATA", "."), "MagicQubeHelper")
    os.makedirs(log_dir, exist_ok=True)
    logging.basicConfig(filename=os.path.join(log_dir, "helper.log"), level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    log.info("starting; lhm=%s port=%d", args.lhm, args.port)

    sensors = Sensors(args.lhm)
    feed = ColorFeed(args.port)
    display = Display()
    metrics = list(INDICATORS)
    off = (0, 0, 0)
    start = time.time()

    while True:
        metric = metrics[int((time.time() - start) / args.rotate) % len(metrics)]
        lit = lit_mask(metric, sensors.values[metric])
        colors = feed.current()
        display.send([colors[i] if i in lit else off for i in range(LED_COUNT)])
        time.sleep(FRAME_INTERVAL)


if __name__ == "__main__":
    main()
