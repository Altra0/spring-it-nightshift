"""Two-minute check of the radio rig. Run from the repo root:

    python3 -m radio.test_rig                 # AIOC, software PTT
    python3 -m radio.test_rig --device AB13X --ptt manual
    python3 -m radio.test_rig --loop 2         # answer two reports, no prompts

Steps: list devices -> PTT blink -> transmit tone -> transmit speech -> receive a report.
"""

import argparse
import time
from pathlib import Path

import numpy as np
import sounddevice as sd

from radio.bridge import RadioBridge, RadioConfig, level_db, tone, write_wav


def step(title: str) -> None:
    input(f"\n=== {title} — press Enter to start ")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--device", default="AIOC")
    p.add_argument("--ptt", default="aioc", choices=["aioc", "vox", "manual"])
    p.add_argument("--in-device", help="input device hint, overrides --device")
    p.add_argument("--out-device", help="output device hint, overrides --device")
    p.add_argument("--gain", type=float, default=0.85)
    p.add_argument("--loop", type=int, metavar="N", help="skip the checks; answer N reports, then exit")
    p.add_argument("--monitor", action="store_true", help="live web view at http://localhost:8765")
    p.add_argument("--rx", default=None, choices=["cos", "level"], help="default: cos with the AIOC, else level")
    args = p.parse_args()

    print(sd.query_devices())
    monitor = None
    if args.monitor:
        from radio.monitor import Monitor

        monitor = Monitor()
        monitor.open()
    bridge = RadioBridge(
        RadioConfig(
            device_hint=args.device,
            input_hint=args.in_device,
            output_hint=args.out_device,
            ptt_mode=args.ptt,
            output_gain=args.gain,
            rx_detect=args.rx or ("cos" if args.ptt == "aioc" else "level"),
        ),
        monitor=monitor,
    )
    print(f"\nUsing input #{bridge.in_dev}, output #{bridge.out_dev}, PTT mode {args.ptt}")

    try:
        if args.loop:
            echo_loop(bridge, args.loop)
            return
        if args.ptt == "aioc":
            step("1. PTT test: wired radio LED should go RED for 2 seconds")
            bridge.ptt.on()
            time.sleep(2)
            bridge.ptt.off()

        step("2. Transmit a 1 kHz tone for 3 s. Listen on the hand radio")
        bridge.transmit(tone(1000, 3))

        step("3. Transmit speech. Hand radio should say a test phrase")
        bridge.say("Spring It radio check. One, two, three.")

        step("4. Receive: talk on the hand radio for a few seconds, then release")
        audio = bridge.listen()
        out = Path("radio_rx_test.wav")
        write_wav(out, audio)
        peak = 20 * np.log10(max(float(abs(audio).max()), 1e-9))
        print(f"Got {len(audio) / 48000:.1f} s, level {level_db(audio):.0f} dBFS, peak {peak:.0f} dBFS -> {out}")
        print("Aim for peaks around -10 to -6 dBFS; adjust the wired radio's volume knob.")
    finally:
        bridge.close()


def echo_loop(bridge: RadioBridge, reports: int) -> None:
    """Stand-in for Spring It: wait for a report, save it, read back its length."""
    for n in range(1, reports + 1):
        print(f"\n[{n}/{reports}] listening ({bridge.cfg.rx_detect})...")
        audio = bridge.listen()
        seconds = len(audio) / 48000
        out = Path(f"radio_report_{n}.wav")
        write_wav(out, audio)
        peak = 20 * np.log10(max(float(abs(audio).max()), 1e-9))
        print(f"Got {seconds:.1f} s, level {level_db(audio):.0f} dBFS, peak {peak:.0f} dBFS -> {out}")
        bridge.mon.event(f"Report {n}: {seconds:.1f} s, peak {peak:.0f} dBFS -> {out}")
        bridge.say(f"Got your report, {seconds:.0f} seconds long. Over.")
        print("Replied")
    bridge.mon.phase("Loop finished")


if __name__ == "__main__":
    main()
