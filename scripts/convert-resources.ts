/* Converts Windower Resources files into public/data/gamedata.json, which the app loads on start.

   Usage (from the project root):
     npx tsx scripts/convert-resources.ts <folder or files...> [--out public/data/gamedata.json]

   Give it the resources_data folder from https://github.com/Windower/Resources, or individual files such as
   items.lua, spells.lua, job_abilities.lua, weapon_skills.lua and buffs.lua. */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { buildGameData, kindFromFileName } from '../src/data/windower';
import type { LoadedFile } from '../src/data/windower';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1]! : 'public/data/gamedata.json';
const inputs = args.filter((_, i) => i !== outIdx && i !== outIdx + 1);
if (!inputs.length) {
  console.error('Give a folder or files to convert. See the comment at the top of this script.');
  process.exit(1);
}

const wanted = new Set(['items', 'spells', 'abilities', 'weaponskills', 'buffs']);
const files: LoadedFile[] = [];
for (const input of inputs) {
  const paths = statSync(input).isDirectory() ? readdirSync(input).filter(f => f.endsWith('.lua')).map(f => join(input, f)) : [input];
  for (const p of paths) {
    if (!wanted.has(kindFromFileName(basename(p))) && !p.endsWith('.json')) continue;
    files.push({ name: basename(p), text: readFileSync(p, 'utf8') });
  }
}
if (!files.length) {
  console.error('No items.lua, spells.lua, job_abilities.lua, weapon_skills.lua or buffs.lua found in the given paths.');
  process.exit(1);
}

const { data, summary } = buildGameData(files, 'Windower Resources');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data));
summary.forEach(s => console.log(s));
console.log(`Wrote ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
