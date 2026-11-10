/* Lua import: LuAshitacast profile text -> Profile model. Never writes Lua.
   Anything that cannot be modelled visually is kept as raw Lua and reported, never dropped. */
import type { Condition, ConditionGroup, GearSet, HandlerId, ImportNote, ItemEntry, Profile, Rule, RuleAction, SlotName, VisualRule } from './types';
import { SLOT_NAMES } from './types';
import { ALL_HANDLER_NAMES, CONDS, FIELD_KIND, GEN_ORDER, RAW_HANDLERS } from './reference';
import { emptyGroup, findSet, newItem, newProfile, newRawRule, newRule, newSet } from './model';
import { dedent, isIdent, luaStr, shorten } from './luatext';
import type { Span, Token } from './lexer';
import { closeIdx, lex, matchBlock, splitStatements, splitTopLevel } from './lexer';
import type { CondKind } from './types';

interface Key { src: string; str: string | null }
interface Entry { key: Key | null; a: number; b: number }
interface HandlerSpan { a: number; b: number; line: number }
interface Ctx {
  src: string;
  toks: Token[];
  sets: GearSet[];
  custom: string[];
  notes: ImportNote[];
  setsVar: string;
  names: Profile['names'];
  handlers: Record<string, HandlerSpan>;
  settings: Profile['settings'];
}

const isSlot = (s: string | null | undefined): s is SlotName => !!s && (SLOT_NAMES as readonly string[]).includes(s);

/* ---------- source slicing ---------- */

function tidyGap(gap: string): string { return gap.replace(/^[\s;]+/, '').trim(); }
function leadingComment(gap: string): string {
  const lines = gap.split('\n').map(l => l.trim()).filter(l => l.startsWith('--') && !l.startsWith('--['));
  return lines.length ? lines[0]!.replace(/^-+\s*/, '').trim() : '';
}
function lineStart(src: string, pos: number): number {
  let k = pos;
  while (k > 0 && (src[k - 1] === ' ' || src[k - 1] === '\t')) k--;
  return k;
}
function stmtSrc(ctx: Ctx, st: Span): string {
  return ctx.src.slice(lineStart(ctx.src, ctx.toks[st.a]!.s), ctx.toks[st.b - 1]!.e);
}
const withComment = (gap: string, code: string): string => (gap.startsWith('--') ? gap + '\n' : '') + code;

/* ---------- gear set tables ---------- */

function tableEntries(ctx: Ctx, i: number): Entry[] {
  const T = ctx.toks, c = closeIdx(T, i);
  const ranges = splitTopLevel(T, i + 1, c, t => t.t === 'op' && (t.v === ',' || t.v === ';')).filter(r => r[1] > r[0]);
  return ranges.map(([x, y]) => {
    let key: Key | null = null, a = x;
    if (T[x]!.t === 'name' && T[x + 1] && T[x + 1]!.t === 'op' && T[x + 1]!.v === '=') { key = { src: T[x]!.v, str: T[x]!.v }; a = x + 2; }
    else if (T[x]!.t === 'op' && T[x]!.v === '[') {
      const cb = closeIdx(T, x);
      if (T[cb + 1] && T[cb + 1]!.v === '=') {
        const single = cb - x === 2 ? T[x + 1]! : null;
        key = { src: ctx.src.slice(T[x]!.s, T[cb]!.e), str: single && (single.t === 'str' || single.t === 'num') ? single.v : null };
        a = cb + 2;
      }
    }
    return { key, a, b: y };
  });
}

type EntryKind = { k: 'str'; v: string } | { k: 'num'; v: number } | { k: 'table' } | { k: 'raw' };
function entryKind(ctx: Ctx, e: Entry): EntryKind {
  const T = ctx.toks;
  if (e.b - e.a === 1 && T[e.a]!.t === 'str') return { k: 'str', v: T[e.a]!.v };
  if (e.b - e.a === 1 && T[e.a]!.t === 'num' && !T[e.a]!.v.startsWith('0x')) return { k: 'num', v: Number(T[e.a]!.v) };
  if (T[e.a]!.t === 'op' && T[e.a]!.v === '{' && closeIdx(T, e.a) === e.b - 1) return { k: 'table' };
  return { k: 'raw' };
}
const entryRaw = (ctx: Ctx, e: Entry): string => ctx.src.slice(ctx.toks[e.a]!.s, ctx.toks[e.b - 1]!.e);

