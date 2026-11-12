#!/usr/bin/env tsx
/* Extracts equipment, spells, abilities, weaponskills and status effects (and optionally icons) from your own FFXI client install for Ashita Gear Studio.

   usage:
     npm run extract:client -- --client "C:\Program Files (x86)\PlayOnline\SquareEnix\FINAL FANTASY XI" [options]

   options:
     --client <dir>      FFXI install folder (or set FFXI_INSTALL_PATH)
     --out <dir>         output folder (default public/resources)
     --icons             also write icons.png (sprite sheet) and icons.json
     --compare <file>    check the result against a Phoenix/LandSandBoat sql/item_equipment.sql and print a report
     --record-size <n>   force 3072 (0xC00) or 5120 (0x1400) byte records if auto detection is wrong
*/
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ABILITY_TYPES, ELEMENT_NAMES, ITEM_DATS, MAGIC_TYPES, NEW_LAYOUT, OLD_LAYOUT, SKILL_NAMES, SLOT_NAMES, WEAPONSKILL_TYPES, buildAtlas, decodeBitmapA, firstStrings, parseDmsgTable, parseItemDat, parseMenuTable, parseStatusInfo } from './lib/clientdat';
import type { ItemRecord, Layout } from './lib/clientdat';
import { encodePng } from './lib/png';

