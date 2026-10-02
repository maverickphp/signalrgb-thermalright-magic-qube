# SignalRGB plugin: Thermalright Magic Qube

Lets [SignalRGB](https://signalrgb.com) drive the digital LED display on the pump head of the
**Thermalright Magic Qube 360 ARGB** AIO, so it follows your SignalRGB effects like any other device.

The radiator fans and the pump ring are plain 5V ARGB and are wired to the motherboard's ARGB
header. Set those up as components on your motherboard's ARGB channel in SignalRGB. This plugin
only covers the USB display (`VID 0416`, `PID 8001`, a WCH CH32x035 HID device).

## Install

1. Quit Thermalright Control Center (`TRCC.exe`), including from the tray. It fights over the device.
2. In SignalRGB's Addons page, add this repo as an addon. It updates automatically when the repo
   changes:
   `https://github.com/maverickphp/signalrgb-thermalright-magic-qube`
3. Fully restart SignalRGB (quit it from the tray icon). The display shows up under Devices as
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
| 0-20 | right digit, 7 segments x 3 LEDs, segment order c, d, e, g, b, a, f |
| 21-41 | left digit, same order |
| 42-49 | indicator pairs, clockwise from top-left: CPU temp, GPU temp, GPU load, CPU load |
| 50-64 | border outline |
| 65 | light strip on the side of the pump head (not in the trcc-linux map; found by testing) |

The order of LEDs inside each segment and around the border is approximate, so smooth gradients
may look slightly out of order on those parts.

## Tools

`tools/` holds the scripts used to work out the protocol:

- `probe.py`: sends test frames straight to the display (`pip install hidapi`).
  Example: `python tools/probe.py walk` lights the LEDs one at a time.
- `hid_caps.py`: prints the device's HID report sizes.
- `test_plugin.mjs`: runs the plugin against a fake SignalRGB device and checks the bytes it sends
  (`node tools/test_plugin.mjs`).

## Credits

Protocol and LED layout come from
[thermalright-trcc-linux](https://github.com/Lexonight1/thermalright-trcc-linux), where
[@jphilipb](https://github.com/jphilipb) mapped the Magic Qube on real hardware.

## License

[GPL-3.0](LICENSE), the same license as thermalright-trcc-linux.
