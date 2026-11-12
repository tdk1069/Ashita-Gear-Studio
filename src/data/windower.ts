/* Reads game resource files into Gear Studio's compact data format.
   Input is the Lua tables published in the Windower Resources project (items.lua, spells.lua, ...) or
   a JSON file in one of the shapes accepted below. Pure functions: no DOM, no file access. */
import type { SlotName } from '../core/types';

/** Bit order of the `slots` field in the Windower item resources (bit 0 = Main ... bit 15 = Back). */
export const RESOURCE_SLOT_ORDER: SlotName[] = ['Main', 'Sub', 'Range', 'Ammo', 'Head', 'Body', 'Hands', 'Legs', 'Feet', 'Neck', 'Waist', 'Ear1', 'Ear2', 'Ring1', 'Ring2', 'Back'];

/** [in-game name, slotMask, level, full name or '', icon cell or -1]. Level 0 means unknown. The last two are only present in client extracts. */
export type ItemRow = [string, number, number, string?, number?];
export interface SpellInfo { id: number; n: string; skill: string; el: string; type: string; mp: number; cast: number; recast: number; lv: Record<string, number> }
export interface AbilityInfo { id: number; n: string; type: string; mp: number; tp: number }
export interface BuffInfo { id: number; n: string; icon: number }
/** Names of the icon sprite sheets (without extension) found next to gamedata.json. */
export interface IconSets { items?: string; buffs?: string }
export interface GameData {
  version: 1;
  source: string;
  /** 'bundled' = shipped in resources/, 'user' = loaded by hand through the Game data dialog. */
  origin?: 'bundled' | 'user';
  items: ItemRow[];
  spells: string[];
  abilities: string[];
  weaponskills: string[];
  buffs: string[];
  /** Richer details, present when the data came from a client extract. */
  spellInfo?: SpellInfo[];
  abilityInfo?: AbilityInfo[];
  weaponskillInfo?: AbilityInfo[];
  buffInfo?: BuffInfo[];
  icons?: IconSets;
}
export const emptyGameData = (source = ''): GameData => ({ version: 1, source, items: [], spells: [], abilities: [], weaponskills: [], buffs: [] });

export const slotBit = (slot: SlotName): number => 1 << RESOURCE_SLOT_ORDER.indexOf(slot);
export function maskSlots(mask: number): SlotName[] { return RESOURCE_SLOT_ORDER.filter((_, i) => (mask & (1 << i)) !== 0); }
const maskOf = (slots: SlotName[]): number => slots.reduce((m, s) => m | slotBit(s), 0);

/* ---------- Lua resource tables ---------- */

export interface LuaEntry { id: number; body: string }

/** Finds every `[id] = { ... }` entry of a resource table, honouring quotes inside the entry. */
export function scanLuaEntries(text: string): LuaEntry[] {
  const out: LuaEntry[] = [];
  const re = /\[(\d+)\]\s*=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let i = re.lastIndex, depth = 1, inStr: string | null = null;
    const start = i;
    while (i < text.length && depth > 0) {
      const c = text[i]!;
      if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; }
      else if (c === '"' || c === "'") inStr = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    out.push({ id: Number(m[1]), body: text.slice(start, i - 1) });
    re.lastIndex = i;
  }
  return out;
}

