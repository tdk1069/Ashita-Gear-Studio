# Ashita Gear Studio

A client-side visual profile builder for LuAshitacast (FFXI / Ashita). Everything runs in the browser; projects autosave to IndexedDB and can be saved or opened as JSON files. Lua is generated from an internal model, and imported Lua that cannot be modelled is kept verbatim and reported.

## Using it
See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for a player guide (first weaponskill set, modes, elemental staff and obi by day/weather).

## Develop
    npm install
    npm run dev          # local server
    npm test             # core + game-data tests
    npm run build        # typecheck and build to dist/
    npm run build:standalone   # single-file build in standalone/

## Game equipment data
Put the Windower resource files in `public/resources/` (from github.com/Windower/Resources, `resources_data`): `items.lua` (required), plus optional `spells.lua`, `job_abilities.lua`, `weapon_skills.lua`, `buffs.lua`. They are fetched and parsed automatically when the site opens; the parsed result is cached in IndexedDB and refreshed when the files change. Update the files in the repo whenever the game adds items.

Anyone can also load newer files by hand with the **Game data** button. Those take priority on that device until removed, and removing them returns to the bundled set. Partial loads merge (for example, adding only `spells.lua` keeps the bundled items).

To refresh items from your own game client instead, see [docs/EXTRACT_CLIENT_DATA.md](docs/EXTRACT_CLIENT_DATA.md) (`npm run extract:client`).

`npm run convert:data` (single JSON bundle) still works and is used as a fallback if `public/resources/` is empty.

## Deploy
Pushing to `main` runs `.github/workflows/deploy.yml` (enable Pages with source "GitHub Actions").

## Layout
`src/core` model, generate, importer, validate, highlight (no UI) · `src/data` game data and templates · `src/storage` IndexedDB · `src/ui` React views · `tests`
