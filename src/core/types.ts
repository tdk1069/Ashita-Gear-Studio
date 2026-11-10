/* The internal configuration model. It knows nothing about Lua text: generation, parsing and
   validation all work against these types. */

export const SLOT_NAMES = ['Main', 'Sub', 'Range', 'Ammo', 'Head', 'Neck', 'Ear1', 'Ear2', 'Body', 'Hands', 'Ring1', 'Ring2', 'Back', 'Waist', 'Legs', 'Feet'] as const;
export type SlotName = (typeof SLOT_NAMES)[number];

export type HandlerId =
  | 'HandleDefault' | 'HandlePrecast' | 'HandleMidcast' | 'HandleAbility'
  | 'HandleWeaponskill' | 'HandleItem' | 'HandlePreshot' | 'HandleMidshot';

export type AugPath = '' | 'A' | 'B' | 'C' | 'D';

/** A field kept verbatim because the editor has no control for it. */
export interface RawField { k: string; raw: string }

export interface ItemEntry {
  name: string;
  augPath: AugPath;
  augRank?: number;
  augTrial?: number;
  bag?: string;
  augments: string[];
  extras: RawField[];
  /** When set, the whole entry is Lua the editor could not model and is written out as is. */
  raw: string | null;
}

export interface GearSet {
  id: string;
  name: string;
  note: string;
  slots: Partial<Record<SlotName, ItemEntry>>;
  /** Non-slot entries found in an imported set (for example BaseSet), kept verbatim. */
  extras: { k: string | null; raw: string }[];
}

export type CondKind =
  | 'player.status' | 'player.hpp' | 'player.mpp' | 'player.tp' | 'player.moving' | 'player.subjob' | 'player.level'
  | 'env.day' | 'env.weather' | 'env.time' | 'env.area' | 'env.moon'
  | 'action.name' | 'action.skill' | 'action.element' | 'action.type' | 'action.mp'
  | 'buff' | 'pet' | 'var' | 'raw';

export interface Condition {
  kind: CondKind;
  op: string;
  value: string | number;
  expr?: string;
  varId?: string;
}
export interface ConditionGroup { op: 'AND' | 'OR'; children: Array<Condition | ConditionGroup> }

export type RuleAction =
  | { type: 'equipSet'; setId: string; setName?: string }
  | { type: 'equipSetVar'; prefix: string; varId: string }
  | { type: 'equipItem'; slot: SlotName; item: string }
  | { type: 'message'; text: string }
  | { type: 'setVar'; varId: string; value: string }
  | { type: 'rawLua'; code: string };
export type ActionType = RuleAction['type'];

interface RuleBase { id: string; handler: HandlerId; name: string; enabled: boolean; exclusive: boolean }
export interface VisualRule extends RuleBase { kind: 'rule'; when: ConditionGroup; actions: RuleAction[] }
export interface RawRule extends RuleBase { kind: 'raw'; code: string }
export type Rule = VisualRule | RawRule;

export interface Variable { id: string; name: string; options: string[]; value: string }

export type Command =
  | { id: string; name: string; kind: 'cycle'; varId: string }
  | { id: string; name: string; kind: 'set'; varId: string; value: string }
  | { id: string; name: string; kind: 'lock'; setId: string; seconds: number }
  | { id: string; name: string; kind: 'raw'; code: string };
export type CommandKind = Command['kind'];

export interface ImportNote { line: number; kind: string; text: string; handler?: string }
export interface ImportReport {
  at: number; fileName: string;
  sets: number; rules: number; rawBlocks: number; customLines: number;
  handlers: string[]; notes: ImportNote[]; noteCount: number;
}

export interface Profile {
  id: string;
  name: string;
  job: string;
  settings: { allowAddSet: boolean; addSetBackup: boolean };
  sets: GearSet[];
  variables: Variable[];
  rules: Rule[];
  commands: Command[];
  /** Local names used for gData.GetPlayer(), GetAction() and GetEnvironment() in the generated Lua. */
  names: { player: string; action: string; environment: string };
  /** Lua the visual editor does not manage. Always written back unchanged. */
  raw: { custom: string; OnLoad: string; OnUnload: string; HandleCommand: string };
  importReport: ImportReport | null;
}

export interface Project { schema: 1; name: string; profiles: Profile[]; savedAt?: number }

export type Severity = 'error' | 'warn' | 'info';
export interface IssueRef { tab?: 'sets' | 'rules' | 'profile'; setId?: string; handler?: HandlerId; ruleId?: string }
export interface Issue { sev: Severity; title: string; detail: string; ref: IssueRef }

export function isGroup(n: Condition | ConditionGroup): n is ConditionGroup {
  return Array.isArray((n as ConditionGroup).children);
}
