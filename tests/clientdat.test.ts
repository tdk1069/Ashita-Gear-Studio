import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAtlas, dataShift, decodeBitmapA, decryptRecord, detectLayout, encryptRecord, firstStrings, longNameFrom, NEW_LAYOUT, OLD_LAYOUT, parseDmsgTable, parseItemDat, parseMenuTable, parseStatusInfo, readDmsgList } from '../scripts/lib/clientdat';
import type { Layout } from '../scripts/lib/clientdat';
import { encodePng } from '../scripts/lib/png';

const w16 = (b: Uint8Array, o: number, v: number): void => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; };
const w32 = (b: Uint8Array, o: number, v: number): void => { w16(b, o, v & 0xffff); w16(b, o + 2, (v >>> 16) & 0xffff); };

/** A 32x32 8 bit BitmapA whose pixel (0,0) in the top-left uses palette entry `colour`. */
function bitmapA(colour: number): Uint8Array {
  const w = 32, h = 32, out = new Uint8Array(57 + 1024 + w * h);
  out[0] = 0x91; out.set(new TextEncoder().encode('iconst00'), 1); out.set(new TextEncoder().encode('00000001'), 9);
  w32(out, 17, 40); w32(out, 21, w); w32(out, 25, h); w16(out, 29, 1); w16(out, 31, 8);
  for (let i = 1; i < 256; i++) { out[57 + i * 4] = i; out[57 + i * 4 + 1] = 0; out[57 + i * 4 + 2] = 255 - i; out[57 + i * 4 + 3] = 0; } // BGRA
  out[57 + 1024 + (h - 1) * w] = colour;      // bottom-up: last row is the top row of the picture
  return out;
}


/** A list of strings/numbers as stored in item records and d_msg tables. */
function buildList(values: (string | number)[], flip = false): Uint8Array {
  const entries: Uint8Array[] = [];
  let offset = 4 + values.length * 8;
  const meta = new Uint8Array(4 + values.length * 8);
  w32(meta, 0, values.length);
  values.forEach((v, i) => {
    let bytes: Uint8Array;
    if (typeof v === 'number') { bytes = new Uint8Array(4); w32(bytes, 0, v); }
    else {
      const text = new TextEncoder().encode(v);
      bytes = new Uint8Array(Math.ceil((28 + text.length + 1) / 4) * 4);
      bytes[0] = 1; bytes.set(text, 28);
    }
    w32(meta, 4 + i * 8, offset); w32(meta, 8 + i * 8, typeof v === 'number' ? 1 : 0);
    entries.push(bytes); offset += bytes.length;
  });
  const out = new Uint8Array(offset);
  out.set(meta, 0);
  let at = meta.length; for (const e of entries) { out.set(e, at); at += e.length; }
  return flip ? out.map(b => b ^ 0xff) : out;
}
function buildDmsg(lists: (string | number)[][], opts: { flip?: boolean; fixed?: number }): Uint8Array {
  const flip = !!opts.flip;
  const built = lists.map(l => buildList(l, flip));
  const per = opts.fixed ?? 0;
  const metaSize = per ? 0 : lists.length * 8;
  const body: number[] = [];
  const meta = new Uint8Array(metaSize);
  built.forEach((b, i) => {
    if (per) { const padded = new Uint8Array(per); padded.set(b); if (flip) padded.fill(0xff, b.length); body.push(...padded); }
    else { w32(meta, i * 8, flip ? ~body.length >>> 0 : body.length); w32(meta, i * 8 + 4, flip ? ~b.length >>> 0 : b.length); body.push(...b); }
  });
  const out = new Uint8Array(0x40 + metaSize + body.length);
  out.set(new TextEncoder().encode('d_msg'), 0);
  w16(out, 8, 1); w16(out, 10, flip ? 1 : 0); w32(out, 12, 3); w32(out, 16, 3); w32(out, 20, out.length); w32(out, 24, 0x40);
  w32(out, 28, metaSize); w32(out, 32, per); w32(out, 36, body.length); w32(out, 40, lists.length); w32(out, 44, 1);
  out.set(meta, 0x40); out.set(body, 0x40 + metaSize);
  return out;
}
const rotl = (b: Uint8Array, s: number): Uint8Array => b.map(x => ((x << s) | (x >> (8 - s))) & 0xff);
/** Scrambles an entry the way menu tables do: bytes 2, 11 and 12 stay readable and carry the key. */
function encodeMasked(plain: Uint8Array): Uint8Array {
  const out = rotl(plain, dataShift(plain));
  out[2] = plain[2]!; out[11] = plain[11]!; out[12] = plain[12]!;
  return out;
}
function section(code: string, kind: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(16 + body.length);
  out.set(new TextEncoder().encode(code), 0);
  w32(out, 4, ((body.length + 16) << 3) + kind);
  out.set(body, 16);
  return out;
}

