"""Optional helper for the Thermalright Magic Qube SignalRGB plugin: sends CPU/GPU readings.

Free SignalRGB doesn't give plugins sensor readings, so this reads CPU/GPU temperature and load
through LibreHardwareMonitorLib and sends them once a second as JSON over UDP to the plugin on
this PC (127.0.0.1:51867), e.g. {"cpu_temp": 63.0, "gpu_temp": 45.0, "gpu_load": 23.0,
"cpu_load": 12.5}. The plugin keeps driving the display; it shows these on the digits while they
keep arriving and goes back to effect-only lighting when they stop.

Run as administrator (CPU temperatures need it):
  pythonw magic_qube_helper.py --lhm "C:\\path\\to\\LibreHardwareMonitor"
The packaged MagicQubeHelper.exe carries LibreHardwareMonitorLib itself and needs no --lhm.
"""
import argparse
import json
import logging
import os
import socket
import sys
import time

PLUGIN_ADDRESS = ("127.0.0.1", 51867)
KEYS = ("cpu_temp", "gpu_temp", "gpu_load", "cpu_load")

log = logging.getLogger("magic_qube")


class Sensors:
    """CPU/GPU temperature and load from LibreHardwareMonitorLib."""

    def __init__(self, lhm_dir):
        from pythonnet import load
        load("netfx")  # LibreHardwareMonitor.zip targets .NET Framework 4.7.2
        import clr
        sys.path.append(lhm_dir)
        clr.AddReference("LibreHardwareMonitorLib")
        from LibreHardwareMonitor.Hardware import Computer, HardwareType, SensorType

        self._types = (HardwareType, SensorType)
        self._pc = Computer()
        self._pc.IsCpuEnabled = True
        self._pc.IsGpuEnabled = True
        self._pc.Open()

    def read(self):
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
        return {k: round(found[k], 1) for k in KEYS if k in found}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    # The packaged exe carries LibreHardwareMonitorLib in its own "lhm" folder.
    bundled = os.path.join(getattr(sys, "_MEIPASS", ""), "lhm") if getattr(sys, "frozen", False) else None
    parser.add_argument("--lhm", required=bundled is None, default=bundled,
                        help="folder containing LibreHardwareMonitorLib.dll")
    parser.add_argument("--interval", type=float, default=1.0, help="seconds between readings")
    args = parser.parse_args()

    log_dir = os.path.join(os.environ.get("LOCALAPPDATA", "."), "MagicQubeHelper")
    os.makedirs(log_dir, exist_ok=True)
    logging.basicConfig(filename=os.path.join(log_dir, "helper.log"), level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    log.info("starting; lhm=%s", args.lhm)

    sensors = Sensors(args.lhm)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    logged_first = False
    while True:
        try:
            values = sensors.read()
            sock.sendto(json.dumps(values).encode(), PLUGIN_ADDRESS)
            if not logged_first:
                log.info("first reading: %s", values)
                logged_first = True
        except Exception:
            log.exception("reading or sending failed")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