function parseItem(ctx: Ctx, e: Entry): ItemEntry {
  const kind = entryKind(ctx, e);
  if (kind.k === 'str') return newItem(kind.v);
  if (kind.k === 'table') {
    const it = newItem('');
    let named = false, ok = true;
    for (const en of tableEntries(ctx, e.a)) {
      const ks = en.key?.str, vv = entryKind(ctx, en);
      if (ks === 'Name' && vv.k === 'str') { it.name = vv.v; named = true; }
      else if (ks === 'AugPath' && vv.k === 'str' && /^[ABCD]$/.test(vv.v)) it.augPath = vv.v as ItemEntry['augPath'];
      else if (ks === 'AugRank' && vv.k === 'num') it.augRank = vv.v;
      else if (ks === 'AugTrial' && vv.k === 'num') it.augTrial = vv.v;
      else if (ks === 'Bag' && vv.k === 'str') it.bag = vv.v;
      else if (ks === 'Augment') {
        if (vv.k === 'str') it.augments.push(vv.v);
        else if (vv.k === 'table') tableEntries(ctx, en.a).forEach(x => { const xv = entryKind(ctx, x); if (xv.k === 'str') it.augments.push(xv.v); else ok = false; });
        else ok = false;
      } else if (en.key && /^[A-Za-z_]\w*$/.test(en.key.src)) it.extras.push({ k: en.key.src, raw: entryRaw(ctx, en) });
      else ok = false;
    }
    if (named && ok) return it;
  }
  const it = newItem('');
  it.raw = entryRaw(ctx, e);
  ctx.notes.push({ line: ctx.toks[e.a]!.line, kind: 'item', text: 'A gear entry uses Lua that cannot be shown as a plain item. It is kept as written: ' + shorten(it.raw) });
  return it;
}

function addSet(ctx: Ctx, name: string, entries: Entry[]): void {
  const set = newSet(name);
  for (const e of entries) {
    const ks = e.key?.str;
    if (isSlot(ks)) set.slots[ks] = parseItem(ctx, e);
    else {
      set.extras.push({ k: e.key ? e.key.src : null, raw: entryRaw(ctx, e) });
      ctx.notes.push({ line: ctx.toks[e.a]!.line, kind: 'setkey', text: `Gear set "${name}" has an entry (${e.key ? e.key.src : 'unnamed'}) that is not an equipment slot. It is kept as written.` });
    }
  }
  if (ctx.sets.some(s => s.name === name)) {
    ctx.notes.push({ line: ctx.toks[entries.length ? entries[0]!.a : 0]!.line, kind: 'dup', text: `The set "${name}" is defined more than once. The later definition replaces the earlier one.` });
  }
  ctx.sets = ctx.sets.filter(s => s.name !== name);
  ctx.sets.push(set);
}

function buildSets(ctx: Ctx, ti: number, prefix: string): void {
  const entries = tableEntries(ctx, ti);
  const hasSlot = entries.some(e => isSlot(e.key?.str));
  if (prefix && (hasSlot || entries.length === 0)) { addSet(ctx, prefix, entries); return; }
  for (const e of entries) {
    const kind = entryKind(ctx, e);
    if (e.key && e.key.str != null && kind.k === 'table') { buildSets(ctx, e.a, prefix ? prefix + '.' + e.key.str : e.key.str); continue; }
    if (!e.key) continue;
    const path = prefix ? prefix.split('.').map(s => (isIdent(s) ? '.' + s : '[' + luaStr(s) + ']')).join('') : '';
    const keyStr = e.key.str ?? '';
    const keySrc = isIdent(keyStr) ? '.' + keyStr : '[' + luaStr(keyStr) + ']';
    ctx.custom.push(ctx.setsVar + path + keySrc + ' = ' + entryRaw(ctx, e) + ';');
    ctx.notes.push({ line: ctx.toks[e.a]!.line, kind: 'setexpr', text: `The set "${keyStr || '?'}" is built with Lua code, so it is kept as custom Lua instead of a visual set.` });
  }
}

