export type JobRole = 'melee' | 'caster' | 'hybrid';
export const JOBS: { abbr: string; name: string; role: JobRole }[] = [
  { abbr: 'WAR', name: 'Warrior', role: 'melee' }, { abbr: 'MNK', name: 'Monk', role: 'melee' }, { abbr: 'WHM', name: 'White Mage', role: 'caster' },
  { abbr: 'BLM', name: 'Black Mage', role: 'caster' }, { abbr: 'RDM', name: 'Red Mage', role: 'hybrid' }, { abbr: 'THF', name: 'Thief', role: 'melee' },
  { abbr: 'PLD', name: 'Paladin', role: 'hybrid' }, { abbr: 'DRK', name: 'Dark Knight', role: 'hybrid' }, { abbr: 'BST', name: 'Beastmaster', role: 'melee' },
  { abbr: 'BRD', name: 'Bard', role: 'caster' }, { abbr: 'RNG', name: 'Ranger', role: 'melee' }, { abbr: 'SAM', name: 'Samurai', role: 'melee' },
  { abbr: 'NIN', name: 'Ninja', role: 'hybrid' }, { abbr: 'DRG', name: 'Dragoon', role: 'melee' }, { abbr: 'SMN', name: 'Summoner', role: 'caster' },
  { abbr: 'BLU', name: 'Blue Mage', role: 'hybrid' }, { abbr: 'COR', name: 'Corsair', role: 'hybrid' }, { abbr: 'PUP', name: 'Puppetmaster', role: 'melee' },
  { abbr: 'DNC', name: 'Dancer', role: 'melee' }, { abbr: 'SCH', name: 'Scholar', role: 'caster' }, { abbr: 'GEO', name: 'Geomancer', role: 'caster' },
  { abbr: 'RUN', name: 'Rune Fencer', role: 'hybrid' },
];
