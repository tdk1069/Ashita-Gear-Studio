/* Rules tab: handlers, rule cards, nested ALL/ANY condition groups and actions. */
import type { GameData } from '../../data/windower';
import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';
import type { ActionType, Condition, ConditionGroup, HandlerId, Profile, Rule, RuleAction, SlotName, VisualRule } from '../../core';
import {
  ACTION_TYPES, COND_KINDS, CONDS, HANDLERS, SLOT_NAMES, describeRule, emptyGroup, handlerInfo, isGroup, newAction, newCond, newRawRule, newRule, ruleTitle, uid,
} from '../../core';
import type { CondKind } from '../../core';
import { Badge, Btn, Check, ConfirmBtn, IconBtn, Select, TextArea, TextInput, cx } from '../components/ui';
import { mutateProfile, setState, useProfile, useStore } from '../store';

type Path = number[];

function nodeAt(g: ConditionGroup, path: Path): ConditionGroup | Condition {
  let n: ConditionGroup | Condition = g;
  for (const i of path) { if (!isGroup(n)) break; n = n.children[i]!; }
  return n;
}
function groupAt(g: ConditionGroup, path: Path): ConditionGroup { const n = nodeAt(g, path); return isGroup(n) ? n : g; }

/** Applies a change to one rule inside the profile. */
function editRule(id: string, fn: (r: Rule) => void, key?: string): void {
  mutateProfile(p => { const r = p.rules.find(x => x.id === id); if (r) fn(r); }, key ? `rule:${id}:${key}` : undefined);
}
function editVisual(id: string, fn: (r: VisualRule) => void, key?: string): void {
  editRule(id, r => { if (r.kind === 'rule') fn(r); }, key);
}

/* ---------- conditions ---------- */

const groupedKinds = (): { group: string; kinds: CondKind[] }[] => {
  const out: { group: string; kinds: CondKind[] }[] = [];
  for (const k of COND_KINDS) {
    const g = CONDS[k].group;
    const slot = out.find(o => o.group === g) ?? (out.push({ group: g, kinds: [] }), out[out.length - 1]!);
    slot.kinds.push(k);
  }
  return out;
};
const KIND_GROUPS = groupedKinds();

