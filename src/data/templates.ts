/* Starter templates and the sample project shown on first launch. */
import type { Command, Condition, GearSet, HandlerId, Profile, Project, RuleAction, SlotName, Variable } from '../core/types';
import { newCond, newItem, newProfile, newRule, newSet, uid } from '../core/model';
import { JOBS } from './jobs';
import type { JobRole } from './jobs';

export type TemplateId = JobRole | 'blank';
export const TEMPLATES: { id: TemplateId; label: string; blurb: string }[] = [
  { id: 'melee', label: 'Melee', blurb: 'Idle, Resting, TP and weaponskill sets with rules for fighting and resting.' },
  { id: 'caster', label: 'Caster', blurb: 'Idle, Resting, Precast and four Midcast sets, with rules for cure, enfeebling, enhancing and elemental magic.' },
  { id: 'hybrid', label: 'Melee and magic', blurb: 'Everything in Caster plus TP and weaponskill sets.' },
  { id: 'blank', label: 'Blank', blurb: 'An empty profile.' },
];
export const defaultTemplate = (job: string): TemplateId => JOBS.find(j => j.abbr === job)?.role ?? 'blank';

type Items = Partial<Record<SlotName, string>>;
function mkSet(p: Profile, name: string, items: Items = {}, note = ''): GearSet {
  const s = newSet(name);
  s.note = note;
  (Object.keys(items) as SlotName[]).forEach(k => { s.slots[k] = newItem(items[k]); });
  p.sets.push(s);
  return s;
}
function rule(p: Profile, handler: HandlerId, name: string, conds: Condition[], actions: RuleAction[], exclusive = false): void {
  const r = newRule(handler);
  r.name = name; r.exclusive = exclusive; r.when = { op: 'AND', children: conds }; r.actions = actions;
  p.rules.push(r);
}
const cond = (kind: Parameters<typeof newCond>[0], props: Partial<Condition> = {}): Condition => ({ ...newCond(kind), ...props });
const eq = (s: GearSet): RuleAction => ({ type: 'equipSet', setId: s.id });

function buildMelee(p: Profile): void {
  const idle = mkSet(p, 'Idle'), tp = mkSet(p, 'TP'), ws = mkSet(p, 'WS_Default'), rest = mkSet(p, 'Resting');
  rule(p, 'HandleDefault', 'Idle gear', [], [eq(idle)]);
  rule(p, 'HandleDefault', 'Resting', [cond('player.status', { value: 'Resting' })], [eq(rest)]);
  rule(p, 'HandleDefault', 'Fighting', [cond('player.status', { value: 'Engaged' })], [eq(tp)]);
  rule(p, 'HandleWeaponskill', 'Weaponskill gear', [], [eq(ws)]);
}
function buildCaster(p: Profile): void {
  const idle = mkSet(p, 'Idle'), rest = mkSet(p, 'Resting'), pre = mkSet(p, 'Precast');
  const cure = mkSet(p, 'Midcast_Cure'), enf = mkSet(p, 'Midcast_Enfeebling'), enh = mkSet(p, 'Midcast_Enhancing'), nuke = mkSet(p, 'Midcast_Nuke');
  rule(p, 'HandleDefault', 'Idle gear', [], [eq(idle)]);
  rule(p, 'HandleDefault', 'Resting', [cond('player.status', { value: 'Resting' })], [eq(rest)]);
  rule(p, 'HandlePrecast', 'Fast cast', [], [eq(pre)]);
  rule(p, 'HandleMidcast', 'Cure spells', [cond('action.name', { op: 'contains', value: 'Cure' })], [eq(cure)]);
  rule(p, 'HandleMidcast', 'Enfeebling', [cond('action.skill', { value: 'Enfeebling Magic' })], [eq(enf)], true);
  rule(p, 'HandleMidcast', 'Enhancing', [cond('action.skill', { value: 'Enhancing Magic' })], [eq(enh)], true);
  rule(p, 'HandleMidcast', 'Elemental', [cond('action.skill', { value: 'Elemental Magic' })], [eq(nuke)], true);
}
function buildHybrid(p: Profile): void {
  buildCaster(p);
  const tp = mkSet(p, 'TP'), ws = mkSet(p, 'WS_Default');
  const lastDefault = p.rules.map((r, i) => (r.handler === 'HandleDefault' ? i : -1)).filter(i => i >= 0).pop() ?? p.rules.length - 1;
  const r = newRule('HandleDefault');
  r.name = 'Fighting'; r.when = { op: 'AND', children: [cond('player.status', { value: 'Engaged' })] }; r.actions = [eq(tp)];
  p.rules.splice(lastDefault + 1, 0, r);
  rule(p, 'HandleWeaponskill', 'Weaponskill gear', [], [eq(ws)]);
}

