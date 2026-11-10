/* A small Lua lexer plus statement/bracket structure helpers. Enough to split a LuAshitacast
   profile into statements and rules without a full Lua parser. */
import { LUA_KEYWORDS } from './reference';

export class LuaSyntaxError extends Error {
  line: number;
  constructor(msg: string, line: number) { super(msg); this.name = 'LuaSyntaxError'; this.line = line; }
}

export type TokType = 'str' | 'num' | 'name' | 'kw' | 'op';
export interface Token { t: TokType; v: string; s: number; e: number; line: number }
export interface Span { a: number; b: number }

export function longLevel(src: string, pos: number): number {
  const m = /^\[(=*)\[/.exec(src.slice(pos, pos + 64));
  return m ? m[1]!.length : -1;
}
export function longEnd(src: string, pos: number, level: number): number {
  const close = ']' + '='.repeat(level) + ']';
  const k = src.indexOf(close, pos);
  return k < 0 ? src.length : k + close.length;
}

export function lex(src: string): Token[] {
  const toks: Token[] = [];
  const n = src.length;
  let i = 0, line = 1;
  const newlines = (a: number, b: number): number => { let c = 0; for (let k = a; k < b; k++) if (src.charCodeAt(k) === 10) c++; return c; };
  while (i < n) {
    const c = src[i]!;
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }
    if (c === '-' && src[i + 1] === '-') {
      const lv = longLevel(src, i + 2);
      if (lv >= 0) { const e = longEnd(src, i + 2 + lv + 2, lv); line += newlines(i, e); i = e; continue; }
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    const s = i;
    if (c === '"' || c === "'") {
      let j = i + 1, val = '';
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') {
          const d = src[j + 1];
          if (d === undefined) throw new LuaSyntaxError('Unfinished string', line);
          if (d === 'n') { val += '\n'; j += 2; }
          else if (d === 't') { val += '\t'; j += 2; }
          else if (d === 'r') { val += '\r'; j += 2; }
          else if (d === '\n') { val += '\n'; line++; j += 2; }
          else if (d >= '0' && d <= '9') {
            let k = j + 1, num = '';
            while (k < n && num.length < 3 && src[k]! >= '0' && src[k]! <= '9') { num += src[k]; k++; }
            val += String.fromCharCode(parseInt(num, 10)); j = k;
          } else { val += d; j += 2; }
        } else val += src[j++];
      }
      if (src[j] !== c) throw new LuaSyntaxError('A string starting on line ' + line + ' is never closed', line);
      j++;
      toks.push({ t: 'str', v: val, s, e: j, line });
      i = j; continue;
    }
    if (c === '[') {
      const lv = longLevel(src, i);
      if (lv >= 0) {
        const e = longEnd(src, i + lv + 2, lv);
        let inner = src.slice(i + lv + 2, Math.max(i + lv + 2, e - lv - 2));
        if (inner[0] === '\n') inner = inner.slice(1);
        toks.push({ t: 'str', v: inner, s, e, line });
        line += newlines(i, e); i = e; continue;
      }
    }
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1]! >= '0' && src[i + 1]! <= '9')) {
      const m = /^(0[xX][0-9a-fA-F]+|(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(src.slice(i, i + 40))!;
      toks.push({ t: 'num', v: m[0], s, e: i + m[0].length, line });
      i += m[0].length; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 80))![0];
      toks.push({ t: LUA_KEYWORDS.has(m) ? 'kw' : 'name', v: m, s, e: i + m.length, line });
      i += m.length; continue;
    }
    const three = src.substr(i, 3), two = src.substr(i, 2);
    if (three === '...') { toks.push({ t: 'op', v: '...', s, e: i + 3, line }); i += 3; continue; }
    if (['==', '~=', '<=', '>=', '..', '::', '//', '<<', '>>'].includes(two)) { toks.push({ t: 'op', v: two, s, e: i + 2, line }); i += 2; continue; }
    toks.push({ t: 'op', v: c, s, e: i + 1, line });
    i++;
  }
  return toks;
}

/* ---------- structure ---------- */

/** Index of the `end`/`until` that closes the block opened at toks[i]. */
export function matchBlock(toks: Token[], i: number): number {
  let depth = 0;
  for (let k = i; k < toks.length; k++) {
    const t = toks[k]!;
    if (t.t !== 'kw') continue;
    if (t.v === 'function' || t.v === 'if' || t.v === 'do' || t.v === 'repeat') depth++;
    else if (t.v === 'end' || t.v === 'until') { depth--; if (depth === 0) return k; }
  }
  throw new LuaSyntaxError("Missing 'end' for the block that starts on line " + toks[i]!.line, toks[i]!.line);
}

