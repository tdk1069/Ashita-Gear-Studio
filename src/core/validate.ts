/* Validation: finds missing sets, invalid references and configuration problems, and explains them. */
import type { Condition, ConditionGroup, Issue, IssueRef, Profile, Severity } from './types';
import { SLOT_NAMES, isGroup } from './types';
import { BAGS, CONDS, GEN_ORDER, handlerInfo } from './reference';
import { findSet, findVar } from './model';
import { groupExpr, itemExpr } from './generate';
import { ruleTitle } from './describe';
import { isIdent } from './luatext';
import { balanced } from './lexer';

export function validate(profile: Profile): Issue[] {
  const issues: Issue[] = [];
  const add = (sev: Severity, title: string, detail: string, ref: IssueRef = {}): void => { issues.push({ sev, title, detail, ref }); };
  const definedInCustom = (name: string): boolean => {
    const last = name.split('.').pop() ?? name;
    return new RegExp('sets\\s*(\\.|\\[)[^=]*' + last.replace(/[^\w]/g, '') + '[^=]*=').test(profile.raw.custom);
  };

  if (!profile.sets.length) add('warn', 'This profile has no gear sets yet', 'Rules can only equip sets that exist. Create a set on the Gear Sets tab first.', { tab: 'sets' });

  const seen = new Set<string>();
  for (const s of profile.sets) {
    const key = s.name.toLowerCase();
    const ref: IssueRef = { tab: 'sets', setId: s.id };
    if (!s.name.trim()) add('error', 'A gear set has no name', 'Give it a name so rules can refer to it.', ref);
    if (seen.has(key)) add('error', `Two gear sets are both called "${s.name}"`, 'LuAshitacast matches set names without caring about upper or lower case, so the second one would never be found. Rename one.', ref);
    seen.add(key);
    if (s.name && !s.name.split('.').every(isIdent)) add('info', `"${s.name}" contains characters Lua treats specially`, `It still works, because Gear Studio writes it as sets["${s.name}"], but plain letters, numbers and underscores keep the file easier to read.`, ref);
    if (!SLOT_NAMES.some(sl => itemExpr(s.slots[sl]))) add('warn', `The set "${s.name}" is empty`, 'An empty set equips nothing. Pick at least one item for it, or remove it if you do not need it.', ref);
    for (const p of ['Ring', 'Ear'] as const) {
      const a = s.slots[(p + '1') as 'Ring1' | 'Ear1'], b = s.slots[(p + '2') as 'Ring2' | 'Ear2'];
      if (a && b && !a.raw && !b.raw && a.name && a.name.toLowerCase() === b.name.toLowerCase() && !(a.augments.length || b.augments.length)) {
        add('warn', `The set "${s.name}" uses ${a.name} in both ${p} slots`, 'You can only wear the same item twice if you own two copies. If you only have one, the second slot will stay empty.', ref);
      }
    }
    const main = s.slots.Main, sub = s.slots.Sub;
    if (main?.name && sub?.name && main.name === sub.name) add('info', `The set "${s.name}" puts ${main.name} in both Main and Sub`, 'That only works for a dual wield with two copies of the weapon.', ref);
    for (const slot of SLOT_NAMES) {
      const it = s.slots[slot];
      if (it?.bag && !BAGS.includes(it.bag)) add('error', `${slot} in "${s.name}" uses an unknown bag "${it.bag}"`, `LuAshitacast accepts: ${BAGS.join(', ')}.`, ref);
      if (it && !it.raw && it.augRank != null && !Number.isFinite(it.augRank)) add('error', `${slot} in "${s.name}" has an invalid augment rank`, 'The rank must be a number.', ref);
    }
  }

  const usedSets = new Set<string>();
  const names = new Set<string>();
  for (const v of profile.variables) {
    if (!isIdent(v.name)) add('error', `The variable name "${v.name}" is not valid`, 'Variable names must start with a letter or underscore and use only letters, numbers and underscores, and cannot be a Lua keyword such as "end".', { tab: 'profile' });
    if (names.has(v.name)) add('error', `The variable "${v.name}" is defined twice`, 'Each variable needs its own name.', { tab: 'profile' });
    names.add(v.name);
    if (!v.options.length) add('error', `The variable "${v.name}" has no options`, 'Add at least one option, for example Normal, Acc.', { tab: 'profile' });
  }

  const walk = (g: ConditionGroup, where: IssueRef, label: string, handler: string): void => {
    const h = handlerInfo(handler);
    g.children.forEach((c: Condition | ConditionGroup) => {
      if (isGroup(c)) {
        if (!c.children.length) add('info', `The rule ${label} has an empty condition group`, 'Empty groups are ignored. Add a condition to it or remove it.', where);
        walk(c, where, label, handler);
        return;
      }
      const spec = CONDS[c.kind];
      if (!spec) { add('error', `The rule ${label} has an unknown condition`, 'Remove it and add the condition again.', where); return; }
      if (spec.needsAction && h && !h.action) add('error', `The rule ${label} checks the action, but there is no action here`, 'In the Default handler LuAshitacast has no current action, so this check would cause an error in game. Move the rule to Precast, Midcast, Ability, Weaponskill, Item, Preshot or Midshot.', where);
      else if (spec.spellOnly && h && !h.spell) add('warn', `The rule ${label} checks a spell detail outside of a spell`, `Skill, element, type and MP cost only exist for spells. In ${h.label} this check is never true.`, where);
      if (['enum', 'text', 'name', 'buff'].includes(spec.type) && !String(c.value ?? '').trim()) add('warn', `The rule ${label} has a condition with no value`, 'Fill in the value, otherwise the condition can never match.', where);
      if (spec.type === 'var') {
        const v = findVar(profile, c.varId);
        if (!v) add('error', `The rule ${label} refers to a variable that does not exist`, 'Pick a variable on the Profile tab or remove this condition.', where);
        else if (v.options.length && !v.options.includes(String(c.value))) add('warn', `The rule ${label} compares ${v.name} with "${c.value}"`, `That is not one of its options (${v.options.join(', ')}).`, where);
      }
      if (spec.type === 'raw') {
        if (!(c.expr ?? '').trim()) add('warn', `The rule ${label} has an empty custom check`, 'Enter a Lua expression or remove it.', where);
        else { const p = balanced(c.expr!); if (p) add('warn', `A custom check in ${label} ${p}`, 'Check the expression.', where); }
      }
    });
  };

  for (const r of profile.rules) {
    const h = handlerInfo(r.handler);
    const where: IssueRef = { tab: 'rules', handler: r.handler, ruleId: r.id };
    const label = `"${ruleTitle(r, profile)}" in ${h ? h.label : r.handler}`;
    if (r.kind === 'raw') {
      const p = balanced(r.code);
      if (p) add('warn', `A custom Lua block in ${h ? h.label : r.handler} ${p}`, 'Check the code for a missing "end" or bracket. The generated file would not load until this is fixed.', where);
      continue;
    }
    const siblings = profile.rules.filter(x => x.handler === r.handler);
    const pos = siblings.indexOf(r);
    if (r.exclusive && pos === 0) add('info', `The rule ${label} is marked "Otherwise" but has no rule above it`, 'It will behave like a normal rule.', where);
    if (r.exclusive && pos > 0) {
      for (let k = pos - 1; k >= 0; k--) {
        const above = siblings[k]!;
        if (above.kind !== 'rule' || !above.enabled) break;
        if (!groupExpr(above.when, profile, profile.names, true)) {
          add('warn', `The rule ${label} can never be reached`, 'A rule above it always applies, so an "Otherwise" rule below it never runs. Add a condition to the rule above or remove the Otherwise setting.', where);
          break;
        }
        if (!above.exclusive) break;
      }
    }
    if (!r.actions.length) add('warn', `The rule ${label} does nothing`, 'Add an action such as "Equip a gear set".', where);
    walk(r.when, where, label, r.handler);
    for (const a of r.actions) {
      switch (a.type) {
        case 'equipSet': {
          const s = findSet(profile, a.setId);
          if (s) usedSets.add(s.id);
          else if (!(a.setName && definedInCustom(a.setName))) add('error', `The rule ${label} equips a set that does not exist${a.setName ? ` ("${a.setName}")` : ''}`, 'The set may have been deleted or renamed. Choose another set in the rule, or create it on the Gear Sets tab.', where);
          break;
        }
        case 'equipSetVar': {
          const v = findVar(profile, a.varId);
          if (!v) { add('error', `The rule ${label} uses a variable that does not exist`, 'Choose a variable on the Profile tab first.', where); break; }
          for (const o of v.options) {
            const s = findSet(profile, a.prefix + o);
            if (s) usedSets.add(s.id);
            else add('error', `No gear set called "${a.prefix + o}"`, `The rule ${label} builds a set name from the variable ${v.name} (${a.prefix + o}), but that set is missing. Create it or remove the option.`, where);
          }
          break;
        }
        case 'equipItem':
          if (!a.item.trim()) add('warn', `The rule ${label} equips no item`, 'Type an item name.', where);
          break;
        case 'setVar':
          if (!findVar(profile, a.varId)) add('error', `The rule ${label} changes a variable that does not exist`, 'Pick a variable on the Profile tab.', where);
          break;
        case 'rawLua': { const p = balanced(a.code); if (p) add('warn', `Custom Lua in ${label} ${p}`, 'The generated file would not load until this is fixed.', where); break; }
        default: break;
      }
    }
  }

  const cn = new Set<string>();
  const prof: IssueRef = { tab: 'profile' };
  for (const c of profile.commands) {
    const nm = c.name.trim().toLowerCase();
    if (!nm) { add('warn', 'A command has no name', 'Type the word you will use after /lac fwd.', prof); continue; }
    if (/\s/.test(nm)) add('error', `The command "${c.name}" contains a space`, `Commands are a single word, used like /lac fwd ${nm.split(/\s+/)[0]}.`, prof);
    if (cn.has(nm)) add('error', `The command "${nm}" is defined twice`, 'Only the first one would run.', prof);
    cn.add(nm);
    if ((c.kind === 'cycle' || c.kind === 'set') && !findVar(profile, c.varId)) add('error', `The command "${nm}" needs a variable`, 'Choose which variable it changes.', prof);
    if (c.kind === 'lock') {
      const s = findSet(profile, c.setId);
      if (!s) add('error', `The command "${nm}" locks a set that does not exist`, 'Choose a set.', prof); else usedSets.add(s.id);
    }
    if (c.kind === 'raw') { const p = balanced(c.code); if (p) add('warn', `The command "${nm}" ${p}`, 'Check the Lua.', prof); }
  }

  for (const k of ['custom', 'OnLoad', 'OnUnload', 'HandleCommand'] as const) {
    const code = profile.raw[k];
    if (!code.trim()) continue;
    const p = balanced(code);
    if (p) add('warn', `The custom Lua section "${k}" ${p}`, 'The generated file would not load until this is fixed.', prof);
  }
  for (const h of GEN_ORDER) {
    if (new RegExp('profile\\s*\\.\\s*' + h + '\\s*=').test(profile.raw.custom)) add('warn', `Custom Lua also defines ${h}`, 'Gear Studio generates this handler too, and the generated one is written last, so it wins.', prof);
  }

  for (const s of profile.sets) {
    if (!usedSets.has(s.id)) add('info', `The set "${s.name}" is not used by any rule`, `It is still written to the file. You can equip it in game with /lac set ${s.name}.`, { tab: 'sets', setId: s.id });
  }

  const rank: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  return issues.sort((a, b) => rank[a.sev] - rank[b.sev]);
}
