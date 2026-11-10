/* Lua & Checks tab: generated Lua with highlighting, validation results and the import report. */
import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { generateLua, tokenizeLua, validate } from '../../core';
import type { Issue } from '../../core';
import { itemIssues } from '../../data/itemChecks';
import { Btn, Window, cx } from '../components/ui';
import { copyText, safeName, saveText } from '../files';
import { activeProfile, getState, gotoIssue, mutateProfile, toast, useProfile, useStore } from '../store';

export function useIssues(): Issue[] {
  const p = useProfile();
  const game = useStore(s => s.game);
  return useMemo(() => [...validate(p), ...itemIssues(p, game)].sort((a, b) => ({ error: 0, warn: 1, info: 2 })[a.sev] - ({ error: 0, warn: 1, info: 2 })[b.sev]), [p, game]);
}

export async function exportLua(): Promise<void> {
  const p = activeProfile(getState());
  const base = safeName(p.job || p.name, 'profile');
  const errs = validate(p).filter(i => i.sev === 'error').length;
  const r = await saveText(base + '.lua', generateLua(p), 'Lua file', base + '.lua.txt');
  if (r.status === 'saved') toast(errs ? `Saved, but ${errs} problem${errs > 1 ? 's' : ''} should be fixed first. See Lua & Checks.` : 'Lua file saved. If your browser added .txt, rename it to ' + base + '.lua.');
}

export function LuaView(): ReactElement {
  const p = useProfile();
  const issues = useIssues();
  const lua = useMemo(() => generateLua(p), [p]);
  const tokens = useMemo(() => tokenizeLua(lua), [lua]);
  const errs = issues.filter(i => i.sev === 'error').length, warns = issues.filter(i => i.sev === 'warn').length;
  const rep = p.importReport;
  return (
    <div className="lua-grid">
      <Window title="Generated Lua" actions={<><Btn small onClick={async () => toast((await copyText(lua)) ? 'Copied to the clipboard' : 'Select the text and copy it with your keyboard')}>Copy</Btn><Btn small variant="primary" onClick={() => { void exportLua(); }}>Save file</Btn></>}>
        <div className="stats"><span><b>{lua.split('\n').length}</b> lines</span><span><b>{p.sets.length}</b> sets</span><span><b>{p.rules.filter(r => r.enabled).length}</b> active rules</span></div>
        <pre className="lua" tabIndex={0} aria-label="Generated Lua">{tokens.map((t, i) => (t.cls ? <span key={i} className={t.cls}>{t.text}</span> : t.text))}</pre>
      </Window>
      <div className="checks stack-16">
        <Window title="Checks" actions={<span className="hint small">{errs ? `${errs} to fix` : ''}{errs && warns ? ', ' : ''}{warns ? `${warns} to review` : ''}</span>}>
          {!issues.length && <div className="allgood">No problems found. This profile is ready to export.</div>}
          {issues.map((i, n) => (
            <div className={cx('issue', i.sev)} key={n}>
              <i className="dot" /><b>{i.title}</b><p>{i.detail}</p>
              {i.ref.tab && <Btn small variant="ghost" className="go" onClick={() => gotoIssue(i.ref)}>Show me</Btn>}
            </div>
          ))}
        </Window>
        {rep && (
          <Window title="Import report" actions={<Btn small variant="ghost" onClick={() => mutateProfile(pr => { pr.importReport = null; })}>Dismiss</Btn>}>
            <div className="stats"><span><b>{rep.sets}</b> gear sets</span><span><b>{rep.rules}</b> rules</span><span><b>{rep.rawBlocks}</b> custom Lua blocks</span><span><b>{rep.customLines}</b> lines of other Lua kept</span></div>
            {rep.notes.length === 0 && <div className="allgood">Everything in this file was recognised.</div>}
            {rep.notes.map((n, i) => <div className="note-line" key={i}><span className="ln">line {n.line}</span>{n.text}</div>)}
            {rep.noteCount > rep.notes.length && <div className="note-line hint">And {rep.noteCount - rep.notes.length} more.</div>}
          </Window>
        )}
      </div>
    </div>
  );
}
