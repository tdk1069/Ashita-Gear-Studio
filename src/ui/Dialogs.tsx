/* Modal dialogs: new profile, import Lua, game data and the save-as-text fallback. */
import type { ReactElement } from 'react';
import { JOB_ABBRS, LuaSyntaxError, importLua, normaliseProject } from '../core';
import { JOBS } from '../data/jobs';
import { TEMPLATES, defaultTemplate, makeProfile } from '../data/templates';
import type { TemplateId } from '../data/templates';
import { Btn, Dialog, Field, Select, TextArea, TextInput, cx } from './components/ui';
import { copyText, pickFiles } from './files';
import type { DialogState } from './store';
import { installGameData, mutate, removeGameData, replaceProject, setState, toast, useStore } from './store';

const close = (): void => setState({ dialog: null });
type Of<T extends DialogState['type']> = Extract<DialogState, { type: T }>;
const jobOptions = JOBS.map(j => [j.abbr, `${j.abbr} · ${j.name}`] as const);

function NewProfile({ d }: { d: Of<'new-profile'> }): ReactElement {
  const set = (patch: Partial<Of<'new-profile'>>): void => setState({ dialog: { ...d, ...patch } });
  const create = (): void => {
    const np = makeProfile(d.job, d.tmpl, d.name.trim() || d.job || 'Profile');
    mutate(p => { p.profiles.push(np); });
    setState({ profileId: np.id, setId: null, tab: 'sets', dialog: null });
  };
  return (
    <Dialog title="New profile" onClose={close} footer={<><Btn onClick={close}>Cancel</Btn><Btn variant="primary" onClick={create}>Create profile</Btn></>}>
      <div className="grid2">
        <Field label="Job"><Select value={d.job} placeholder="Other" onChange={v => set({ job: v, name: !d.name || d.name === d.job ? v || d.name : d.name, tmpl: defaultTemplate(v) })} options={jobOptions} /></Field>
        <Field label="Profile name"><TextInput value={d.name} onChange={v => set({ name: v })} /></Field>
      </div>
      <div className="col-title !m-0">Starting point</div>
      <div className="tmpl-grid">
        {TEMPLATES.map(t => <button key={t.id} type="button" className="tmpl" aria-pressed={d.tmpl === t.id} onClick={() => set({ tmpl: t.id as TemplateId })}><b>{t.label}</b><small>{t.blurb}</small></button>)}
      </div>
    </Dialog>
  );
}

function ImportDialog({ d }: { d: Of<'import'> }): ReactElement {
  const set = (patch: Partial<Of<'import'>>): void => setState({ dialog: { ...d, ...patch } });
  const choose = async (): Promise<void> => { const [f] = await pickFiles('.lua,.txt,text/plain'); if (f) set({ text: f.text, fileName: f.name, error: '' }); };
  const run = (): void => {
    if (!d.text.trim()) { set({ error: 'Paste your Lua or choose a file first.' }); return; }
    const base = d.fileName.replace(/\.lua(\.txt)?$/i, '');
    let job = d.job;
    if (!job && JOB_ABBRS.includes(base.toUpperCase())) job = base.toUpperCase();
    const name = d.name.trim() || base || job || 'Imported';
    try {
      const p = importLua(d.text, { name, job, fileName: d.fileName });
      mutate(proj => { proj.profiles.push(p); });
      setState({ profileId: p.id, setId: null, tab: 'lua', dialog: null });
      toast(`Imported ${p.sets.length} sets and ${p.rules.length} rules`, true);
    } catch (e) {
      set({ error: e instanceof LuaSyntaxError ? `This does not look like valid Lua: ${e.message} (line ${e.line}). Fix it in a text editor and try again.` : `Could not import this file: ${(e as Error).message}` });
    }
  };
  return (
    <Dialog title="Import a LuAshitacast profile" onClose={close} footer={<><Btn onClick={close}>Cancel</Btn><Btn variant="primary" onClick={run}>Import</Btn></>}>
      <p className="hint">Choose your <code>.lua</code> profile, or paste it below. Gear sets and simple if-rules become visual items. Anything else is kept as custom Lua so nothing is lost.</p>
      <div className="flex flex-wrap items-center gap-2"><Btn onClick={() => { void choose(); }}>Choose a .lua file…</Btn><span className="hint small">{d.fileName}</span></div>
      <TextArea label="Lua to import" rows={10} placeholder="Or paste Lua here" value={d.text} onChange={v => set({ text: v })} />
      <div className="grid2">
        <Field label="Profile name"><TextInput value={d.name} placeholder="Taken from the file name" onChange={v => set({ name: v })} /></Field>
        <Field label="Job"><Select value={d.job} placeholder="Other" onChange={v => set({ job: v })} options={jobOptions} /></Field>
      </div>
      {d.error && <p className="err-text" role="alert">{d.error}</p>}
    </Dialog>
  );
}

