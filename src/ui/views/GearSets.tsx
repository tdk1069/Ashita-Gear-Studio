/* Gear Sets tab: set list, paper doll, and the slot inspector with the item picker. */
import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { AugPath, GearSet, ItemEntry, Profile, SlotName } from '../../core';
import { BAGS, SLOT_NAMES, clone, itemExpr, newItem, newSet, ruleTitle, handlerInfo } from '../../core';
import { Btn, ConfirmBtn, Field, Icon, Select, TextArea, TextInput, Window, cx } from '../components/ui';
import { mutateProfile, setNameMode, setState, useProfile, useStore } from '../store';

function uniqueName(base: string, names: string[]): string {
  const low = names.map(n => n.toLowerCase());
  if (!low.includes(base.toLowerCase())) return base;
  let i = 2;
  while (low.includes((base + '_' + i).toLowerCase())) i++;
  return base + '_' + i;
}
const filled = (s: GearSet): number => SLOT_NAMES.filter(sl => itemExpr(s.slots[sl])).length;

/** Rules that equip this set, directly or through a variable-built name. */
function usedBy(p: Profile, set: GearSet): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  for (const r of p.rules) {
    if (r.kind !== 'rule') continue;
    const hit = r.actions.some(a => {
      if (a.type === 'equipSet') return a.setId === set.id;
      if (a.type === 'equipSetVar') return (p.variables.find(v => v.id === a.varId)?.options ?? []).some(o => (a.prefix + o).toLowerCase() === set.name.toLowerCase());
      return false;
    });
    if (hit) out.push({ id: r.id, title: `${ruleTitle(r, p)} in ${handlerInfo(r.handler)?.label ?? r.handler}` });
  }
  return out;
}

