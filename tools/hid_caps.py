"""Print the HID report sizes of the Magic Qube screen (Windows only)."""
import ctypes
from ctypes import wintypes

import hid

VID, PID = 0x0416, 0x8001


class HIDP_CAPS(ctypes.Structure):
    _fields_ = [
        ("Usage", wintypes.USHORT),
        ("UsagePage", wintypes.USHORT),
        ("InputReportByteLength", wintypes.USHORT),
        ("OutputReportByteLength", wintypes.USHORT),
        ("FeatureReportByteLength", wintypes.USHORT),
        ("Reserved", wintypes.USHORT * 17),
        ("NumberLinkCollectionNodes", wintypes.USHORT),
        ("NumberInputButtonCaps", wintypes.USHORT),
        ("NumberInputValueCaps", wintypes.USHORT),
        ("NumberInputDataIndices", wintypes.USHORT),
        ("NumberOutputButtonCaps", wintypes.USHORT),
        ("NumberOutputValueCaps", wintypes.USHORT),
        ("NumberOutputDataIndices", wintypes.USHORT),
        ("NumberFeatureButtonCaps", wintypes.USHORT),
        ("NumberFeatureValueCaps", wintypes.USHORT),
        ("NumberFeatureDataIndices", wintypes.USHORT),
    ]


k32 = ctypes.WinDLL("kernel32", use_last_error=True)
hidlib = ctypes.WinDLL("hid")
k32.CreateFileW.restype = wintypes.HANDLE

for d in hid.enumerate(VID, PID):
    path = d["path"].decode()
    h = k32.CreateFileW(path, 0, 3, None, 3, 0, None)  # no access rights needed for caps
    ppd = ctypes.c_void_p()
    hidlib.HidD_GetPreparsedData(h, ctypes.byref(ppd))
    caps = HIDP_CAPS()
    hidlib.HidP_GetCaps(ppd, ctypes.byref(caps))
    hidlib.HidD_FreePreparsedData(ppd)
    k32.CloseHandle(h)
    print(path)
    print(f"  usage page 0x{caps.UsagePage:04X} usage 0x{caps.Usage:02X}")
    print(f"  input {caps.InputReportByteLength}  output {caps.OutputReportByteLength}"
          f"  feature {caps.FeatureReportByteLength}  (lengths include the report ID byte)")
