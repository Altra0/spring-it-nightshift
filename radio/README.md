# Radio bridge

Lets Spring It take reports and answer over a real walkie-talkie.

```
hand radio  ))) PMR446 (((  wired radio ── AIOC cable ── Mac (Spring It)
```

- **Receive:** someone talks on the hand radio. The wired radio's speaker goes into the AIOC sound card, and `RadioBridge.listen()` returns the clip once they stop.
- **Transmit:** `RadioBridge.say(text)` keys PTT over the AIOC's serial port (DTR on, RTS off), plays the reply into the radio's mic, then releases.

## Setup

```
pip install -r radio/requirements.txt
python3 -m radio.test_rig
```

Put both radios on the same channel, 1 to 15 (16 is scan). Start the output gain at 0.3 and raise it if the hand radio sounds quiet. If it's distorted, turn it down.

## Without an AIOC

The old chain (HYSHIKRA RF-K → VENTION → AB13X) receives fine, but the cable's mic wire is dead, so it can't transmit. If a working K1 audio cable is used with a sound card that has no PTT:

```
python3 -m radio.test_rig --device AB13X --ptt manual   # a person holds PTT
python3 -m radio.test_rig --device AB13X --ptt vox      # radio VOX on (set via CHIRP); a chime leads each reply
```

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

## Notes

- Spring It shouldn't listen while it's transmitting. `listen()` and `say()` are sequential, so this holds by default.
- VOX on these eSynic radios can't be turned on from the buttons. The AIOC can program it with CHIRP: pick model Baofeng BF-888 (unconfirmed for this exact radio).
- The AB13X is a Bluetrum AB13xx chip with no GPIO, so it has no software PTT.
