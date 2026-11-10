/* A small built-in sample so the app is usable before the real game data is loaded.
   The full list comes from the game resource files (see scripts/convert-resources.ts or the Game data dialog). */
import type { SlotName } from '../core/types';
import type { GameData, ItemRow } from './windower';
import { emptyGameData, slotBit } from './windower';

const GEAR: Partial<Record<SlotName | 'Ear' | 'Ring', string[]>> = {
  Main: ['Excalibur', 'Joyeuse', 'Ragnarok', 'Apocalypse', 'Maneater', 'Mandau', 'Kikoku', 'Kraken Club', 'Yagrush', 'Chatoyant Staff', "Pluto's Staff", "Terra's Staff", 'Dark Staff', 'Light Staff', 'Fire Staff'],
  Sub: ["Genbu's Shield", 'Aegis', 'Ochain', 'Mighty Strap', 'Mandau', 'Kikoku', 'Kraken Club', 'Maneater', 'Excalibur'],
  Range: ['Gjallarhorn', 'Ullr', 'Annihilator', 'Cornette'],
  Ammo: ['Tulfaire Arrow', 'Bronze Bolt', 'Orichalcum Bullet', 'Silver Bullet', 'Happy Egg'],
  Head: ['Optical Hat', 'Walahra Turban', 'Gavialis Helm', 'Homam Zucchetto', 'Hecatomb Cap', "Duelist's Chapeau", 'Goliard Chapeau'],
  Neck: ['Spike Necklace', 'Justice Torque', 'Prudence Torque', 'Love Torque', 'Peacock Amulet', 'Uggalepih Pendant', 'Parade Gorget'],
  Ear: ['Brutal Earring', 'Suppanomimi', 'Loquac. Earring', 'Moonshade Earring', "Merman's Earring", 'Cassie Earring', 'Ethereal Earring', 'Magnetic Earring', 'Static Earring', 'Novio Earring'],
  Body: ['Scorpion Harness', 'Dusk Jerkin', "Kirin's Osode", 'Black Cotehardie', 'Vermillion Cloak', 'Errant Houppelande', 'Shura Togi', 'Askar Korazin', "Warlock's Tabard", "Duelist's Tabard"],
  Hands: ['Dusk Gloves', 'Bokwus Gloves', 'Mochizuki Tekko', 'Rawhide Gloves', 'Leather Gloves', "Warlock's Gloves", "Duelist's Gloves", 'Garrison Gloves'],
  Ring: ['Rajas Ring', 'Flame Ring', 'Defending Ring', "Balrahn's Ring", 'Tamas Ring', 'Vivian Ring', 'Prolix Ring', 'Kunaji Ring', "Ulthalam's Ring", "Sirona's Ring", 'Serket Ring', "Toreador's Ring", "Evoker's Ring", 'Rahab Ring', 'Jelly Ring', 'Sheltered Ring'],
  Back: ["Forager's Mantle", "Cuchulain's Mantle", 'Prism Cape', 'Amemet Mantle', 'Veela Cape', 'Shadow Mantle', "Rudianos's Mantle", "Boxer's Mantle", 'Cerberus Mantle'],
  Waist: ['Warwolf Belt', "Hurch'lan Sash", 'Swift Belt', 'Fotia Belt', 'Chaac Belt', "Penitent's Rope", "Friar's Rope"],
  Legs: ['Dusk Trousers', "Byakko's Haidate", 'Garrison Hose', 'Mochizuki Hakama', "Duelist's Tights", "Warlock's Tights"],
  Feet: ['Dusk Ledelsens', 'Rostrum Pumps', 'Bounding Boots', "Herald's Gaiters", 'Fuma Kyahan', 'Mochizuki Kyahan', "Duelist's Boots", "Warlock's Boots"],
};

function starterItems(): ItemRow[] {
  const masks = new Map<string, number>();
  for (const [group, list] of Object.entries(GEAR)) {
    const bits = group === 'Ear' ? slotBit('Ear1') | slotBit('Ear2') : group === 'Ring' ? slotBit('Ring1') | slotBit('Ring2') : slotBit(group as SlotName);
    for (const n of list ?? []) masks.set(n, (masks.get(n) ?? 0) | bits);
  }
  return [...masks.entries()].map(([n, m]): ItemRow => [n, m, 0]).sort((a, b) => a[0].localeCompare(b[0]));
}

export const STARTER_DATA: GameData = {
  ...emptyGameData('Built-in sample'),
  items: starterItems(),
  spells: ['Cure', 'Cure II', 'Cure III', 'Cure IV', 'Cure V', 'Cure VI', 'Curaga', 'Haste', 'Refresh', 'Stoneskin', 'Phalanx', 'Blink', 'Aquaveil', 'Protect', 'Shell', 'Regen', 'Sleep', 'Sleep II', 'Slow', 'Paralyze', 'Silence', 'Blind', 'Bind', 'Gravity', 'Dispel', 'Dia', 'Bio', 'Fire', 'Blizzard', 'Aero', 'Stone', 'Thunder', 'Water', 'Banish', 'Holy', 'Raise', 'Reraise', 'Utsusemi: Ichi', 'Utsusemi: Ni', 'Honor March', 'Victory March'],
  abilities: ['Provoke', 'Berserk', 'Warcry', 'Defender', 'Aggressor', 'Meditate', 'Third Eye', 'Hasso', 'Seigan', 'Sneak Attack', 'Trick Attack', 'Steal', 'Hide', 'Flee', 'Waltz', 'Convert', 'Chainspell', 'Elemental Seal', 'Benediction', 'Divine Seal'],
  weaponskills: ['Fast Blade', 'Burning Blade', 'Red Lotus Blade', 'Seraph Blade', 'Savage Blade', 'Requiescat', 'Evisceration', "Rudra's Storm", 'Tachi: Fudo', 'Tachi: Kasha', 'Chant du Cygne', 'Sanguine Blade'],
  buffs: ['Haste', 'Slow', 'Refresh', 'Protect', 'Shell', 'Stoneskin', 'Blink', 'Reraise', 'Copy Image', 'Sneak Attack', 'Silence', 'Paralysis', 'Doom', 'Weakness', 'Sleep', 'Poison', 'Chainspell', 'Elemental Seal'],
};