function unescapeLua(s: string): string { return s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c)); }
function strField(body: string, key: string): string | null {
  const m = new RegExp('(?:^|[^\\w])' + key + '\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(body);
  return m ? unescapeLua(m[1]!) : null;
}
function numField(body: string, key: string): number | null {
  const m = new RegExp('(?:^|[^\\w])' + key + '\\s*=\\s*(0[xX][0-9a-fA-F]+|\\d+)').exec(body);
  return m ? Number(m[1]) : null;
}

export function parseItemsLua(text: string): ItemRow[] {
  const seen = new Map<string, ItemRow>();
  for (const { body } of scanLuaEntries(text)) {
    const name = strField(body, 'en');
    const mask = numField(body, 'slots');
    if (!name || !mask) continue;
    const category = strField(body, 'category');
    if (category && category !== 'Armor' && category !== 'Weapon') continue;
    const key = name.toLowerCase() + '|' + mask;
    if (!seen.has(key)) seen.set(key, [name, mask, numField(body, 'level') ?? 0]);
  }
  return [...seen.values()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function parseNamesLua(text: string): string[] {
  const names = new Set<string>();
  for (const { body } of scanLuaEntries(text)) { const n = strField(body, 'en'); if (n) names.add(n); }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/* ---------- JSON ---------- */

function rowsFromJson(v: unknown): ItemRow[] | null {
  if (Array.isArray(v)) {
    const rows: ItemRow[] = [];
    for (const e of v) {
      if (Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number') rows.push([e[0], e[1], Number(e[2]) || 0, typeof e[3] === 'string' ? e[3] : '', typeof e[4] === 'number' ? e[4] : -1]);
      else if (e && typeof e === 'object') {
        const o = e as { name?: unknown; en?: unknown; slots?: unknown; level?: unknown };
        const name = typeof o.name === 'string' ? o.name : typeof o.en === 'string' ? o.en : '';
        const mask = typeof o.slots === 'number' ? o.slots : Array.isArray(o.slots) ? maskOf(o.slots.filter((s): s is SlotName => RESOURCE_SLOT_ORDER.includes(s as SlotName))) : 0;
        if (name && mask) rows.push([name, mask, Number(o.level) || 0]);
      }
    }
    return rows;
  }
  if (v && typeof v === 'object') {
    // { Head: ['Optical Hat', ...], Ring: [...], ... }
    const rows = new Map<string, ItemRow>();
    let any = false;
    for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const slots: SlotName[] = k === 'Ear' ? ['Ear1', 'Ear2'] : k === 'Ring' ? ['Ring1', 'Ring2'] : RESOURCE_SLOT_ORDER.includes(k as SlotName) ? [k as SlotName] : [];
      if (!slots.length) continue;
      for (const n of list) if (typeof n === 'string') { any = true; const r = rows.get(n); if (r) r[1] |= maskOf(slots); else rows.set(n, [n, maskOf(slots), 0]); }
    }
    return any ? [...rows.values()] : null;
  }
  return null;
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Which kind of resource a file name suggests. */
export type ResourceKind = 'items' | 'spells' | 'abilities' | 'weaponskills' | 'buffs' | 'gamedata' | 'unknown';
export function kindFromFileName(name: string): ResourceKind {
  const n = name.toLowerCase();
  if (n.includes('weapon_skill') || n.includes('weaponskill')) return 'weaponskills';
  if (n.includes('abilit')) return 'abilities';
  if (n.includes('spell')) return 'spells';
  if (n.includes('buff')) return 'buffs';
  if (n.includes('item') && !n.includes('description')) return 'items';
  if (n.endsWith('.json')) return 'gamedata';
  return 'unknown';
}

export interface LoadedFile { name: string; text: string }

/** Merges any mix of resource files into one GameData. Throws a readable Error when nothing usable is found. */
export function buildGameData(files: LoadedFile[], source: string): { data: GameData; summary: string[] } {
  const data = emptyGameData(source);
  const summary: string[] = [];
  for (const f of files) {
    const text = f.text.replace(/^﻿/, '');
    const trimmed = text.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let json: unknown;
      try { json = JSON.parse(text); } catch { throw new Error(`${f.name} looks like JSON but could not be read. Check that the file is complete.`); }
      const o = json as Partial<GameData> & Record<string, unknown>;
      if (o && o.version === 1 && Array.isArray(o.items)) {
        const rows = rowsFromJson(o.items) ?? [];
        data.items.push(...rows);
        data.spells.push(...strList(o.spells)); data.abilities.push(...strList(o.abilities));
        data.weaponskills.push(...strList(o.weaponskills)); data.buffs.push(...strList(o.buffs));
        const keep = <T,>(a: unknown): T[] => (Array.isArray(a) ? (a as T[]) : []);
        if (o.spellInfo) data.spellInfo = [...(data.spellInfo ?? []), ...keep<SpellInfo>(o.spellInfo)];
        if (o.abilityInfo) data.abilityInfo = [...(data.abilityInfo ?? []), ...keep<AbilityInfo>(o.abilityInfo)];
        if (o.weaponskillInfo) data.weaponskillInfo = [...(data.weaponskillInfo ?? []), ...keep<AbilityInfo>(o.weaponskillInfo)];
        if (o.buffInfo) data.buffInfo = [...(data.buffInfo ?? []), ...keep<BuffInfo>(o.buffInfo)];
        if (o.icons && typeof o.icons === 'object') data.icons = o.icons as IconSets;
        summary.push(`${f.name}: ${rows.length.toLocaleString()} items, ${data.spells.length.toLocaleString()} spells, ${data.weaponskills.length.toLocaleString()} weaponskills, ${data.buffs.length.toLocaleString()} status effects`);
      } else {
        const rows = rowsFromJson(json);
        if (!rows) throw new Error(`${f.name} is JSON, but not an item list Gear Studio understands. Expected rows like ["Optical Hat", 16, 12] or {"Head": ["Optical Hat"]}.`);
        data.items.push(...rows);
        summary.push(`${f.name}: ${rows.length.toLocaleString()} items`);
      }
      continue;
    }
    const kind = kindFromFileName(f.name);
    if (kind === 'items' || (kind === 'unknown' && /\bslots\s*=/.test(text))) {
      const rows = parseItemsLua(text);
      data.items.push(...rows);
      summary.push(`${f.name}: ${rows.length.toLocaleString()} items that can be equipped`);
    } else if (kind === 'spells' || kind === 'abilities' || kind === 'weaponskills' || kind === 'buffs') {
      const names = parseNamesLua(text);
      data[kind].push(...names);
      summary.push(`${f.name}: ${names.length.toLocaleString()} ${kind === 'weaponskills' ? 'weaponskills' : kind}`);
    } else {
      summary.push(`${f.name}: skipped (not recognised)`);
    }
  }
  // Merge duplicates produced by multiple files.
  const merged = new Map<string, ItemRow>();
  for (const r of data.items) { const k = r[0].toLowerCase() + '|' + r[1]; if (!merged.has(k)) merged.set(k, r); }
  data.items = [...merged.values()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const k of ['spells', 'abilities', 'weaponskills', 'buffs'] as const) data[k] = [...new Set(data[k])].sort((a, b) => a.localeCompare(b));
  if (!data.items.length && !data.spells.length && !data.abilities.length && !data.weaponskills.length && !data.buffs.length) {
    throw new Error('No game data was found in the chosen files. Choose items.lua (and optionally spells.lua, job_abilities.lua, weapon_skills.lua, buffs.lua) from the Windower Resources project.');
  }
  return { data, summary };
}
