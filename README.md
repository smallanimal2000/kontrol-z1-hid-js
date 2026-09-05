# kontrol-z1-hid

TypeScript driver for the **Traktor Kontrol Z1** control surface over HID —
decode the knobs, faders, crossfader and buttons, and drive the LEDs. Works in
the **browser** (WebHID) and in **Node** (node-hid), sharing one pure-TS
protocol core. The byte layout, the 14-channel analog map, and the button masks
are all verified against real hardware.

> Scope: the Z1's *control surface* (HID interface 3). The Z1's 4-channel USB
> audio is a separate UAC2 interface and is out of scope for this package.

## Install

```bash
npm i kontrol-z1-hid
# for the Node transport also:
npm i node-hid
```

## Browser (WebHID)

```ts
import { Z1WebHID, Analog, Button, ledsVu } from 'kontrol-z1-hid';

const z1 = new Z1WebHID({
  onInput(state) {
    const gain = state.get(Analog.LeftGain);          // 0..4095
    const xf = state.normalized(Analog.Crossfader);    // 0..1
    const cue = state.button(Button.HeadphoneA);       // boolean
    // …update your UI…

    // mirror the gains onto the VU meters:
    const seg = (x: number) => Math.round((x / 4095) * 7);
    z1.setLeds(ledsVu(seg(state.get(Analog.LeftGain)), seg(state.get(Analog.RightGain)), 0x30));
  },
  onDisconnect() { console.log('Z1 unplugged'); },
});

// must be called from a user gesture (e.g. a click handler):
document.querySelector('#connect')!.addEventListener('click', () => z1.requestAndOpen());
```

WebHID is **not** gated behind Isolated Web Apps, so this runs in ordinary
(including managed) Chrome.

## Node (node-hid)

```ts
import { Z1Node } from 'kontrol-z1-hid/node';
import { Analog, ledsAll } from 'kontrol-z1-hid';

const z1 = await Z1Node.open({
  onInput(state) {
    console.log('crossfader', state.get(Analog.Crossfader));
  },
});
z1.setLeds(ledsAll(0x10));
// …later: z1.close();
```

## Protocol-only (no transport)

```ts
import { parseInput, encodeLeds, Analog, ledsAll } from 'kontrol-z1-hid/protocol';

const state = parseInput(rawReport);            // full report incl. report-ID byte
const bytes = encodeLeds(ledsAll(0x7f));        // [0x80, …21 brightness bytes]
```

`parseInput(report)` expects the full report (report-ID byte at index 0, as
node-hid delivers). WebHID strips that byte and passes the ID separately — use
`parseInputBody(reportId, body)` (the `Z1WebHID` transport does this for you).

## Control map (verified)

| `Analog` | idx | | `Analog` | idx |
|----------|-----|-|----------|-----|
| LeftGain | 0 | | RightMid | 7 |
| LeftHi | 1 | | RightLow | 8 |
| LeftMid | 2 | | RightFx | 9 |
| LeftLow | 3 | | CueMix | 10 |
| LeftFx | 4 | | LeftFader | 11 |
| RightGain | 5 | | RightFader | 12 |
| RightHi | 6 | | Crossfader | 13 |

Buttons (`Button`): `Mode 0x02`, `FxLeft 0x04`, `FxRight 0x08`,
`HeadphoneA 0x10`, `HeadphoneB 0x01`.

## Develop

```bash
npm install
npm run build     # tsc → dist/
npm test          # vitest
```

## License

MIT
