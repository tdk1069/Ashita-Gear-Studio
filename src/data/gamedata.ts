/* Searchable game data: per-slot item index plus name lists for spells, abilities and so on. */
import type { SlotName } from '../core/types';
import { SLOT_NAMES } from '../core/types';
import type { GameData, ItemRow } from './windower';
import { slotBit } from './windower';
import { STARTER_DATA } from './starter';

export interface ItemHit { name: string; level: number }
export interface SearchOptions { query: string; maxLevel?: number; limit?: number }

interface Entry { name: string; lower: string; level: number }

export class GameIndex {
  readonly data: GameData;
  private bySlot = new Map<SlotName, Entry[]>();
  readonly isStarter: boolean;

  constructor(data: GameData, isStarter = false) {
    this.data = data;
    this.isStarter = isStarter;
    const rows: ItemRow[] = data.items;
    for (const slot of SLOT_NAMES) {
      const bit = slotBit(slot);
      // Left and right slots share one pool, so an earring is offered for both ears.
      const bits = slot === 'Ear1' || slot === 'Ear2' ? slotBit('Ear1') | slotBit('Ear2') : slot === 'Ring1' || slot === 'Ring2' ? slotBit('Ring1') | slotBit('Ring2') : bit;
      const list: Entry[] = [];
      for (const [name, mask, level] of rows) if ((mask & bits) !== 0) list.push({ name, lower: name.toLowerCase(), level });
      this.bySlot.set(slot, list);
    }
  }

  count(slot: SlotName): number { return this.bySlot.get(slot)?.length ?? 0; }
  get itemCount(): number { return this.data.items.length; }

  /** Name matches first (starts with, then word start, then anywhere), then alphabetical. */
  search(slot: SlotName, opts: SearchOptions): { hits: ItemHit[]; total: number } {
    const list = this.bySlot.get(slot) ?? [];
    const q = opts.query.trim().toLowerCase();
    const limit = opts.limit ?? 80;
    const max = opts.maxLevel;
    const scored: { e: Entry; score: number }[] = [];
    let total = 0;
    for (const e of list) {
      if (max != null && e.level > max) continue;
      let score = 0;
      if (q) {
        const at = e.lower.indexOf(q);
        if (at < 0) continue;
        score = at === 0 ? 0 : e.lower[at - 1] === ' ' ? 1 : 2;
      }
      total++;
      if (scored.length < 4000) scored.push({ e, score });
    }
    scored.sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name));
    return { hits: scored.slice(0, limit).map(s => ({ name: s.e.name, level: s.e.level })), total };
  }

  has(slot: SlotName, name: string): boolean {
    const low = name.trim().toLowerCase();
    return (this.bySlot.get(slot) ?? []).some(e => e.lower === low);
  }
}

export const starterIndex = (): GameIndex => new GameIndex(STARTER_DATA, true);