/* ---------- rule bodies ---------- */

function parseSetRef(ctx: Ctx, a: number, b: number): string | null {
  const T = ctx.toks;
  if (b - a === 1 && T[a]!.t === 'str') return T[a]!.v;
  if (T[a] && T[a]!.t === 'name' && T[a]!.v === ctx.setsVar) {
    const segs: string[] = [];
    let i = a + 1;
    while (i < b) {
      if (T[i]!.v === '.' && T[i + 1] && T[i + 1]!.t === 'name') { segs.push(T[i + 1]!.v); i += 2; }
      else if (T[i]!.v === '[' && T[i + 1] && T[i + 1]!.t === 'str' && T[i + 2] && T[i + 2]!.v === ']') { segs.push(T[i + 1]!.v); i += 3; }
      else return null;
    }
    return segs.length ? segs.join('.') : null;
  }
  return null;
}

function parseSimpleAction(ctx: Ctx, st: Span): RuleAction | null {
  const T = ctx.toks;
  const a = st.a;
  let e = st.b;
  if (T[e - 1]!.v === ';') e--;
  const v = (i: number): string | undefined => T[i]?.v;
  if (v(a) === 'gFunc' && v(a + 1) === '.' && v(a + 3) === '(' && v(e - 1) === ')' && closeIdx(T, a + 3) === e - 1) {
    const fn = v(a + 2);
    if (fn === 'EquipSet') { const name = parseSetRef(ctx, a + 4, e - 1); if (name) return { type: 'equipSet', setId: '', setName: name }; }
    if (fn === 'Equip' && e - a === 8 && T[a + 4]!.t === 'str' && v(a + 5) === ',' && T[a + 6]!.t === 'str' && isSlot(T[a + 4]!.v)) return { type: 'equipItem', slot: T[a + 4]!.v as SlotName, item: T[a + 6]!.v };
    if (fn === 'Message' && e - a === 6 && T[a + 4]!.t === 'str') return { type: 'message', text: T[a + 4]!.v };
  }
  return null;
}

function parseActions(ctx: Ctx, a: number, b: number): RuleAction[] {
  const T = ctx.toks, out: RuleAction[] = [];
  let prevEnd = a > 0 ? T[a - 1]!.e : 0;
  for (const st of splitStatements(T, a, b)) {
    const gap = tidyGap(ctx.src.slice(prevEnd, T[st.a]!.s));
    prevEnd = T[st.b - 1]!.e;
    const act = parseSimpleAction(ctx, st);
    if (act) { out.push(act); continue; }
    const code = dedent(withComment(gap, stmtSrc(ctx, st)));
    out.push({ type: 'rawLua', code });
    ctx.notes.push({ line: T[st.a]!.line, kind: 'action', text: 'Custom Lua inside a rule is kept as written: ' + shorten(code) });
  }
  return out;
}

interface Clause { condA: number | null; condB: number | null; bodyA: number; bodyB: number }

/** Splits an if / elseif / else statement into its clauses. */
function parseIf(ctx: Ctx, i: number): Clause[] {
  const T = ctx.toks, endIdx = matchBlock(T, i);
  const clauses: Clause[] = [];
  let depth = 0, k = i + 1, cur: Clause | null = null, condStart = i + 1;
  while (k < endIdx) {
    const t = T[k]!;
    if (t.t === 'kw') {
      if (t.v === 'function' || t.v === 'if' || t.v === 'do' || t.v === 'repeat') depth++;
      else if (t.v === 'end' || t.v === 'until') depth--;
      else if (depth === 0 && t.v === 'then' && cur === null) cur = { condA: condStart, condB: k, bodyA: k + 1, bodyB: -1 };
      else if (depth === 0 && (t.v === 'elseif' || t.v === 'else')) {
        if (cur) { cur.bodyB = k; clauses.push(cur); }
        if (t.v === 'elseif') { condStart = k + 1; cur = null; }
        else cur = { condA: null, condB: null, bodyA: k + 1, bodyB: -1 };
      }
    }
    k++;
  }
  if (cur) { cur.bodyB = endIdx; clauses.push(cur); }
  return clauses;
}

