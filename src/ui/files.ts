/* Opening and saving files in the browser. */
import type { LoadedFile } from '../data/windower';
import { setState } from './store';

interface ClaudeHost { use?: (name: string) => Promise<unknown> }
declare global { interface Window { claude?: ClaudeHost } }
interface DownloadsApi { save: (r: { filename: string; data: string }) => Promise<unknown> }

/** Opens the file picker and reads the chosen text files. Resolves to [] when the picker is dismissed. */
export function pickFiles(accept: string, multiple = false): Promise<LoadedFile[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.multiple = multiple;
    input.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    input.addEventListener('change', async () => {
      const list = Array.from(input.files ?? []);
      try { resolve(await Promise.all(list.map(async f => ({ name: f.name, text: await f.text() })))); }
      catch { resolve([]); }
      input.remove();
    });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

export interface SaveResult { status: 'saved' | 'declined' | 'dialog' }

/** Saves a text file. Uses the host's save prompt when embedded, a normal download otherwise,
    and shows the text in a dialog as a last resort. `embeddedName` is used when the host only allows certain extensions. */
export async function saveText(filename: string, text: string, label: string, embeddedName?: string): Promise<SaveResult> {
  try {
    const dl = (await window.claude?.use?.('downloads')) as DownloadsApi | null | undefined;
    if (dl) {
      try { await dl.save({ filename: embeddedName ?? filename, data: text }); return { status: 'saved' }; }
      catch (e) { if ((e as { code?: string })?.code === 'declined') return { status: 'declined' }; }
    } else {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { status: 'saved' };
    }
  } catch { /* fall through to the dialog */ }
  setState({ dialog: { type: 'text', title: label, text, help: `Saving a file is not available here. Copy the text and save it as ${filename}.` } });
  return { status: 'dialog' };
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export const safeName = (s: string, fallback: string): string => (s || fallback).replace(/[^\w-]+/g, '_');