function ConditionRow({ rule, path, c, p }: { rule: VisualRule; path: Path; c: Condition; p: Profile }): ReactElement {
  const spec = CONDS[c.kind];
  const game = useStore(s => s.game);
  const key = 'c' + path.join('.');
  const update = (fn: (c: Condition) => void, k = 'v'): void => editVisual(rule.id, r => { const n = nodeAt(r.when, path); if (!isGroup(n)) fn(n); }, key + k);
  const remove = (): void => editVisual(rule.id, r => { const g = groupAt(r.when, path.slice(0, -1)); g.children.splice(path[path.length - 1]!, 1); });
  const changeKind = (k: string): void => editVisual(rule.id, r => { const g = groupAt(r.when, path.slice(0, -1)); g.children[path[path.length - 1]!] = newCond(k as CondKind); });
  const kindSel = (
    <select aria-label="Condition type" value={c.kind} onChange={e => changeKind(e.target.value)}>
      {KIND_GROUPS.map(g => <optgroup key={g.group} label={g.group}>{g.kinds.map(k => <option key={k} value={k}>{CONDS[k].label}</option>)}</optgroup>)}
    </select>
  );
  const opSel = <Select label="Operator" value={c.op} onChange={v => update(x => { x.op = v; }, 'op')} options={spec.ops} />;
  const rm = <IconBtn label="Remove condition" onClick={remove}>✕</IconBtn>;
  const listId = rule.handler === 'HandleAbility' ? 'dl-abilities' : rule.handler === 'HandleWeaponskill' ? 'dl-weaponskills' : 'dl-spells';
  void game;
  switch (spec.type) {
    case 'enum':
      return <div className="crow">{kindSel}{opSel}<Select label="Value" value={String(c.value)} onChange={v => update(x => { x.value = v; })} options={spec.options ?? []} />{rm}</div>;
    case 'num':
      return <div className="crow">{kindSel}{opSel}<TextInput type="number" label="Value" value={c.value} onChange={v => update(x => { x.value = v === '' ? 0 : Number(v); })} />{rm}</div>;
    case 'text':
      return <div className="crow">{kindSel}{opSel}<TextInput label="Value" value={String(c.value)} onChange={v => update(x => { x.value = v; })} />{rm}</div>;
    case 'name':
      return <div className="crow">{kindSel}{opSel}<TextInput list={listId} label={c.op === 'oneof' ? 'Names separated by commas' : 'Name'} placeholder={c.op === 'oneof' ? 'Cure, Cure II' : 'Cure'} value={String(c.value)} onChange={v => update(x => { x.value = v; })} />{rm}</div>;
    case 'bool': case 'pet':
      return <div className="crow two">{kindSel}{opSel}{rm}</div>;
    case 'buff':
      return <div className="crow">{kindSel}<TextInput list="dl-buffs" label="Status effect" placeholder="Haste" value={String(c.value)} onChange={v => update(x => { x.value = v; })} />{opSel}{rm}</div>;
    case 'var': {
      const v = p.variables.find(x => x.id === c.varId);
      return (
        <div className="crow">{kindSel}
          <div className="pair">
            <Select label="Variable" value={c.varId ?? ''} placeholder="Choose…" onChange={id => update(x => { x.varId = id; x.value = p.variables.find(y => y.id === id)?.options[0] ?? ''; }, 'var')} options={p.variables.map(x => [x.id, x.name] as const)} />
            {opSel}
          </div>
          <Select label="Value" value={String(c.value)} placeholder="Choose…" onChange={val => update(x => { x.value = val; })} options={v?.options ?? []} />
          {rm}
        </div>
      );
    }
    case 'raw':
      return <div className="crow rawc">{kindSel}<TextInput mono label="Lua expression" placeholder="TPMode == 'Acc'" value={c.expr ?? ''} onChange={v => update(x => { x.expr = v; })} />{rm}</div>;
  }
}

function GroupEditor({ rule, path, g, p, depth }: { rule: VisualRule; path: Path; g: ConditionGroup; p: Profile; depth: number }): ReactElement {
  const h = handlerInfo(rule.handler);
  const first = (): Condition => newCond(h?.action ? 'action.name' : 'player.status');
  const here = (r: VisualRule): ConditionGroup => groupAt(r.when, path);
  const multi = g.children.length > 1;
  return (
    <div className="group">
      <div className="group-head">
        {(multi || path.length > 0) && (
          <button type="button" className={cx('logic', g.op === 'OR' ? 'or' : 'and')} title="Switch between all and any" onClick={() => editVisual(rule.id, r => { const n = here(r); n.op = n.op === 'OR' ? 'AND' : 'OR'; })}>
            {g.op === 'OR' ? 'ANY of these' : 'ALL of these'}
          </button>
        )}
        {path.length > 0 && <Btn small variant="ghost" onClick={() => editVisual(rule.id, r => { groupAt(r.when, path.slice(0, -1)).children.splice(path[path.length - 1]!, 1); })}>Remove group</Btn>}
      </div>
      {g.children.map((ch, i) => {
        const cp = [...path, i];
        return isGroup(ch)
          ? <GroupEditor key={i} rule={rule} path={cp} g={ch} p={p} depth={depth + 1} />
          : <ConditionRow key={i} rule={rule} path={cp} c={ch} p={p} />;
      })}
      {!g.children.length && <p className="hint small">{path.length === 0 ? 'No conditions, so this rule always applies.' : 'Empty group.'}</p>}
      <div className="add-row">
        <Btn small onClick={() => editVisual(rule.id, r => { here(r).children.push(first()); })}>+ Condition</Btn>
        {depth < 2 && <Btn small variant="ghost" onClick={() => editVisual(rule.id, r => { const ng = emptyGroup('OR'); ng.children.push(first()); here(r).children.push(ng); })}>+ Group</Btn>}
      </div>
    </div>
  );
}

