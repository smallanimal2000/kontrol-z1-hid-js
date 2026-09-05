/**
 * Node transport for the Z1 via `node-hid` (an optional peer dependency).
 * Install `node-hid` in your app to use this. On macOS/Linux the Z1 is a
 * class-compliant HID device, so no extra driver is needed.
 */
import {
  VID,
  PID,
  ControlState,
  parseInput,
  encodeLeds,
  type Leds,
} from './protocol.js';

export interface Z1NodeHandlers {
  onInput?: (state: ControlState) => void;
  onError?: (error: unknown) => void;
}

export class Z1Node {
  private constructor(private device: any) {}

  /** Open the first connected Z1. Throws if `node-hid` isn't installed or no Z1 is present. */
  static async open(handlers: Z1NodeHandlers = {}): Promise<Z1Node> {
    let hid: any;
    try {
      hid = await import('node-hid');
    } catch {
      throw new Error(
        "kontrol-z1-hid/node requires the optional 'node-hid' package. Run: npm i node-hid",
      );
    }
    const HID = hid.HID ?? hid.default?.HID;
    const device = new HID(VID, PID);
    const z1 = new Z1Node(device);
    device.on('data', (buf: Buffer) => {
      // node-hid includes the report-ID byte for numbered reports.
      const state = parseInput(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      if (state) handlers.onInput?.(state);
    });
    if (handlers.onError) device.on('error', handlers.onError);
    return z1;
  }

  /** Write the LED state to the device. */
  setLeds(leds: Leds): void {
    this.device.write(Array.from(encodeLeds(leds)));
  }

  close(): void {
    this.device.close();
  }
}
