/* Searchable game data: per-slot item index plus name lists for spells, abilities and so on. */
import type { SlotName } from '../core/types';
import { SLOT_NAMES } from '../core/types';
import type { GameData, ItemRow } from './windower';
import { slotBit } from './windower';
import { STARTER_DATA } from './starter';

/** name is the in-game name; long is the full name when it differs; icon is a cell in the item icon sheet or -1. */
export interface ItemHit { name: string; level: number; long: string; icon: number }
export interface SearchOptions { query: string; maxLevel?: number; limit?: number }

interface Entry { name: string; lower: string; level: number; long: string; longLower: string; icon: number }

export class GameIndex {
  readonly data: GameData;
  private bySlot = new Map<SlotName, Entry[]>();
  private byName = new Map<string, Entry>();
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
      for (const row of rows) {
        const [name, mask, level] = row;
        if ((mask & bits) === 0) continue;
        const long = row[3] ?? '';
        list.push({ name, lower: name.toLowerCase(), level, long, longLower: long.toLowerCase(), icon: row[4] ?? -1 });
      }
      this.bySlot.set(slot, list);
    }
    for (const list of this.bySlot.values()) for (const e of list) { this.byName.set(e.lower, e); if (e.long) this.byName.set(e.longLower, e); }
  }

  /** Finds an item by its in-game name or its full name, in any slot. */
  lookup(name: string): ItemHit | undefined {
    const e = this.byName.get(name.trim().toLowerCase());
    return e && { name: e.name, level: e.level, long: e.long, icon: e.icon };
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
        const at = e.lower.indexOf(q), atLong = e.long ? e.longLower.indexOf(q) : -1;
        if (at < 0 && atLong < 0) continue;
        const rank = (hay: string, i: number): number => (i < 0 ? 9 : i === 0 ? 0 : hay[i - 1] === ' ' ? 1 : 2);
        score = Math.min(rank(e.lower, at), rank(e.longLower, atLong));
      }
      total++;
      if (scored.length < 4000) scored.push({ e, score });
    }
    scored.sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name));
    return { hits: scored.slice(0, limit).map(s => ({ name: s.e.name, level: s.e.level, long: s.e.long, icon: s.e.icon })), total };
  }

  has(slot: SlotName, name: string): boolean {
    const low = name.trim().toLowerCase();
    return (this.bySlot.get(slot) ?? []).some(e => e.lower === low || (e.long !== '' && e.longLower === low));
  }
}

export const starterIndex = (): GameIndex => new GameIndex(STARTER_DATA, true);