/* ---------- conditions ---------- */

const CMP = new Set(['==', '~=', '<', '<=', '>', '>=']);
const aliasSrc = (ctx: Ctx, name: string): keyof Profile['names'] | undefined =>
  (Object.keys(ctx.names) as (keyof Profile['names'])[]).find(k => ctx.names[k] === name);

function matchLeaf(ctx: Ctx, a: number, b: number): Condition | null {
  const tk = ctx.toks.slice(a, b), n = tk.length;
  const L = (i: number, v: string): boolean => tk[i]?.v === v;
  if (n === 5 && tk[0]!.t === 'name' && L(1, '.') && tk[2]!.t === 'name' && CMP.has(tk[3]!.v)) {
    const s = aliasSrc(ctx, tk[0]!.v);
    const kind: CondKind | undefined = s ? FIELD_KIND[s + '.' + tk[2]!.v] : undefined;
    const spec = kind ? CONDS[kind] : undefined, lit = tk[4]!;
    if (kind && spec) {
      if (spec.type === 'num' && lit.t === 'num') return { kind, op: tk[3]!.v, value: Number(lit.v) };
      if ((spec.type === 'enum' || spec.type === 'text' || spec.type === 'name') && lit.t === 'str' && (tk[3]!.v === '==' || tk[3]!.v === '~=')) return { kind, op: tk[3]!.v, value: lit.v };
    }
    if (s === 'player' && tk[2]!.v === 'IsMoving' && lit.t === 'kw' && (lit.v === 'true' || lit.v === 'false') && (tk[3]!.v === '==' || tk[3]!.v === '~=')) {
      return { kind: 'player.moving', op: (lit.v === 'true') === (tk[3]!.v === '==') ? 'true' : 'false', value: 'true' };
    }
  }
  if (n === 3 && tk[0]!.t === 'name' && L(1, '.') && L(2, 'IsMoving') && aliasSrc(ctx, tk[0]!.v) === 'player') return { kind: 'player.moving', op: 'true', value: 'true' };
  if (n === 4 && L(0, 'not') && tk[1]!.t === 'name' && L(2, '.') && L(3, 'IsMoving') && aliasSrc(ctx, tk[1]!.v) === 'player') return { kind: 'player.moving', op: 'false', value: 'true' };
  if (n === 8 && L(0, 'gData') && L(2, 'GetBuffCount') && L(3, '(') && tk[4]!.t === 'str' && L(5, ')') && CMP.has(tk[6]!.v) && tk[7]!.t === 'num') {
    const op = tk[6]!.v, num = Number(tk[7]!.v);
    if ((op === '>' && num === 0) || (op === '>=' && num === 1) || (op === '~=' && num === 0)) return { kind: 'buff', op: 'active', value: tk[4]!.v };
    if ((op === '==' && num === 0) || (op === '<' && num === 1)) return { kind: 'buff', op: 'inactive', value: tk[4]!.v };
  }
  if (n === 7 && L(0, 'gData') && L(2, 'GetPet') && L(3, '(') && L(4, ')') && (L(5, '==') || L(5, '~=')) && L(6, 'nil')) return { kind: 'pet', op: L(5, '~=') ? 'has' : 'none', value: '' };
  if (n >= 10 && L(0, 'string') && L(1, '.') && (L(2, 'find') || L(2, 'match')) && L(3, '(') && tk[4]!.t === 'name' && aliasSrc(ctx, tk[4]!.v) === 'action' && L(5, '.') && L(6, 'Name') && L(7, ',') && tk[8]!.t === 'str') {
    let i = 9, plain = false;
    if (L(i, ',') && tk[i + 1]?.v === '1' && L(i + 2, ',') && L(i + 3, 'true')) { plain = true; i += 4; }
    if (L(i, ')')) {
      const rest = tk.slice(i + 1).map(t => t.v).join(' ');
      if ((rest === '' || rest === '~= nil') && (plain || !/[\^$()%.[\]*+\-?]/.test(tk[8]!.v))) return { kind: 'action.name', op: 'contains', value: tk[8]!.v };
    }
  }
  return null;
}