/* ---------- actions ---------- */

function ActionRow({ rule, i, a, p }: { rule: VisualRule; i: number; a: RuleAction; p: Profile }): ReactElement {
  const update = (fn: (a: RuleAction) => void, k = 'v'): void => editVisual(rule.id, r => { const x = r.actions[i]; if (x) fn(x); }, `a${i}${k}`);
  const changeType = (t: string): void => editVisual(rule.id, r => {
    const na = newAction(t as ActionType);
    if (na.type === 'equipSet' && p.sets[0]) na.setId = p.sets[0].id;
    r.actions[i] = na;
  });
  const varSel = (value: string, onChange: (v: string) => void): ReactElement => (
    <Select label="Variable" value={value} placeholder="Choose a variable…" onChange={onChange} options={p.variables.map(x => [x.id, x.name] as const)} />
  );
  let field: ReactElement;
  switch (a.type) {
    case 'equipSet': {
      const found = p.sets.find(s => s.id === a.setId) ?? (a.setName ? p.sets.find(s => s.name.toLowerCase() === a.setName!.toLowerCase()) : undefined);
      field = <Select label="Gear set" value={found?.id ?? ''} placeholder={a.setName ? `Missing: ${a.setName}` : 'Choose a set…'} onChange={v => update(x => { if (x.type === 'equipSet') { x.setId = v; delete x.setName; } })} options={p.sets.map(s => [s.id, s.name] as const)} />;
      break;
    }
    case 'equipSetVar':
      field = (
        <>
          <div className="pair">
            <TextInput label="Set name prefix" placeholder="Prefix, e.g. TP_" value={a.prefix} onChange={v => update(x => { if (x.type === 'equipSetVar') x.prefix = v; })} />
            {varSel(a.varId, v => update(x => { if (x.type === 'equipSetVar') x.varId = v; }, 'var'))}
          </div>
          <p className="hint small">Equips the set named prefix + the variable’s current value, for example TP_Acc.</p>
        </>
      );
      break;
    case 'equipItem':
      field = (
        <div className="pair">
          <Select label="Slot" value={a.slot} onChange={v => update(x => { if (x.type === 'equipItem') x.slot = v as SlotName; })} options={SLOT_NAMES} />
          <TextInput label="Item" placeholder="Item name" value={a.item} onChange={v => update(x => { if (x.type === 'equipItem') x.item = v; })} />
        </div>
      );
      break;
    case 'message':
      field = <TextInput label="Message" placeholder="Text shown in the chat log" value={a.text} onChange={v => update(x => { if (x.type === 'message') x.text = v; })} />;
      break;
    case 'setVar': {
      const v = p.variables.find(x => x.id === a.varId);
      field = (
        <div className="pair">
          {varSel(a.varId, id => update(x => { if (x.type === 'setVar') { x.varId = id; x.value = p.variables.find(y => y.id === id)?.options[0] ?? ''; } }, 'var'))}
          {v && <Select label="Value" value={a.value} placeholder="Choose…" onChange={val => update(x => { if (x.type === 'setVar') x.value = val; })} options={v.options} />}
        </div>
      );
      break;
    }
    case 'rawLua':
      field = <TextArea label="Lua code" rows={3} placeholder="Lua statements" value={a.code} onChange={v => update(x => { if (x.type === 'rawLua') x.code = v; })} />;
      break;
  }
  return (
    <div className="arow">
      <Select label="Action type" value={a.type} onChange={changeType} options={ACTION_TYPES} />
      <div className="stack">{field}</div>
      <IconBtn label="Remove action" onClick={() => editVisual(rule.id, r => { r.actions.splice(i, 1); })}>✕</IconBtn>
    </div>
  );
}

