# Radio page (`/radio`)

Runs on the iMac in Chrome or Edge, with the AIOC cable plugged in (the old AB13X card
still works for listening only).

## Loop (half duplex)

1. Listen on the input (the AIOC by default, else the AB13X). Browser echo cancellation, noise
   suppression and auto gain are off so the radio audio arrives untouched.
2. Capture: hold Space or the big button, or **Auto** (starts on voice, stops after
   1.2 s of quiet, keeps 0.5 s from before the voice started). Captures with less
   than 0.5 s of voice are dropped, which filters out the radios' key-up beeps.
3. The recording is peak-normalised (the AB13X peaks near -42 dBFS on soft speech),
   resampled to 16 kHz mono WAV, and sent to `POST /api/transcribe`.
4. The text goes to `POST /api/report {text, shiftId, source: "radio"}`.
5. Reply: a short beep, then the reply spoken via `POST /api/speak` (browser voice
   as fallback). Over the AIOC the reply is levelled to a -3 dBFS peak and played at
   0.85, the level tuned by ear on 4 Nov. Nothing is heard while replying, plus 0.4 s after.

Input gain and the voice threshold only affect the meter and voice detection.
Settings and the feed are kept in the browser (localStorage).

## Transmit setting

| Setting | What happens | When |
|---|---|---|
| Speaker | Reply plays on the chosen output (iMac speakers) | Testing without a radio |
| Radio via AIOC | Reply plays on the AIOC sound card; PTT keyed through the AIOC serial port with Web Serial, DTR on / RTS off, 0.3 s before and after the audio, the same as `radio/bridge.py` | Normal use |

Swapping is a setting on the page: choose **Radio via AIOC**, press **Connect**, pick
the AIOC port. `src/lib/radio/transmit.ts` holds the `Transmitter` interface if
another keying method is needed.

## With the AIOC

The first time the page sees the AIOC it listens on it and switches to **Radio PTT**,
**Radio via AIOC**, input gain +0 dB and a voice threshold of -50 dB. The AIOC's idle hiss sits near
-58 dB and close-talked speech well above -50. After that, your own changes stick.
Press **Connect** once and grant both prompts: the AIOC's HID interface (COS, to hear the
hand radio key up) and its serial port (PTT, to transmit). Later starts reconnect both
without asking.

Capture modes:

| Mode | Starts | Ends |
|---|---|---|
| Radio PTT | The wired radio is receiving (AIOC COS) and voice is above the threshold | The hand radio lets go of PTT (COS off for 0.3 s), or 1.2 s without voice |
| Voice level | Voice above the threshold | 1.2 s without voice |
| Desk mic | Holding Space or the big button | Letting go |

In Radio PTT mode COS is never used alone, because the ESY082 holds it on for seconds after
a call. If COS isn't connected, it falls back to voice level. In Radio via AIOC mode a reply
is never played on the Mac's speakers: if the AIOC sound card, PTT or the spoken audio is
missing, the page shows an error.

- Only one program can hold the AIOC's serial port, so don't run `radio/bridge.py` or
  the monitor while this page is open. If the page says the port is busy, close any
  other tab with the page open, hard-reload, or replug the AIOC.
- The hand radio's mic needs close talking, about 5 cm from the mouth.
