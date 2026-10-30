/** Raw mail transport uses one code point per octet, never UTF-8 decoding. */
export function rawEmailString(bytes) {
  let raw = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    raw += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return raw;
}

export function rawEmailBytes(raw) {
  if (typeof raw !== 'string' || !raw.length) throw new Error('Empty email file');
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) {
    const value = raw.charCodeAt(index);
    if (value > 255) throw new Error('The raw email bytes could not be read. Download the original .eml file again.');
    bytes[index] = value;
  }
  return bytes;
}

export async function readRawEmail(file) {
  return rawEmailString(new Uint8Array(await file.arrayBuffer()));
}

// Existing inbox deployments decoded their bytes using WHATWG `latin1` (Windows-1252).
// Invert only that reversible mapping at the inbox boundary; file/prover input stays binary.
const legacyWindows1252 = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);

export function normalizeInboxEmail(raw) {
  if (typeof raw !== 'string') throw new Error('The inbox returned an invalid email file.');
  const normalized = raw.replace(/[^\u0000-\u00ff]/g, character => {
    const byte = legacyWindows1252.get(character.charCodeAt(0));
    if (byte === undefined) throw new Error('The inbox returned an unsupported email encoding. Upload the original .eml file instead.');
    return String.fromCharCode(byte);
  });
  rawEmailBytes(normalized);
  return normalized;
}