function condTree(ctx: Ctx, a: number, b: number): ConditionGroup {
  const T = ctx.toks;
  const strip = (x: number, y: number): [number, number] => {
    while (y - x >= 2 && T[x]!.t === 'op' && T[x]!.v === '(' && closeIdx(T, x) === y - 1) { x++; y--; }
    return [x, y];
  };
  const parse = (x0: number, y0: number): Condition | ConditionGroup => {
    const [x, y] = strip(x0, y0);
    let parts = splitTopLevel(T, x, y, t => t.t === 'kw' && t.v === 'or');
    if (parts.length > 1) return { op: 'OR', children: parts.map(p => parse(p[0], p[1])) };
    parts = splitTopLevel(T, x, y, t => t.t === 'kw' && t.v === 'and');
    if (parts.length > 1) return { op: 'AND', children: parts.map(p => parse(p[0], p[1])) };
    const leaf = matchLeaf(ctx, x, y);
    if (leaf) return leaf;
    const expr = ctx.src.slice(T[x]!.s, T[y - 1]!.e);
    ctx.notes.push({ line: T[x]!.line, kind: 'cond', text: `The check "${shorten(expr)}" cannot be built from the visual options, so it is kept as a custom Lua check.` });
    return { kind: 'raw', op: '', value: '', expr };
  };
  const node = parse(a, b);
  return 'children' in node ? node : { op: 'AND', children: [node] };
}

/* ---------- whole file ---------- */

export interface ImportOptions { name?: string; job?: string; fileName?: string }

