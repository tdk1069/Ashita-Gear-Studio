import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameIndex } from '../src/data/gamedata';
import { buildGameData, maskSlots, parseItemsLua, scanLuaEntries, slotBit } from '../src/data/windower';

/* A hand-written sample in the layout of the Windower items table. It is a parser fixture, not game data. */
const ITEMS_LUA = `return {
    [4096] = {id=4096,en="Fire Crystal",ja="x",enl="Fire Crystal",jal="x",category="Basic",flags=0,stack=12,targets=0},
    [10000] = {id=10000,en="Optical Hat",ja="x",enl="Optical Hat",jal="x",category="Armor",flags=100,stack=1,targets=0,jobs=8388606,level=12,races=510,slots=16},
    [10001] = {id=10001,en="Brutal Earring",ja="x",enl="Brutal Earring",jal="x",category="Armor",stack=1,jobs=8388606,level=62,slots=6144},
    [10002] = {id=10002,en="Rajas Ring",ja="x",enl="Rajas Ring",jal="x",category="Armor",stack=1,level=61,slots=0x6000},
    [10003] = {id=10003,en="Excalibur",category="Weapon",stack=1,level=75,slots=1,skill=2,damage=70,delay=232},
    [10004] = {id=10004,en="Genbu's Shield",category="Armor",level=75,slots=2,shield_size=4},
    [10005] = {id=10005,en="Odd {Name} \\"Q\\"",category="Armor",level=1,slots=32},
    [10006] = {id=10006,en="Optical Hat",category="Armor",level=12,slots=16},
    [10007] = {
        id=10007,
        en="Multi Line Cape",
        category="Armor",
        level=40,
        slots=32768,
    },
}`;

test('slot masks use the resource bit order', () => {
  assert.equal(slotBit('Main'), 1);
  assert.equal(slotBit('Head'), 16);
  assert.equal(slotBit('Back'), 32768);
  assert.deepEqual(maskSlots(6144), ['Ear1', 'Ear2']);
});

test('scans entries even with braces and quotes inside names', () => {
  const entries = scanLuaEntries(ITEMS_LUA);
  assert.equal(entries.length, 9);
  assert.ok(entries[6]!.body.includes('Odd {Name}'));
});

test('parses equippable items only, with levels, hex masks and dedupe', () => {
  const rows = parseItemsLua(ITEMS_LUA);
  const names = rows.map(r => r[0]);
  assert.ok(!names.includes('Fire Crystal'));
  assert.equal(names.filter(n => n === 'Optical Hat').length, 1);
  assert.ok(names.includes('Odd {Name} "Q"'));
  assert.deepEqual(rows.find(r => r[0] === 'Rajas Ring'), ['Rajas Ring', 0x6000, 61]);
  assert.deepEqual(rows.find(r => r[0] === 'Multi Line Cape'), ['Multi Line Cape', 32768, 40]);
});

test('index offers shared pools for ears and rings and ranks matches', () => {
  const { data } = buildGameData([{ name: 'items.lua', text: ITEMS_LUA }], 'test');
  const idx = new GameIndex(data);
  assert.equal(idx.search('Ear1', { query: 'brutal' }).hits[0]!.name, 'Brutal Earring');
  assert.equal(idx.search('Ear2', { query: 'brutal' }).hits[0]!.name, 'Brutal Earring');
  assert.equal(idx.search('Ring2', { query: 'rajas' }).hits.length, 1);
  assert.equal(idx.search('Head', { query: '', maxLevel: 5 }).hits.length, 0);
  assert.equal(idx.search('Head', { query: 'hat', maxLevel: 12 }).hits.length, 1);
  assert.equal(idx.search('Main', { query: 'xyz' }).total, 0);
});

test('accepts JSON in the compact, slot-keyed and object-list shapes', () => {
  const compact = buildGameData([{ name: 'gamedata.json', text: JSON.stringify({ version: 1, items: [['A', 16, 1]], spells: ['Cure'], abilities: [], weaponskills: [], buffs: [] }) }], 't').data;
  assert.equal(compact.items.length, 1);
  assert.deepEqual(compact.spells, ['Cure']);
  const keyed = buildGameData([{ name: 'x.json', text: JSON.stringify({ Head: ['Hat'], Ring: ['Band'] }) }], 't').data;
  assert.deepEqual(keyed.items.find(r => r[0] === 'Band')![1], slotBit('Ring1') | slotBit('Ring2'));
  const list = buildGameData([{ name: 'x.json', text: JSON.stringify([{ name: 'Boot', slots: ['Feet'], level: 3 }]) }], 't').data;
  assert.deepEqual(list.items[0], ['Boot', slotBit('Feet'), 3]);
});

test('reads names lists by file name and reports unusable files', () => {
  const spells = `return {[1]={id=1,en="Cure",skill=33},[2]={id=2,en="Cure II"}}`;
  const { data } = buildGameData([{ name: 'spells.lua', text: spells }], 't');
  assert.deepEqual(data.spells, ['Cure', 'Cure II']);
  assert.throws(() => buildGameData([{ name: 'notes.txt', text: 'hello' }], 't'), /No game data/);
  assert.throws(() => buildGameData([{ name: 'bad.json', text: '{oops' }], 't'), /could not be read/);
});

test('searching tens of thousands of items stays fast', () => {
  const rows: [string, number, number][] = [];
  const heads = ['Helm', 'Hat', 'Cap', 'Circlet', 'Crown'];
  for (let i = 0; i < 40000; i++) rows.push([`Sample ${heads[i % 5]} ${i}`, slotBit(i % 2 ? 'Head' : 'Body'), i % 99]);
  const idx = new GameIndex({ version: 1, source: 'perf', items: rows, spells: [], abilities: [], weaponskills: [], buffs: [] });
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) idx.search('Head', { query: 'cap 1' });
  const per = (performance.now() - t0) / 20;
  assert.ok(per < 60, `search took ${per.toFixed(1)} ms`);
  assert.equal(idx.search('Head', { query: '' }).hits.length, 80);
});
