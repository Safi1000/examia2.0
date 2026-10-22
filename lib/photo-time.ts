/**
 * When was this page photographed?
 *
 * Camera photos carry the moment they were taken (EXIF "DateTimeOriginal").
 * We read it on the student's phone before the photo is shrunk (shrinking
 * drops it), and keep it on the uploaded link as a `#taken=` tag. Browsers and
 * Cloudinary ignore everything after `#`, so the image loads exactly as
 * before; the marking page reads the tag to show when each page was taken.
 *
 * Gentle by design: nothing here blocks a student. Screenshots, WhatsApp
 * forwards and some apps strip the time; those simply show as "time unknown".
 */

const TAG = "#taken=";

/** ISO time the photo was taken, or null when the file doesn't say. */
export async function readPhotoTakenAt(file: File): Promise<string | null> {
  if (file.type !== "image/jpeg" && !/\.jpe?g$/i.test(file.name)) return null;
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const raw = exifDateTime(new DataView(buf));
    if (!raw) return null;
    const m = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    // EXIF time is the phone's local time, which is this browser's time zone.
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

/** Attach the taken time to an uploaded link (no-op when unknown). */
export function withTakenTime(url: string, iso: string | null): string {
  return iso ? `${url.split("#")[0]}${TAG}${encodeURIComponent(iso)}` : url;
}

/** The taken time stored on a link, if any. */
export function takenTimeOf(url: string): Date | null {
  const i = url.indexOf(TAG);
  if (i < 0) return null;
  const d = new Date(decodeURIComponent(url.slice(i + TAG.length)));
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---- Minimal EXIF reader: DateTimeOriginal (0x9003), else DateTime (0x0132).
function exifDateTime(v: DataView): string | null {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    const size = v.getUint16(off + 2);
    if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) {
      return readTiff(v, off + 10);
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null; // no more headers
    off += 2 + size;
  }
  return null;
}

function readTiff(v: DataView, base: number): string | null {
  const little = v.getUint16(base) === 0x4949;
  const u16 = (o: number) => v.getUint16(base + o, little);
  const u32 = (o: number) => v.getUint32(base + o, little);
  const ascii = (o: number, n: number) => {
    let s = "";
    for (let i = 0; i < n && base + o + i < v.byteLength; i++) {
      const c = v.getUint8(base + o + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const scan = (ifd: number, tag: number): number | null => {
    if (base + ifd + 2 > v.byteLength) return null;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (base + e + 12 > v.byteLength) return null;
      if (u16(e) === tag) return e;
    }
    return null;
  };
  const ifd0 = u32(4);
  const exifPtr = scan(ifd0, 0x8769);
  if (exifPtr !== null) {
    const exif = u32(exifPtr + 8);
    const e = scan(exif, 0x9003);
    if (e !== null) return ascii(u32(e + 8), 19);
  }
  const e = scan(ifd0, 0x0132);
  return e !== null ? ascii(u32(e + 8), 19) : null;
}
