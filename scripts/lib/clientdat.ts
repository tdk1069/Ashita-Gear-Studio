/* Reads FFXI client item DATs (ROM/118/106.DAT and friends). Pure functions over bytes, no file access, so they can be tested.

   File layout, as documented by the community (Windower ResourceExtractor / POLUtils, and sruon/ffxi-resources' FORMATS notes):
   - Every record is fixed size (0xC00 bytes, or 0x1400 in newer clients) and each byte is rotated: dec = (b >> 5 | b << 3) & 0xFF.
   - A record starts with a small header, then category fields (level, slots, races, jobs ...), then a string table and an icon.
   - The icon sits at 0x280: a u32 size followed by a "BitmapA" image (usually 32x32, 8 bit paletted, bottom-up).
   This is an independent implementation of that layout. */

export interface ItemDatSpec { path: string; maxCount: number }

/** Item DATs, relative to the client folder. Which ids a file holds comes from the records themselves. */
export const ITEM_DATS: readonly ItemDatSpec[] = [
  { path: 'ROM/118/106.DAT', maxCount: 4096 },
  { path: 'ROM/118/107.DAT', maxCount: 4096 },
  { path: 'ROM/301/115.DAT', maxCount: 1536 },
  { path: 'ROM/118/109.DAT', maxCount: 6144 },
  { path: 'ROM/118/108.DAT', maxCount: 6656 },
  { path: 'ROM/286/73.DAT', maxCount: 5632 },
  { path: 'ROM/217/21.DAT', maxCount: 1024 },
  { path: 'ROM/118/110.DAT', maxCount: 512 },
  { path: 'ROM/174/48.DAT', maxCount: 16 },
  { path: 'ROM/288/67.DAT', maxCount: 512 },
];

export interface Layout { record: number; isNew: boolean }
export const OLD_LAYOUT: Layout = { record: 0xc00, isNew: false };
export const NEW_LAYOUT: Layout = { record: 0x1400, isNew: true };
export const ICON_OFFSET = 0x280;

/** Newer clients use 0x1400 byte records. The file is that large only if it holds the full record count at that size. */
export function detectLayout(fileSize: number, maxCount: number): Layout {
  return fileSize >= maxCount * NEW_LAYOUT.record ? NEW_LAYOUT : OLD_LAYOUT;
}

export function decryptRecord(raw: Uint8Array): Uint8Array {
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) { const b = raw[i]!; out[i] = ((b >> 5) | (b << 3)) & 0xff; }
  return out;
}
/** Inverse of decryptRecord. Only used to build test files. */
export function encryptRecord(dec: Uint8Array): Uint8Array {
  const out = new Uint8Array(dec.length);
  for (let i = 0; i < dec.length; i++) { const b = dec[i]!; out[i] = ((b << 5) | (b >> 3)) & 0xff; }
  return out;
}

/** Item id ranges. Equipment is armor and weapons; slips and other ranges are not gear. */
export function isEquipmentId(id: number): boolean {
  return (id >= 0x2800 && id < 0x4000) || (id >= 0x4000 && id < 0x5a00) || (id >= 0x5a00 && id < 0x7000);
}

export const SLOT_NAMES = ['Main', 'Sub', 'Range', 'Ammo', 'Head', 'Body', 'Hands', 'Legs', 'Feet', 'Neck', 'Waist', 'Ear1', 'Ear2', 'Ring1', 'Ring2', 'Back'] as const;

export interface ItemRecord {
  id: number;
  type: number;
  flags: number;
  resourceId: number;
  level: number;
  /** Bit 0 = Main ... bit 15 = Back (same order as the app and the Phoenix database). */
  slots: number;
  races: number;
  /** Bit n-1 = job n (WAR = bit 0), the same convention as the Phoenix database. */
  jobs: number;
  itemLevel: number;
  /** The in-game (often abbreviated) name, e.g. "Errant Hpl.". */
  name: string;
  /** The full name when it differs, e.g. "Errant Houppelande". */
  longName: string;
  /** Raw icon bytes (BitmapA), if the record holds one. */
  icon: Uint8Array | null;
}

const u16 = (b: Uint8Array, o: number): number => (b[o]! | (b[o + 1]! << 8)) >>> 0;
const u32 = (b: Uint8Array, o: number): number => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

function findPair(b: Uint8Array, a: number, c: number): number {
  for (let i = 0; i + 8 <= b.length; i += 1) if (u32(b, i) === a && u32(b, i + 4) === c) return i;
  return -1;
}

