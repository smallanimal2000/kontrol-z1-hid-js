/**
 * Traktor Kontrol Z1 HID protocol — pure parse/encode, no I/O.
 *
 * Verified against hardware (serial B981FD23) on 2026-09-05:
 *  - Input report `0x01`: 14 analog channels (16-bit LE, 12-bit range 0..4095)
 *    followed by a button bitmap. With the report-ID byte at offset 0, analog
 *    values span offsets 1..28 and the button byte is at offset 29.
 *  - Output report `0x80`: 21 LED brightness bytes, each 0..0x7F.
 *
 * WebHID delivers reports without the leading report-ID byte (it is exposed
 * separately as `event.reportId`); node-hid includes it. Both are supported:
 * {@link parseInput} takes the full report, {@link parseInputBody} takes the
 * ID-stripped body.
 */

export const VID = 0x17cc;
export const PID = 0x1210;

/** HID interface number on the composite device. */
export const HID_INTERFACE = 3;

export const INPUT_REPORT_ID = 0x01;
export const OUTPUT_REPORT_ID = 0x80;

/** Number of analog controls in the input report. */
export const ANALOG_COUNT = 14;
/** Offset of the button byte within the *full* report (report-ID byte included). */
export const BUTTON_OFFSET = 29;
/** Minimum full-report length: id + 14×2 + 1 button byte. */
export const INPUT_REPORT_LEN = 1 + ANALOG_COUNT * 2 + 1; // 30
/** Maximum raw analog reading (12-bit). */
export const ANALOG_MAX = 0x0fff;

/** Number of LED brightness bytes in the output report. */
export const LED_COUNT = 21;
/** Full output-report length: id + 21 brightness bytes. */
export const OUTPUT_REPORT_LEN = 1 + LED_COUNT; // 22
/** Maximum LED brightness the firmware accepts. */
export const LED_MAX = 0x7f;

/**
 * Calibrated analog-channel indices. The Z1 has one centre Cue-Mix knob and a
 * crossfader (no per-deck cue knobs). `Fx` is the per-channel Filter/FX knob.
 */
export enum Analog {
  LeftGain = 0,
  LeftHi = 1,
  LeftMid = 2,
  LeftLow = 3,
  LeftFx = 4,
  RightGain = 5,
  RightHi = 6,
  RightMid = 7,
  RightLow = 8,
  RightFx = 9,
  CueMix = 10,
  LeftFader = 11,
  RightFader = 12,
  Crossfader = 13,
}

/** Human-readable labels, indexed by {@link Analog}. */
export const ANALOG_LABELS: readonly string[] = [
  'Left Gain', 'Left Hi', 'Left Mid', 'Left Low', 'Left FX',
  'Right Gain', 'Right Hi', 'Right Mid', 'Right Low', 'Right FX',
  'Cue Mix', 'Left Fader', 'Right Fader', 'Crossfader',
];

/** Verified button bit masks within the button byte. */
export const Button = {
  Mode: 0x02,
  FxLeft: 0x04,
  FxRight: 0x08,
  HeadphoneA: 0x10,
  HeadphoneB: 0x01,
} as const;
export type ButtonMask = (typeof Button)[keyof typeof Button];

/** A decoded snapshot of every control. */
export class ControlState {
  constructor(
    /** 14 analog readings, 0..4095, indexed by {@link Analog}. */
    readonly analog: Uint16Array,
    /** Raw button bitmap (byte 29 of the report). */
    readonly buttons: number,
  ) {}

  /** One analog channel, 0..4095. */
  get(control: Analog): number {
    return this.analog[control] ?? 0;
  }

  /** One analog channel normalised to 0..1. */
  normalized(control: Analog): number {
    return this.get(control) / ANALOG_MAX;
  }

  /** Test a button by mask (see {@link Button}). */
  button(mask: number): boolean {
    return (this.buttons & mask) !== 0;
  }
}

function readAnalog(bytes: Uint8Array, analogStart: number): Uint16Array {
  const analog = new Uint16Array(ANALOG_COUNT);
  for (let i = 0; i < ANALOG_COUNT; i++) {
    const o = analogStart + i * 2;
    analog[i] = ((bytes[o] ?? 0) | ((bytes[o + 1] ?? 0) << 8)) & ANALOG_MAX;
  }
  return analog;
}