function record(lay: Layout, o: { id: number; name: string; log?: string; level: number; slots: number; jobs: number; ilvl: number; colour?: number }): Uint8Array {
  const d = new Uint8Array(lay.record);
  const f = lay.isNew ? 0x10 : 0x0e;
  w16(d, 0, o.id); w16(d, 4, 1); w16(d, lay.isNew ? 10 : 8, 4 /* armor/weapon type */);
  w16(d, f, o.level); w16(d, f + 2, o.slots); w16(d, f + 4, 0x1ff);
  const jobsAt = f + (lay.isNew ? 8 : 6);
  w32(d, jobsAt, o.jobs << 1);                 // client stores job n at bit n
  const weapon = o.id >= 0x4000 && o.id < 0x5a00;
  d[jobsAt + 4 + (weapon ? 26 : 14)] = o.ilvl;
  d.set(buildList([o.name, '', o.log ?? o.name.toLowerCase(), '', 'description']), 0x60);
  if (o.colour !== undefined) { const bmp = bitmapA(o.colour); w32(d, 0x280, bmp.length); d.set(bmp, 0x284); }
  return encryptRecord(d);
}

function dat(lay: Layout, count: number, rows: Parameters<typeof record>[1][]): Uint8Array {
  const f = new Uint8Array(lay.record * count);
  rows.forEach((r, i) => f.set(record(lay, r), i * lay.record));
  return f;
}

test('rotation round-trips', () => {
  const x = new Uint8Array(256).map((_, i) => i);
  assert.deepEqual(decryptRecord(encryptRecord(x)), x);
});

test('layout is chosen by file size', () => {
  assert.equal(detectLayout(4096 * 0xc00, 4096), OLD_LAYOUT);
  assert.equal(detectLayout(4096 * 0x1400, 4096), NEW_LAYOUT);
});

for (const [label, lay] of [['old 0xC00', OLD_LAYOUT], ['new 0x1400', NEW_LAYOUT]] as const) {
  test(`parses armor and weapons (${label})`, () => {
    const file = dat(lay, 8, [
      { id: 0x2f31, name: 'Moonshade Earring', level: 90, slots: 0x1800, jobs: 0x3fffff, ilvl: 0 },
      { id: 0x4488, name: "Genbu's Shield", level: 74, slots: 2, jobs: 0x18c01c, ilvl: 3 },
      { id: 0x4489, name: 'Fire Staff', level: 51, slots: 1, jobs: 0x3fffff, ilvl: 119 },
    ]);
    const { items } = parseItemDat(file, { path: 'x', maxCount: 8 }, false, lay);
    assert.equal(items.length, 3);
    const [a, b, c] = items;
    assert.deepEqual([a!.name, a!.level, a!.slots, a!.jobs, a!.itemLevel], ['Moonshade Earring', 90, 0x1800, 0x3fffff, 0]);
    assert.deepEqual([b!.name, b!.level, b!.slots, b!.jobs, b!.itemLevel], ["Genbu's Shield", 74, 2, 0x18c01c, 3]);
    assert.equal(c!.itemLevel, 119);
  });
}

test('skips non-equipment ids and unnamed records', () => {
  const file = dat(OLD_LAYOUT, 4, [
    { id: 0x1000, name: 'Potion', level: 1, slots: 0, jobs: 0, ilvl: 0 },
    { id: 0x7001, name: 'Storage Slip', level: 1, slots: 0, jobs: 0, ilvl: 0 },
    { id: 0x2800, name: '.', level: 1, slots: 16, jobs: 0, ilvl: 0 },
  ]);
  assert.equal(parseItemDat(file, { path: 'x', maxCount: 4 }, false, OLD_LAYOUT).items.length, 0);
});