interface Args { client: string; out: string; icons: boolean; compare: string; record: number }
function parseArgs(argv: string[]): Args {
  const a: Args = { client: process.env['FFXI_INSTALL_PATH'] ?? '', out: 'public/resources', icons: false, compare: '', record: 0 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (k === '--client') a.client = argv[++i] ?? '';
    else if (k === '--out') a.out = argv[++i] ?? a.out;
    else if (k === '--icons') a.icons = true;
    else if (k === '--compare') a.compare = argv[++i] ?? '';
    else if (k === '--record-size') a.record = Number(argv[++i]);
    else { console.error('Unknown option ' + k); process.exit(2); }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (!args.client) { console.error('Tell me where the game is installed: --client "<FFXI folder>" (the folder that contains ROM).'); process.exit(2); }
const client = resolve(args.client);
if (!existsSync(join(client, 'ROM'))) { console.error(`No ROM folder in ${client}. Point --client at the folder that contains ROM, ROM2 and so on.`); process.exit(2); }
const forced: Layout | undefined = args.record === 0xc00 || args.record === 3072 ? OLD_LAYOUT : args.record === 0x1400 || args.record === 5120 ? NEW_LAYOUT : undefined;

/* ---- read: equipment ---- */
const items = new Map<number, ItemRecord>();
let missing = 0;
for (const spec of ITEM_DATS) {
  const file = join(client, spec.path);
  if (!existsSync(file)) { console.warn(`  missing  ${spec.path}`); missing++; continue; }
  const { items: found, layout } = parseItemDat(readFileSync(file), spec, args.icons, forced);
  for (const it of found) items.set(it.id, it);
  console.log(`  read     ${spec.path.padEnd(18)} ${found.length.toLocaleString().padStart(6)} equipment records (${layout.isNew ? '0x1400' : '0xC00'} byte records)`);
}
const list = [...items.values()].filter(i => i.slots !== 0).sort((a, b) => a.id - b.id);
if (!list.length) {
  console.error('\nNo equipment found. Either the client folder is wrong or this client version stores items differently. Try --record-size 3072 or 5120 and send me the output.');
  process.exit(1);
}

/* ---- read: spells, abilities, weaponskills, status effects ---- */
function load(rel: string): Uint8Array | null {
  const f = join(client, rel);
  if (!existsSync(f)) { console.warn(`  missing  ${rel}`); return null; }
  return readFileSync(f);
}
const menuFile = load('ROM/118/114.DAT');
const menu = menuFile ? parseMenuTable(menuFile) : { spells: [], abilities: [], sections: [] as string[] };
const spellNames = firstStrings(parseDmsgTable(load('ROM/181/73.DAT') ?? new Uint8Array()));
const abilityNames = firstStrings(parseDmsgTable(load('ROM/181/72.DAT') ?? new Uint8Array()));
const statusNames = firstStrings(parseDmsgTable(load('ROM/180/102.DAT') ?? new Uint8Array()));
const statusFile = load('ROM/119/57.DAT');
const statuses = statusFile ? parseStatusInfo(statusFile) : [];
console.log(`  read     menu table sections: ${menu.sections.join(', ') || 'none'}`);

interface SpellInfo { id: number; n: string; skill: string; el: string; type: string; mp: number; cast: number; recast: number; lv: Record<string, number> }
interface AbilityInfo { id: number; n: string; type: string; mp: number; tp: number }
interface BuffInfo { id: number; n: string; icon: number }
const spellInfo: SpellInfo[] = [];
for (const sp of menu.spells) {
  const n = spellNames.get(sp.index);
  if (!n) continue;
  spellInfo.push({ id: sp.id, n, skill: SKILL_NAMES[sp.skill] ?? '', el: ELEMENT_NAMES[sp.element] ?? '', type: MAGIC_TYPES[sp.type] ?? '', mp: sp.mp, cast: sp.castTime, recast: sp.recast, lv: sp.levels });
}
spellInfo.sort((a, b) => a.n.localeCompare(b.n));
const abilityInfo: AbilityInfo[] = [], weaponskillInfo: AbilityInfo[] = [];
const typeSamples = new Map<number, string[]>();
for (const ab of menu.abilities) {
  const n = abilityNames.get(ab.id);
  if (!n) continue;
  const row: AbilityInfo = { id: ab.id, n, type: ABILITY_TYPES[ab.type] ?? `Type ${ab.type}`, mp: ab.mp, tp: ab.tp };
  (WEAPONSKILL_TYPES.has(ab.type) ? weaponskillInfo : abilityInfo).push(row);
  const sm = typeSamples.get(ab.type) ?? []; if (sm.length < 4) { sm.push(n); typeSamples.set(ab.type, sm); }
}
abilityInfo.sort((a, b) => a.n.localeCompare(b.n)); weaponskillInfo.sort((a, b) => a.n.localeCompare(b.n));
const buffInfoRaw = statuses.map(st => ({ st, n: statusNames.get(st.id) ?? '' })).filter(x => x.n);

/* ---- write ---- */
const out = resolve(args.out);
mkdirSync(out, { recursive: true });
let cells: number[] = list.map(() => -1);
let buffCells: number[] = buffInfoRaw.map(() => -1);
const atlasMeta = (a: ReturnType<typeof buildAtlas>): object => ({ version: 1, cell: 32, cols: 64, count: a.unique, width: a.sheet.width, height: a.sheet.height });
if (args.icons) {
  const atlas = buildAtlas(list.map(i => (i.icon ? decodeBitmapA(i.icon) : null)));
  cells = atlas.cells;
  writeFileSync(join(out, 'icons.png'), encodePng(atlas.sheet));
  writeFileSync(join(out, 'icons.json'), JSON.stringify(atlasMeta(atlas)) + '\n');
  console.log(`  icons    ${atlas.unique.toLocaleString()} unique item icons -> icons.png (${atlas.sheet.width}x${atlas.sheet.height})`);
  const satlas = buildAtlas(buffInfoRaw.map(x => (x.st.icon ? decodeBitmapA(x.st.icon) : null)));
  buffCells = satlas.cells;
  writeFileSync(join(out, 'status-icons.png'), encodePng(satlas.sheet));
  writeFileSync(join(out, 'status-icons.json'), JSON.stringify(atlasMeta(satlas)) + '\n');
  console.log(`  icons    ${satlas.unique.toLocaleString()} unique status icons -> status-icons.png (${satlas.sheet.width}x${satlas.sheet.height})`);
}
const buffInfo: BuffInfo[] = buffInfoRaw.map((x, i) => ({ id: x.st.id, n: x.n, icon: buffCells[i]! })).sort((a, b) => a.n.localeCompare(b.n));
const uniq = (xs: string[]): string[] => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
const gamedata = {
  version: 1,
  source: 'FFXI client data (' + new Date().toISOString().slice(0, 10) + ')',
  /** [in-game name, slot mask, level, full name or '', icon cell or -1] */
  items: list.map((i, n) => [i.name, i.slots, i.level, i.longName, cells[n]]),
  spells: uniq(spellInfo.map(x => x.n)), abilities: uniq(abilityInfo.map(x => x.n)), weaponskills: uniq(weaponskillInfo.map(x => x.n)), buffs: uniq(buffInfo.map(x => x.n)),
  spellInfo, abilityInfo, weaponskillInfo, buffInfo,
  icons: args.icons ? { items: 'icons', buffs: 'status-icons' } : undefined,
};
writeFileSync(join(out, 'gamedata.json'), JSON.stringify(gamedata) + '\n');
const extra = { version: 1, fields: ['id', 'name', 'jobs', 'itemLevel'], rows: list.map(i => [i.id, i.name, i.jobs, i.itemLevel]) };
writeFileSync(join(out, 'items-extra.json'), JSON.stringify(extra) + '\n');
const longCount = list.filter(i => i.longName).length;
console.log(`\nWrote to ${out}${missing ? ` (${missing} item file(s) were missing)` : ''}:`);
console.log(`  ${list.length.toLocaleString()} equipment items (${longCount.toLocaleString()} with a longer full name), ${spellInfo.length.toLocaleString()} spells, ${abilityInfo.length.toLocaleString()} abilities, ${weaponskillInfo.length.toLocaleString()} weaponskills, ${buffInfo.length.toLocaleString()} status effects`);

/* ---- sanity checks against things whose details are known ---- */
const known: [number, string, number, number][] = [[11697, 'Moonshade Earring', 0x1800, 90], [12296, "Genbu's Shield", 2, 74], [17545, 'Fire Staff', 1, 51], [28419, 'Hachirin-no-Obi', 0x400, 71]];
console.log('\nSpot checks:');
for (const [id, name, slots, level] of known) {
  const it = items.get(id);
  const ok = it && (it.name === name || it.longName === name) && it.slots === slots && it.level === level;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} item #${id} expected ${name} (slots ${slots}, level ${level}), got ${it ? `${it.name}${it.longName ? ' / ' + it.longName : ''} (slots ${it.slots}, level ${it.level})` : 'nothing'}`);
}
const has = (xs: { n: string }[], n: string): boolean => xs.some(x => x.n === n);
for (const [label, ok] of [['spell Cure', has(spellInfo, 'Cure')], ['spell Stoneskin', has(spellInfo, 'Stoneskin')], ['weaponskill Savage Blade', has(weaponskillInfo, 'Savage Blade')], ['weaponskill Chant du Cygne', has(weaponskillInfo, 'Chant du Cygne')], ['ability Mighty Strikes', has(abilityInfo, 'Mighty Strikes')], ['status Haste', has(buffInfo, 'Haste')]] as const) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
}
console.log('\nAbility types found (check the weaponskill types look right):');
for (const [t, names] of [...typeSamples].sort((a, b) => a[0] - b[0])) console.log(`  type ${String(t).padStart(2)} ${(ABILITY_TYPES[t] ?? '?').padEnd(18)} ${names.join(', ')}${WEAPONSKILL_TYPES.has(t) ? '   <- counted as weaponskills' : ''}`);
const shortened = list.filter(i => i.longName).slice(0, 5).map(i => `${i.name} = ${i.longName}`);
if (shortened.length) console.log('\nShort and full names, e.g.: ' + shortened.join('; '));

