/* App state: the project (with undo/redo and autosave), game data, and which view is open.
   A tiny external store read through useSyncExternalStore, so there is no state library to install. */
import { useSyncExternalStore } from 'react';
import type { HandlerId, Issue, Profile, Project, SlotName } from '../core';
import { clone, normaliseProject } from '../core';
import { sampleProject } from '../data/templates';
import type { TemplateId } from '../data/templates';
import { GameIndex, starterIndex } from '../data/gamedata';
import { buildGameData } from '../data/windower';
import type { GameData, LoadedFile } from '../data/windower';
import { kvDelete, kvGet, kvSet, persistent } from '../storage/kv';

export type Tab = 'sets' | 'rules' | 'profile' | 'lua';
export type SaveState = 'saved' | 'saving' | 'unavailable';

export type DialogState =
  | { type: 'new-profile'; job: string; name: string; tmpl: TemplateId }
  | { type: 'import'; text: string; fileName: string; name: string; job: string; error: string }
  | { type: 'gamedata'; busy: boolean; message: string; error: string }
  | { type: 'text'; title: string; text: string; help: string };

export interface State {
  ready: boolean;
  project: Project;
  profileId: string;
  setId: string | null;
  slot: SlotName;
  tab: Tab;
  handler: HandlerId;
  flash: string | null;
  dialog: DialogState | null;
  toast: { id: number; msg: string; undo: boolean } | null;
  canUndo: boolean;
  canRedo: boolean;
  save: SaveState;
  game: GameIndex;
  gameLoading: boolean;
  /** What the bundled-data loader found, shown in the Game data dialog. */
  gameNote: string;
}

const PROJECT_KEY = 'project';
const GAME_KEY = 'gamedata';
const BUNDLED_KEY = 'gamedata-bundled';
const LEGACY_KEY = 'ags:project:v1';
/** Windower resource files looked for in ./resources/ (public/resources in the repo). Missing files are skipped. */
export const BUNDLED_FILES: readonly (readonly string[])[] = [['items.lua'], ['spells.lua'], ['job_abilities.lua'], ['weapon_skills.lua', 'weapon_skill.lua'], ['buffs.lua']];

/** Folder holding the resources, next to the page. Works whether or not the page URL ends in a slash (GitHub Pages project sites). */
function resourcesUrl(): string {
  const u = new URL(location.href);
  u.hash = ''; u.search = '';
  const last = u.pathname.split('/').pop() ?? '';
  u.pathname = last.includes('.') ? u.pathname.replace(/[^/]*$/, '') : u.pathname.replace(/\/?$/, '/');
  return u.href + 'resources/';
}

let state: State = {
  ready: false,
  project: sampleProject(),
  profileId: '', setId: null, slot: 'Head', tab: 'sets', handler: 'HandleDefault',
  flash: null, dialog: null, toast: null, canUndo: false, canRedo: false, save: 'saved',
  game: starterIndex(), gameLoading: false, gameNote: '',
};
state.profileId = state.project.profiles[0]!.id;
state.setId = state.project.profiles[0]!.sets[0]?.id ?? null;

const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach(l => l());
export const getState = (): State => state;
export function subscribe(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
export function useStore<T>(sel: (s: State) => T): T { return useSyncExternalStore(subscribe, () => sel(state), () => sel(state)); }

/** Keeps the selected profile and set valid after any change. */
function settle(s: State): State {
  const prof = s.project.profiles.find(p => p.id === s.profileId) ?? s.project.profiles[0]!;
  const setId = prof.sets.some(x => x.id === s.setId) ? s.setId : prof.sets[0]?.id ?? null;
  return { ...s, profileId: prof.id, setId };
}
export function setState(patch: Partial<State>): void { state = settle({ ...state, ...patch }); emit(); }

export const activeProfile = (s: State): Profile => s.project.profiles.find(p => p.id === s.profileId) ?? s.project.profiles[0]!;
export const useProfile = (): Profile => useStore(activeProfile);

/* ---------- history ---------- */

interface Snap { project: Project; key?: string; at: number }
let past: Snap[] = [];
let future: Project[] = [];
const HISTORY_LIMIT = 100;

/** Applies a change to a copy of the project. Edits with the same `coalesce` key within a second share one undo step. */
export function mutate(fn: (p: Project) => void, coalesce?: string): void {
  const next = clone(state.project);
  fn(next);
  const now = Date.now();
  const top = past[past.length - 1];
  if (!(coalesce && top && top.key === coalesce && now - top.at < 1000)) {
    past.push({ project: state.project, key: coalesce, at: now });
    if (past.length > HISTORY_LIMIT) past.shift();
  } else top.at = now;
  future = [];
  setState({ project: next, canUndo: true, canRedo: false });
  scheduleSave();
}
export function mutateProfile(fn: (p: Profile) => void, coalesce?: string): void {
  mutate(proj => { const p = proj.profiles.find(x => x.id === state.profileId) ?? proj.profiles[0]!; fn(p); }, coalesce);
}
export function undo(): void {
  const snap = past.pop();
  if (!snap) return;
  future.push(state.project);
  setState({ project: snap.project, canUndo: past.length > 0, canRedo: true });
  scheduleSave();
}
export function redo(): void {
  const next = future.pop();
  if (!next) return;
  past.push({ project: state.project, at: 0 });
  setState({ project: next, canUndo: true, canRedo: future.length > 0 });
  scheduleSave();
}

/** Replaces the whole project (opening a file). Undo brings the old one back. */
export function replaceProject(next: Project): void {
  past.push({ project: state.project, at: 0 });
  future = [];
  setState({ project: next, profileId: next.profiles[0]!.id, setId: null, tab: 'sets', canUndo: true, canRedo: false });
  scheduleSave();
}

/* ---------- autosave ---------- */

let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  setState({ save: 'saving' });
  saveTimer = setTimeout(() => { void flushSave(); }, 400);
}
export async function flushSave(): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const ok = await kvSet(PROJECT_KEY, { ...state.project, savedAt: Date.now() });
  setState({ save: ok && persistent ? 'saved' : 'unavailable' });
}

