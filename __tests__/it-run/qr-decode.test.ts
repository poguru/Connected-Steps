/**
 * The camera decoder reads a QR code from raw RGBA pixels, and reports nothing for a frame without one.
 */

import QRCode from "qrcode";
import { decodeQr } from "@/lib/qr-decode";

/** Raw RGBA pixels of a QR code, scaled so each module is several pixels, with a white quiet zone. */
function qrFrame(text: string, scale = 8, margin = 4) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const side = (n + margin * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.modules.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = ((y + margin) * scale + dy) * side + (x + margin) * scale + dx;
          data[px * 4] = 0; data[px * 4 + 1] = 0; data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { data, width: side, height: side };
}

describe("decodeQr", () => {
  it("reads a participant QR token from a frame", () => {
    const token = "SVRSLTAwMQ.ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12";
    const { data, width, height } = qrFrame(token);
    expect(decodeQr(data, width, height)).toBe(token);
  });

  it("reports nothing for a frame with no code", () => {
    const width = 320, height = 240;
    const data = new Uint8ClampedArray(width * height * 4).fill(200);
    expect(decodeQr(data, width, height)).toBeNull();
  });
});
