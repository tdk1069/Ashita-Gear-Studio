/* Profile tab: name and job, settings, variables, commands and the advanced custom Lua boxes. */
import type { ReactElement } from 'react';
import type { Command, CommandKind, Profile } from '../../core';
import { COMMAND_KINDS, newCommand, newVariable, uid } from '../../core';
import { JOBS } from '../../data/jobs';
import { Btn, Check, ConfirmBtn, Field, Select, TextArea, TextInput, Window } from '../components/ui';
import { mutate, mutateProfile, setState, useProfile, useStore } from '../store';

function uniqueName(base: string, names: string[]): string {
  let n = base, i = 2;
  while (names.includes(n)) n = base + i++;
  return n;
}

function ProfileCard({ p }: { p: Profile }): ReactElement {
  const count = useStore(s => s.project.profiles.length);
  const dupProfile = (): void => {
    mutate(proj => {
      const src = proj.profiles.find(x => x.id === p.id)!;
      const c = JSON.parse(JSON.stringify(src)) as Profile;
      const idMap = new Map<string, string>();
      c.id = uid('prof'); c.name = src.name + ' copy'; c.importReport = null;
      c.sets.forEach(s => { const n = uid('set'); idMap.set(s.id, n); s.id = n; });
      c.variables.forEach(v => { const n = uid('var'); idMap.set(v.id, n); v.id = n; });
      c.rules.forEach(r => { r.id = uid('rule'); if (r.kind === 'rule') { r.actions.forEach(a => { if (a.type === 'equipSet') a.setId = idMap.get(a.setId) ?? a.setId; if ('varId' in a) a.varId = idMap.get(a.varId) ?? a.varId; }); const fix = (g: typeof r.when): void => g.children.forEach(ch => { if ('children' in ch) fix(ch); else if (ch.varId) ch.varId = idMap.get(ch.varId) ?? ch.varId; }); fix(r.when); } });
      c.commands.forEach(cm => { cm.id = uid('cmd'); if ('varId' in cm) cm.varId = idMap.get(cm.varId) ?? cm.varId; if (cm.kind === 'lock') cm.setId = idMap.get(cm.setId) ?? cm.setId; });
      proj.profiles.push(c);
      setState({ profileId: c.id });
    });
  };
  return (
    <Window title="Profile" bodyClass="body form">
      <div className="grid2">
        <Field label="Name"><TextInput value={p.name} onChange={v => mutateProfile(pr => { pr.name = v; }, 'pname')} /></Field>
        <Field label="Job"><Select value={p.job} placeholder="None" onChange={v => mutateProfile(pr => { pr.job = v; })} options={JOBS.map(j => [j.abbr, `${j.abbr} · ${j.name}`] as const)} /></Field>
      </div>
      <p className="hint small">Save the exported file as <code>{p.job || 'Job'}.lua</code> in <code>ashita/config/addons/luashitacast/CharName_CharId/</code>.</p>
      <Check checked={p.settings.allowAddSet} onChange={v => mutateProfile(pr => { pr.settings.allowAddSet = v; })}>Allow <code>/lac addset</code> in game</Check>
      <Check checked={p.settings.addSetBackup} onChange={v => mutateProfile(pr => { pr.settings.addSetBackup = v; })}>Back up the profile before <code>addset</code> writes to it</Check>
      <div className="flex flex-wrap items-center gap-1.5">
        <Btn small onClick={dupProfile}>Duplicate this profile</Btn>
        {count > 1 ? <ConfirmBtn label="Delete this profile" onConfirm={() => mutate(proj => { proj.profiles = proj.profiles.filter(x => x.id !== p.id); })} /> : <span className="hint small">The last profile cannot be deleted.</span>}
      </div>
    </Window>
  );
}

function Variables({ p }: { p: Profile }): ReactElement {
  return (
    <Window title="Variables" bodyClass="body form">
      <p className="hint small">A variable holds a mode such as Normal or Acc. Rules can check it, equip a set named after it, and commands can change it in game.</p>
      {p.variables.map(v => (
        <div className="row-item" key={v.id}>
          <div className="grid2">
            <Field label="Name"><TextInput value={v.name} onChange={val => mutateProfile(pr => { const x = pr.variables.find(y => y.id === v.id); if (x) x.name = val; }, 'vn' + v.id)} /></Field>
            <Field label="Options, separated by commas">
              <TextInput value={v.options.join(', ')} onChange={val => mutateProfile(pr => { const x = pr.variables.find(y => y.id === v.id); if (!x) return; x.options = val.split(',').map(s => s.trim()).filter(Boolean); if (!x.options.includes(x.value)) x.value = x.options[0] ?? ''; }, 'vo' + v.id)} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="field inline-flex items-center gap-2"><span>Starts as</span><Select value={v.value} onChange={val => mutateProfile(pr => { const x = pr.variables.find(y => y.id === v.id); if (x) x.value = val; })} options={v.options} className="!w-auto" /></label>
            <span className="ml-auto"><ConfirmBtn onConfirm={() => mutateProfile(pr => { pr.variables = pr.variables.filter(y => y.id !== v.id); })} /></span>
          </div>
        </div>
      ))}
      <div className="add-row"><Btn small onClick={() => mutateProfile(pr => { pr.variables.push(newVariable(uniqueName('Mode', pr.variables.map(x => x.name)))); })}>+ Variable</Btn></div>
    </Window>
  );
}

