/**
 * Reads a QR code from one camera frame, in the browser. jsQR is tried first because it is fast; ZXing is the fallback
 * for codes that are blurred, angled or shown on another screen, which jsQR often misses. The decoded text is only a
 * candidate: the server verifies it before anything is shown.
 */

import jsQR from "jsqr";
import {
  BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource,
} from "@zxing/library";

const zxing = new MultiFormatReader();
zxing.setHints(new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]],
  [DecodeHintType.TRY_HARDER, true],
]));

/** Packs RGBA camera pixels into the ARGB integers ZXing reads. */
function toArgb(data: Uint8ClampedArray, pixelCount: number): Int32Array {
  const out = new Int32Array(pixelCount);
  for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
    out[i] = (0xff << 24) | (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
  }
  return out;
}

/** The text of the first QR code in the frame, or null. */
export function decodeQr(data: Uint8ClampedArray, width: number, height: number): string | null {
  const fast = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  if (fast?.data) return fast.data;

  try {
    const source = new RGBLuminanceSource(toArgb(data, width * height), width, height);
    const result = zxing.decode(new BinaryBitmap(new HybridBinarizer(source)));
    return result.getText() || null;
  } catch {
    // Nothing readable in this frame. ZXing reports "not found" by throwing; that is the normal case between codes.
    zxing.reset();
    return null;
  }
}