/** Decodes FFXI text bytes (Shift-JIS family). Keeps only the first line. */
export function decodeText(src: Uint8Array): string {
  const bytes = src.slice();
  // FFXI writes a right single quote as 0x85 0x52, which Shift-JIS decoders reject; map it to the standard one.
  for (let i = 0; i + 1 < bytes.length; i++) if (bytes[i] === 0x85 && bytes[i + 1] === 0x52) { bytes[i] = 0x81; bytes[i + 1] = 0x66; }
  let s: string;
  try { s = new TextDecoder('shift_jis').decode(bytes); } catch { s = new TextDecoder('latin1').decode(bytes); }
  return s.replace(/[\u2018\u2019]/g, "'").split('\n').map(l => l.trimEnd()).filter(Boolean)[0] ?? '';
}
function cstring(b: Uint8Array, offset: number, xor = 0): string {
  if (offset < 0 || offset >= b.length) return '';
  let end = offset;
  while (end < b.length && (b[end]! ^ xor) !== 0) end++;
  const bytes = b.slice(offset, end);
  if (xor) for (let i = 0; i < bytes.length; i++) bytes[i] = bytes[i]! ^ xor;
  return decodeText(bytes);
}

export type DmsgValue = string | number;
/** One "list" of strings and numbers (used inside item records and in d_msg tables).
    Layout: u32 count, then count x (u32 offset, u32 isNumber), then the entries. A string entry is 0x01, 27 zero bytes, then the text. */
export function readDmsgList(b: Uint8Array, start: number, flip = false): DmsgValue[] {
  const m32 = flip ? 0xffffffff : 0, m8 = flip ? 0xff : 0;
  if (start + 4 > b.length) return [];
  const count = (u32(b, start) ^ m32) >>> 0;
  if (count === 0 || count > 64) return [];
  const out: DmsgValue[] = [];
  for (let i = 0; i < count; i++) {
    const at = start + 4 + i * 8;
    if (at + 8 > b.length) break;
    const offset = (u32(b, at) ^ m32) >>> 0, isNumber = (u32(b, at + 4) ^ m32) >>> 0;
    const pos = start + offset;
    if (isNumber > 0) { out.push(pos + 4 <= b.length ? (u32(b, pos) ^ m32) >>> 0 : 0); continue; }
    out.push(cstring(b, pos + 28, m8));
  }
  return out;
}

/** The strings in an item record: [name, ?, log name (singular), log name (plural), description]. */
export function readItemStrings(dec: Uint8Array): string[] {
  const pos = findPair(dec, 5, 0x2c);
  if (pos < 0) {
    const alt = findPair(dec, 1, 0x05);
    return alt >= 0 ? [cstring(dec, alt + 4 + 8)] : [];
  }
  return readDmsgList(dec, pos).map(v => (typeof v === 'string' ? v : ''));
}
export const readName = (dec: Uint8Array): string => readItemStrings(dec)[0] ?? '';

const SMALL_WORDS = new Set(['of', 'the', 'and', 'de', 'du', 'la', 'in', 'to', 'a', 'an']);
/** The full name of an item whose in-game name is shortened ("Errant Hpl." -> "Errant Houppelande"), or '' when there is no distinct long name. */
export function longNameFrom(shortName: string, logSingular: string): string {
  let ls = logSingular.trim().replace(/^(a|an|the)\s+/i, '');
  if (!ls || ls === '.') return '';
  if (ls.toLowerCase() === shortName.toLowerCase()) return '';
  if (!/[A-Z]/.test(ls)) {
    // the log name is stored lower case; restore capitals word by word
    ls = ls.split(' ').map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  }
  return ls === shortName ? '' : ls;
}

export function readIcon(dec: Uint8Array): Uint8Array | null {
  if (dec.length < ICON_OFFSET + 4) return null;
  const size = u32(dec, ICON_OFFSET);
  if (size === 0 || ICON_OFFSET + 4 + size > dec.length) return null;
  return dec.slice(ICON_OFFSET + 4, ICON_OFFSET + 4 + size);
}

