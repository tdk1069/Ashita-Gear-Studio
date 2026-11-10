import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { Badge, Btn, cx } from './components/ui';
import { Dialogs, openProjectFile } from './Dialogs';
import { pickFiles, safeName, saveText } from './files';
import { GearSetsView } from './views/GearSets';
import { LuaView, exportLua, useIssues } from './views/LuaView';
import { ProfileView } from './views/ProfileView';
import { RulesView } from './views/Rules';
import type { Tab } from './store';
import { boot, mutate, redo, setState, toast, undo, useProfile, useStore } from './store';

const CRYSTAL = (
  <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 2 26 14 16 30 6 14Z" fill="#1b2756" stroke="#e3bd62" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M6 14h20M16 2v28M11 14 16 2l5 12-5 16Z" fill="none" stroke="#e3bd62" strokeOpacity=".55" strokeWidth="1" />
  </svg>
);

function Header(): ReactElement {
  const project = useStore(s => s.project);
  const profileId = useStore(s => s.profileId);
  const canUndo = useStore(s => s.canUndo);
  const canRedo = useStore(s => s.canRedo);
  return (
    <div className="bar">
      <div className="brand">{CRYSTAL}<div><h1>Ashita Gear Studio</h1><small>LuAshitacast profile builder</small></div></div>
      <div className="bar-mid">
        <input className="projname" aria-label="Project name" value={project.name} onChange={e => mutate(p => { p.name = e.target.value; }, 'projname')} />
        <div className="pill-select">
          <select aria-label="Profile" value={profileId} onChange={e => setState({ profileId: e.target.value, setId: null })}>
            {project.profiles.map(x => <option key={x.id} value={x.id}>{x.name}{x.job && x.job !== x.name ? ` (${x.job})` : ''}</option>)}
          </select>
          <Btn small title="Add a profile" onClick={() => setState({ dialog: { type: 'new-profile', job: 'WAR', name: 'WAR', tmpl: 'melee' } })}>+ Profile</Btn>
        </div>
        <Btn small variant="ghost" label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>↶ Undo</Btn>
        <Btn small variant="ghost" label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>↷ Redo</Btn>
      </div>
      <div className="bar-end">
        <Btn small onClick={() => setState({ dialog: { type: 'gamedata', busy: false, message: '', error: '' } })}>Game data</Btn>
        <Btn small onClick={() => setState({ dialog: { type: 'import', text: '', fileName: '', name: '', job: '', error: '' } })}>Import Lua</Btn>
        <Btn small onClick={async () => { const [f] = await pickFiles('.json,application/json'); if (f) openProjectFile(f.text, f.name); }}>Open project</Btn>
        <Btn small onClick={async () => {
          const name = safeName(project.name, 'gear-project') + '.json';
          const r = await saveText(name, JSON.stringify({ ...project, savedAt: Date.now() }, null, 2), 'Project file');
          if (r.status === 'saved') toast('Project saved as ' + name);
        }}>Save project</Btn>
        <Btn variant="primary" onClick={() => { void exportLua(); }}>Export Lua</Btn>
      </div>
    </div>
  );
}

function Tabs(): ReactElement {
  const p = useProfile();
  const tab = useStore(s => s.tab);
  const issues = useIssues();
  const errs = issues.filter(i => i.sev === 'error').length, warns = issues.filter(i => i.sev === 'warn').length;
  const tabs: [Tab, string, number | null, 'err' | 'warn' | undefined][] = [
    ['sets', 'Gear Sets', p.sets.length, undefined],
    ['rules', 'Rules', p.rules.length, undefined],
    ['profile', 'Profile', null, undefined],
    ['lua', 'Lua & Checks', errs || warns || null, errs ? 'err' : 'warn'],
  ];
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([id, label, n, tone]) => (
        <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setState({ tab: id })}>
          {label}{n != null && n > 0 && <Badge tone={id === 'lua' ? tone : undefined}>{n}</Badge>}
        </button>
      ))}
    </div>
  );
}

function Toast(): ReactElement | null {
  const t = useStore(s => s.toast);
  if (!t) return null;
  return (
    <div className="toast" role="status">
      <span>{t.msg}</span>
      {t.undo && <Btn small onClick={() => { undo(); setState({ toast: null }); }}>Undo</Btn>}
    </div>
  );
}

function SaveLine(): ReactElement {
  const save = useStore(s => s.save);
  return <p className="hint small mt-6" id="savestate">{save === 'saving' ? 'Saving…' : save === 'saved' ? 'Autosaved in this browser' : 'Autosave is unavailable here. Use Save project to keep your work.'}</p>;
}

export function App(): ReactElement {
  const ready = useStore(s => s.ready);
  const tab = useStore(s => s.tab);
  useEffect(() => {
    void boot();
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (!ready) return <div className="wrap"><p className="hint p-8">Loading your project…</p></div>;
  return (
    <div className="wrap">
      <Header />
      <Tabs />
      <main className={cx('view')}>
        {tab === 'sets' && <GearSetsView />}
        {tab === 'rules' && <RulesView />}
        {tab === 'profile' && <ProfileView />}
        {tab === 'lua' && <LuaView />}
      </main>
      <SaveLine />
      <Dialogs />
      <Toast />
    </div>
  );
}