/* ---------- rule card ---------- */

function RuleCard({ rule, index, siblings, p, flash }: { rule: Rule; index: number; siblings: Rule[]; p: Profile; flash: boolean }): ReactElement {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!flash) return;
    ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => setState({ flash: null }), 1300);
    return () => clearTimeout(t);
  }, [flash]);
  const pos = siblings.indexOf(rule);
  const move = (dir: number): void => mutateProfile(pr => {
    const sib = pr.rules.filter(x => x.handler === rule.handler);
    const j = sib.findIndex(x => x.id === rule.id) + dir;
    if (j < 0 || j >= sib.length) return;
    const a = pr.rules.findIndex(x => x.id === rule.id), b = pr.rules.findIndex(x => x.id === sib[j]!.id);
    [pr.rules[a], pr.rules[b]] = [pr.rules[b]!, pr.rules[a]!];
  });
  const duplicate = (): void => mutateProfile(pr => {
    const at = pr.rules.findIndex(x => x.id === rule.id);
    const c = JSON.parse(JSON.stringify(rule)) as Rule;
    c.id = uid('rule'); c.name = rule.name ? rule.name + ' copy' : '';
    pr.rules.splice(at + 1, 0, c);
  });
  const placeholder = ruleTitle({ ...rule, name: '' }, p);
  return (
    <article ref={ref} id={'rule-' + rule.id} className={cx('win rule', !rule.enabled && 'off', flash && 'flash')}>
      <div className="rule-head">
        <span className="num" title="Rules run top to bottom">{index + 1}</span>
        <Check checked={rule.enabled} onChange={v => editRule(rule.id, r => { r.enabled = v; })} title="Switch the rule off without deleting it">On</Check>
        <input className="rname" aria-label="Rule name" placeholder={placeholder} value={rule.name} onChange={e => editRule(rule.id, r => { r.name = e.target.value; }, 'name')} />
        {rule.kind === 'rule' && pos > 0 && <Check checked={rule.exclusive} onChange={v => editRule(rule.id, r => { r.exclusive = v; })} title="Generates an elseif: this rule is only checked when the rule above did not match">Otherwise</Check>}
        <IconBtn label="Move up" disabled={pos === 0} onClick={() => move(-1)}>↑</IconBtn>
        <IconBtn label="Move down" disabled={pos === siblings.length - 1} onClick={() => move(1)}>↓</IconBtn>
        <Btn small variant="ghost" onClick={duplicate}>Duplicate</Btn>
        <ConfirmBtn onConfirm={() => mutateProfile(pr => { pr.rules = pr.rules.filter(x => x.id !== rule.id); })} />
      </div>
      {rule.kind === 'raw' ? (
        <div className="rule-body single">
          <div>
            <p className="raw-flag">Custom Lua block</p>
            <p className="hint small mb-2">This code could not be shown as a visual rule. It is written to the file exactly as you see it.</p>
            <TextArea label="Lua code" rows={Math.min(14, Math.max(4, rule.code.split('\n').length + 1))} value={rule.code} onChange={v => editRule(rule.id, r => { if (r.kind === 'raw') r.code = v; }, 'code')} />
          </div>
        </div>
      ) : (
        <div className="rule-body">
          <div><div className="col-title">When</div><GroupEditor rule={rule} path={[]} g={rule.when} p={p} depth={0} /></div>
          <div>
            <div className="col-title">Then</div>
            <div className="grid gap-2">
              {rule.actions.map((a, i) => <ActionRow key={i} rule={rule} i={i} a={a} p={p} />)}
              <div className="add-row"><Btn small onClick={() => editVisual(rule.id, r => { r.actions.push(p.sets[0] ? { type: 'equipSet', setId: p.sets[0].id } : newAction('equipSet')); })}>+ Action</Btn></div>
            </div>
          </div>
          <div className="english"><b>Plain English:</b> {describeRule(rule, p)}</div>
        </div>
      )}
    </article>
  );
}

