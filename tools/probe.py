"""Send test frames to the Thermalright Magic Qube screen (VID 0416, PID 8001).

Protocol from thermalright-trcc-linux doc/PROTOCOL_USBLED.md:
  data packet = 20-byte header (DA DB DC DD, cmd 0x02 at byte 12,
  payload length LE16 at byte 16) + 66 x RGB, sent as 64-byte HID reports.

Usage:
  probe.py handshake                  send the init packet and print the reply
  probe.py fill RRGGBB [seconds]      every LED the same color
  probe.py range START STOP RRGGBB [seconds]  only LEDs START..STOP-1 lit
  probe.py walk [delay]               light LEDs one at a time, printing the index

Close TRCC first, or it will overwrite these frames.
"""
import struct
import sys
import time

import hid

VID, PID = 0x0416, 0x8001
MAGIC = bytes.fromhex("dadbdcdd")
LED_COUNT = 66
REPORT = 64            # data bytes per HID report; Windows needs report ID 0 in front


def write_report(dev, data):
    dev.write(b"\x00" + data + b"\x00" * (REPORT - len(data)))


def handshake(dev):
    init = bytearray(REPORT)
    init[0:4] = MAGIC
    init[12] = 0x01
    time.sleep(0.05)
    write_report(dev, bytes(init))
    time.sleep(0.2)
    reply = dev.read(REPORT + 1, 1000)
    return bytes(reply)


def send(dev, colors):
    header = bytearray(20)
    header[0:4] = MAGIC
    header[12] = 0x02
    struct.pack_into("<H", header, 16, len(colors) * 3)
    data = bytes(header) + b"".join(colors)
    for i in range(0, len(data), REPORT):
        write_report(dev, data[i:i + REPORT])


def rgb(hexstr):
    return bytes.fromhex(hexstr)


def hold(dev, colors, seconds):
    end = time.time() + seconds
    while time.time() < end:
        send(dev, colors)
        time.sleep(0.05)


def main():
    dev = hid.device()
    dev.open(VID, PID)
    args = sys.argv[1:] or ["help"]
    off = rgb("000000")
    try:
        if args[0] == "handshake":
            reply = handshake(dev)
            print("reply:", reply.hex(" ") if reply else "(none - already answered this power cycle?)")
        elif args[0] == "fill":
            hold(dev, [rgb(args[1])] * LED_COUNT, float(args[2]) if len(args) > 2 else 10)
        elif args[0] == "range":
            a, b = int(args[1]), int(args[2])
            cols = [rgb(args[3]) if a <= i < b else off for i in range(LED_COUNT)]
            hold(dev, cols, float(args[4]) if len(args) > 4 else 10)
        elif args[0] == "bands":
            # LEDs from 65 up in groups of 5, each group a different color; main display off.
            names = ["red", "green", "blue", "yellow", "cyan", "magenta", "white", "orange"]
            band = ["660000", "006600", "000066", "666600", "006666", "660066", "666666", "662200"]
            total = LED_COUNT + 5 * len(band)
            cols = [off] * LED_COUNT
            for i, c in enumerate(band):
                print(f"LEDs {LED_COUNT + i * 5}-{LED_COUNT + i * 5 + 4}: {names[i]}")
                cols += [rgb(c)] * 5
            assert len(cols) == total
            hold(dev, cols, float(args[1]) if len(args) > 1 else 60)
        elif args[0] == "walk":
            delay = float(args[1]) if len(args) > 1 else 0.7
            for i in range(LED_COUNT):
                print(i, flush=True)
                hold(dev, [rgb("ffffff") if j == i else off for j in range(LED_COUNT)], delay)
        else:
            print(__doc__)
    finally:
        dev.close()


if __name__ == "__main__":
    main()
