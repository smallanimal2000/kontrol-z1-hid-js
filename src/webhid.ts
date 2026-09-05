/**
 * WebHID transport for the Z1 (browser). Not gated behind Isolated Web Apps, so
 * it works in ordinary Chrome. Emits {@link ControlState} snapshots and drives
 * the LEDs.
 */
import {
  VID,
  PID,
  INPUT_REPORT_ID,
  OUTPUT_REPORT_ID,
  ControlState,
  parseInput,
  parseInputBody,
  encodeLedsBody,
  type Leds,
} from './protocol.js';

export interface Z1Handlers {
  /** Called on every control report (a knob moved or a button changed). */
  onInput?: (state: ControlState) => void;
  /** Called when this device is unplugged. */
  onDisconnect?: () => void;
}

export class Z1WebHID {
  device: HIDDevice | null = null;

  constructor(private handlers: Z1Handlers = {}) {}

  /** Whether WebHID is available in this context. */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'hid' in navigator;
  }

  /** Return an already-granted Z1, if the user paired one before. */
  static async getGranted(): Promise<HIDDevice | null> {
    if (!Z1WebHID.isSupported()) return null;
    const devices = await navigator.hid.getDevices();
    return devices.find((d) => d.vendorId === VID && d.productId === PID) ?? null;
  }

  /** Prompt the user to pick the Z1, then open it. Resolves false if cancelled. */
  async requestAndOpen(): Promise<boolean> {
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: VID, productId: PID }],
    });
    const device = devices[0];
    if (!device) return false;
    await this.open(device);
    return true;
  }

  /** Open a specific HIDDevice (e.g. from {@link getGranted}). */
  async open(device: HIDDevice): Promise<void> {
    this.device = device;
    if (!device.opened) await device.open();
    device.addEventListener('inputreport', this.handleInput);
    navigator.hid.addEventListener('disconnect', this.handleDisconnect);
  }

  /**
   * Read the current control state on demand via a HID feature-report get,
   * without waiting for the user to move a control. The Z1 only pushes an
   * `inputreport` when something changes, so this is how the UI gets a baseline
   * right after connecting.
   *
   * Resolves `null` if the device is closed, if the get is rejected (not all
   * firmware answers a feature get for the input report), or if the reply does
   * not parse. Callers should treat it as best-effort and keep relying on
   * {@link Z1Handlers.onInput} for live updates.
   */
  async readState(): Promise<ControlState | null> {
    if (!this.device) return null;
    try {
      const view = await this.device.receiveFeatureReport(INPUT_REPORT_ID);
      return parseInput(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    } catch {
      return null;
    }
  }

  private handleInput = (event: HIDInputReportEvent): void => {
    const body = new Uint8Array(event.data.buffer);
    const state = parseInputBody(event.reportId, body);
    if (state) this.handlers.onInput?.(state);
  };

  private handleDisconnect = (event: HIDConnectionEvent): void => {
    if (event.device === this.device) {
      this.device = null;
      this.handlers.onDisconnect?.();
    }
  };

  /** Write the LED state to the device. */
  async setLeds(leds: Leds): Promise<void> {
    if (!this.device) return;
    await this.device.sendReport(OUTPUT_REPORT_ID, encodeLedsBody(leds));
  }

  /** Stop listening and close the device. */
  async close(): Promise<void> {
    if (!this.device) return;
    this.device.removeEventListener('inputreport', this.handleInput);
    navigator.hid.removeEventListener('disconnect', this.handleDisconnect);
    await this.device.close();
    this.device = null;
  }
}