test('icons decode, share cells, and encode to PNG', () => {
  const file = dat(OLD_LAYOUT, 4, [
    { id: 0x2800, name: 'A', level: 1, slots: 16, jobs: 1, ilvl: 0, colour: 5 },
    { id: 0x2801, name: 'B', level: 1, slots: 16, jobs: 1, ilvl: 0, colour: 5 },
    { id: 0x2802, name: 'C', level: 1, slots: 16, jobs: 1, ilvl: 0, colour: 9 },
  ]);
  const { items } = parseItemDat(file, { path: 'x', maxCount: 4 }, true, OLD_LAYOUT);
  const imgs = items.map(i => decodeBitmapA(i.icon!));
  assert.ok(imgs.every(Boolean));
  assert.equal(imgs[0]!.data[3], 255);                        // the coloured pixel is opaque
  assert.equal(imgs[0]!.data[7], 0);                          // its neighbour uses palette 0, which is transparent
  assert.equal(imgs[0]!.data[0], 250);                        // top-left pixel uses palette 5 (R = 255 - 5)
  const atlas = buildAtlas(imgs);
  assert.deepEqual(atlas.cells, [0, 0, 1]);                   // A and B are identical
  assert.equal(atlas.unique, 2);
  const png = encodePng(atlas.sheet);
  assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('long names are restored from the log name', () => {
  assert.equal(longNameFrom('Errant Hpl.', 'errant houppelande'), 'Errant Houppelande');
  assert.equal(longNameFrom('Moonshade Earring', 'a moonshade earring'), '');
  assert.equal(longNameFrom('Cape of Val.', 'cape of valor'), 'Cape of Valor');
  assert.equal(longNameFrom('X', ''), '');
});

test('item records expose short name, full name and description', () => {
  const file = dat(OLD_LAYOUT, 4, [{ id: 0x3a10, name: 'Errant Hpl.', log: 'errant houppelande', level: 75, slots: 32, jobs: 0x3fffff, ilvl: 0 }]);
  const it = parseItemDat(file, { path: 'x', maxCount: 4 }, false, OLD_LAYOUT).items[0]!;
  assert.deepEqual([it.name, it.longName], ['Errant Hpl.', 'Errant Houppelande']);
});

for (const [label, opts] of [['fixed size', { fixed: 256 }], ['variable size', {}], ['byte-flipped', { flip: true }], ['flipped and fixed', { flip: true, fixed: 256 }]] as const) {
  test(`names table (${label})`, () => {
    const t = parseDmsgTable(buildDmsg([['Fire', 'x'], ['Blizzard', 'y'], ['Cure IV', 'z', 7], ['Haste']], opts));
    assert.equal(t.size, 4);
    assert.deepEqual([...firstStrings(t)].map(([, v]) => v), ['Fire', 'Blizzard', 'Cure IV', 'Haste']);
    assert.deepEqual(t.get(2), ['Cure IV', 'z', 7]);
  });
}

test('menu table: spells and abilities', () => {
  const spell = new Uint8Array(100);
  w16(spell, 0, 144);          // index
  w16(spell, 2, 2);            // black magic
  w16(spell, 4, 0);            // fire
  w16(spell, 8, 0x24);         // elemental
  w16(spell, 10, 91);          // mp
  spell[12] = 8; spell[13] = 30;
  w16(spell, 14 + 4 * 2, 52);  // BLM learns at 52
  w16(spell, 14 + 1 * 2, 0xffff); // not WAR
  w16(spell, 62, 147);         // id
  spell[99] = 0xff;
  const ability = new Uint8Array(48);
  w16(ability, 0, 163); ability[2] = 3; ability[3] = 12; w16(ability, 6, 0); w16(ability, 12, 1000); ability[47] = 0xff;
  const header = new Uint8Array(32); header.set(new TextEncoder().encode('menu'), 0); w32(header, 4, 0x101);
  const file = new Uint8Array([...header, ...section('mgc_', 73, new Uint8Array([...encodeMasked(spell), ...new Uint8Array(300)])), ...section('comm', 83, encodeMasked(ability)), ...section('end\0', 0, new Uint8Array(0))]);
  const m = parseMenuTable(file);
  assert.deepEqual(m.sections, ['mgc_', 'comm']);
  assert.equal(m.spells.length, 1);
  assert.deepEqual([m.spells[0]!.id, m.spells[0]!.index, m.spells[0]!.element, m.spells[0]!.skill, m.spells[0]!.mp, m.spells[0]!.castTime, m.spells[0]!.recast, m.spells[0]!.levels], [147, 144, 0, 0x24, 91, 8, 30, { BLM: 52 }]);
  assert.deepEqual([m.abilities[0]!.id, m.abilities[0]!.type, m.abilities[0]!.tp], [163, 3, 1000]);
});

test('status info with embedded icon', () => {
  // find a plain header whose scrambled form carries a consistent key
  let rec: Uint8Array | null = null;
  for (let key = 0; key < 256 && !rec; key++) {
    const plain = new Uint8Array(0x280);
    w16(plain, 0, 33); plain[2] = key; plain[3] = 1; w32(plain, 4, 1); w32(plain, 8, 12); w32(plain, 12, 0); w32(plain, 16, 1);
    plain.set(new TextEncoder().encode('Increases attack speed'), 44);
    for (let s = 1; s <= 7; s++) { const enc = rotl(plain, s); if (dataShift(enc) === s) { rec = new Uint8Array(0x1800); rec.set(enc, 0); break; } }
  }
  assert.ok(rec);
  const bmp = bitmapA(7);
  w32(rec!, 0x280, bmp.length); rec!.set(bmp, 0x284); rec![0x17ff] = 0xff;
  const s = parseStatusInfo(rec!);
  assert.deepEqual([s[0]!.id, s[0]!.description], [33, 'Increases attack speed']);
  assert.equal(decodeBitmapA(s[0]!.icon!)!.data[0], 248);
});

test('readDmsgList tolerates garbage', () => {
  assert.deepEqual(readDmsgList(new Uint8Array(8), 0), []);
});
