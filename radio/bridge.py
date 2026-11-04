"""Radio bridge: lets Spring It hear reports and reply over a PMR446 walkie-talkie.

Hardware: AIOC (All-In-One-Cable) on the "wired radio". The AIOC shows up as
  - a USB sound card (radio speaker -> Mac input, Mac output -> radio mic)
  - a USB serial port; DTR=1, RTS=0 keys PTT (firmware >= 1.2.0)

Without an AIOC (e.g. the AB13X card) use ptt_mode="vox" or "manual".
"""

from __future__ import annotations

import collections
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


class Cos:
    """Carrier-operated squelch from the AIOC: the radio is receiving while the bit is set.

    The AIOC routes its COS input to a CM108 button (IN2 on volume-down by default), which
    arrives as a HID input report whenever it changes.
    """

    def __init__(self, mask: int = 0x02, on_report=None):
        import hid  # hidapi

        self.mask = mask
        self.active = False
        self.on_report = on_report  # called with each raw HID report, for debugging
        self._dev = hid.device()
        self._dev.open(AIOC_VID, AIOC_PID)
        self._dev.set_nonblocking(True)

    def poll(self) -> bool:
        while report := self._dev.read(16):  # drain every pending report, keep the last state
            self.active = bool(report[0] & self.mask)
            if self.on_report:
                self.on_report(report)
        return self.active

    def close(self) -> None:
        self._dev.close()


class RxGate:
    """Effective receive: COS is on AND there was audio above squelch within hang_time.

    The ESY082's speaker-bias COS can stay high for half a minute after a quick re-key
    while the audio sits at the noise floor, so COS alone can't end a report.
    """

    def __init__(self, squelch_db: float, hang_time: float):
        self.squelch_db = squelch_db
        self.hang_time = hang_time
        self.quiet_for = float("inf")

    def update(self, cos: bool, db: float, dt: float = 0.05) -> bool:
        self.quiet_for = 0.0 if db > self.squelch_db else self.quiet_for + dt
        return cos and self.quiet_for < self.hang_time


AIOC_VID, AIOC_PID = 0x1209, 0x7388


@dataclass
class RadioConfig:
    device_hint: str = "AIOC"  # CoreAudio names it "AIOC Audio"; use "AB13X" for the old card
    input_hint: str | None = None  # override device_hint per direction, e.g. built-in mic/speaker held to the radio
    output_hint: str | None = None
    ptt_mode: str = "aioc"
    output_gain: float = 0.85  # applied to speech normalised to tts_peak_db; 0.3 to 0.7 was quiet on the ESY082
    tts_peak_db: float = -3.0  # speech peak before output_gain, so every reply has the same level and can't clip
    key_up_delay: float = 0.3  # seconds between PTT on and audio, so the first word isn't clipped
    tail: float = 0.3  # seconds of PTT after audio ends
    rx_detect: str = "cos"  # "cos" (AIOC hardware COS) or "level" (input loudness)
    squelch_db: float = -50.0  # level that counts as speech; open-channel hiss on the ESY082 is about -58
    hang_time: float = 1.2  # silence that ends a received transmission, even while COS is stuck on
    cos_tail: float = 0.3  # keep recording this long after effective receive drops (rides out COS bounces)
    pre_roll: float = 1.0  # audio kept from before COS rises; COS lagged the audio by ~0.6 s
    min_speech: float = 0.5  # less audio than this above squelch is a key-up beep, not a report
    max_report: float = 60.0
    normalize_db: float | None = -3.0  # peak level for returned reports; None keeps them raw
    max_boost_db: float = 20.0


