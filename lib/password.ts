/**
 * Starting passwords for students: one easy word and four digits ("maple4821").
 * Easy to type on a phone, but a million possibilities, picked with the
 * browser's secure random numbers, so a classmate can't guess one.
 */
const WORDS = [
  "amber", "anchor", "apple", "arrow", "atlas", "autumn", "bamboo", "banner", "basil", "beacon",
  "birch", "bloom", "breeze", "bridge", "brook", "cactus", "candle", "canyon", "cedar", "cherry",
  "cloud", "clover", "comet", "copper", "coral", "cotton", "crystal", "daisy", "delta", "desert",
  "dolphin", "dune", "eagle", "ember", "falcon", "fern", "forest", "fossil", "galaxy", "garden",
  "ginger", "glacier", "harbor", "hazel", "honey", "island", "ivory", "jasmine", "jungle", "kite",
  "lagoon", "lantern", "lemon", "lotus", "lunar", "mango", "maple", "marble", "meadow", "meteor",
  "mint", "mirror", "monsoon", "nectar", "north", "oasis", "ocean", "ochre", "olive", "orbit",
  "orchid", "pebble", "pepper", "pine", "planet", "prism", "quartz", "rain", "raven", "reef",
  "ribbon", "river", "saffron", "sage", "silver", "sky", "spark", "spruce", "summit", "sunset",
  "thunder", "tiger", "topaz", "tulip", "velvet", "violet", "willow", "winter", "zebra", "zenith",
];

export function newPassword(): string {
  const pick = new Uint32Array(2);
  crypto.getRandomValues(pick);
  return `${WORDS[pick[0] % WORDS.length]}${String(pick[1] % 10000).padStart(4, "0")}`;
}
