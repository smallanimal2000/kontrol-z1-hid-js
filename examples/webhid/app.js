// Browser-side Z1 control demo using the `kontrol-z1-hid` TypeScript library
// (WebHID transport). The library owns the protocol and the transport.
import { Z1WebHID, Analog, Button, ledsAll, ledsVu } from 'kontrol-z1-hid';

const CONTROLS = {
  left: [
    ['Gain', Analog.LeftGain], ['Hi', Analog.LeftHi], ['Mid', Analog.LeftMid],
    ['Low', Analog.LeftLow], ['FX', Analog.LeftFx], ['Fader', Analog.LeftFader],
  ],
  right: [
    ['Gain', Analog.RightGain], ['Hi', Analog.RightHi], ['Mid', Analog.RightMid],
    ['Low', Analog.RightLow], ['FX', Analog.RightFx], ['Fader', Analog.RightFader],
  ],
  center: [['Cue Mix', Analog.CueMix], ['Crossfader', Analog.Crossfader]],
};
const BUTTONS = [
  ['MODE', Button.Mode], ['FX-L', Button.FxLeft], ['FX-R', Button.FxRight],
  ['Cue-A', Button.HeadphoneA], ['Cue-B', Button.HeadphoneB],
];

const $ = (id) => document.getElementById(id);
const bars = new Map(); // Analog index -> { fill, val }
const seg = (x) => Math.round((x / 4095) * 7); // 12-bit reading -> 0..7 VU segments
let z1 = null;
let mirror = false;
let lastLed = 0;

const log = (m) => {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = el.scrollHeight;
};

function buildUI() {
  for (const side of ['left', 'right', 'center']) {
    const root = $(side);
    for (const [label, index] of CONTROLS[side]) {
      const row = document.createElement('div');
      row.className = 'ctl';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = label;
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('i');
      bar.appendChild(fill);
      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = '—';
      row.append(name, bar, val);
      root.appendChild(row);
      bars.set(index, { fill, val });
    }
  }
  for (const [label] of BUTTONS) {
    const b = document.createElement('span');
    b.className = 'btn';
    b.id = 'b_' + label;
    b.textContent = label;
    $('buttons').appendChild(b);
  }
}

function render(state) {
  for (const [index, { fill, val }] of bars) {
    const v = state.get(index);
    fill.style.width = (state.normalized(index) * 100).toFixed(1) + '%';
    val.textContent = v;
  }
  for (const [label, mask] of BUTTONS) {
    $('b_' + label).classList.toggle('on', state.button(mask));
  }
  if (mirror && z1) {
    const now = performance.now();
    if (now - lastLed > 40) {
      lastLed = now;
      z1.setLeds(ledsVu(seg(state.get(Analog.LeftGain)), seg(state.get(Analog.RightGain)), 0x30)).catch(() => {});
    }
  }
}

async function connect() {
  try {
    z1 = new Z1WebHID({
      onInput: render,
      onDisconnect: () => {
        z1 = null;
        $('status').textContent = 'Device disconnected.';
      },
    });
    const ok = await z1.requestAndOpen();
    if (!ok) {
      z1 = null;
      $('status').textContent = 'No device selected.';
      return;
    }
    $('status').textContent = `Connected: ${z1.device.productName}. Move controls.`;
    $('panel').hidden = false;
    $('ledsweep').disabled = false;
    $('mirror').disabled = false;
    log(`opened HID device (collections: ${z1.device.collections.length})`);

    // The Z1 only pushes reports on change, so prime the UI with the current
    // control positions instead of leaving every bar at "—".
    const initial = await z1.readState();
    if (initial) render(initial);
    else log('initial state read unavailable — move a control to populate.');
  } catch (e) {
    log('connect failed: ' + e);
    $('status').textContent = 'Connect failed: ' + e;
  }
}

async function ledSweep() {
  if (!z1) return;
  // Sequential by design: each level is a timed animation frame, not parallel work.
  /* eslint-disable no-await-in-loop */
  for (const lvl of [0x10, 0x30, 0x50, 0x7f, 0x50, 0x30, 0x10, 0x00]) {
    await z1.setLeds(ledsAll(lvl));
    await new Promise((r) => setTimeout(r, 110));
  }
  /* eslint-enable no-await-in-loop */
}

function boot() {
  if (!Z1WebHID.isSupported()) {
    $('status').textContent = 'WebHID is not available in this browser/context.';
    return;
  }
  buildUI();
  $('connect').addEventListener('click', connect);
  $('ledsweep').addEventListener('click', () => ledSweep().catch((e) => log('led: ' + e)));
  $('mirror').addEventListener('change', (e) => (mirror = e.target.checked));
  log('kontrol-z1-hid loaded — WebHID mode.');
}

boot();
