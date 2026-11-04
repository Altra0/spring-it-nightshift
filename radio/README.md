# Radio bridge

Lets Spring It take reports and answer over a real walkie-talkie.

```
hand radio  ))) PMR446 (((  wired radio ── AIOC cable ── Mac (Spring It)
```

- **Receive:** someone talks on the hand radio. The wired radio's speaker goes into the AIOC sound card, and `RadioBridge.listen()` returns the clip once they stop. The AIOC's hardware COS (speaker bias) tells it exactly when the radio is receiving; without an AIOC it falls back to input level.
- **Transmit:** `RadioBridge.say(text)` keys PTT over the AIOC's serial port (DTR on, RTS off), plays the reply into the radio's mic, then releases.

## Setup

```
pip install -r radio/requirements.txt
python3 -m radio.test_rig
```

Put both radios on the same channel, 1 to 15 (16 is scan). Replies are normalised to a -3 dBFS peak and played at output gain 0.85 (peak about 0.6, no clipping); raise it if the hand radio sounds quiet. If it's distorted, turn it down.

## Without an AIOC

The old chain (HYSHIKRA RF-K → VENTION → AB13X) receives fine, but the cable's mic wire is dead, so it can't transmit. If a working K1 audio cable is used with a sound card that has no PTT:

```
python3 -m radio.test_rig --device AB13X --ptt manual   # a person holds PTT
python3 -m radio.test_rig --device AB13X --ptt vox      # radio VOX on (set via CHIRP); a chime leads each reply
```

With no audio cable at all, hold the wired radio next to the Mac (radio VOX on). The Mac's speaker feeds the radio mic and the Mac's mic hears the radio speaker:

```
python3 -m radio.test_rig --in-device "Built-in Microphone" --out-device "Built-in Output" --ptt vox --gain 0.8
```

Raise `squelch_db` if room noise starts a "report".

## Wiring it into Spring It

```python
from radio.bridge import RadioBridge, write_wav

radio = RadioBridge()
while True:
    clip = radio.listen()               # concierge's report
    write_wav("report.wav", clip)
    reply = spring_it.handle("report.wav")  # transcribe → reason → reply text
    radio.say(reply)
```

## Watching it

```
python3 -m radio.monitor                   # live page at http://localhost:8765, never transmits
python3 -m radio.test_rig --loop 2 --monitor
python3 -m radio.timeline 30               # receive-only, plots level and COS to radio_timeline.png
```

The banner is green while receiving, red while transmitting, and striped when the radio holds COS on over silence.

## Notes

- The ESY082's speaker-bias COS often stays on for seconds, sometimes half a minute, after a transmission ends, and bounces off and on for about 50 ms at release. So `listen()` counts the radio as receiving only while COS is on and there was audio above `squelch_db` within `hang_time`. Clips with less than `min_speech` of audio (key-up beeps) are dropped.
- The hand radio's mic needs close talking, about 5 cm from the mouth. Reports are normalised to a -3 dBFS peak (at most +20 dB) before they're returned.
- `python3 -m radio.aioc_dump` prints the AIOC's config registers (read-only). The ESY082 setup works with the factory PTT1 source (CM108 GPIO3 or serial DTR=1/RTS=0) and COS on IN2.
- The ESY082 programs in CHIRP as Baofeng BF-888 (ident `P3107`), over the PC03 or over the AIOC's own serial port. VOX is off; it isn't needed with the AIOC.
- Spring It shouldn't listen while it's transmitting. `listen()` and `say()` are sequential, so this holds by default.
- VOX on these eSynic radios can't be turned on from the buttons, only with CHIRP.
- The AB13X is a Bluetrum AB13xx chip with no GPIO, so it has no software PTT.
