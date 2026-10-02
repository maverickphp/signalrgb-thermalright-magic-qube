# SignalRGB plugin: Thermalright Magic Qube

Lets [SignalRGB](https://signalrgb.com) drive the digital LED display on the pump head of the
**Thermalright Magic Qube 360 ARGB** AIO. The display keeps showing live CPU/GPU readings like
Thermalright's own software, but in the colors of your SignalRGB effect.

The radiator fans and the pump ring are plain 5V ARGB and are wired to the motherboard's ARGB
header. Set those up as components on your motherboard's ARGB channel in SignalRGB. This project
only covers the USB display (`VID 0416`, `PID 8001`, a WCH CH32x035 HID device).

## How it works

SignalRGB doesn't give plugins access to temperatures, so the work is split in two:

```text
SignalRGB effect --UDP 127.0.0.1:51866--> helper --USB HID--> Magic Qube display
                                            ^
             LibreHardwareMonitorLib -------+  (CPU/GPU temperature and load)
```

- `Thermalright_Magic_Qube.js` is a SignalRGB network plugin. It sends the effect colors for all
  66 LEDs to the helper on this PC.
- `helper/magic_qube_helper.py` reads the sensors, lights only the digit segments that spell the
  current value, and writes the frame to the display. It rotates through CPU temperature, GPU
  temperature, GPU load and CPU load every 3 seconds. When SignalRGB isn't running it keeps
  showing the readings in a fixed blue.

## Install

1. Quit Thermalright Control Center (`TRCC.exe`), including from the tray, and stop it starting
   with Windows. It fights over the device.
2. Download `LibreHardwareMonitor.zip` (not the .NET 10 build) from the
   [LibreHardwareMonitor releases](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases)
   and extract it. The helper only loads its `LibreHardwareMonitorLib.dll`; the app itself never runs.
3. Set up the helper, from this repo's folder:

   ```powershell
   python -m venv .venv
   .venv\Scripts\python -m pip install hidapi pythonnet
   ```

4. From an **elevated** PowerShell, register the helper to start hidden at logon (CPU temperatures
   need admin rights):

   ```powershell
   powershell -ExecutionPolicy Bypass -File helper\install_helper.ps1 -LhmPath "C:\path\to\LibreHardwareMonitor"
   ```

   It starts right away too. `-Uninstall` removes it. Its log is in
   `%LOCALAPPDATA%\MagicQubeHelper\helper.log`.
5. In SignalRGB's Addons page, add this repo as an addon. It updates automatically when the repo
   changes:
   `https://github.com/maverickphp/signalrgb-thermalright-magic-qube`
6. Fully restart SignalRGB (quit it from the tray icon). The display shows up under Devices as
   **Thermalright Magic Qube**.

## Settings

| Setting | What it does |
|---|---|
| Lighting Mode | `Canvas` follows the active effect, `Forced` uses one color |
| Forced Color | Color for `Forced` mode |
| Shutdown Color | Color sent when SignalRGB or Windows shuts down |
| Hardware Brightness (%) | Thermalright's own app sends colors at 40%; this matches it by default |

## Protocol

Each frame is a 20-byte header followed by 66 RGB triplets, sent as 64-byte HID output reports
(Windows needs report ID `0x00` in front of each one):

```text
offset 0-3   DA DB DC DD   magic
offset 12    02            command: LED data
offset 16-17 C6 00         payload length, little-endian (66 x 3 = 198)
offset 20..  R G B x 66    colors in wire order
```

No handshake is needed before sending colors.

LED wire order:

| LEDs | Part |
|---|---|
| 0-20 | right (units) digit, 7 segments x 3 LEDs, segment order c, d, e, g, b, a, f |
| 21-41 | left (tens) digit, same order |
| 42-49 | indicator pairs, clockwise from top-left: CPU temp, GPU temp, GPU load, CPU load |
| 50-64 | border outline |
| 65 | light strip on the side of the pump head (not in the trcc-linux map; found by testing) |

The order of LEDs inside each segment and around the border is approximate, so smooth gradients
may look slightly out of order on those parts.

The plugin-to-helper packet is `4D 51 01` ("MQ", version 1) followed by the same 66 RGB triplets.

## Tools

`tools/` holds the scripts used to work out the protocol and to test the code:

- `probe.py`: sends test frames straight to the display. Example: `python tools/probe.py walk`
  lights the LEDs one at a time. Stop the helper first.
- `hid_caps.py`: prints the device's HID report sizes.
- `sensors_test.py`: lists the CPU/GPU sensors LibreHardwareMonitorLib finds.
- `test_plugin.mjs`: runs the plugin against a fake SignalRGB runtime and checks the packets it
  sends (`node tools/test_plugin.mjs`).
- `test_helper.py`: checks the helper's digit masks (`python tools/test_helper.py`).

## Credits

Protocol and LED layout come from
[thermalright-trcc-linux](https://github.com/Lexonight1/thermalright-trcc-linux), where
[@jphilipb](https://github.com/jphilipb) mapped the Magic Qube on real hardware. Sensor readings
come from [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor).

## License

[GPL-3.0](LICENSE), the same license as thermalright-trcc-linux.