function SetList({ p }: { p: Profile }): ReactElement {
  const setId = useStore(s => s.setId);
  const cur = p.sets.find(s => s.id === setId) ?? null;
  const add = (): void => {
    const s = newSet(uniqueName('NewSet', p.sets.map(x => x.name)));
    mutateProfile(pr => { pr.sets.push(s); });
    setState({ setId: s.id });
  };
  const dup = (): void => {
    if (!cur) return;
    const c = clone(cur);
    c.id = newSet().id; c.name = uniqueName(cur.name + '_Copy', p.sets.map(x => x.name));
    mutateProfile(pr => { pr.sets.splice(pr.sets.findIndex(s => s.id === cur.id) + 1, 0, c); });
    setState({ setId: c.id });
  };
  const remove = (): void => { if (cur) mutateProfile(pr => { pr.sets = pr.sets.filter(s => s.id !== cur.id); }); };
  return (
    <Window title="Gear sets" className="self-start">
      <div className="setlist" role="listbox" aria-label="Gear sets">
        {!p.sets.length && <p className="hint p-2">No gear sets yet.</p>}
        {p.sets.map(s => (
          <button key={s.id} type="button" role="option" aria-selected={s.id === setId} className="setrow" aria-current={s.id === setId} onClick={() => setState({ setId: s.id })}>
            <b>{s.name || '(unnamed)'}</b><span>{filled(s)} of 16 slots</span><i className="cnt">{filled(s)}</i>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 p-3 pt-1">
        <Btn small variant="primary" onClick={add}>+ New set</Btn>
        <Btn small onClick={dup} disabled={!cur}>Duplicate</Btn>
        {cur && <ConfirmBtn key={cur.id} onConfirm={remove} />}
      </div>
    </Window>
  );
}

function SlotTile({ set, slot, active }: { set: GearSet; slot: SlotName; active: boolean }): ReactElement {
  const game = useStore(s => s.game);
  const atlas = useStore(s => s.icons.items);
  const it = set.slots[slot];
  const has = !!itemExpr(it);
  const unknown = has && it && !it.raw && !game.isStarter && !game.has(slot, it.name);
  return (
    <button type="button" className={cx('slot', has && 'filled')} aria-pressed={active} onClick={() => setState({ slot })}>
      <span className="sl"><span>{slot}</span><i className="gem" /></span>
      <span className="item">{has && !it!.raw && <Icon atlas={atlas} cell={game.lookup(it!.name)?.icon} size={24} />}{has ? <span>{it!.raw ?? it!.name}</span> : <span className="empty">Empty</span>}</span>
      <span className="meta">
        {it?.raw && <span className="tag raw">Custom Lua</span>}
        {it && !it.raw && (it.augPath || it.augments.some(Boolean) || it.augRank != null || it.augTrial != null) && (
          <span className="tag">{[it.augPath && 'Path ' + it.augPath, it.augRank != null && 'Rank ' + it.augRank, it.augTrial != null && 'Trial ' + it.augTrial, it.augments.some(Boolean) && it.augments.filter(Boolean).length + ' aug'].filter(Boolean).join(' · ')}</span>
        )}
        {it?.bag && <span className="tag">{it.bag}</span>}
        {unknown && <span className="tag raw" title="This name is not in the loaded game data for this slot. Check the spelling.">Not in game data</span>}
      </span>
    </button>
  );
}

function PaperDoll({ p }: { p: Profile }): ReactElement {
  const setId = useStore(s => s.setId);
  const slot = useStore(s => s.slot);
  const set = p.sets.find(s => s.id === setId);
  if (!set) {
    return (
      <Window className="doll-wrap">
        <div className="empty-state border-0">Create your first gear set. A set is a named group of equipment such as Idle, TP or Fast Cast.</div>
      </Window>
    );
  }
  const by = usedBy(p, set);
  const edit = (fn: (s: GearSet) => void, key: string): void => mutateProfile(pr => { const s = pr.sets.find(x => x.id === set.id); if (s) fn(s); }, key);
  return (
    <Window className="doll-wrap">
      <div className="doll-title">
        <input className="name" aria-label="Gear set name" value={set.name} onChange={e => edit(s => { s.name = e.target.value; }, 'setname:' + set.id)} />
      </div>
      <div className="doll" role="group" aria-label="Equipment slots">
        <div className="doll-crest" aria-hidden="true">
          <svg viewBox="0 0 32 32"><path d="M16 2 26 14 16 30 6 14Z" fill="none" stroke="#e3bd62" strokeWidth="1" /><path d="M6 14h20M16 2v28M11 14 16 2l5 12-5 16Z" fill="none" stroke="#e3bd62" strokeWidth=".6" /></svg>
        </div>
        {SLOT_NAMES.map(sl => <SlotTile key={sl} set={set} slot={sl} active={sl === slot} />)}
      </div>
      <div className="used-in">
        {by.length
          ? <>Used by: {by.map(r => <button key={r.id} type="button" className="chip" onClick={() => setState({ tab: 'rules', handler: p.rules.find(x => x.id === r.id)!.handler, flash: r.id })}>{r.title}</button>)}</>
          : <>No rule uses this set yet. Add one on the Rules tab, or equip it in game with <code>/lac set {set.name}</code>.</>}
      </div>
      <textarea className="note" aria-label="Note for this set" rows={1} placeholder="Optional note, written into the file as a comment" value={set.note} onChange={e => edit(s => { s.note = e.target.value; }, 'setnote:' + set.id)} />
    </Window>
  );
}

/* ---------- inspector ---------- */

function ItemPicker({ set, slot }: { set: GearSet; slot: SlotName }): ReactElement {
  const game = useStore(s => s.game);
  const loading = useStore(s => s.gameLoading);
  const atlas = useStore(s => s.icons.items);
  const nameMode = useStore(s => s.nameMode);
  const [query, setQuery] = useState('');
  const [maxLevel, setMaxLevel] = useState('');
  const [cursor, setCursor] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setQuery(''); setCursor(0); input.current?.focus({ preventScroll: true }); }, [slot, set.id]);
  const lvl = maxLevel.trim() === '' ? undefined : Number(maxLevel);
  const { hits, total } = useMemo(() => game.search(slot, { query, maxLevel: Number.isFinite(lvl) ? lvl : undefined, limit: 80 }), [game, slot, query, lvl]);
  const typed = query.trim();
  const showTyped = typed !== '' && !hits.some(h => h.name.toLowerCase() === typed.toLowerCase());
  const rows: { name: string; level: number; long?: string; icon?: number; typed?: boolean }[] = [...hits, ...(showTyped ? [{ name: typed, level: 0, typed: true }] : [])];

  const choose = (name: string): void => {
    const hit = hits.find(h => h.name === name);
    if (hit && nameMode === 'long' && hit.long) name = hit.long;
    mutateProfile(pr => { const s = pr.sets.find(x => x.id === set.id); if (s) s.slots[slot] = newItem(name); });
    setQuery(''); setCursor(0);
  };
  useEffect(() => { list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }, [cursor]);
  const onKey = (e: ReactKeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(rows.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') { const r = rows[cursor]; if (r) { e.preventDefault(); choose(r.name); } }
  };
  return (
    <>
      <div className="grid grid-cols-[1fr_auto] gap-2.5">
        <Field label="Search or type an item">
          <input ref={input} type="text" autoComplete="off" role="combobox" aria-expanded="true" aria-controls="item-results" placeholder={game.isStarter ? 'Search the sample list, or type any name' : `Search ${game.count(slot).toLocaleString()} items`} value={query} onChange={e => { setQuery(e.target.value); setCursor(0); }} onKeyDown={onKey} />
        </Field>
        <Field label="Max level"><input type="number" min={1} max={99} className="w-[5.2rem]" placeholder="Any" value={maxLevel} onChange={e => { setMaxLevel(e.target.value); setCursor(0); }} /></Field>
      </div>
      {hits.some(h => h.long && h.long !== h.name) && (
        <p className="hint small">Write item names as: <button type="button" className="linkbtn" aria-pressed={nameMode === 'short'} onClick={() => setNameMode('short')}>{nameMode === 'short' ? '● ' : ''}in-game short name</button> · <button type="button" className="linkbtn" aria-pressed={nameMode === 'long'} onClick={() => setNameMode('long')}>{nameMode === 'long' ? '● ' : ''}full name</button></p>
      )}
      {game.isStarter && loading && <p className="hint small">Loading the full item list…</p>}
      {game.isStarter && !loading && <p className="hint small">Only a small sample list is loaded. <button type="button" className="linkbtn" onClick={() => setState({ dialog: { type: 'gamedata', busy: false, message: '', error: '' } })}>Load the full item list</button></p>}
        <div className="results" id="item-results" role="listbox" ref={list}>
        {rows.map((r, i) => (
          <button key={(r.typed ? 'typed:' : '') + r.name} type="button" role="option" aria-selected={i === cursor} className={cx('result', r.typed && 'custom')} onMouseEnter={() => setCursor(i)} onClick={() => choose(r.name)}>
            {r.typed ? <>Use “{r.name}” as typed</> : <><span className="nm"><Icon atlas={atlas} cell={r.icon} size={24} /><span>{r.name}{r.long && r.long !== r.name && <span className="full">{r.long}</span>}</span></span>{r.level > 0 && <span className="lv">Lv {r.level}</span>}</>}
          </button>
        ))}
        {!rows.length && <p className="hint p-2.5">{game.count(slot) ? 'Nothing matches. Clear the search or raise the level.' : 'No items for this slot. Type a name above.'}</p>}
      </div>
      <p className="hint small">{total > hits.length ? `Showing ${hits.length} of ${total.toLocaleString()} matches. Keep typing to narrow it down.` : `${total.toLocaleString()} match${total === 1 ? '' : 'es'}.`} Arrow keys and Enter pick an item.</p>
    </>
  );
}

function ItemDetails({ set, slot, it }: { set: GearSet; slot: SlotName; it: ItemEntry }): ReactElement {
  const edit = (fn: (i: ItemEntry) => void, key: string): void => mutateProfile(pr => { const i = pr.sets.find(x => x.id === set.id)?.slots[slot]; if (i) fn(i); }, `item:${set.id}:${slot}:${key}`);
  if (it.raw) {
    return (
      <div className="row-item">
        <span className="raw-flag">Custom Lua</span>
        <code className="break-words text-[13px]">{it.raw}</code>
        <p className="hint small">This entry is written in Lua that cannot be shown as a plain item. It is kept exactly as written. Choose an item above to replace it.</p>
      </div>
    );
  }
  const numOrUndef = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));
  return (
    <div className="row-item">
      <Field label="Item name"><TextInput value={it.name} onChange={v => edit(i => { i.name = v; }, 'name')} /></Field>
      <div className="grid2">
        <Field label="Augment path"><Select value={it.augPath} onChange={v => edit(i => { i.augPath = v as AugPath; }, 'path')} options={[['', 'None'], 'A', 'B', 'C', 'D']} /></Field>
        <Field label="Must be in bag"><Select value={it.bag ?? ''} onChange={v => edit(i => { if (v) i.bag = v; else delete i.bag; }, 'bag')} options={[['', 'Any'], ...BAGS]} /></Field>
      </div>
      <div className="grid2">
        <Field label="Augment rank"><TextInput type="number" value={it.augRank ?? ''} onChange={v => edit(i => { const n = numOrUndef(v); if (n === undefined) delete i.augRank; else i.augRank = n; }, 'rank')} placeholder="Any" /></Field>
        <Field label="Augment trial"><TextInput type="number" value={it.augTrial ?? ''} onChange={v => edit(i => { const n = numOrUndef(v); if (n === undefined) delete i.augTrial; else i.augTrial = n; }, 'trial')} placeholder="Any" /></Field>
      </div>
      <Field label="Augments, one per line">
        <TextArea rows={3} value={it.augments.join('\n')} placeholder="Example: DEX+5" onChange={v => edit(i => { i.augments = v.split('\n'); }, 'augs')} />
      </Field>
      <p className="hint small">With one augment line, any matching augment qualifies. With several, each line must match one of the item’s augments. These are the item matching fields LuAshitacast documents, so you can tell two copies of the same item apart.</p>
      {it.extras.length > 0 && <p className="hint small">Other fields kept as written: {it.extras.map(e => `${e.k} = ${e.raw}`).join(', ')}</p>}
    </div>
  );
}