export function importLua(source: string, opts: ImportOptions = {}): Profile {
  const src = source.replace(/^﻿/, '');
  const T = lex(src);
  const ctx: Ctx = {
    src, toks: T, sets: [], custom: [], notes: [], setsVar: 'sets',
    names: { player: 'player', action: 'action', environment: 'environment' },
    handlers: {}, settings: { allowAddSet: true, addSetBackup: true },
  };

  const m = /profile\s*\.\s*Sets\s*=\s*([A-Za-z_]\w*)/.exec(src);
  if (m) ctx.setsVar = m[1]!;
  for (let i = 0; i + 8 < T.length; i++) {
    if (T[i]!.v === 'local' && T[i + 1]!.t === 'name' && T[i + 2]!.v === '=' && T[i + 3]!.v === 'gData' && T[i + 4]!.v === '.' && T[i + 6]!.v === '(' && T[i + 7]!.v === ')') {
      const f = T[i + 5]!.v, nm = T[i + 1]!.v;
      if (f === 'GetPlayer' && ctx.names.player === 'player') ctx.names.player = nm;
      if (f === 'GetAction' && ctx.names.action === 'action') ctx.names.action = nm;
      if (f === 'GetEnvironment' && ctx.names.environment === 'environment') ctx.names.environment = nm;
    }
  }

  // Top-level statements: sets, handlers, or other code to keep.
  let prevEnd = 0;
  for (const st of splitStatements(T, 0, T.length)) {
    const a = st.a;
    let e = st.b;
    if (T[e - 1]!.v === ';') e--;
    const v = (i: number): string | undefined => T[i]?.v;
    const gap = tidyGap(src.slice(prevEnd, T[a]!.s));
    prevEnd = T[st.b - 1]!.e;
    let used = false;
    if (v(a) === 'local' && v(a + 1) === 'profile' && v(a + 2) === '=' && v(a + 3) === '{' && closeIdx(T, a + 3) === e - 1) used = true;
    else if (v(a) === 'return' && v(a + 1) === 'profile' && e === a + 2) used = true;
    else if (v(a) === 'profile' && v(a + 1) === '.' && v(a + 2) === 'Packer' && v(a + 3) === '=' && v(a + 4) === '{' && v(a + 5) === '}' && e === a + 6) used = true;
    else if (v(a) === 'profile' && v(a + 1) === '.' && v(a + 2) === 'Sets' && v(a + 3) === '=') {
      if (e === a + 5 && T[a + 4]!.t === 'name') used = true;
      else if (v(a + 4) === '{' && closeIdx(T, a + 4) === e - 1) { buildSets(ctx, a + 4, ''); used = true; }
    } else if (v(a) === 'local' && v(a + 1) === ctx.setsVar && v(a + 2) === '=' && v(a + 3) === '{' && closeIdx(T, a + 3) === e - 1) { buildSets(ctx, a + 3, ''); used = true; }
    else if (v(a) === ctx.setsVar && v(a + 1) === '=' && v(a + 2) === '{' && closeIdx(T, a + 2) === e - 1) { buildSets(ctx, a + 2, ''); used = true; }
    else if (v(a) === ctx.setsVar && (v(a + 1) === '.' || v(a + 1) === '[')) {
      const segs: string[] = [];
      let i = a + 1;
      for (;;) {
        if (v(i) === '.' && T[i + 1]?.t === 'name') { segs.push(T[i + 1]!.v); i += 2; }
        else if (v(i) === '[' && T[i + 1]?.t === 'str' && v(i + 2) === ']') { segs.push(T[i + 1]!.v); i += 3; }
        else break;
      }
      if (segs.length && v(i) === '=' && v(i + 1) === '{' && closeIdx(T, i + 1) === e - 1) { buildSets(ctx, i + 1, segs.join('.')); used = true; }
    }
    if (!used) {
      let fnIdx = -1, name: string | undefined, paren = -1;
      if (v(a) === 'profile' && v(a + 1) === '.' && ALL_HANDLER_NAMES.has(v(a + 2) ?? '') && v(a + 3) === '=' && v(a + 4) === 'function') { fnIdx = a + 4; name = v(a + 2); paren = fnIdx + 1; }
      if (v(a) === 'function' && v(a + 1) === 'profile' && v(a + 2) === '.' && ALL_HANDLER_NAMES.has(v(a + 3) ?? '')) { fnIdx = a; name = v(a + 3); paren = a + 4; }
      if (fnIdx >= 0 && name && v(paren) === '(') {
        const pc = closeIdx(T, paren), endIdx = matchBlock(T, fnIdx);
        if (!ctx.handlers[name]) { ctx.handlers[name] = { a: pc + 1, b: endIdx, line: T[a]!.line }; used = true; }
        else ctx.notes.push({ line: T[a]!.line, kind: 'dup', text: `The handler ${name} is defined twice. The second one is kept as custom Lua.` });
      }
    }
    if (!used) ctx.custom.push(withComment(gap, stmtSrc(ctx, st)));
  }

  // OnLoad, OnUnload and HandleCommand are kept as Lua text (with AllowAddSet lifted into settings).
  const raw = {
    custom: ctx.custom.join('\n\n').replace(/^-- Custom Lua kept from the imported profile\n?/gm, '').trim(),
    OnLoad: '', OnUnload: '', HandleCommand: '',
  };
  for (const h of RAW_HANDLERS) {
    const hd = ctx.handlers[h];
    if (!hd) continue;
    const chunks: string[] = [];
    let pe = hd.a > 0 ? T[hd.a - 1]!.e : 0;
    for (const st of splitStatements(T, hd.a, hd.b)) {
      const gap = tidyGap(src.slice(pe, T[st.a]!.s));
      pe = T[st.b - 1]!.e;
      let e = st.b;
      if (T[e - 1]!.v === ';') e--;
      const v = (i: number): string | undefined => T[i]?.v;
      if (h === 'OnLoad' && v(st.a) === 'gSettings' && v(st.a + 1) === '.' && v(st.a + 3) === '=' && e - st.a === 5 && (v(st.a + 4) === 'true' || v(st.a + 4) === 'false')) {
        if (v(st.a + 2) === 'AllowAddSet') { ctx.settings.allowAddSet = v(st.a + 4) === 'true'; continue; }
        if (v(st.a + 2) === 'AddSetBackup') { ctx.settings.addSetBackup = v(st.a + 4) === 'true'; continue; }
      }
      chunks.push(withComment(gap, stmtSrc(ctx, st)));
    }
    raw[h] = chunks.join('\n');
    if (raw[h].trim() && h === 'HandleCommand') ctx.notes.push({ line: hd.line, kind: 'cmd', text: 'HandleCommand is kept as custom Lua. Commands added in Gear Studio are appended after it.' });
  }

  // The remaining handlers become rules.
  const rules: Rule[] = [];
  for (const h of GEN_ORDER) {
    const hd = ctx.handlers[h];
    if (!hd) continue;
    let pending: { name: string; acts: RuleAction[] } | null = null;
    const flush = (): void => {
      if (!pending) return;
      const r = newRule(h as HandlerId);
      r.name = pending.name; r.actions = pending.acts;
      rules.push(r); pending = null;
    };
    let pe = hd.a > 0 ? T[hd.a - 1]!.e : 0;
    for (const st of splitStatements(T, hd.a, hd.b)) {
      const gap = tidyGap(src.slice(pe, T[st.a]!.s));
      pe = T[st.b - 1]!.e;
      const comment = leadingComment(gap);
      let e = st.b;
      if (T[e - 1]!.v === ';') e--;
      const v = (i: number): string | undefined => T[i]?.v;
      // `local player = gData.GetPlayer();` is regenerated on export, so it is not a rule.
      if (v(st.a) === 'local' && T[st.a + 1]?.t === 'name' && v(st.a + 2) === '=' && v(st.a + 3) === 'gData' && v(st.a + 4) === '.' &&
          ['GetPlayer', 'GetAction', 'GetEnvironment'].includes(v(st.a + 5) ?? '') && e - st.a === 8) continue;
      if (T[st.a]!.t === 'kw' && T[st.a]!.v === 'if') {
        flush();
        parseIf(ctx, st.a).forEach((cl, idx) => {
          const r: VisualRule = newRule(h as HandlerId);
          r.name = idx === 0 ? comment : '';
          r.exclusive = idx > 0;
          r.when = cl.condA === null || cl.condB === null ? emptyGroup('AND') : condTree(ctx, cl.condA, cl.condB);
          r.actions = parseActions(ctx, cl.bodyA, cl.bodyB);
          rules.push(r);
        });
        continue;
      }
      const act = parseSimpleAction(ctx, st);
      if (act) {
        if (!pending) pending = { name: comment, acts: [] };
        (pending as { name: string; acts: RuleAction[] }).acts.push(act);
        continue;
      }
      flush();
      const code = dedent(withComment(gap, stmtSrc(ctx, st)));
      rules.push(newRawRule(h as HandlerId, code));
      ctx.notes.push({ line: T[st.a]!.line, kind: 'raw', handler: h, text: `A statement in ${h} is not an if-rule or a simple equip call, so it is kept as a custom Lua block: ${shorten(code)}` });
    }
    flush();
  }

  const profile = newProfile(opts.name || opts.job || 'Imported', opts.job || '');
  profile.sets = ctx.sets;
  rules.forEach(r => {
    if (r.kind !== 'rule') return;
    r.actions.forEach(a => {
      if (a.type === 'equipSet' && a.setName) { const s = findSet(profile, a.setName); if (s) a.setId = s.id; }
    });
  });
  profile.rules = rules;
  profile.names = ctx.names;
  profile.settings = ctx.settings;
  profile.raw = raw;
  profile.importReport = {
    at: Date.now(), fileName: opts.fileName ?? '',
    sets: ctx.sets.length,
    rules: rules.filter(r => r.kind === 'rule').length,
    rawBlocks: rules.filter(r => r.kind === 'raw').length,
    customLines: raw.custom.split('\n').filter(l => l.trim()).length,
    handlers: Object.keys(ctx.handlers),
    notes: ctx.notes.slice(0, 200),
    noteCount: ctx.notes.length,
  };
  return profile;
}
