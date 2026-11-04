# Radio page (`/radio`)

Runs on the iMac in Chrome or Edge, because it needs the AB13X USB sound card.

## Loop (half duplex)

1. Listen on the input (AB13X by default). Browser echo cancellation, noise
   suppression and auto gain are off so the radio audio arrives untouched.
2. Capture: hold Space or the big button, or **Auto** (starts on voice, stops after
   about 1 s of quiet, keeps 0.35 s from before the voice started).
3. The recording is peak-normalised (the AB13X peaks near -42 dBFS on soft speech),
   resampled to 16 kHz mono WAV, and sent to `POST /api/transcribe`.
4. The text goes to `POST /api/report {text, shiftId, source: "radio"}`.
5. Reply: a short beep, then the reply spoken via `POST /api/speak` (browser voice
   as fallback). Nothing is heard while replying, plus 0.4 s after.

Input gain and the voice threshold only affect the meter and voice detection.
Settings and the feed are kept in the browser (localStorage).

## Transmit setting

| Setting | What happens | When |
|---|---|---|
| Speaker | Reply plays on the chosen output (iMac speakers) | Now (no PTT line on the RF-K cable) |
| Radio via AIOC | Reply plays on the AIOC sound card; PTT keyed through the AIOC serial port with Web Serial, DTR on / RTS off, the same rule as `radio/bridge.py` (PR #1) | When the AIOC arrives |

Swapping is a setting on the page: choose **Radio via AIOC**, press **Connect**, pick
the AIOC port. `src/lib/radio/transmit.ts` holds the `Transmitter` interface if
another keying method is needed.