function Inspector({ p }: { p: Profile }): ReactElement {
  const setId = useStore(s => s.setId);
  const slot = useStore(s => s.slot);
  const game = useStore(s => s.game);
  const set = p.sets.find(s => s.id === setId);
  if (!set) return <Window title="Slot" className="inspector self-start"><div className="body"><p className="hint">Create a gear set to start choosing equipment.</p></div></Window>;
  const it = set.slots[slot];
  return (
    <Window title={`${slot} slot`} actions={<span className="hint small">in “{set.name}”</span>} className="inspector self-start">
      <div className="body">
        <ItemPicker set={set} slot={slot} />
        <div className="flex flex-wrap gap-1.5">
          <Btn small disabled={!it} onClick={() => mutateProfile(pr => { const s = pr.sets.find(x => x.id === set.id); if (s) delete s.slots[slot]; })}>Empty this slot</Btn>
        </div>
        {it && <ItemDetails key={set.id + slot} set={set} slot={slot} it={it} />}
        <div className="datasource">
          {game.isStarter
            ? <><b>Sample list.</b> {game.itemCount} items. Any name you type still works.</>
            : <><b>{game.itemCount.toLocaleString()} items</b> from {game.data.source || 'game data'}.</>}
          <Btn small variant="ghost" onClick={() => setState({ dialog: { type: 'gamedata', busy: false, message: '', error: '' } })}>Game data…</Btn>
        </div>
      </div>
    </Window>
  );
}

export function GearSetsView(): ReactElement {
  const p = useProfile();
  return (
    <div className="workspace">
      <SetList p={p} />
      <PaperDoll p={p} />
      <Inspector p={p} />
    </div>
  );
}
