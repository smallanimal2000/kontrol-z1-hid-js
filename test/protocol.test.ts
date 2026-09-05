import { describe, it, expect } from 'vitest';
import {
  Analog,
  Button,
  parseInput,
  parseInputBody,
  encodeLeds,
  encodeLedsBody,
  ledsAll,
  ledsVu,
  emptyLeds,
  OUTPUT_REPORT_ID,
  LED_MAX,
  LED_COUNT,
} from '../src/protocol.js';

const hex = (s: string): Uint8Array =>
  Uint8Array.from(s.trim().split(/\s+/).map((b) => parseInt(b, 16)));

// A real capture from the device (serial B981FD23): all controls at rest with
// one knob mid-travel. 30 bytes, report ID 0x01, button byte 0x00.
const REST = hex(
  '01 00 00 b2 09 29 04 4c 00 f0 03 f5 04 d6 0b cb 0e fb 0f a2 09 b5 07 de 08 ed 07 9a 08 00',
);

describe('parseInput', () => {
  it('decodes the calibrated channels from a real report', () => {
    const s = parseInput(REST)!;
    expect(s).not.toBeNull();
    expect(s.get(Analog.LeftGain)).toBe(0); // bytes 1-2
    expect(s.get(Analog.LeftFx)).toBe(0x03f0); // bytes 9-10 = 1008
    expect(s.get(Analog.Crossfader)).toBe(0x089a); // bytes 27-28 = 2202
    expect(s.get(Analog.RightLow)).toBe(0x0ffb); // bytes 17-18 = 4091
    expect(s.buttons).toBe(0);
  });

  it('masks readings to 12 bits and normalizes', () => {
    const buf = new Uint8Array(REST);
    buf[1] = 0x34;
    buf[2] = 0xf2; // 0xf234 & 0x0fff == 0x0234
    const s = parseInput(buf)!;
    expect(s.get(Analog.LeftGain)).toBe(0x0234);
    expect(s.normalized(Analog.RightLow)).toBeCloseTo(4091 / 4095, 5);
  });

  it('reads button bits', () => {
    const buf = new Uint8Array(REST);
    buf[29] = Button.Mode | Button.FxRight;
    const s = parseInput(buf)!;
    expect(s.button(Button.Mode)).toBe(true);
    expect(s.button(Button.FxRight)).toBe(true);
    expect(s.button(Button.HeadphoneA)).toBe(false);
  });

  it('rejects short buffers and the wrong report id', () => {
    expect(parseInput(new Uint8Array(10))).toBeNull();
    const wrong = new Uint8Array(REST);
    wrong[0] = 0x80;
    expect(parseInput(wrong)).toBeNull();
  });
});

describe('parseInputBody (WebHID, id stripped)', () => {
  it('matches parseInput on the same data', () => {
    const full = parseInput(REST)!;
    const body = parseInputBody(0x01, REST.slice(1))!;
    expect(Array.from(body.analog)).toEqual(Array.from(full.analog));
    expect(body.buttons).toBe(full.buttons);
  });

  it('ignores non-control report ids', () => {
    expect(parseInputBody(0x80, REST.slice(1))).toBeNull();
  });
});

describe('LED encoding', () => {
  it('encodeLeds prepends the 0x80 report id and clamps', () => {
    const leds = emptyLeds();
    leds.mode = 0xff; // must clamp
    leds.vuLeft[0] = 0x0a;
    const out = encodeLeds(leds);
    expect(out.length).toBe(1 + LED_COUNT);
    expect(out[0]).toBe(OUTPUT_REPORT_ID);
    expect(out[1]).toBe(0x0a); // vuLeft[0]
    // mode sits at body index 7+7+1+1+1+1 = 18 -> out[19]
    expect(out[19]).toBe(LED_MAX);
  });

  it('encodeLedsBody omits the report id (for WebHID sendReport)', () => {
    const body = encodeLedsBody(ledsAll(0xff));
    expect(body.length).toBe(LED_COUNT);
    expect([...body].every((b) => b === LED_MAX)).toBe(true);
  });

  it('ledsVu lights the requested segments only', () => {
    const body = encodeLedsBody(ledsVu(3, 0, 0x10));
    expect(Array.from(body.slice(0, 7))).toEqual([0x10, 0x10, 0x10, 0, 0, 0, 0]);
    expect(Array.from(body.slice(7, 14))).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