/* ---- optional full comparison with a Phoenix / LandSandBoat item_equipment.sql ---- */
if (args.compare) {
  const sql = readFileSync(args.compare, 'utf8');
  const rowRe = /INSERT INTO `item_equipment` VALUES \((\d+),'((?:[^'\\]|\\.)*)',(\d+),(\d+),(\d+),\d+,\d+,\d+,(\d+),/g;
  let m: RegExpExecArray | null, total = 0, noClient = 0, badLevel = 0, badSlot = 0, badJobs = 0, badIlvl = 0, nameLike = 0;
  const samples: string[] = [];
  while ((m = rowRe.exec(sql))) {
    total++;
    const id = Number(m[1]), level = Number(m[3]), ilvl = Number(m[4]), jobs = Number(m[5]), slot = Number(m[6]);
    const it = items.get(id);
    if (!it) { noClient++; continue; }
    if (it.level !== level) badLevel++;
    if (it.slots !== slot) badSlot++;
    if ((it.jobs & 0x3fffff) !== (jobs & 0x3fffff)) badJobs++;
    if (it.itemLevel !== ilvl) badIlvl++;
    const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (norm(it.name) === norm(m[2]!.replace(/_/g, ' ')) || (it.longName && norm(it.longName) === norm(m[2]!.replace(/_/g, ' ')))) nameLike++;
    else if (samples.length < 8) samples.push(`#${id} client "${it.name}" vs server "${m[2]}"`);
  }
  console.log(`\nComparison with ${args.compare}`);
  console.log(`  server rows ${total.toLocaleString()}; not found in client data ${noClient.toLocaleString()} (custom or newer server items)`);
  console.log(`  mismatches: level ${badLevel}, slots ${badSlot}, jobs ${badJobs}, item level ${badIlvl}`);
  console.log(`  names that match the server's spelling: ${nameLike.toLocaleString()} of ${(total - noClient).toLocaleString()}`);
  samples.forEach(s => console.log('   ' + s));
  console.log('  (Level, slot and job mismatches near zero mean the layout was read correctly. Item level differences are expected on servers that edit it.)');
}
void SLOT_NAMES;
