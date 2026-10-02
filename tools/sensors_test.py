"""List CPU/GPU temperature and load sensors via LibreHardwareMonitorLib.

Usage: sensors_test.py PATH_TO_LIBREHARDWAREMONITOR_FOLDER
CPU temperatures need the script to run as administrator.
"""
import sys

from pythonnet import load

load("netfx")  # LibreHardwareMonitor.zip targets .NET Framework 4.7.2
import clr  # noqa: E402

sys.path.append(sys.argv[1])
clr.AddReference("LibreHardwareMonitorLib")
from LibreHardwareMonitor.Hardware import Computer, SensorType  # noqa: E402

pc = Computer()
pc.IsCpuEnabled = True
pc.IsGpuEnabled = True
pc.Open()
try:
    for hw in pc.Hardware:
        hw.Update()
        print(f"{hw.HardwareType}: {hw.Name}")
        for s in hw.Sensors:
            if s.SensorType in (SensorType.Temperature, SensorType.Load):
                print(f"   {str(s.SensorType):11} {s.Name:32} {s.Value}")
finally:
    pc.Close()
