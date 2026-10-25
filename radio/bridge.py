"""Radio bridge: lets Spring It hear reports and reply over a PMR446 walkie-talkie.

Hardware: AIOC (All-In-One-Cable) on the "wired radio". The AIOC shows up as
  - a USB sound card (radio speaker -> Mac input, Mac output -> radio mic)
  - a USB serial port; DTR=1, RTS=0 keys PTT (firmware >= 1.2.0)

Without an AIOC (e.g. the AB13X card) use ptt_mode="vox" or "manual".
"""

from __future__ import annotations

import glob
import subprocess
import tempfile
import time
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import sounddevice as sd

SAMPLE_RATE = 48000


def find_audio_device(name_hint: str, kind: str) -> int:
    """Return the index of the first input/output device whose name contains name_hint."""
    for i, dev in enumerate(sd.query_devices()):
        channels = dev["max_input_channels"] if kind == "input" else dev["max_output_channels"]
        if name_hint.lower() in dev["name"].lower() and channels > 0:
            return i
    names = [d["name"] for d in sd.query_devices()]
    raise RuntimeError(f"No {kind} device matching {name_hint!r}. Found: {names}")


def find_aioc_serial() -> str:
    """AIOC enumerates as a CDC serial port; on macOS that's /dev/cu.usbmodem*."""
    ports = sorted(glob.glob("/dev/cu.usbmodem*")) + sorted(glob.glob("/dev/ttyACM*"))
    if not ports:
        raise RuntimeError("No AIOC serial port found (looked for /dev/cu.usbmodem*, /dev/ttyACM*)")
    return ports[0]


class Ptt:
    """Push-to-talk. mode: 'aioc' (serial DTR/RTS), 'vox' (radio keys itself), 'manual' (a person presses PTT)."""

    def __init__(self, mode: str = "aioc", port: str | None = None):
        self.mode = mode
        self._serial = None
        if mode == "aioc":
            import serial  # pyserial

            self._serial = serial.Serial(port or find_aioc_serial())
            self.off()

    def on(self) -> None:
        if self._serial:
            self._serial.dtr = True
            self._serial.rts = False
        elif self.mode == "manual":
            input(">>> Hold PTT on the wired radio, then press Enter ")

    def off(self) -> None:
        if self._serial:
            self._serial.dtr = False
            self._serial.rts = False
        elif self.mode == "manual":
            print(">>> Release PTT")

    def close(self) -> None:
        if self._serial:
            self.off()
            self._serial.close()


@dataclass
class RadioConfig:
    device_hint: str = "All-In-One-Cable"  # use "AB13X" for the old card
    ptt_mode: str = "aioc"
    output_gain: float = 0.3  # radio mic inputs are sensitive; start low
    key_up_delay: float = 0.3  # seconds between PTT on and audio, so the first word isn't clipped
    tail: float = 0.3  # seconds of PTT after audio ends
    squelch_db: float = -45.0  # input level that counts as "someone is talking"
    hang_time: float = 1.2  # silence that ends a received transmission
    max_report: float = 60.0


class RadioBridge:
    def __init__(self, config: RadioConfig | None = None):
        self.cfg = config or RadioConfig()
        self.in_dev = find_audio_device(self.cfg.device_hint, "input")
        self.out_dev = find_audio_device(self.cfg.device_hint, "output")
        self.ptt = Ptt(self.cfg.ptt_mode)

    # ---- transmit -------------------------------------------------------

    def transmit(self, audio: np.ndarray, sample_rate: int = SAMPLE_RATE) -> None:
        """Key the radio, play mono float32 audio, unkey."""
        audio = np.clip(audio.astype(np.float32) * self.cfg.output_gain, -1.0, 1.0)
        if self.cfg.ptt_mode == "vox":
            # VOX needs sound to key up; lead with a short chime.
            audio = np.concatenate([chime(sample_rate), audio])
        self.ptt.on()
        try:
            time.sleep(self.cfg.key_up_delay)
            sd.play(audio, sample_rate, device=self.out_dev, blocking=True)
            time.sleep(self.cfg.tail)
        finally:
            self.ptt.off()

    def say(self, text: str, voice: str = "Daniel") -> None:
        """Speak text over the radio using macOS `say` (swap for any TTS that returns audio)."""
        self.transmit(*tts_macos(text, voice))

    # ---- receive --------------------------------------------------------

    def listen(self) -> np.ndarray:
        """Block until a transmission arrives and ends; return it as mono float32 at SAMPLE_RATE."""
        block = int(SAMPLE_RATE * 0.05)
        frames: list[np.ndarray] = []
        talking, silent_for, total = False, 0.0, 0.0
        with sd.InputStream(device=self.in_dev, channels=1, samplerate=SAMPLE_RATE, blocksize=block) as stream:
            while True:
                chunk, _ = stream.read(block)
                chunk = chunk[:, 0].copy()
                loud = level_db(chunk) > self.cfg.squelch_db
                if loud and not talking:
                    talking = True
                if talking:
                    frames.append(chunk)
                    total += 0.05
                    silent_for = 0.0 if loud else silent_for + 0.05
                    if silent_for >= self.cfg.hang_time or total >= self.cfg.max_report:
                        return np.concatenate(frames)

    def close(self) -> None:
        self.ptt.close()


# ---- helpers -----------------------------------------------------------


def level_db(x: np.ndarray) -> float:
    rms = float(np.sqrt(np.mean(np.square(x)))) if x.size else 0.0
    return 20 * np.log10(max(rms, 1e-9))


def tone(freq: float = 1000.0, seconds: float = 2.0, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    t = np.arange(int(seconds * sample_rate)) / sample_rate
    return (0.8 * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def chime(sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    return np.concatenate([tone(880, 0.2, sample_rate), tone(1320, 0.3, sample_rate)])


def tts_macos(text: str, voice: str = "Daniel") -> tuple[np.ndarray, int]:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "say.wav"
        subprocess.run(
            ["say", "-v", voice, "-o", str(path), "--data-format=LEI16@48000", text], check=True
        )
        return read_wav(path)


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path)) as w:
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        if w.getnchannels() > 1:
            data = data.reshape(-1, w.getnchannels()).mean(axis=1)
        return data, w.getframerate()


def write_wav(path: Path, audio: np.ndarray, sample_rate: int = SAMPLE_RATE) -> None:
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm.tobytes())
