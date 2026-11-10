/* Checks gear names against the loaded game data. Only meaningful once real game data is installed. */
import type { Issue, Profile } from '../core/types';
import { SLOT_NAMES } from '../core/types';
import type { GameIndex } from './gamedata';

export function itemIssues(profile: Profile, game: GameIndex): Issue[] {
  if (game.isStarter) return [];
  const out: Issue[] = [];
  for (const set of profile.sets) {
    for (const slot of SLOT_NAMES) {
      const it = set.slots[slot];
      if (!it || it.raw || !it.name.trim() || game.has(slot, it.name)) continue;
      out.push({
        sev: 'info',
        title: `"${it.name}" is not in the loaded game data for ${slot}`,
        detail: `In the set "${set.name}". The name may be misspelled, or the item cannot be worn in this slot. LuAshitacast matches names exactly, so a typo means nothing is equipped.`,
        ref: { tab: 'sets', setId: set.id },
      });
    }
  }
  return out;
}
