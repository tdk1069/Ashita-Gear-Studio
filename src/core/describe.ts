/* Plain-English descriptions of rules, so people can check what a rule does without reading Lua. */
import type { Condition, ConditionGroup, Profile, Rule, RuleAction } from './types';
import { isGroup } from './types';
import { CONDS } from './reference';
import type { CondSpec } from './reference';
import { findSet, findVar } from './model';

function opWord(spec: CondSpec, op: string): string {
  return spec.ops.find(o => o[0] === op)?.[1] ?? op;
}

export function describeCond(c: Condition, profile: Profile): string {
  const spec = CONDS[c.kind];
  if (!spec) return 'an unknown check';
  const v = String(c.value ?? '');
  switch (spec.type) {
    case 'enum': case 'text': return `${spec.noun} ${opWord(spec, c.op)} ${v === '' ? '(blank)' : v}`;
    case 'num': return `${spec.noun} ${opWord(spec, c.op)} ${v}${spec.unit ?? ''}`;
    case 'bool': return opWord(spec, c.op);
    case 'name':
      if (c.op === 'contains') return `the action name contains "${v || '(blank)'}"`;
      if (c.op === 'oneof') return `the action is one of ${v || '(none)'}`;
      return `the action ${opWord(spec, c.op)} "${v || '(blank)'}"`;
    case 'buff': return `${v || '(no effect chosen)'} ${opWord(spec, c.op)}`;
    case 'pet': return opWord(spec, c.op);
    case 'var': { const va = findVar(profile, c.varId); return `${va ? va.name : '(missing variable)'} ${c.op === '~=' ? 'is not' : 'is'} ${v}`; }
    case 'raw': { const t = (c.expr ?? '').replace(/\s+/g, ' ').trim(); return `custom check <${t.length > 48 ? t.slice(0, 45) + '...' : t}>`; }
  }
}

export function describeGroup(g: ConditionGroup, profile: Profile, top = true): string {
  const parts = g.children.map(ch => (isGroup(ch) ? describeGroup(ch, profile, false) : describeCond(ch, profile))).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0]!;
  const j = parts.join(g.op === 'OR' ? ' or ' : ' and ');
  return top ? j : '(' + j + ')';
}

export function describeAction(a: RuleAction, profile: Profile): string {
  switch (a.type) {
    case 'equipSet': { const s = findSet(profile, a.setId) ?? (a.setName ? { name: a.setName } : null); return s ? `equip the "${s.name}" set` : 'equip a set (none chosen)'; }
    case 'equipSetVar': { const v = findVar(profile, a.varId); return `equip the set named "${a.prefix}" + ${v ? v.name : '(variable)'}`; }
    case 'equipItem': return `put ${a.item || '(no item)'} in ${a.slot}`;
    case 'message': return `show the message "${a.text}"`;
    case 'setVar': { const v = findVar(profile, a.varId); return `set ${v ? v.name : '(variable)'} to ${a.value}`; }
    case 'rawLua': return 'run custom Lua';
  }
}

export function describeRule(r: Rule, profile: Profile): string {
  if (r.kind === 'raw') return 'Runs your custom Lua code as written.';
  const cond = describeGroup(r.when, profile);
  const acts = r.actions.map(a => describeAction(a, profile)).join(', then ') || 'do nothing yet';
  if (cond) return `${r.exclusive ? 'Otherwise, if ' : 'If '}${cond}: ${acts}.`;
  return `${r.exclusive ? 'Otherwise: ' : 'Always: '}${acts}.`;
}

export function ruleTitle(r: Rule, profile: Profile): string {
  if (r.name) return r.name;
  if (r.kind === 'raw') return 'Custom Lua block';
  const cond = describeGroup(r.when, profile);
  const a0 = r.actions[0] ? describeAction(r.actions[0], profile) : 'no actions';
  return cond ? 'When ' + cond : 'Always ' + a0.replace(/^equip /, '');
}
