# Extracting game data from your FFXI client

`npm run extract:client` reads equipment straight from your own FFXI install and writes the files Gear Studio loads from `public/resources/`. Use it to refresh the item list after a game update, or to get names that match your client exactly.

## Run it

You need Node 20+ and this repo's dependencies (`npm install`).

    npm run extract:client -- --client "C:\Program Files (x86)\PlayOnline\SquareEnix\FINAL FANTASY XI"

The folder you point at is the one that contains `ROM`. Add `--icons` to also write item icons, and `--out <folder>` to write somewhere other than `public/resources`.

## What it writes

| File | Contents |
|---|---|
| `gamedata.json` | Every equippable item: name, slot, level. Loaded automatically by the site. |
| `items-extra.json` | Per item: id, jobs (bit 0 = WAR), item level, icon cell. Not used by the UI yet. |
| `icons.png`, `icons.json` | With `--icons`: a sprite sheet of 32x32 icons (duplicates share a cell) and its geometry. |

If you already have `items.lua` from Windower in `public/resources/`, remove one of the two, otherwise the same items appear twice with slightly different spelling.

## Check it read your client correctly

Compare against the Phoenix database tables:

    npm run extract:client -- --client "<FFXI folder>" --compare path/to/Phoenix/sql/item_equipment.sql

The report lists how many items disagree on level, slot and jobs. Those should be close to zero. If they are not, or the script finds no equipment, run it again with `--record-size 3072` or `--record-size 5120` and send the output. It also prints four spot checks (Moonshade Earring, Genbu's Shield, Fire Staff, Hachirin-no-Obi).

## About the format

Item DATs (`ROM/118/106.DAT` and the other files listed in `scripts/lib/clientdat.ts`) hold fixed-size records. Each byte is bit-rotated, and each record has a header, level/slot/job fields, a name table and a 32x32 icon. Recent clients grew the records from 0xC00 to 0x1400 bytes; the script detects both. The layout is documented by the community (Windower's ResourceExtractor and POLUtils, and sruon/ffxi-resources). This is an independent implementation of it.

## Icons are Square Enix artwork

Item icons come from your game files. Decide for yourself whether it is appropriate to publish them on a public site.

## Not covered yet

Spells, abilities, weaponskills and status effects still come from the Windower files (`spells.lua` and so on). They can be extracted from the client in the same way if you want to drop that dependency.


## What the extractor now produces

Run `npm run extract:client -- --client "<FFXI folder>" --icons` and copy the output files into `public/resources/` (or load `gamedata.json` through the Game data button).

- **Items**: in-game short name, full name (when different), level, slots, jobs, item level, and a 32x32 icon cell.
- **Spells, job abilities, weapon skills**: name, skill, element, MP/TP, and job levels where the client has them.
- **Status effects**: names and icons.
- **Icon sheets** (`icons.png`/`icons.json`, `status-icons.png`/`status-icons.json`): the studio shows them next to items in slots and in the picker.

The report printed at the end includes spot checks and a histogram of ability types. Weapon skills are identified by ability type 3 or 20; if the histogram looks different on your client, tell me and the classification can be adjusted.

### Item names
The picker shows the short in-game name and the full name beneath it. A toggle under the search box chooses which one is written into your profile. Which form LuAshitacast matches has not been verified; if equipment is not swapping, try the other one.

### Not extracted
Spell and ability icons are only referenced by id in the client and are not extracted yet. Icons are Square Enix artwork, so check the licensing before publishing a site that contains them.
