"""Receive-only diagnostic: log input level and AIOC COS every 50 ms, then plot a timeline.

    python -m radio.timeline 30            # record 30 s -> radio_timeline.png / .wav

Plotting needs matplotlib (pip install matplotlib); the bridge itself doesn't.
"""

import sys
import time

import numpy as np
import sounddevice as sd

from radio.bridge import SAMPLE_RATE, Cos, RadioConfig, find_audio_device, level_db, write_wav

BLOCK = 0.05
SQUELCH_DB = RadioConfig().squelch_db


def record(seconds: float, device_hint: str = "AIOC"):
    dev = find_audio_device(device_hint, "input")
    cos = Cos()
    block = int(SAMPLE_RATE * BLOCK)
    t, levels, states, chunks = [], [], [], []
    try:
        cos.poll()
        with sd.InputStream(device=dev, channels=1, samplerate=SAMPLE_RATE, blocksize=block) as stream:
            start = time.time()
            while time.time() - start < seconds:
                chunk, _ = stream.read(block)
                chunk = chunk[:, 0].copy()
                chunks.append(chunk)
                t.append(time.time() - start)
                levels.append(level_db(chunk))
                states.append(cos.poll())
    finally:
        cos.close()
    return np.array(t), np.array(levels), np.array(states), np.concatenate(chunks)


def edges(t, states):
    out = []
    for i in range(1, len(states)):
        if states[i] != states[i - 1]:
            out.append((round(float(t[i]), 2), "ON" if states[i] else "OFF"))
    if len(states) and states[0]:
        out.insert(0, (0.0, "ON (at start)"))
    return out


def plot(t, levels, states, path, title="AIOC receive timeline"):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(12, 4.5), dpi=120)
    on = states.astype(bool)
    ax.fill_between(t, -80, 0, where=on, step="post", color="#2e7d32", alpha=0.18, label="COS on (radio receiving)")
    ax.plot(t, levels, color="#1565c0", lw=1, label="input level (50 ms RMS)")
    ax.axhline(SQUELCH_DB, color="#999", ls="--", lw=0.8, label=f"speech threshold ({SQUELCH_DB:.0f} dBFS)")
    ax.axhspan(-10, -6, color="#f9a825", alpha=0.15, label="target speech peaks")
    for at, what in edges(t, states):
        ax.axvline(at, color="#2e7d32" if what.startswith("ON") else "#c62828", lw=0.8)
        ax.text(at, -3, f"{what} {at:.1f}s", rotation=90, va="top", ha="right", fontsize=7)
    ax.set_ylim(-80, 0)
    ax.set_xlim(0, t[-1] if len(t) else 1)
    ax.set_xlabel("seconds")
    ax.set_ylabel("dBFS")
    ax.set_title(title)
    ax.legend(loc="lower right", fontsize=7)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path)


def main() -> None:
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 30
    print(f"recording {seconds:.0f} s ...", flush=True)
    t, levels, states, audio = record(seconds)
    write_wav("radio_timeline.wav", audio)
    plot(t, levels, states, "radio_timeline.png", f"AIOC receive timeline, {time.strftime('%H:%M:%S')}")
    print("COS edges:", edges(t, states) or "none")
    loud = t[levels > SQUELCH_DB]
    print(f"above {SQUELCH_DB:.0f} dBFS: {len(loud) * BLOCK:.1f} s total" + (f", first {loud[0]:.1f}s last {loud[-1]:.1f}s" if len(loud) else ""))
    print(f"peak {20 * np.log10(max(float(abs(audio).max()), 1e-9)):.1f} dBFS -> radio_timeline.png")


if __name__ == "__main__":
    main()
