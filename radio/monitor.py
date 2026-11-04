"""Live web monitor for the radio bridge: RX level, COS, PTT, phase and an event log.

    python -m radio.monitor            # monitor only, never transmits; open http://localhost:8765

RadioBridge(monitor=Monitor()) reports into the same page while the bridge runs.
Stdlib only: http.server in a thread, Server-Sent Events at ~20 Hz.
"""

from __future__ import annotations

import collections
import json
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SQUELCH_DB = -50.0  # keep in step with RadioConfig.squelch_db


class Monitor:
    def __init__(self, port: int = 8765, log_to_stdout: bool = True):
        self.port = port
        self.log_to_stdout = log_to_stdout
        self._lock = threading.Lock()
        self._start = time.time()
        self._state = {"level": -90.0, "cos": False, "rx": False, "ptt": False, "phase": "Idle"}
        self._events: collections.deque = collections.deque(maxlen=200)
        self._seq = 0
        monitor = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):  # keep the console for events
                pass

            def do_GET(self):
                if self.path == "/events":
                    monitor._stream(self)
                else:
                    body = PAGE.replace("__SQUELCH__", str(SQUELCH_DB)).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)

        self._server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        self._server.daemon_threads = True
        threading.Thread(target=self._server.serve_forever, daemon=True).start()

    @property
    def url(self) -> str:
        return f"http://localhost:{self.port}"

    def open(self) -> None:
        subprocess.run(["open", self.url], check=False)

    # ---- updates from the bridge -----------------------------------------

    def level(self, db: float) -> None:
        with self._lock:
            self._state["level"] = max(db, -90.0)

    def cos(self, on: bool) -> None:
        with self._lock:
            changed = on != self._state["cos"]
            self._state["cos"] = on
            level = self._state["level"]
        if changed:
            self.event(f"COS {'ON' if on else 'OFF'} (level {level:.0f} dBFS)")

    def rx(self, on: bool) -> None:
        """Effective receive: COS on and real audio (see bridge.RxGate)."""
        with self._lock:
            changed = on != self._state["rx"]
            self._state["rx"] = on
            level = self._state["level"]
        if changed:
            self.event(f"RX {'ON' if on else 'OFF'} (effective, level {level:.0f} dBFS)")

    def ptt(self, on: bool) -> None:
        with self._lock:
            changed = on != self._state["ptt"]
            self._state["ptt"] = on
        if changed:
            self.event(f"PTT {'ON' if on else 'OFF'}")

    def phase(self, text: str) -> None:
        with self._lock:
            self._state["phase"] = text

    def event(self, text: str) -> None:
        t = time.time() - self._start
        with self._lock:
            self._seq += 1
            self._events.append({"seq": self._seq, "t": round(t, 2), "text": text})
        if self.log_to_stdout:
            print(f"[{t:7.2f}s] {text}", flush=True)

    # ---- serving ---------------------------------------------------------

    def _snapshot(self, after_seq: int) -> dict:
        with self._lock:
            return {
                **self._state,
                "t": round(time.time() - self._start, 3),
                "events": [e for e in self._events if e["seq"] > after_seq],
            }

    def _stream(self, handler: BaseHTTPRequestHandler) -> None:
        handler.send_response(200)
        handler.send_header("Content-Type", "text/event-stream")
        handler.send_header("Cache-Control", "no-cache")
        handler.end_headers()
        last_seq = 0
        try:
            while True:
                snap = self._snapshot(last_seq)
                if snap["events"]:
                    last_seq = snap["events"][-1]["seq"]
                handler.wfile.write(f"data: {json.dumps(snap)}\n\n".encode())
                handler.wfile.flush()
                time.sleep(0.05)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def close(self) -> None:
        self._server.shutdown()


