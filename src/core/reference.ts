/* Reference data taken from the LuAshitacast documentation (handlers, gData fields, equipment slots). */
import type { ActionType, CommandKind, CondKind, HandlerId } from './types';

export interface HandlerInfo { id: HandlerId; label: string; action: boolean; spell: boolean; blurb: string }

export const HANDLERS: HandlerInfo[] = [
  { id: 'HandleDefault', label: 'Default', action: false, spell: false, blurb: 'Runs continuously while you are not performing an action. This is where idle, resting and engaged gear belong.' },
  { id: 'HandlePrecast', label: 'Precast', action: true, spell: true, blurb: 'Runs when you start a spell, before the spell packet is sent. Use it for fast cast and quick magic gear.' },
  { id: 'HandleMidcast', label: 'Midcast', action: true, spell: true, blurb: 'Runs after the spell packet is sent. Use it for gear that changes spell potency, accuracy or recast.' },
  { id: 'HandleAbility', label: 'Ability', action: true, spell: false, blurb: 'Runs when you use a job ability.' },
  { id: 'HandleWeaponskill', label: 'Weaponskill', action: true, spell: false, blurb: 'Runs when you use a weaponskill.' },
  { id: 'HandleItem', label: 'Item', action: true, spell: false, blurb: 'Runs when you use an item.' },
  { id: 'HandlePreshot', label: 'Preshot', action: true, spell: false, blurb: 'Runs before a ranged attack is sent. Use it for snapshot or rapid shot gear.' },
  { id: 'HandleMidshot', label: 'Midshot', action: true, spell: false, blurb: 'Runs after the ranged attack is sent. Use it for ranged accuracy and damage gear.' },
];
export const handlerInfo = (id: string): HandlerInfo | undefined => HANDLERS.find(h => h.id === id);

export const GEN_ORDER: HandlerId[] = ['HandleDefault', 'HandleAbility', 'HandleItem', 'HandlePrecast', 'HandleMidcast', 'HandlePreshot', 'HandleMidshot', 'HandleWeaponskill'];
export const RAW_HANDLERS = ['OnLoad', 'OnUnload', 'HandleCommand'] as const;
export const ALL_HANDLER_NAMES: ReadonlySet<string> = new Set<string>([...GEN_ORDER, ...RAW_HANDLERS]);

export const ELEMENTS = ['Fire', 'Ice', 'Wind', 'Earth', 'Thunder', 'Water', 'Light', 'Dark'];
export const SPELL_SKILLS = ['Divine Magic', 'Healing Magic', 'Enhancing Magic', 'Enfeebling Magic', 'Elemental Magic', 'Dark Magic', 'Summoning', 'Ninjutsu', 'Singing', 'Blue Magic', 'Geomancy'];
export const SPELL_TYPES = ['White Magic', 'Black Magic', 'Summoning', 'Ninjutsu', 'Bard Song', 'Blue Magic'];
export const STATUSES = ['Idle', 'Engaged', 'Resting'];
export const BAGS = ['Inventory', 'Wardrobe', 'Wardrobe2', 'Wardrobe3', 'Wardrobe4', 'Satchel', 'Sack', 'Case', 'Safe', 'Safe2', 'Storage', 'Locker', 'Temporary'];
export const JOB_ABBRS = ['WAR', 'MNK', 'WHM', 'BLM', 'RDM', 'THF', 'PLD', 'DRK', 'BST', 'BRD', 'RNG', 'SAM', 'NIN', 'DRG', 'SMN', 'BLU', 'COR', 'PUP', 'DNC', 'SCH', 'GEO', 'RUN'];

export type Op = readonly [string, string];
export const NUM_OPS: Op[] = [['<', 'is below'], ['<=', 'is at most'], ['>', 'is above'], ['>=', 'is at least'], ['==', 'is exactly'], ['~=', 'is not']];
export const EQ_OPS: Op[] = [['==', 'is'], ['~=', 'is not']];

export type CondValueType = 'enum' | 'num' | 'text' | 'bool' | 'name' | 'buff' | 'pet' | 'var' | 'raw';
export interface CondSpec {
  group: 'You' | 'World' | 'Action' | 'Other';
  label: string;
  type: CondValueType;
  ops: Op[];
  def: string | number;
  noun?: string;
  /** Which gData table the value comes from. */
  src?: 'player' | 'action' | 'environment';
  field?: string;
  options?: string[];
  unit?: string;
  needsAction?: boolean;
  spellOnly?: boolean;
}

