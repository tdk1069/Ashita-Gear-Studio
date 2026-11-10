/* Lua syntax highlighting as tokens, rendered by React as spans (no HTML strings, no injection). */
import { LUA_KEYWORDS } from './reference';
import { longEnd, longLevel } from './lexer';

export type HighlightClass = 'lc' | 'ls' | 'ln' | 'lk' | 'll' | 'la' | 'lf' | '';
export interface HighlightToken { cls: HighlightClass; text: string }

export function tokenizeLua(src: string): HighlightToken[] {
  const out: HighlightToken[] = [];
  const n = src.length;
  let i = 0, plain = '';
  const flush = (): void => { if (plain) { out.push({ cls: '', text: plain }); plain = ''; } };
  const push = (cls: HighlightClass, text: string): void => { flush(); out.push({ cls, text }); };
  while (i < n) {
    const c = src[i]!;
    if (c === '-' && src[i + 1] === '-') {
      let j = i;
      const lv = longLevel(src, i + 2);
      if (lv >= 0) j = longEnd(src, i + 2 + lv + 2, lv);
      else while (j < n && src[j] !== '\n') j++;
      push('lc', src.slice(i, j)); i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      j = Math.min(n, j + 1);
      push('ls', src.slice(i, j)); i = j; continue;
    }
    if (c >= '0' && c <= '9') { const m = /^\d+\.?\d*/.exec(src.slice(i, i + 30))!; push('ln', m[0]); i += m[0].length; continue; }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 80))![0];
      let cls: HighlightClass = '';
      if (LUA_KEYWORDS.has(m)) cls = m === 'true' || m === 'false' || m === 'nil' ? 'll' : 'lk';
      else if (m === 'gFunc' || m === 'gData' || m === 'gSettings') cls = 'la';
      else if (src[i - 1] === '.' && /^\s*\(/.test(src.slice(i + m.length, i + m.length + 3))) cls = 'lf';
      if (cls) push(cls, m); else plain += m;
      i += m.length; continue;
    }
    plain += c; i++;
  }
  flush();
  return out;
}
