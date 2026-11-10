/* Lua generation: Profile model -> LuAshitacast profile text. Never reads Lua. */
import type { Command, Condition, ConditionGroup, GearSet, HandlerId, ItemEntry, Profile, RuleAction } from './types';
import { SLOT_NAMES, isGroup } from './types';
import { CONDS, GEN_ORDER } from './reference';
import { findSet, findVar } from './model';
import { dedent, isIdent, keyText, luaNum, luaStr, setPath } from './luatext';

/* ---------- gear sets ---------- */

export function itemExpr(it: ItemEntry | undefined): string | null {
  if (!it) return null;
  if (it.raw) return it.raw;
  const name = it.name.trim();
  if (!name) return null;
  const aug = it.augments.map(a => a.trim()).filter(Boolean);
  const plain = !it.augPath && !aug.length && !it.extras.length && it.augRank == null && it.augTrial == null && !it.bag;
  if (plain) return luaStr(name);
  const parts = ['Name = ' + luaStr(name)];
  if (it.augPath) parts.push('AugPath = ' + luaStr(it.augPath));
  if (it.augRank != null) parts.push('AugRank = ' + luaNum(it.augRank));
  if (it.augTrial != null) parts.push('AugTrial = ' + luaNum(it.augTrial));
  if (aug.length === 1) parts.push('Augment = ' + luaStr(aug[0]));
  else if (aug.length > 1) parts.push('Augment = { ' + aug.map(luaStr).join(', ') + ' }');
  if (it.bag) parts.push('Bag = ' + luaStr(it.bag));
  it.extras.forEach(e => parts.push(e.k + ' = ' + e.raw));
  return '{ ' + parts.join(', ') + ' }';
}

function setBodyLines(set: GearSet | null, pad: string, kids: string[] | null): string[] {
  const lines: string[] = [];
  if (set?.note) set.note.split('\n').forEach(n => lines.push(pad + '-- ' + n));
  if (set) {
    for (const slot of SLOT_NAMES) {
      const e = itemExpr(set.slots[slot]);
      if (e) lines.push(pad + slot + ' = ' + e + ',');
    }
    set.extras.forEach(x => lines.push(pad + (x.k ? x.k + ' = ' : '') + x.raw + ','));
  }
  if (kids) lines.push(...kids);
  return lines;
}

interface SetNode { kids: Map<string, SetNode>; set: GearSet | null }

/** Dotted set names (Midcast.Cure) become nested tables, the usual LuAshitacast layout. */
function emitSetTree(profile: Profile): string[] {
  const root: SetNode = { kids: new Map(), set: null };
  for (const s of profile.sets) {
    const segs = s.name.split('.').filter(Boolean);
    if (!segs.length) continue;
    let n = root;
    for (const seg of segs) {
      if (!n.kids.has(seg)) n.kids.set(seg, { kids: new Map(), set: null });
      n = n.kids.get(seg)!;
    }
    n.set = s;
  }
  const emit = (node: SetNode, depth: number): string[] => {
    const pad = '    '.repeat(depth + 1);
    const out: string[] = [];
    node.kids.forEach((child, key) => {
      const kidLines = child.kids.size ? emit(child, depth + 1) : null;
      const body = setBodyLines(child.set, '    '.repeat(depth + 2), kidLines);
      if (!body.length) out.push(pad + keyText(key) + ' = {},');
      else { out.push(pad + keyText(key) + ' = {', ...body, pad + '},'); }
    });
    return out;
  };
  return emit(root, 0);
}

/* ---------- conditions ---------- */

type Names = Profile['names'];

function condExpr(c: Condition, profile: Profile, names: Names): string {
  const spec = CONDS[c.kind];
  if (!spec) return 'false';
  const nm = (src: keyof Names): string => names[src] || src;
  const field = spec.src ? nm(spec.src) + '.' + spec.field : '';
  switch (spec.type) {
    case 'enum': case 'text':
      return field + ' ' + (c.op === '~=' ? '~=' : '==') + ' ' + luaStr(c.value);
    case 'num':
      return field + ' ' + (['<', '<=', '>', '>=', '==', '~='].includes(c.op) ? c.op : '>') + ' ' + luaNum(c.value);
    case 'bool':
      return (c.op === 'false' ? 'not ' : '') + field;
    case 'name': {
      const ref = nm('action') + '.Name';
      const v = String(c.value ?? '');
      if (c.op === 'contains') return 'string.find(' + ref + ', ' + luaStr(v) + ', 1, true) ~= nil';
      if (c.op === 'oneof') {
        const list = v.split(',').map(x => x.trim()).filter(Boolean);
        if (!list.length) return 'false';
        const parts = list.map(x => ref + ' == ' + luaStr(x));
        return parts.length === 1 ? parts[0]! : '(' + parts.join(' or ') + ')';
      }
      return ref + ' ' + (c.op === '~=' ? '~=' : '==') + ' ' + luaStr(v);
    }
    case 'buff':
      return 'gData.GetBuffCount(' + luaStr(c.value) + ') ' + (c.op === 'inactive' ? '== 0' : '> 0');
    case 'pet':
      return 'gData.GetPet() ' + (c.op === 'none' ? '==' : '~=') + ' nil';
    case 'var': {
      const v = findVar(profile, c.varId);
      if (!v || !isIdent(v.name)) return 'false';
      return v.name + ' ' + (c.op === '~=' ? '~=' : '==') + ' ' + luaStr(c.value);
    }
    case 'raw':
      return '(' + ((c.expr ?? '').trim() || 'true') + ')';
  }
}