/** Parses one decrypted record. Returns null for empty slots and for anything that is not equipment. */
export function parseEquipmentRecord(dec: Uint8Array, lay: Layout, withIcon: boolean): ItemRecord | null {
  const id = u16(dec, 0);
  if (id === 0 || !isEquipmentId(id)) return null;
  const flags = u16(dec, 4);
  const type = u16(dec, lay.isNew ? 10 : 8);
  if (type === 0) return null;
  const resourceId = u16(dec, lay.isNew ? 12 : 10);
  const f = lay.isNew ? 0x10 : 0x0e;          // start of the category fields
  const jobsAt = f + (lay.isNew ? 8 : 6);
  const isWeapon = id >= 0x4000 && id < 0x5a00;
  // item level: weapons carry damage/delay/skill/emote fields before the charge block, armor does not
  const ilvlAt = jobsAt + 4 + (isWeapon ? 26 : 14);
  const slots = u16(dec, f + 2);
  const strings = readItemStrings(dec);
  const name = strings[0] ?? '';
  if (!name || name === '.') return null;
  return {
    id, type, flags, resourceId,
    level: u16(dec, f), slots, races: u16(dec, f + 4),
    jobs: u32(dec, jobsAt) >>> 1,
    itemLevel: dec[ilvlAt] ?? 0,
    name, longName: longNameFrom(name, strings[2] ?? ''),
    icon: withIcon ? readIcon(dec) : null,
  };
}

/** Parses a whole item DAT file. */
export function parseItemDat(file: Uint8Array, spec: ItemDatSpec, withIcon: boolean, forced?: Layout): { items: ItemRecord[]; layout: Layout } {
  const lay = forced ?? detectLayout(file.length, spec.maxCount);
  const count = Math.min(spec.maxCount, Math.floor(file.length / lay.record));
  const items: ItemRecord[] = [];
  for (let i = 0; i < count; i++) {
    const it = parseEquipmentRecord(decryptRecord(file.subarray(i * lay.record, (i + 1) * lay.record)), lay, withIcon);
    if (it) items.push(it);
  }
  return { items, layout: lay };
}

/* ---------- icons ---------- */

export interface Rgba { width: number; height: number; data: Uint8Array }

/** Decodes a BitmapA blob: 0x91 tag, 8 bytes category, 8 bytes id, a 40 byte BITMAPINFOHEADER, then palette/pixels, stored bottom-up. */
export function decodeBitmapA(raw: Uint8Array): Rgba | null {
  if (raw.length < 57 || raw[0] !== 0x91) return null;
  const width = u32(raw, 21), height = u32(raw, 25), bpp = u16(raw, 31);
  if (!width || !height || width > 256 || height > 256) return null;
  const out = new Uint8Array(width * height * 4);
  if (bpp === 8) {
    const palAt = 57, pixAt = 57 + 1024;
    if (raw.length < pixAt + width * height) return null;
    for (let y = 0; y < height; y++) {
      const srcRow = height - 1 - y;
      for (let x = 0; x < width; x++) {
        const idx = raw[pixAt + srcRow * width + x]!;
        const o = (y * width + x) * 4, p = palAt + idx * 4;
        out[o] = raw[p + 2]!; out[o + 1] = raw[p + 1]!; out[o + 2] = raw[p]!;
        out[o + 3] = idx === 0 ? 0 : 255;       // palette index 0 is the transparent colour
      }
    }
  } else if (bpp === 32) {
    if (raw.length < 57 + width * height * 4) return null;
    for (let y = 0; y < height; y++) {
      const srcRow = height - 1 - y;
      for (let x = 0; x < width; x++) {
        const p = 57 + (srcRow * width + x) * 4, o = (y * width + x) * 4;
        out[o] = raw[p + 2]!; out[o + 1] = raw[p + 1]!; out[o + 2] = raw[p]!; out[o + 3] = raw[p + 3]!;
      }
    }
  } else return null;
  return { width, height, data: out };
}

