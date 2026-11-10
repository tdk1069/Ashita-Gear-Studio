/* Factories and lookups for the configuration model. */
import type {
  ActionType, Command, Condition, ConditionGroup, GearSet, HandlerId, ItemEntry, Profile, Project, RawRule, Rule, RuleAction, Variable, VisualRule,
} from './types';
import { CONDS } from './reference';
import type { CondKind } from './types';

let counter = 0;
export function uid(prefix = 'id'): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 7) + (counter++).toString(36);
}
export function clone<T>(o: T): T { return JSON.parse(JSON.stringify(o)) as T; }

export function emptyGroup(op: 'AND' | 'OR' = 'AND'): ConditionGroup { return { op, children: [] }; }

export function newSet(name = 'NewSet'): GearSet { return { id: uid('set'), name, note: '', slots: {}, extras: [] }; }
export function newItem(name = ''): ItemEntry { return { name, augPath: '', augments: [], extras: [], raw: null }; }

export function newCond(kind: CondKind): Condition {
  const spec = CONDS[kind];
  const c: Condition = { kind, op: spec.ops[0]?.[0] ?? '', value: spec.def };
  if (spec.type === 'num') c.op = '>';
  if (kind === 'raw') c.expr = '';
  if (kind === 'var') c.varId = '';
  return c;
}

export function newRule(handler: HandlerId): VisualRule {
  return { id: uid('rule'), kind: 'rule', handler, name: '', enabled: true, exclusive: false, when: emptyGroup('AND'), actions: [] };
}
export function newRawRule(handler: HandlerId, code = ''): RawRule {
  return { id: uid('rule'), kind: 'raw', handler, name: '', enabled: true, exclusive: false, code };
}
export function newAction(type: ActionType): RuleAction {
  switch (type) {
    case 'equipSet': return { type, setId: '' };
    case 'equipSetVar': return { type, prefix: '', varId: '' };
    case 'equipItem': return { type, slot: 'Main', item: '' };
    case 'message': return { type, text: '' };
    case 'setVar': return { type, varId: '', value: '' };
    default: return { type: 'rawLua', code: '' };
  }
}
export function newVariable(name: string): Variable { return { id: uid('var'), name, options: ['Normal', 'Alt'], value: 'Normal' }; }
export function newCommand(varId: string): Command { return { id: uid('cmd'), name: '', kind: 'cycle', varId }; }

export function newProfile(name = 'Profile', job = ''): Profile {
  return {
    id: uid('prof'), name: name || job || 'Profile', job,
    settings: { allowAddSet: true, addSetBackup: true },
    sets: [], variables: [], rules: [], commands: [],
    names: { player: 'player', action: 'action', environment: 'environment' },
    raw: { custom: '', OnLoad: '', OnUnload: '', HandleCommand: '' },
    importReport: null,
  };
}

export function findSet(profile: Profile, idOrName: string | undefined): GearSet | null {
  if (!idOrName) return null;
  const byId = profile.sets.find(s => s.id === idOrName);
  if (byId) return byId;
  const low = idOrName.toLowerCase();
  return profile.sets.find(s => s.name.toLowerCase() === low) ?? null;
}
export function findVar(profile: Profile, id: string | undefined): Variable | null {
  return profile.variables.find(v => v.id === id) ?? null;
}

/** Normalises a parsed project file so older or hand-edited files cannot crash the editor. */
export function normaliseProject(p: unknown): Project {
  const src = p as { profiles?: Partial<Profile>[]; name?: unknown } | null;
  if (!src || !Array.isArray(src.profiles)) throw new Error('This file is not an Ashita Gear Studio project (no profiles found).');
  const out: Project = { schema: 1, name: String(src.name || 'My Gear Project'), profiles: [] };
  for (const raw of src.profiles) {
    const base = newProfile(raw.name, raw.job);
    const pr: Profile = Object.assign(base, clone(raw));
    pr.settings = { ...base.settings, ...(raw.settings ?? {}) };
    pr.names = { ...base.names, ...(raw.names ?? {}) };
    pr.raw = { ...base.raw, ...(raw.raw ?? {}) };
    pr.sets = pr.sets ?? []; pr.variables = pr.variables ?? []; pr.rules = pr.rules ?? []; pr.commands = pr.commands ?? [];
    pr.sets.forEach(s => { s.slots = s.slots ?? {}; s.extras = s.extras ?? []; s.note = s.note ?? ''; });
    out.profiles.push(pr);
  }
  if (!out.profiles.length) out.profiles.push(newProfile('Profile', ''));
  return out;
}

export function ruleIsVisual(r: Rule): r is VisualRule { return r.kind === 'rule'; }