function GameDataDialog({ d }: { d: Of<'gamedata'> }): ReactElement {
  const game = useStore(s => s.game);
  const note = useStore(s => s.gameNote);
  const set = (patch: Partial<Of<'gamedata'>>): void => setState({ dialog: { ...d, ...patch } });
  const load = async (): Promise<void> => {
    const files = await pickFiles('.lua,.json,.txt', true);
    if (!files.length) return;
    set({ busy: true, error: '', message: 'Reading files…' });
    await new Promise(r => setTimeout(r, 30));
    try {
      const summary = await installGameData(files);
      setState({ dialog: { type: 'gamedata', busy: false, error: '', message: summary.join('\n') } });
    } catch (e) { set({ busy: false, message: '', error: (e as Error).message }); }
  };
  return (
    <Dialog title="Game data" onClose={close} footer={<Btn variant="primary" onClick={close}>Done</Btn>}>
      <div className="row-item">
        {game.isStarter
          ? <p><b>Using the built-in sample list</b> ({game.itemCount} items). Load the game’s resource files to search every piece of equipment.</p>
          : <p><b>{game.itemCount.toLocaleString()} items</b>, {game.data.spells.length.toLocaleString()} spells, {game.data.abilities.length.toLocaleString()} abilities, {game.data.weaponskills.length.toLocaleString()} weaponskills, {game.data.buffs.length.toLocaleString()} status effects. Source: {game.data.origin === 'bundled' ? 'bundled with the site (resources folder)' : game.data.source}.</p>}
      </div>
      {note && <p className="hint small">{note}</p>}
      <p className="hint">Choose <code>items.lua</code> from the <a href="https://github.com/Windower/Resources/tree/master/resources_data" target="_blank" rel="noreferrer">Windower Resources</a> project. You can pick several files at once: <code>spells.lua</code>, <code>job_abilities.lua</code>, <code>weapon_skills.lua</code> and <code>buffs.lua</code> fill the suggestion lists in the rule builder. Files you load here replace the bundled ones on this device only, and you can remove them to go back to the bundled set.</p>
      <div className="flex flex-wrap gap-2">
        <Btn variant="primary" disabled={d.busy} onClick={() => { void load(); }}>{d.busy ? 'Reading…' : 'Choose game data files…'}</Btn>
        {!game.isStarter && <Btn onClick={() => { void removeGameData().then(() => toast('Bundled game data reloaded')); }}>{game.data.origin === 'bundled' ? 'Reload bundled data' : 'Remove loaded data (use bundled)'}</Btn>}
      </div>
      {d.message && <pre className={cx('summary')}>{d.message}</pre>}
      {d.error && <p className="err-text" role="alert">{d.error}</p>}
    </Dialog>
  );
}

function TextDialog({ d }: { d: Of<'text'> }): ReactElement {
  return (
    <Dialog title={d.title} onClose={close} footer={<><Btn onClick={close}>Close</Btn><Btn variant="primary" onClick={async () => toast((await copyText(d.text)) ? 'Copied to the clipboard' : 'Select the text and copy it with your keyboard')}>Copy all</Btn></>}>
      <p className="hint">{d.help}</p>
      <TextArea label={d.title} rows={14} readOnly value={d.text} />
    </Dialog>
  );
}

export function Dialogs(): ReactElement | null {
  const d = useStore(s => s.dialog);
  if (!d) return null;
  switch (d.type) {
    case 'new-profile': return <NewProfile d={d} />;
    case 'import': return <ImportDialog d={d} />;
    case 'gamedata': return <GameDataDialog d={d} />;
    case 'text': return <TextDialog d={d} />;
  }
}

/** Opens a project file. Exported for the header. */
export function openProjectFile(text: string, name: string): void {
  try { replaceProject(normaliseProject(JSON.parse(text))); toast('Opened ' + name, true); }
  catch (e) { toast('Could not open this file: ' + (e as Error).message); }
}