class NullMonitor:
    """Stands in when no monitor is attached."""

    def level(self, db: float) -> None: ...
    def cos(self, on: bool) -> None: ...
    def rx(self, on: bool) -> None: ...
    def ptt(self, on: bool) -> None: ...
    def phase(self, text: str) -> None: ...
    def event(self, text: str) -> None: ...


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Radio Monitor</title>
<style>
  :root { --bg:#0f1115; --panel:#181b22; --text:#e6e8ee; --muted:#8a90a0; --line:#2a2f3a;
          --rx:#2fbf71; --tx:#e5484d; --idle:#4a5060; --level:#4aa3ff; --target:#f5c451; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.4 -apple-system, system-ui, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 16px; display: grid; gap: 14px; }
  .banner { border-radius: 10px; padding: 22px; text-align: center; font-size: 38px; font-weight: 700;
            letter-spacing: .08em; background: var(--idle); transition: background .1s; }
  .banner.rx { background: var(--rx); } .banner.tx { background: var(--tx); }
  .banner.cosonly { background: repeating-linear-gradient(45deg, #2a4a36 0 14px, #1d2a22 14px 28px); color: #9fd8b4; }
  .phase { text-align:center; color: var(--muted); font-size: 18px; margin-top: -6px; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
  .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px;
           display:flex; justify-content: space-between; }
  .meter { position: relative; height: 34px; background: #0b0d11; border-radius: 6px; overflow: hidden; }
  .meter .fill { position:absolute; left:0; top:0; bottom:0; background: var(--level); width:0; transition: width .05s linear; }
  .meter .zone { position:absolute; top:0; bottom:0; background: color-mix(in srgb, var(--target) 30%, transparent);
                 border-left: 1px solid var(--target); border-right: 1px solid var(--target); }
  .meter .sq { position:absolute; top:0; bottom:0; width:0; border-left: 2px dashed #bbb; }
  .ticks { display:flex; justify-content: space-between; color: var(--muted); font-size: 11px; margin-top: 4px; }
  canvas { width: 100%; height: 220px; display:block; }
  ol { list-style: none; margin: 0; padding: 0; font: 13px/1.6 ui-monospace, Menlo, monospace; }
  ol li .t { color: var(--muted); margin-right: 10px; }
  .legend span { margin-left: 12px; } .legend i { display:inline-block; width:10px; height:10px; margin-right:4px; border-radius:2px; }
</style></head>
<body><main>
  <div id="banner" class="banner">IDLE</div>
  <div id="phase" class="phase">connecting…</div>
  <div class="panel">
    <div class="label"><span>RX level</span><span id="db">– dBFS</span></div>
    <div class="meter"><div id="fill" class="fill"></div><div id="zone" class="zone"></div><div id="sq" class="sq"></div></div>
    <div class="ticks"><span>-80</span><span>-60</span><span>-40</span><span>-20</span><span>0 dBFS</span></div>
  </div>
  <div class="panel">
    <div class="label"><span>Last 60 s</span>
      <span class="legend"><span><i style="background:var(--rx)"></i>receiving</span><span><i style="background:repeating-linear-gradient(45deg,#2fbf71 0 2px,transparent 2px 4px)"></i>raw COS only</span><span><i style="background:var(--tx)"></i>PTT</span>
      <span><i style="background:var(--level)"></i>level</span><span><i style="background:#bbb"></i>squelch</span></span></div>
    <canvas id="tl"></canvas>
  </div>
  <div class="panel"><div class="label"><span>Events</span></div><ol id="log"></ol></div>
</main>
<script>
const SQ = __SQUELCH__, MIN = -80, WINDOW = 60;
const pct = db => Math.max(0, Math.min(100, (db - MIN) / -MIN * 100));
const $ = id => document.getElementById(id);
$("zone").style.left = pct(-10) + "%"; $("zone").style.width = (pct(-6) - pct(-10)) + "%";
$("sq").style.left = pct(SQ) + "%";
const css = getComputedStyle(document.documentElement), col = n => css.getPropertyValue(n).trim();
const samples = [], events = [];
const es = new EventSource("/events");
es.onmessage = m => {
  const s = JSON.parse(m.data);
  samples.push(s); while (samples.length && samples[0].t < s.t - WINDOW) samples.shift();
  const b = $("banner");
  b.className = "banner" + (s.ptt ? " tx" : s.rx ? " rx" : s.cos ? " cosonly" : "");
  b.textContent = s.ptt ? "TRANSMITTING" : s.rx ? "RECEIVING" : s.cos ? "IDLE · RADIO HOLDING COS" : "IDLE";
  $("phase").textContent = s.phase;
  $("db").textContent = s.level.toFixed(0) + " dBFS";
  $("fill").style.width = pct(s.level) + "%";
  for (const e of s.events) events.unshift(e);
  events.length = Math.min(events.length, 15);
  $("log").innerHTML = events.map(e => `<li><span class="t">${e.t.toFixed(2)}s</span>${e.text.replace(/</g,"&lt;")}</li>`).join("");
  draw(s.t);
};
es.onerror = () => { $("phase").textContent = "disconnected (bridge stopped?)"; };
let hatchPattern;
function hatch(g) {
  if (!hatchPattern) {
    const p = document.createElement("canvas"); p.width = p.height = 8;
    const q = p.getContext("2d"); q.strokeStyle = col("--rx") + "90"; q.lineWidth = 1.5;
    q.beginPath(); q.moveTo(0, 8); q.lineTo(8, 0); q.stroke();
    hatchPattern = g.createPattern(p, "repeat");
  }
  return hatchPattern;
}
function draw(now) {
  const c = $("tl"), dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
  const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const x = t => w - (now - t) / WINDOW * w, y = db => h - pct(db) / 100 * h;
  g.fillStyle = col("--line"); for (let d = -60; d < 0; d += 20) g.fillRect(0, y(d), w, 1);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], x0 = x(a.t), x1 = x(b.t) + 0.5;
    if (b.rx) { g.fillStyle = col("--rx") + "55"; g.fillRect(x0, 0, x1 - x0, h); }
    else if (b.cos) { g.fillStyle = hatch(g); g.fillRect(x0, 0, x1 - x0, h); }
    if (b.ptt) { g.fillStyle = col("--tx") + "55"; g.fillRect(x0, 0, x1 - x0, h); }
  }
  g.strokeStyle = "#bbb"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(0, y(SQ)); g.lineTo(w, y(SQ)); g.stroke(); g.setLineDash([]);
  g.fillStyle = col("--target") + "30"; g.fillRect(0, y(-6), w, y(-10) - y(-6));
  g.strokeStyle = col("--level"); g.lineWidth = 1.5; g.beginPath();
  samples.forEach((s, i) => i ? g.lineTo(x(s.t), y(s.level)) : g.moveTo(x(s.t), y(s.level))); g.stroke();
}
</script></body></html>
"""


def main() -> None:
    """Monitor only: show live RX level and COS from the AIOC. Never keys the radio."""
    import sounddevice as sd

    from radio.bridge import SAMPLE_RATE, Cos, RadioConfig, RxGate, find_audio_device, level_db

    mon = Monitor()
    dev = find_audio_device("AIOC", "input")
    cos = Cos(on_report=lambda r: mon.event(f"HID report {bytes(r[:4]).hex(' ')}"))
    cfg = RadioConfig()
    gate = RxGate(cfg.squelch_db, cfg.hang_time)
    log = open("radio_monitor_log.csv", "w")
    log.write("t,level_db,cos,rx\n")
    mon.phase("Monitor only, never transmits. Press PTT on the hand radio and talk.")
    mon.event(f"Monitor started: input #{dev}, {mon.url}")
    mon.open()
    block = int(SAMPLE_RATE * 0.05)
    try:
        cos.poll()
        with sd.InputStream(device=dev, channels=1, samplerate=SAMPLE_RATE, blocksize=block) as stream:
            start = time.time()
            while True:
                chunk, _ = stream.read(block)
                db = level_db(chunk[:, 0])
                raw = cos.poll()
                rx = gate.update(raw, db)
                mon.level(db)
                mon.cos(raw)
                mon.rx(rx)
                log.write(f"{time.time() - start:.2f},{db:.1f},{int(raw)},{int(rx)}\n")
                log.flush()
    except KeyboardInterrupt:
        pass
    finally:
        log.close()
        cos.close()
        mon.close()


if __name__ == "__main__":
    main()
