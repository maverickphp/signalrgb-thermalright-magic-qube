# SignalRGB plugin: Thermalright Magic Qube

Lets [SignalRGB](https://signalrgb.com) drive the digital display on the pump head of the
**Thermalright Magic Qube 360 ARGB** AIO: the two 7-segment digits, the corner labels, the border
and the side light strip all follow your SignalRGB effect.

| Setup | Display shows |
|---|---|
| **Addon only** | Your effect on every segment, synced with the rest of your PC |
| **Addon + optional helper** | Live CPU °C, GPU °C, GPU % and CPU % on the digits, in your effect's colors |

Why the helper? Free SignalRGB doesn't give plugins CPU/GPU sensor readings (they're a
[Pro feature](https://docs.signalrgb.com/guides/account-billing/about-pro-features.md)), so a
small background program reads them and hands them to the plugin.

The radiator fans and the pump ring are plain 5V ARGB wired to the motherboard's ARGB header.
Set those up as components on your motherboard's ARGB channel in SignalRGB; this plugin covers
the USB display (`VID 0416`, `PID 8001`).

## Install

1. Quit Thermalright Control Center (`TRCC.exe`), including from the tray. It fights over the
   display.
2. In SignalRGB, open **Addons** and add this repo:
   `https://github.com/maverickphp/signalrgb-thermalright-magic-qube`
3. Quit SignalRGB from the tray icon and open it again. **Thermalright Magic Qube** shows up under
   Devices and follows your effects.

### Optional: show temperatures

1. Download `MagicQubeHelper.zip` from the
   [latest release](https://github.com/maverickphp/signalrgb-thermalright-magic-qube/releases/latest)
   and extract it.
2. Double-click **Install.cmd** and allow the admin prompt.

That's it: within a few seconds the digits start showing your readings. The helper runs hidden in
the background and starts with Windows. The installer also:

- stops TRCC from starting with Windows,
- offers to install the free [PawnIO](https://pawnio.eu) driver if it's missing (needed for CPU
  temperature),
- copies itself to `C:\Program Files\MagicQubeHelper`.

To remove it, run **Uninstall.cmd** (also in that folder). The display goes back to effect-only.

## Settings

In SignalRGB: Devices → Thermalright Magic Qube → Lighting.

| Setting | What it does |
|---|---|
| Show CPU/GPU Readings | Spell the helper's readings on the digits; off shows the effect on every segment |
| Seconds Per Reading | How long each reading stays before the next one (default 3) |
| Lighting Mode | `Canvas` follows the active effect, `Forced` uses one color |
| Forced Color | Color for `Forced` mode |
| Shutdown Color | Color sent when SignalRGB or Windows shuts down |
| Hardware Brightness (%) | Thermalright's own app runs the LEDs at 40%; this matches it by default |
| LCD Face Sensor / Text Color (Pro) | See below |

**SignalRGB Pro users** may not need the helper: the plugin also registers an LCD for the device,
and can read the number SignalRGB's built-in **Simple Sensor** face draws on it. Pick that face in
the device's LCD tab, set its text color to the plugin's *LCD Face Text Color* (default
`#00ff00`), and pick the matching *LCD Face Sensor*. This is untested, since sensors and face
selection are Pro features.

## How it works

```text
                      effect colors
SignalRGB ───────────────────────────────► plugin ──USB HID──► Magic Qube display
                                             ▲
helper (optional) ──UDP 127.0.0.1:51867──────┘
  reads CPU/GPU sensors with LibreHardwareMonitorLib,
  sends {"cpu_temp": 63.0, "gpu_temp": 45.0, "gpu_load": 23.0, "cpu_load": 12.5} once a second
```

The plugin always drives the display itself. While readings arrive it lights only the segments
that spell the current value plus its corner label, border and strip; when they stop for 5 seconds
it goes back to lighting every segment.

### Display protocol

Each frame is a 20-byte header followed by 66 RGB triplets, sent as 64-byte HID output reports
(Windows needs report ID `0x00` in front of each one):

```text
offset 0-3   DA DB DC DD   magic
offset 12    02            command: LED data
offset 16-17 C6 00         payload length, little-endian (66 x 3 = 198)
offset 20..  R G B x 66    colors in wire order
```

No handshake is needed before sending colors.

| LEDs | Part |
|---|---|
| 0-20 | right (units) digit, 7 segments x 3 LEDs, segment order c, d, e, g, b, a, f |
| 21-41 | left (tens) digit, same order |
| 42-49 | corner label pairs, clockwise from top-left: CPU °C, GPU °C, GPU %, CPU % |
| 50-64 | border outline |
| 65 | light strip on the side of the pump head (not in the trcc-linux map; found by testing) |

## Development

- `tools/test_plugin.mjs`: runs the plugin against a fake SignalRGB runtime and checks the HID
  frames it sends.
- `tools/test_decoder.mjs`: checks the LCD-face number reader against frames from
  `tools/make_face_frames.py`.

  ```powershell
  python tools/make_face_frames.py build/frames
  node tools/test_plugin.mjs build/frames
  node tools/test_decoder.mjs build/frames
  ```

- `tools/make_digit_templates.py`: regenerates the bold Arial digit templates the reader uses.
- `tools/probe.py`: sends test frames straight to the display, e.g. `python tools/probe.py walk`
  lights the LEDs one at a time (quit SignalRGB first). `hid_caps.py` prints the HID report sizes,
  `sensors_test.py` lists the sensors LibreHardwareMonitorLib finds.
- `helper/magic_qube_helper.py`: the helper. Run from source as administrator with
  `--lhm <folder with LibreHardwareMonitorLib.dll>` (from `LibreHardwareMonitor.zip`, the
  .NET Framework build).
- `packaging/build.ps1 -LhmPath <that folder>`: builds `dist/MagicQubeHelper.zip` (the helper as
  one exe, plus the install scripts) for a release.

## Credits

Protocol and LED layout come from
[thermalright-trcc-linux](https://github.com/Lexonight1/thermalright-trcc-linux), where
[@jphilipb](https://github.com/jphilipb) mapped the Magic Qube on real hardware. Sensor readings
come from [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)
(MPL-2.0), which the helper bundles.

## License

[GPL-3.0](LICENSE), the same license as thermalright-trcc-linux.