export const CONDS: Record<CondKind, CondSpec> = {
  'player.status': { group: 'You', label: 'Your status', noun: 'your status', src: 'player', field: 'Status', type: 'enum', options: STATUSES, ops: EQ_OPS, def: 'Engaged' },
  'player.hpp': { group: 'You', label: 'Your HP %', noun: 'your HP', src: 'player', field: 'HPP', type: 'num', ops: NUM_OPS, def: 50, unit: '%' },
  'player.mpp': { group: 'You', label: 'Your MP %', noun: 'your MP', src: 'player', field: 'MPP', type: 'num', ops: NUM_OPS, def: 50, unit: '%' },
  'player.tp': { group: 'You', label: 'Your TP', noun: 'your TP', src: 'player', field: 'TP', type: 'num', ops: NUM_OPS, def: 1000 },
  'player.moving': { group: 'You', label: 'Movement', src: 'player', field: 'IsMoving', type: 'bool', ops: [['true', 'you are moving'], ['false', 'you are standing still']], def: 'true' },
  'player.subjob': { group: 'You', label: 'Your sub job', noun: 'your sub job', src: 'player', field: 'SubJob', type: 'enum', options: JOB_ABBRS, ops: EQ_OPS, def: 'NIN' },
  'player.level': { group: 'You', label: 'Your main job level', noun: 'your main job level', src: 'player', field: 'MainJobLevel', type: 'num', ops: NUM_OPS, def: 75 },
  'env.day': { group: 'World', label: 'Day element', noun: 'the day element', src: 'environment', field: 'DayElement', type: 'enum', options: ELEMENTS, ops: EQ_OPS, def: 'Fire' },
  'env.weather': { group: 'World', label: 'Weather element', noun: 'the weather element', src: 'environment', field: 'WeatherElement', type: 'enum', options: ['None', ...ELEMENTS], ops: EQ_OPS, def: 'Fire' },
  'env.time': { group: 'World', label: "Vana'diel time (hour)", noun: "the Vana'diel hour", src: 'environment', field: 'Time', type: 'num', ops: NUM_OPS, def: 18 },
  'env.area': { group: 'World', label: 'Zone name', noun: 'the zone', src: 'environment', field: 'Area', type: 'text', ops: EQ_OPS, def: '' },
  'env.moon': { group: 'World', label: 'Moon %', noun: 'the moon', src: 'environment', field: 'MoonPercent', type: 'num', ops: NUM_OPS, def: 50, unit: '%' },
  'action.name': { group: 'Action', label: 'Action name', noun: 'the action', src: 'action', field: 'Name', type: 'name', ops: [['==', 'is'], ['~=', 'is not'], ['contains', 'contains'], ['oneof', 'is one of']], def: '', needsAction: true },
  'action.skill': { group: 'Action', label: 'Spell skill', noun: 'the spell skill', src: 'action', field: 'Skill', type: 'enum', options: SPELL_SKILLS, ops: EQ_OPS, def: 'Healing Magic', needsAction: true, spellOnly: true },
  'action.element': { group: 'Action', label: 'Spell element', noun: 'the spell element', src: 'action', field: 'Element', type: 'enum', options: [...ELEMENTS, 'Non-Elemental'], ops: EQ_OPS, def: 'Fire', needsAction: true, spellOnly: true },
  'action.type': { group: 'Action', label: 'Spell type', noun: 'the spell type', src: 'action', field: 'Type', type: 'enum', options: SPELL_TYPES, ops: EQ_OPS, def: 'White Magic', needsAction: true, spellOnly: true },
  'action.mp': { group: 'Action', label: 'Spell MP cost', noun: 'the spell MP cost', src: 'action', field: 'MpCost', type: 'num', ops: NUM_OPS, def: 100, needsAction: true, spellOnly: true },
  buff: { group: 'Other', label: 'Status effect', type: 'buff', ops: [['active', 'is active on you'], ['inactive', 'is not active on you']], def: '' },
  pet: { group: 'Other', label: 'Pet', type: 'pet', ops: [['has', 'you have a pet out'], ['none', 'you have no pet']], def: '' },
  var: { group: 'Other', label: 'Profile variable', type: 'var', ops: EQ_OPS, def: '' },
  raw: { group: 'Other', label: 'Custom Lua check', type: 'raw', ops: [], def: '' },
};
export const COND_KINDS = Object.keys(CONDS) as CondKind[];

/** Reverse lookup used by the importer: "player.HPP" -> 'player.hpp'. */
export const FIELD_KIND: Record<string, CondKind> = {};
COND_KINDS.forEach(k => { const s = CONDS[k]; if (s.src && s.field) FIELD_KIND[s.src + '.' + s.field] = k; });

export const ACTION_TYPES: [ActionType, string][] = [
  ['equipSet', 'Equip a gear set'],
  ['equipSetVar', 'Equip a set picked by a variable'],
  ['equipItem', 'Equip a single item'],
  ['message', 'Show a chat message'],
  ['setVar', 'Change a variable'],
  ['rawLua', 'Custom Lua'],
];
export const COMMAND_KINDS: [CommandKind, string][] = [['cycle', 'Cycle a variable'], ['set', 'Set a variable'], ['lock', 'Lock a gear set'], ['raw', 'Custom Lua']];

export const LUA_KEYWORDS: ReadonlySet<string> = new Set('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(' '));
