// Space Scavenger's rules, shared by the 3D engine (three/scavenger.js) and the arcade UI.
// A flight runs through the sectors in order, warping to the next one every SECTOR_SECONDS,
// and loops back to the belt faster and busier after the storm.
export const SECTOR_SECONDS = 25;
export const WARP_SECONDS = 3.4;
export const SECTOR_BONUS = 500;

export const SECTORS = [
  { id: 'belt', name: 'Asteroid Belt', short: 'Belt', rule: 'Chain scrap for combo. Dodge the rocks.', color: '#ff8a4c' },
  { id: 'nebula', name: 'Ion Nebula', short: 'Nebula', rule: 'Scrap is worth double. Ion mines drift toward you.', color: '#ff5fd2' },
  { id: 'wreck', name: 'Wreckage Field', short: 'Wreckage', rule: 'Thread the rings for big points. Girders spin.', color: '#5be7da' },
  { id: 'storm', name: 'Meteor Storm', short: 'Storm', rule: 'Burning meteors cut across your path.', color: '#ffb547' },
];

// Power-ups change how the flight plays for a few seconds.
export const POWERS = {
  magnet: { name: 'Magnet', color: '#a993ff', seconds: 8, rule: 'Pulls nearby scrap into the hold.' },
  overdrive: { name: 'Overdrive', color: '#ff6a2b', seconds: 6, rule: 'Ram anything in your way for +40.' },
  chrono: { name: 'Chrono', color: '#5be7da', seconds: 6, rule: 'Slows the whole field down.' },
};