export function RulesView(): ReactElement {
  const p = useProfile();
  const handler = useStore(s => s.handler);
  const flash = useStore(s => s.flash);
  const game = useStore(s => s.game);
  const h = handlerInfo(handler)!;
  const rules = p.rules.filter(r => r.handler === handler);
  const addRule = (): void => {
    const r = newRule(handler as HandlerId);
    if (p.sets[0]) r.actions.push({ type: 'equipSet', setId: p.sets[0].id });
    mutateProfile(pr => { pr.rules.push(r); });
    setState({ flash: r.id });
  };
  return (
    <>
      <div className="handler-tabs" role="tablist" aria-label="When rules run">
        {HANDLERS.map(x => {
          const n = p.rules.filter(r => r.handler === x.id).length;
          return <button key={x.id} type="button" role="tab" className="hpill" aria-selected={x.id === handler} onClick={() => setState({ handler: x.id })}>{x.label}{n > 0 && <Badge>{n}</Badge>}</button>;
        })}
      </div>
      <div className="handler-info">
        <b>{h.label}</b> <code>profile.{h.id}</code><br />
        {h.blurb} Rules run top to bottom. When two rules fill the same slot, the later one wins, unless you tick “Otherwise” to make a rule apply only when the one above did not match.
        {!h.action && ' There is no current action here, so spell and ability checks are not available.'}
      </div>
      <div className="rules">
        {rules.length === 0 && (
          <div className="empty-state">
            No rules in {h.label} yet.<br />A rule says “when these things are true, equip this set”.<br /><br />
            <Btn variant="primary" onClick={addRule}>+ Add a rule</Btn>
          </div>
        )}
        {rules.map((r, i) => <RuleCard key={r.id} rule={r} index={i} siblings={rules} p={p} flash={flash === r.id} />)}
        {rules.length > 0 && (
          <div className="add-row">
            <Btn variant="primary" onClick={addRule}>+ Add a rule</Btn>
            <Btn onClick={() => mutateProfile(pr => { pr.rules.push(newRawRule(handler as HandlerId, '-- your Lua here')); })}>+ Custom Lua block</Btn>
          </div>
        )}
      </div>
      <datalist id="dl-spells">{spellOptions(game.data)}</datalist>
      <datalist id="dl-abilities">{game.data.abilityInfo?.length ? game.data.abilityInfo.slice(0, 4000).map(x => <option key={x.id} value={x.n} label={[x.type, x.mp ? x.mp + ' MP' : '', x.tp ? x.tp + ' TP' : ''].filter(Boolean).join(' · ')} />) : game.data.abilities.slice(0, 4000).map(x => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-weaponskills">{game.data.weaponskillInfo?.length ? game.data.weaponskillInfo.slice(0, 4000).map(x => <option key={x.id} value={x.n} label={x.type} />) : game.data.weaponskills.slice(0, 4000).map(x => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-buffs">{game.data.buffs.slice(0, 4000).map(x => <option key={x} value={x} />)}</datalist>
    </>
  );
}

/** Spell suggestions with skill, element and cheapest job level, so similar names are easy to tell apart. */
function spellOptions(d: GameData): ReactElement[] {
  if (!d.spellInfo?.length) return d.spells.slice(0, 4000).map(x => <option key={x} value={x} />);
  return d.spellInfo.slice(0, 4000).map(x => {
    const lv = Object.entries(x.lv).sort((a, b) => a[1] - b[1])[0];
    const label = [x.skill, x.el, x.mp ? x.mp + ' MP' : '', lv ? `${lv[0]} ${lv[1]}` : ''].filter(Boolean).join(' · ');
    return <option key={x.id} value={x.n} label={label} />;
  });
}