export function makeProfile(job: string, template: TemplateId, name?: string): Profile {
  const p = newProfile(name || job || 'Profile', job);
  if (template === 'melee') buildMelee(p);
  else if (template === 'caster') buildCaster(p);
  else if (template === 'hybrid') buildHybrid(p);
  return p;
}

/** The project shown on first launch. Gear is placeholder, there to show how a finished profile looks. */
export function sampleProject(): Project {
  const p = newProfile('RDM', 'RDM');
  const idle = mkSet(p, 'Idle', { Main: 'Excalibur', Sub: "Genbu's Shield", Head: 'Walahra Turban', Neck: 'Parade Gorget', Ear1: "Merman's Earring", Ear2: 'Ethereal Earring', Body: 'Vermillion Cloak', Hands: 'Garrison Gloves', Ring1: 'Defending Ring', Ring2: 'Sheltered Ring', Back: 'Shadow Mantle', Waist: "Friar's Rope", Legs: 'Garrison Hose', Feet: "Herald's Gaiters" });
  const rest = mkSet(p, 'Resting', { Main: 'Dark Staff', Neck: 'Uggalepih Pendant', Body: 'Errant Houppelande', Waist: "Friar's Rope" });
  const tpBase: Items = { Main: 'Excalibur', Sub: 'Mandau', Head: 'Optical Hat', Ear1: 'Brutal Earring', Ear2: 'Suppanomimi', Body: 'Askar Korazin', Hands: 'Dusk Gloves', Ring1: 'Rajas Ring', Ring2: "Toreador's Ring", Back: "Cuchulain's Mantle", Legs: 'Dusk Trousers', Feet: 'Dusk Ledelsens' };
  mkSet(p, 'TP_Normal', { ...tpBase, Neck: 'Spike Necklace', Waist: 'Swift Belt' }, 'Sample gear for layout testing, not a recommended build.');
  mkSet(p, 'TP_Acc', { ...tpBase, Neck: 'Peacock Amulet', Waist: 'Warwolf Belt' });
  const ws = mkSet(p, 'WS_Default', { Neck: 'Spike Necklace', Ear1: 'Moonshade Earring', Ear2: 'Brutal Earring', Waist: 'Fotia Belt' });
  const pre = mkSet(p, 'Precast', { Head: 'Walahra Turban', Ear1: 'Loquac. Earring', Hands: "Warlock's Gloves", Feet: "Warlock's Boots" });
  const cure = mkSet(p, 'Midcast_Cure', { Main: 'Yagrush', Neck: 'Justice Torque', Hands: 'Bokwus Gloves', Ring1: "Sirona's Ring", Ring2: 'Kunaji Ring' });
  const enf = mkSet(p, 'Midcast_Enfeebling', { Neck: 'Prudence Torque', Body: "Warlock's Tabard", Hands: "Duelist's Gloves", Ring1: 'Vivian Ring' });
  const enh = mkSet(p, 'Midcast_Enhancing', { Body: "Duelist's Tabard", Hands: "Duelist's Gloves", Waist: "Penitent's Rope" });
  const tpVar: Variable = { id: uid('var'), name: 'TPMode', options: ['Normal', 'Acc'], value: 'Normal' };
  p.variables.push(tpVar);
  const cmds: Command[] = [
    { id: uid('cmd'), name: 'tpmode', kind: 'cycle', varId: tpVar.id },
    { id: uid('cmd'), name: 'lockidle', kind: 'lock', setId: idle.id, seconds: 60 },
  ];
  p.commands.push(...cmds);
  rule(p, 'HandleDefault', 'Idle gear', [], [eq(idle)]);
  rule(p, 'HandleDefault', 'Resting', [cond('player.status', { value: 'Resting' })], [eq(rest)]);
  rule(p, 'HandleDefault', 'Fighting (set follows TPMode)', [cond('player.status', { value: 'Engaged' })], [{ type: 'equipSetVar', prefix: 'TP_', varId: tpVar.id }]);
  rule(p, 'HandlePrecast', 'Fast cast', [], [eq(pre)]);
  rule(p, 'HandleMidcast', 'Cure spells', [cond('action.name', { op: 'contains', value: 'Cure' })], [eq(cure)]);
  rule(p, 'HandleMidcast', 'Enfeebling magic', [cond('action.skill', { value: 'Enfeebling Magic' })], [eq(enf)], true);
  rule(p, 'HandleMidcast', 'Enhancing magic', [cond('action.skill', { value: 'Enhancing Magic' })], [eq(enh)], true);
  rule(p, 'HandleWeaponskill', 'Weaponskill gear', [], [eq(ws)]);
  void rest; void pre;
  return { schema: 1, name: 'My Gear Project', profiles: [p] };
}