export function groupExpr(g: ConditionGroup, profile: Profile, names: Names, top: boolean): string | null {
  const parts = g.children.map(ch => (isGroup(ch) ? groupExpr(ch, profile, names, false) : condExpr(ch, profile, names))).filter((x): x is string => !!x);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0]!;
  const joined = parts.join(g.op === 'OR' ? ' or ' : ' and ');
  return top ? joined : '(' + joined + ')';
}

/* ---------- actions and handlers ---------- */

function actionLines(a: RuleAction, profile: Profile): string[] {
  switch (a.type) {
    case 'equipSet': {
      const s = findSet(profile, a.setId) ?? (a.setName ? { name: a.setName } : null);
      return s ? ['gFunc.EquipSet(' + setPath(s.name) + ');'] : ['-- (gear set not found, nothing equipped)'];
    }
    case 'equipSetVar': {
      const v = findVar(profile, a.varId);
      if (!v || !isIdent(v.name)) return ['-- (variable not found, nothing equipped)'];
      return ['gFunc.EquipSet(' + (a.prefix ? luaStr(a.prefix) + ' .. ' : '') + v.name + ');'];
    }
    case 'equipItem':
      return a.item.trim() ? ['gFunc.Equip(' + luaStr(a.slot) + ', ' + luaStr(a.item) + ');'] : ['-- (no item chosen)'];
    case 'message':
      return ['gFunc.Message(' + luaStr(a.text) + ');'];
    case 'setVar': {
      const v = findVar(profile, a.varId);
      return v && isIdent(v.name) ? [v.name + ' = ' + luaStr(a.value) + ';'] : ['-- (variable not found)'];
    }
    case 'rawLua':
      return a.code.trim() ? dedent(a.code).split('\n') : [];
  }
}

function handlerBody(profile: Profile, h: HandlerId): string[] {
  const L: string[] = [];
  let chain = false;
  for (const r of profile.rules.filter(x => x.handler === h)) {
    if (!r.enabled) {
      L.push('-- Disabled in Gear Studio: ' + (r.name || (r.kind === 'raw' ? 'custom Lua block' : 'unnamed rule')).replace(/\s+/g, ' '));
      continue;
    }
    if (r.kind === 'raw') {
      if (chain) { L.push('end'); chain = false; }
      const lines = dedent(r.code).split('\n');
      if (!(lines.length === 1 && !lines[0])) L.push(...lines);
      continue;
    }
    const expr = groupExpr(r.when, profile, profile.names, true);
    const body = r.actions.flatMap(a => actionLines(a, profile)).map(l => '    ' + l);
    const title = r.name.replace(/\s+/g, ' ').trim();
    if (r.exclusive && chain) {
      if (title) L.push('    -- ' + title);
      if (expr) L.push('elseif (' + expr + ') then', ...body);
      else { L.push('else', ...body, 'end'); chain = false; }
      continue;
    }
    if (chain) { L.push('end'); chain = false; }
    if (title) L.push('-- ' + title);
    if (expr) { L.push('if (' + expr + ') then', ...body); chain = true; }
    else L.push(...body.map(l => l.slice(4)));
  }
  if (chain) L.push('end');
  return L;
}

/** Declares `local player = gData.GetPlayer();` and friends, but only when the handler uses them. */
function withLocals(profile: Profile, lines: string[]): string[] {
  const text = lines.join('\n');
  const decl: Record<keyof Names, string> = { player: 'gData.GetPlayer()', action: 'gData.GetAction()', environment: 'gData.GetEnvironment()' };
  const out: string[] = [];
  (Object.keys(decl) as (keyof Names)[]).forEach(k => {
    const alias = profile.names[k] || k;
    if (new RegExp('(^|[^\\w.])' + alias.replace(/[^\w]/g, '') + '\\b').test(text)) out.push('local ' + alias + ' = ' + decl[k] + ';');
  });
  return out.length ? [...out, ...(lines.length ? [''] : []), ...lines] : lines;
}