/** Packs icons into one sprite sheet. Identical images share a cell. Returns the cell index for each input, or -1. */
export function buildAtlas(icons: (Rgba | null)[], cell = 32, cols = 64): { sheet: Rgba; cells: number[]; unique: number } {
  const seen = new Map<string, number[]>();
  const placed: Rgba[] = [];
  const cells = icons.map(ic => {
    if (!ic || ic.width !== cell || ic.height !== cell) return -1;
    let h = 2166136261;
    for (let i = 0; i < ic.data.length; i++) h = Math.imul(h ^ ic.data[i]!, 16777619) >>> 0;
    const bucket = seen.get(h.toString(36)) ?? [];
    const hit = bucket.find(i => sameBytes(placed[i]!.data, ic.data));
    if (hit !== undefined) return hit;
    placed.push(ic);
    bucket.push(placed.length - 1);
    seen.set(h.toString(36), bucket);
    return placed.length - 1;
  });
  const rows = Math.max(1, Math.ceil(placed.length / cols));
  const sheet: Rgba = { width: cols * cell, height: rows * cell, data: new Uint8Array(cols * cell * rows * cell * 4) };
  placed.forEach((ic, n) => {
    const ox = (n % cols) * cell, oy = Math.floor(n / cols) * cell;
    for (let y = 0; y < cell; y++) sheet.data.set(ic.data.subarray(y * cell * 4, (y + 1) * cell * 4), ((oy + y) * sheet.width + ox) * 4);
  });
  return { sheet, cells, unique: placed.length };
}
function sameBytes(a: Uint8Array, b: Uint8Array): boolean { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

/* ---------- names tables (d_msg) ---------- */

/** d_msg file: 0x40 byte header, then either fixed size lists or (offset, size) metadata followed by the lists. Returns list index -> values. */
export function parseDmsgTable(f: Uint8Array): Map<number, DmsgValue[]> {
  const out = new Map<number, DmsgValue[]>();
  if (f.length < 0x40 || new TextDecoder().decode(f.subarray(0, 5)) !== 'd_msg') return out;
  const flip = u16(f, 10) === 1, m32 = flip ? 0xffffffff : 0;
  const header = u32(f, 24), metaSize = u32(f, 28), perList = u32(f, 32), count = u32(f, 40);
  for (let i = 0; i < count; i++) {
    let start: number;
    if (perList > 0) start = header + i * perList;
    else {
      if (header + i * 8 + 8 > f.length) break;
      start = header + metaSize + ((u32(f, header + i * 8) ^ m32) >>> 0);
    }
    const list = readDmsgList(f, start, flip);
    if (list.length) out.set(i, list);
  }
  return out;
}
/** First string of each list, by list index. */
export function firstStrings(t: Map<number, DmsgValue[]>): Map<number, string> {
  const m = new Map<number, string>();
  for (const [k, v] of t) if (typeof v[0] === 'string' && v[0] && v[0] !== '(NULL)') m.set(k, v[0]);
  return m;
}

/* ---------- "data block" scrambling used by menu tables and status info ---------- */

export function dataShift(b: Uint8Array): number {
  if (b.length < 13) return 0;
  const ones = (x: number): number => { let n = 0; for (let v = x; v; v >>= 1) n += v & 1; return n; };
  const count = Math.abs(ones(b[2]!) - ones(b[11]!) + ones(b[12]!)) % 5;
  return [7, 1, 6, 2, 5][count]!;
}
export function rotateRight(b: Uint8Array, shift: number): void {
  if (shift < 1 || shift > 7) return;
  for (let i = 0; i < b.length; i++) b[i] = ((b[i]! >> shift) | (b[i]! << (8 - shift))) & 0xff;
}
/** Entries in menu tables keep bytes 2, 11 and 12 unscrambled: they carry the key. */
export function decodeMasked(entry: Uint8Array): Uint8Array {
  const out = entry.slice();
  const keep = [out[2]!, out[11]!, out[12]!];
  rotateRight(out, dataShift(entry));
  out[2] = keep[0]!; out[11] = keep[1]!; out[12] = keep[2]!;
  return out;
}
export function decodeBlock(entry: Uint8Array): Uint8Array {
  const out = entry.slice();
  rotateRight(out, dataShift(entry));
  return out;
}

/* ---------- menu table: spells and abilities (ROM/118/114.DAT) ---------- */

export const JOB_NAMES = ['', 'WAR', 'MNK', 'WHM', 'BLM', 'RDM', 'THF', 'PLD', 'DRK', 'BST', 'BRD', 'RNG', 'SAM', 'NIN', 'DRG', 'SMN', 'BLU', 'COR', 'PUP', 'DNC', 'SCH', 'GEO', 'RUN'] as const;
export const ELEMENT_NAMES: Record<number, string> = { 0: 'Fire', 1: 'Ice', 2: 'Wind', 3: 'Earth', 4: 'Thunder', 5: 'Water', 6: 'Light', 7: 'Dark', 15: 'Special' };
export const MAGIC_TYPES: Record<number, string> = { 1: 'White Magic', 2: 'Black Magic', 3: 'Summoning', 4: 'Ninjutsu', 5: 'Song', 6: 'Blue Magic', 7: 'Geomancy', 8: 'Trust' };
export const SKILL_NAMES: Record<number, string> = {
  0x20: 'Divine Magic', 0x21: 'Healing Magic', 0x22: 'Enhancing Magic', 0x23: 'Enfeebling Magic', 0x24: 'Elemental Magic', 0x25: 'Dark Magic', 0x26: 'Summoning Magic', 0x27: 'Ninjutsu',
  0x28: 'Singing', 0x29: 'Stringed Instrument', 0x2a: 'Wind Instrument', 0x2b: 'Blue Magic', 0x2c: 'Geomancy', 0x2d: 'Handbell',
};
export const ABILITY_TYPES: Record<number, string> = {
  0: 'General', 1: 'Job', 2: 'Pet', 3: 'Weapon', 4: 'Trait', 6: 'Blood Pact: Rage', 8: 'Corsair Roll', 9: 'Corsair Shot', 10: 'Blood Pact: Ward', 11: 'Samba', 12: 'Waltz', 13: 'Step',
  14: 'Flourish', 15: 'Scholar', 16: 'Jig', 17: 'Flourish', 18: 'Monster', 19: 'Flourish', 20: 'Weaponskill', 21: 'Rune', 22: 'Ward', 23: 'Effusion',
};
/** Ability types the client uses for weaponskills. */
export const WEAPONSKILL_TYPES = new Set([3, 20]);

export interface SpellRecord { id: number; index: number; type: number; element: number; skill: number; mp: number; castTime: number; recast: number; levels: Record<string, number>; icon: number }
export interface AbilityRecord { id: number; type: number; icon: number; mp: number; tp: number; timer: number }

const i16 = (b: Uint8Array, o: number): number => { const v = u16(b, o); return v > 0x7fff ? v - 0x10000 : v; };

export function parseMenuTable(f: Uint8Array): { spells: SpellRecord[]; abilities: AbilityRecord[]; sections: string[] } {
  const spells: SpellRecord[] = [], abilities: AbilityRecord[] = [], sections: string[] = [];
  if (f.length < 32 || new TextDecoder().decode(f.subarray(0, 4)) !== 'menu') return { spells, abilities, sections };
  let off = 32;
  while (off + 16 <= f.length) {
    const code = new TextDecoder('latin1').decode(f.subarray(off, off + 4));
    const info = u32(f, off + 4);
    const size = ((info & 0xffffff80) >>> 3) - 16;
    if (code.startsWith('end')) break;
    if (size < 0 || off + 16 + size > f.length) break;
    const body = f.subarray(off + 16, off + 16 + size);
    sections.push(code);
    if (code === 'mgc_') {
      for (let p = 0; p + 100 <= body.length; p += 100) {
        const d = decodeMasked(body.subarray(p, p + 100));
        const id = u16(d, 62), mp = u16(d, 10);
        if (id === 0 && mp === 0) continue;
        const levels: Record<string, number> = {};
        for (let j = 1; j < 24; j++) { const lv = i16(d, 14 + j * 2); if (lv > 0 && lv <= 99 && JOB_NAMES[j]) levels[JOB_NAMES[j]!] = lv; }
        spells.push({ id, index: u16(d, 0), type: u16(d, 2), element: u16(d, 4), skill: u16(d, 8), mp, castTime: d[12]!, recast: d[13]!, levels, icon: u16(d, 64) });
      }
    } else if (code === 'comm') {
      for (let p = 0; p + 48 <= body.length; p += 48) {
        const d = decodeMasked(body.subarray(p, p + 48));
        abilities.push({ id: u16(d, 0), type: d[2]!, icon: d[3]!, mp: u16(d, 6), timer: u16(d, 8), tp: i16(d, 12) });
      }
    }
    off += 16 + size;
  }
  return { spells, abilities, sections };
}

/* ---------- status effects (ROM/119/57.DAT info, ROM/180/102.DAT names) ---------- */

export const STATUS_RECORD = 0x1800;
export interface StatusRecord { id: number; description: string; icon: Uint8Array | null }
export function parseStatusInfo(f: Uint8Array): StatusRecord[] {
  const out: StatusRecord[] = [];
  if (f.length % STATUS_RECORD !== 0) return out;
  for (let p = 0; p < f.length; p += STATUS_RECORD) {
    const rec = f.subarray(p, p + STATUS_RECORD);
    const head = decodeBlock(rec.subarray(0, 0x280));
    const iconSize = u32(rec, 0x280);
    out.push({ id: u16(head, 0), description: cstring(head, 44), icon: iconSize > 0 && 0x284 + iconSize <= rec.length ? rec.slice(0x284, 0x284 + iconSize) : null });
  }
  return out;
}