/** Index of the bracket that closes the one opened at toks[i]. */
export function closeIdx(toks: Token[], i: number): number {
  let depth = 0;
  for (let k = i; k < toks.length; k++) {
    const t = toks[k]!;
    if (t.t === 'op') {
      if (t.v === '(' || t.v === '[' || t.v === '{') depth++;
      else if (t.v === ')' || t.v === ']' || t.v === '}') { depth--; if (depth === 0) return k; }
    } else if (t.t === 'kw' && t.v === 'function') k = matchBlock(toks, k);
  }
  throw new LuaSyntaxError("A '" + toks[i]!.v + "' on line " + toks[i]!.line + ' is never closed', toks[i]!.line);
}

function endsExpr(t: Token): boolean {
  return t.t === 'name' || t.t === 'num' || t.t === 'str' ||
    (t.t === 'kw' && ['true', 'false', 'nil', 'end'].includes(t.v)) ||
    (t.t === 'op' && [')', ']', '}', '...'].includes(t.v));
}
const STMT_KW = new Set(['if', 'for', 'while', 'repeat', 'do', 'function', 'local', 'return', 'break', 'goto', 'end', 'else', 'elseif', 'until']);

function exprStmtEnd(toks: Token[], start: number, b: number): number {
  let depth = 0, k = start;
  while (k < b) {
    const t = toks[k]!;
    if (depth === 0 && k > start) {
      if (t.t === 'op' && t.v === ';') return k + 1;
      if (endsExpr(toks[k - 1]!) && (t.t === 'name' || (t.t === 'kw' && STMT_KW.has(t.v)) || (t.t === 'op' && t.v === '::'))) return k;
    }
    if (t.t === 'op') {
      if (t.v === '(' || t.v === '[' || t.v === '{') depth++;
      else if (t.v === ')' || t.v === ']' || t.v === '}') depth--;
    } else if (t.t === 'kw' && t.v === 'function') k = matchBlock(toks, k);
    k++;
  }
  return b;
}

function stmtEnd(toks: Token[], i: number, b: number): number {
  const t = toks[i]!;
  if (t.t === 'kw') {
    switch (t.v) {
      case 'if': case 'do': case 'function': return matchBlock(toks, i) + 1;
      case 'while': case 'for': { let k = i; while (k < b && !(toks[k]!.t === 'kw' && toks[k]!.v === 'do')) k++; return matchBlock(toks, k) + 1; }
      case 'repeat': { const u = matchBlock(toks, i); return exprStmtEnd(toks, u, b) > u + 1 ? exprStmtEnd(toks, u + 1, b) : u + 1; }
      case 'local': if (toks[i + 1] && toks[i + 1]!.t === 'kw' && toks[i + 1]!.v === 'function') return matchBlock(toks, i + 1) + 1; return exprStmtEnd(toks, i, b);
      case 'return': return exprStmtEnd(toks, i, b);
      case 'break': return i + 1;
      case 'goto': return i + 2;
    }
  }
  if (t.t === 'op' && t.v === '::') return Math.min(b, i + 3);
  return exprStmtEnd(toks, i, b);
}

export function splitStatements(toks: Token[], a: number, b: number): Span[] {
  const out: Span[] = [];
  let i = a;
  while (i < b) {
    if (toks[i]!.t === 'op' && toks[i]!.v === ';') { i++; continue; }
    const e = Math.max(i + 1, Math.min(stmtEnd(toks, i, b), b));
    out.push({ a: i, b: e });
    i = e;
  }
  return out;
}

/** Splits toks[a..b) at separators that are not nested inside brackets or functions. */
export function splitTopLevel(toks: Token[], a: number, b: number, isSep: (t: Token) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let depth = 0, start = a;
  for (let k = a; k < b; k++) {
    const t = toks[k]!;
    if (t.t === 'op') {
      if (t.v === '(' || t.v === '[' || t.v === '{') depth++;
      else if (t.v === ')' || t.v === ']' || t.v === '}') depth--;
    } else if (t.t === 'kw' && t.v === 'function') { k = matchBlock(toks, k); continue; }
    if (depth === 0 && isSep(t)) { out.push([start, k]); start = k + 1; }
  }
  out.push([start, b]);
  return out;
}

/** Cheap structural check used to flag custom Lua that is missing an `end` or bracket. */
export function balanced(code: string): string {
  try {
    let depth = 0, br = 0;
    for (const t of lex(code)) {
      if (t.t === 'kw') {
        if (t.v === 'function' || t.v === 'if' || t.v === 'do' || t.v === 'repeat') depth++;
        else if (t.v === 'end' || t.v === 'until') depth--;
      } else if (t.t === 'op') {
        if (t.v === '(' || t.v === '[' || t.v === '{') br++;
        else if (t.v === ')' || t.v === ']' || t.v === '}') br--;
      }
    }
    if (depth > 0) return `is missing ${depth} 'end'`;
    if (depth < 0) return `has ${-depth} extra 'end'`;
    if (br !== 0) return 'has unmatched brackets';
    return '';
  } catch (e) { return (e as Error).message; }
}