class RadioBridge:
    def __init__(self, config: RadioConfig | None = None, monitor=None):
        from radio.monitor import NullMonitor

        self.cfg = config or RadioConfig()
        self.mon = monitor or NullMonitor()  # radio.monitor.Monitor for the live web view
        self.in_dev = find_audio_device(self.cfg.input_hint or self.cfg.device_hint, "input")
        self.out_dev = find_audio_device(self.cfg.output_hint or self.cfg.device_hint, "output")
        self.ptt = Ptt(self.cfg.ptt_mode)
        self.cos = None
        if self.cfg.rx_detect == "cos":
            try:
                self.cos = Cos()
            except (ImportError, OSError) as e:
                print(f"No AIOC COS ({e}); falling back to level squelch")

    # ---- transmit -------------------------------------------------------

    def transmit(self, audio: np.ndarray, sample_rate: int = SAMPLE_RATE) -> None:
        """Key the radio, play mono float32 audio, unkey."""
        audio = np.clip(audio.astype(np.float32) * self.cfg.output_gain, -1.0, 1.0)
        if self.cfg.ptt_mode == "vox":
            # VOX needs sound to key up; lead with a short chime.
            audio = np.concatenate([chime(sample_rate), audio])
        self.ptt.on()
        self.mon.ptt(True)
        try:
            time.sleep(self.cfg.key_up_delay)
            sd.play(audio, sample_rate, device=self.out_dev, blocking=True)
            time.sleep(self.cfg.tail)
        finally:
            self.ptt.off()
            self.mon.ptt(False)

    def say(self, text: str, voice: str = "Daniel") -> None:
        """Speak text over the radio using macOS `say` (swap for any TTS that returns audio)."""
        self.mon.phase(f"Replying: {text}")
        self.mon.event(f"Reply: {text}")
        audio, sample_rate = tts_macos(text, voice)
        self.transmit(normalize(audio, self.cfg.tts_peak_db, max_boost_db=12.0), sample_rate)

    # ---- receive --------------------------------------------------------

    def listen(self) -> np.ndarray:
        """Block until a transmission arrives and ends; return it as mono float32 at SAMPLE_RATE."""
        clip = self._listen_cos() if self.cos else self._listen_level()
        if self.cfg.normalize_db is not None:
            clip = normalize(clip, self.cfg.normalize_db, self.cfg.max_boost_db)
        return clip

    def _listen_level(self) -> np.ndarray:
        block = int(SAMPLE_RATE * 0.05)
        frames: list[np.ndarray] = []
        talking, silent_for, total = False, 0.0, 0.0
        with sd.InputStream(device=self.in_dev, channels=1, samplerate=SAMPLE_RATE, blocksize=block) as stream:
            while True:
                chunk, _ = stream.read(block)
                chunk = chunk[:, 0].copy()
                db = level_db(chunk)
                self.mon.level(db)
                loud = db > self.cfg.squelch_db
                if loud and not talking:
                    talking = True
                if talking:
                    frames.append(chunk)
                    total += 0.05
                    silent_for = 0.0 if loud else silent_for + 0.05
                    if silent_for >= self.cfg.hang_time or total >= self.cfg.max_report:
                        return np.concatenate(frames)

    def _listen_cos(self) -> np.ndarray:
        block = int(SAMPLE_RATE * 0.05)
        before = collections.deque(maxlen=int(self.cfg.pre_roll / 0.05))
        frames: list[np.ndarray] = []
        off_for, total, speech = 0.0, 0.0, 0.0
        gate = RxGate(self.cfg.squelch_db, self.cfg.hang_time)
        self.cos.poll()  # drop reports queued while we were transmitting
        self.mon.phase("Listening for a report")
        with sd.InputStream(device=self.in_dev, channels=1, samplerate=SAMPLE_RATE, blocksize=block) as stream:
            while True:
                chunk, _ = stream.read(block)
                chunk = chunk[:, 0].copy()
                db = level_db(chunk)
                cos = self.cos.poll()
                active = gate.update(cos, db)
                self.mon.level(db)
                self.mon.cos(cos)
                self.mon.rx(active)
                if not frames:
                    if not active:
                        before.append(chunk)
                        continue
                    frames.extend(before)
                frames.append(chunk)
                total += 0.05
                if db > self.cfg.squelch_db:
                    speech += 0.05
                self.mon.phase(f"Recording report ({total:.1f} s)")
                off_for = 0.0 if active else off_for + 0.05
                if off_for >= self.cfg.cos_tail or total >= self.cfg.max_report:
                    if total >= self.cfg.max_report:
                        self.mon.event(f"Report hit the {self.cfg.max_report:.0f} s cap")
                    if speech < self.cfg.min_speech:
                        self.mon.event(f"Ignored {total:.1f} s with {speech:.2f} s of audio (beep, not speech)")
                        frames, off_for, total, speech = [], 0.0, 0.0, 0.0
                        before.clear()
                        self.mon.phase("Listening for a report")
                        continue
                    return np.concatenate(frames)

    def close(self) -> None:
        self.ptt.close()
        if self.cos:
            self.cos.close()


# ---- helpers -----------------------------------------------------------


def normalize(audio: np.ndarray, peak_db: float = -3.0, max_boost_db: float = 20.0) -> np.ndarray:
    """Scale so the peak sits at peak_db, boosting quiet reports by at most max_boost_db."""
    peak = float(np.abs(audio).max()) if audio.size else 0.0
    if peak <= 0:
        return audio
    gain_db = min(peak_db - 20 * np.log10(peak), max_boost_db)
    return (audio * 10 ** (gain_db / 20)).astype(np.float32)


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