/* ---------- toast ---------- */

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 0;
export function toast(msg: string, undoable = false): void {
  const id = ++toastId;
  setState({ toast: { id, msg, undo: undoable } });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (state.toast?.id === id) setState({ toast: null }); }, undoable ? 9000 : 3800);
}

/* ---------- game data ---------- */

function toIndex(data: GameData | null): GameIndex { return data && (data.items.length || data.spells.length) ? new GameIndex(data) : starterIndex(); }

export async function installGameData(files: LoadedFile[]): Promise<string[]> {
  const { data, summary } = buildGameData(files, files.map(f => f.name).join(', '));
  // Anything the new files do not contain keeps its previous value, so spells.lua can be added later without items.lua.
  const prev = state.game.isStarter ? null : state.game.data;
  const merged: GameData = prev ? {
    ...data,
    items: data.items.length ? data.items : prev.items,
    spells: data.spells.length ? data.spells : prev.spells,
    abilities: data.abilities.length ? data.abilities : prev.abilities,
    weaponskills: data.weaponskills.length ? data.weaponskills : prev.weaponskills,
    buffs: data.buffs.length ? data.buffs : prev.buffs,
    source: [prev.origin === 'bundled' ? 'bundled resources' : prev.source, data.source].filter(Boolean).join(' + '),
    origin: 'user' as const,
  } : { ...data, origin: 'user' as const };
  await kvSet(GAME_KEY, merged);
  hasUserData = true;
  setState({ game: new GameIndex(merged) });
  return summary;
}
export async function removeGameData(): Promise<void> {
  await kvDelete(GAME_KEY);
  hasUserData = false;
  setState({ game: starterIndex() });
  await loadBundledGameData();
}
/** Game data shipped with the site in ./resources/*.lua (the same Windower files you can load by hand).
    The parsed result is cached in IndexedDB and reused until the files change on the server. */
async function loadBundledGameData(): Promise<void> {
  setState({ gameLoading: true, gameNote: '' });
  const base = resourcesUrl();
  try {
    const found: { name: string; res: Response }[] = [];
    const tried: string[] = [];
    await Promise.all(BUNDLED_FILES.map(async names => {
      for (const name of names) {
        try {
          const res = await fetch(base + name, { cache: 'no-cache' });
          if (res.ok) { found.push({ name, res }); return; }
          tried.push(`${name} (${res.status})`);
        } catch { tried.push(`${name} (unreachable)`); }
      }
    }));
    if (!found.length) {
      setState({ gameNote: `No resource files found at ${base}. Tried ${tried.join(', ')}.` });
      return;
    }
    found.sort((a, b) => a.name.localeCompare(b.name));
    const sig = found.map(f => `${f.name}:${f.res.headers.get('etag') ?? ''}:${f.res.headers.get('last-modified') ?? ''}:${f.res.headers.get('content-length') ?? ''}`).join('|');
    const cached = await kvGet<{ sig: string; data: GameData }>(BUNDLED_KEY);
    if (cached && cached.sig === sig && cached.data.version === 1) {
      if (!hasUserData) setState({ game: new GameIndex(cached.data) });
      setState({ gameNote: `Loaded from cache (${found.map(f => f.name).join(', ')})` });
      return;
    }
    const files: LoadedFile[] = [];
    for (const f of found) files.push({ name: f.name, text: await f.res.text() });
    await new Promise(r => setTimeout(r, 20));
    const { data } = buildGameData(files, 'Bundled resources: ' + files.map(f => f.name).join(', '));
    data.origin = 'bundled';
    await kvSet(BUNDLED_KEY, { sig, data });
    if (!hasUserData) setState({ game: new GameIndex(data) });
    setState({ gameNote: `Read ${files.map(f => f.name).join(', ')} from ${base}` });
  } catch (e) {
    setState({ gameNote: `Bundled resource files were found but could not be read: ${(e as Error).message}` });
  } finally { setState({ gameLoading: false }); }
}
let hasUserData = false;

/* ---------- navigation ---------- */

export function gotoIssue(ref: Issue['ref']): void {
  const patch: Partial<State> = {};
  if (ref.tab) patch.tab = ref.tab;
  if (ref.handler) patch.handler = ref.handler;
  if (ref.ruleId) patch.flash = ref.ruleId;
  if (ref.setId) patch.setId = ref.setId;
  setState(patch);
}

/* ---------- boot ---------- */

export async function boot(): Promise<void> {
  try {
    let proj = await kvGet<Project>(PROJECT_KEY);
    if (!proj) {
      try { const legacy = localStorage.getItem(LEGACY_KEY); if (legacy) proj = JSON.parse(legacy) as Project; } catch { /* no legacy data */ }
    }
    if (proj) {
      const n = normaliseProject(proj);
      setState({ project: n, profileId: n.profiles[0]!.id, setId: null });
    }
  } catch { /* unreadable saved project: keep the sample */ }
  try {
    const stored = await kvGet<GameData>(GAME_KEY);
    if (stored && stored.version === 1) { hasUserData = true; setState({ game: toIndex({ ...stored, origin: 'user' }) }); }
  } catch { /* keep the sample list */ }
  setState({ ready: true, save: persistent ? 'saved' : 'unavailable' });
  // Bundled data loads in the background (it always refreshes the cache); hand-loaded data, if any, stays in charge.
  void loadBundledGameData();
  window.addEventListener('pagehide', () => { void flushSave(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flushSave(); });
}
