/* Plain text helpers for writing Lua source. */
import { LUA_KEYWORDS } from './reference';

export function isIdent(s: string): boolean { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !LUA_KEYWORDS.has(s); }

/** A Lua string literal, preferring single quotes the way LuAshitacast profiles usually do. */
export function luaStr(value: unknown): string {
  const s = String(value ?? '');
  const esc = (t: string, q: string): string => t.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').split(q).join('\\' + q);
  if (s.includes("'") && !s.includes('"')) return '"' + esc(s, '"') + '"';
  return "'" + esc(s, "'") + "'";
}
export function luaNum(n: unknown): string { const x = Number(n); return Number.isFinite(x) ? String(x) : '0'; }

/** `Midcast.Cure` -> `sets.Midcast.Cure`; names that are not identifiers use the bracket form. */
export function setPath(name: string): string {
  return 'sets' + name.split('.').filter(Boolean).map(s => (isIdent(s) ? '.' + s : '[' + luaStr(s) + ']')).join('');
}
export function keyText(k: string): string { return isIdent(k) ? k : '[' + luaStr(k) + ']'; }

export function dedent(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[0]!.trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  let min = Infinity;
  for (const l of lines) if (l.trim()) min = Math.min(min, /^[ \t]*/.exec(l)![0].length);
  if (!Number.isFinite(min)) min = 0;
  return lines.map(l => l.slice(min).replace(/\s+$/, '')).join('\n');
}
export function shorten(t: string, n = 70): string {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 3) + '...' : s;
}