/**
 * Parse a full HID input report (report-ID byte at index 0), as delivered by
 * node-hid. Returns `null` if the buffer is too short or not the `0x01` report.
 */
export function parseInput(report: Uint8Array): ControlState | null {
  if (report.length < INPUT_REPORT_LEN) return null;
  if (report[0] !== INPUT_REPORT_ID) return null;
  return new ControlState(readAnalog(report, 1), report[BUTTON_OFFSET] ?? 0);
}

/**
 * Parse an ID-stripped input-report body as delivered by WebHID, where the
 * report ID is passed separately. Offsets are shifted by one vs the full report.
 */
export function parseInputBody(reportId: number, body: Uint8Array): ControlState | null {
  if (reportId !== INPUT_REPORT_ID) return null;
  if (body.length < INPUT_REPORT_LEN - 1) return null;
  return new ControlState(readAnalog(body, 0), body[BUTTON_OFFSET - 1] ?? 0);
}

/**
 * Full LED state, in output-report order. Brightness values are clamped to
 * {@link LED_MAX} at encode time.
 */
export interface Leds {
  /** Left VU meter: 5 blue segments then 2 orange (bottom → top). */
  vuLeft: number[]; // length 7
  /** Right VU meter: 5 blue segments then 2 orange. */
  vuRight: number[]; // length 7
  headphoneA: number;
  headphoneB: number;
  /** Left FX button: [red, blue]. */
  fxLeft: [number, number];
  /** Mode button (white). */
  mode: number;
  /** Right FX button: [red, blue]. */
  fxRight: [number, number];
}

/** All-LEDs-off state. */
export function emptyLeds(): Leds {
  return {
    vuLeft: [0, 0, 0, 0, 0, 0, 0],
    vuRight: [0, 0, 0, 0, 0, 0, 0],
    headphoneA: 0,
    headphoneB: 0,
    fxLeft: [0, 0],
    mode: 0,
    fxRight: [0, 0],
  };
}

/** Every LED at a uniform brightness (clamped to {@link LED_MAX}). */
export function ledsAll(level: number): Leds {
  const l = clamp(level);
  return {
    vuLeft: [l, l, l, l, l, l, l],
    vuRight: [l, l, l, l, l, l, l],
    headphoneA: l,
    headphoneB: l,
    fxLeft: [l, l],
    mode: l,
    fxRight: [l, l],
  };
}

/** VU meters lit to N segments (0..7) each, at `level`; buttons dark. */
export function ledsVu(leftSegments: number, rightSegments: number, level: number): Leds {
  const leds = emptyLeds();
  const l = clamp(level);
  for (let i = 0; i < 7; i++) {
    if (i < leftSegments) leds.vuLeft[i] = l;
    if (i < rightSegments) leds.vuRight[i] = l;
  }
  return leds;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > LED_MAX ? LED_MAX : v | 0;
}

/** Encode the 21 LED brightness bytes (no report-ID byte) — for WebHID sendReport. */
export function encodeLedsBody(leds: Leds): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(LED_COUNT);
  let i = 0;
  const put = (v: number) => {
    out[i++] = clamp(v);
  };
  for (const v of leds.vuLeft) put(v);
  for (const v of leds.vuRight) put(v);
  put(leds.headphoneA);
  put(leds.headphoneB);
  put(leds.fxLeft[0]);
  put(leds.fxLeft[1]);
  put(leds.mode);
  put(leds.fxRight[0]);
  put(leds.fxRight[1]);
  return out;
}

/** Encode a full output report (report-ID byte `0x80` + 21 bytes) — for node-hid write. */
export function encodeLeds(leds: Leds): Uint8Array<ArrayBuffer> {
  const body = encodeLedsBody(leds);
  const out = new Uint8Array(OUTPUT_REPORT_LEN);
  out[0] = OUTPUT_REPORT_ID;
  out.set(body, 1);
  return out;
}