function commandLines(profile: Profile): string[] {
  const out: string[] = [];
  if (profile.raw.HandleCommand.trim()) out.push(...dedent(profile.raw.HandleCommand).split('\n'));
  const cmds = profile.commands.filter(c => c.name.trim());
  if (!cmds.length) return out;
  out.push('if (#args > 0) then', '    local cmd = string.lower(args[1]);');
  cmds.forEach((c: Command, i) => {
    out.push('    ' + (i === 0 ? 'if' : 'elseif') + ' (cmd == ' + luaStr(c.name.trim().toLowerCase()) + ') then');
    const body: string[] = [];
    const v = 'varId' in c ? findVar(profile, c.varId) : null;
    if (c.kind === 'cycle' && v && isIdent(v.name)) {
      body.push(v.name + ' = CycleValue(' + v.name + 'Options, ' + v.name + ');', "gFunc.Message('" + v.name + ": ' .. " + v.name + ');');
    } else if (c.kind === 'set' && v && isIdent(v.name)) {
      body.push(v.name + ' = ' + luaStr(c.value) + ';', "gFunc.Message('" + v.name + ": ' .. " + v.name + ');');
    } else if (c.kind === 'lock') {
      const s = findSet(profile, c.setId);
      body.push(s ? 'gFunc.LockSet(' + setPath(s.name) + ', ' + luaNum(c.seconds || 30) + ');' : '-- (gear set not found)');
    } else if (c.kind === 'raw') {
      body.push(...(c.code.trim() ? dedent(c.code).split('\n') : ['-- (empty)']));
    } else body.push('-- (command is not fully set up)');
    body.forEach(l => out.push('        ' + l));
  });
  out.push('    end', 'end');
  return out;
}

/* ---------- whole profile ---------- */

export function generateLua(profile: Profile): string {
  const L: string[] = [];
  const w = (s: string): void => { L.push(s); };
  const job = profile.job || profile.name;
  w('-- Generated by Ashita Gear Studio. Profile: ' + profile.name);
  w('-- Save as ' + (job || 'Job') + '.lua in ashita/config/addons/luashitacast/<CharName>_<CharId>/');
  w('');
  w('local profile = {};');
  w('');
  w('local sets = {');
  emitSetTree(profile).forEach(w);
  w('};');
  w('profile.Sets = sets;');
  if (!/profile\s*\.\s*Packer/.test(profile.raw.custom)) w('profile.Packer = {};');
  w('');

  const vars = profile.variables.filter(v => isIdent(v.name));
  if (vars.length) {
    w('-- Variables (change them in game with /lac fwd <command>)');
    vars.forEach(v => {
      w('local ' + v.name + ' = ' + luaStr(v.value || v.options[0] || '') + ';');
      if (profile.commands.some(c => c.kind === 'cycle' && c.varId === v.id)) w('local ' + v.name + 'Options = { ' + v.options.map(luaStr).join(', ') + ' };');
    });
    w('');
  }
  if (profile.commands.some(c => c.kind === 'cycle')) {
    w('local function CycleValue(list, current)');
    w('    for i, value in ipairs(list) do');
    w('        if (value == current) then');
    w('            return list[(i % #list) + 1];');
    w('        end');
    w('    end');
    w('    return list[1];');
    w('end');
    w('');
  }
  if (profile.raw.custom.trim()) {
    w('-- Custom Lua kept from the imported profile');
    w(dedent(profile.raw.custom));
    w('');
  }

  const onLoad = ['gSettings.AllowAddSet = ' + (profile.settings.allowAddSet ? 'true' : 'false') + ';'];
  if (!profile.settings.addSetBackup) onLoad.push('gSettings.AddSetBackup = false;');
  if (profile.raw.OnLoad.trim()) onLoad.push(...dedent(profile.raw.OnLoad).split('\n'));
  w('profile.OnLoad = function()');
  onLoad.forEach(l => w(l ? '    ' + l : l));
  w('end');
  w('');
  w('profile.OnUnload = function()');
  if (profile.raw.OnUnload.trim()) dedent(profile.raw.OnUnload).split('\n').forEach(l => w(l ? '    ' + l : l));
  w('end');
  w('');
  w('profile.HandleCommand = function(args)');
  commandLines(profile).forEach(l => w(l ? '    ' + l : l));
  w('end');
  w('');

  for (const h of GEN_ORDER) {
    w('profile.' + h + ' = function()');
    withLocals(profile, handlerBody(profile, h)).forEach(l => w(l ? '    ' + l : l));
    w('end');
    w('');
  }
  w('return profile;');
  return L.join('\n') + '\n';
}