function CommandCard({ p, c }: { p: Profile; c: Command }): ReactElement {
  const edit = (fn: (c: Command) => void, key?: string): void => mutateProfile(pr => { const x = pr.commands.find(y => y.id === c.id); if (x) fn(x); }, key ? 'cmd' + c.id + key : undefined);
  const changeKind = (kind: CommandKind): void => edit(x => {
    const idx = p.commands.findIndex(y => y.id === c.id);
    const base = { id: x.id, name: x.name };
    const v0 = p.variables[0]?.id ?? '';
    const next: Command = kind === 'cycle' ? { ...base, kind, varId: v0 } : kind === 'set' ? { ...base, kind, varId: v0, value: p.variables[0]?.options[0] ?? '' } : kind === 'lock' ? { ...base, kind, setId: p.sets[0]?.id ?? '', seconds: 30 } : { ...base, kind, code: '' };
    void idx;
    Object.keys(x).forEach(k => { delete (x as unknown as Record<string, unknown>)[k]; });
    Object.assign(x, next);
  });
  const varSel = (value: string, onChange: (v: string) => void): ReactElement => <Select label="Variable" value={value} placeholder="Choose a variable…" onChange={onChange} options={p.variables.map(x => [x.id, x.name] as const)} />;
  let body: ReactElement;
  if (c.kind === 'cycle') body = varSel(c.varId, v => edit(x => { if (x.kind === 'cycle') x.varId = v; }));
  else if (c.kind === 'set') {
    const v = p.variables.find(x => x.id === c.varId);
    body = <div className="pair">{varSel(c.varId, id => edit(x => { if (x.kind === 'set') { x.varId = id; x.value = p.variables.find(y => y.id === id)?.options[0] ?? ''; } }))}{v && <Select label="Value" value={c.value} placeholder="Choose…" onChange={val => edit(x => { if (x.kind === 'set') x.value = val; })} options={v.options} />}</div>;
  } else if (c.kind === 'lock') {
    body = (
      <div className="pair">
        <Select label="Gear set" value={c.setId} placeholder="Choose a set…" onChange={v => edit(x => { if (x.kind === 'lock') x.setId = v; })} options={p.sets.map(s => [s.id, s.name] as const)} />
        <TextInput type="number" label="Seconds" value={c.seconds} onChange={v => edit(x => { if (x.kind === 'lock') x.seconds = Number(v) || 0; }, 'sec')} className="!max-w-28" />
        <span className="hint small self-center !flex-none">seconds</span>
      </div>
    );
  } else body = <TextArea label="Lua code" rows={3} value={c.code} onChange={v => edit(x => { if (x.kind === 'raw') x.code = v; }, 'code')} />;
  return (
    <div className="row-item">
      <div className="grid2">
        <Field label="Command name"><TextInput value={c.name} placeholder="tpmode" onChange={v => edit(x => { x.name = v; }, 'name')} /></Field>
        <Field label="What it does"><Select value={c.kind} onChange={v => changeKind(v as CommandKind)} options={COMMAND_KINDS} /></Field>
      </div>
      {body}
      <div className="flex flex-wrap items-center gap-2">
        <span className="hint small">In game: <code>/lac fwd {c.name.trim().toLowerCase() || 'name'}</code></span>
        <span className="ml-auto"><ConfirmBtn onConfirm={() => mutateProfile(pr => { pr.commands = pr.commands.filter(y => y.id !== c.id); })} /></span>
      </div>
    </div>
  );
}

function Commands({ p }: { p: Profile }): ReactElement {
  return (
    <Window title="Commands" bodyClass="body form">
      <p className="hint small">Commands run in game with <code>/lac fwd name</code>. Bind them to a macro or key.</p>
      {p.commands.map(c => <CommandCard key={c.id} p={p} c={c} />)}
      <div className="add-row"><Btn small onClick={() => mutateProfile(pr => { pr.commands.push(newCommand(pr.variables[0]?.id ?? '')); })}>+ Command</Btn></div>
    </Window>
  );
}

function Advanced({ p }: { p: Profile }): ReactElement {
  const boxes: [keyof Profile['raw'], string, number][] = [
    ['custom', 'Top-level code (runs when the file loads, before the handlers)', 8],
    ['OnLoad', 'Extra code inside OnLoad', 4],
    ['OnUnload', 'Code inside OnUnload', 4],
    ['HandleCommand', 'Code inside HandleCommand (runs before your commands above)', 4],
  ];
  const open = Object.values(p.raw).some(v => v.trim());
  return (
    <details className="adv" open={open || undefined}>
      <summary>Advanced: custom Lua</summary>
      <div className="inner">
        <p className="hint small">For anything the visual tools cannot express. Imported code that could not be turned into rules is kept here. Nothing in these boxes is changed by Gear Studio.</p>
        {boxes.map(([k, label, rows]) => (
          <Field label={label} key={k}><TextArea rows={rows} value={p.raw[k]} onChange={v => mutateProfile(pr => { pr.raw[k] = v; }, 'raw' + k)} /></Field>
        ))}
      </div>
    </details>
  );
}

export function ProfileView(): ReactElement {
  const p = useProfile();
  return (
    <div className="cols">
      <div className="stack-16"><ProfileCard p={p} /><Variables p={p} /></div>
      <div className="stack-16"><Commands p={p} /><Advanced p={p} /></div>
    </div>
  );
}
