/** The values of the mind itself, which no behaviour owns: when the director is asked, and the seeded sequence the behaviours draw from. */
export const DIRECTOR = {
  /** The director is asked this often, and at once when a cue arrives. */
  ASK_INTERVAL_MILLISECONDS:       3000,
  /** With no cue, click, drag or intent for this long, the rule director sends Flint home to sleep. */
  QUIET_BEFORE_SLEEP_MILLISECONDS: 60000,
  /** How many cues of the habitat Flint lives in a digest carries. */
  RECENT_CUE_LIMIT:                8,
} as const;

/**
 * The pseudo-random sequence of the mind's state (`sequenceSeed`): a linear congruential generator, so a spec sees the same walk and the
 * same run each time.
 */
export const SEEDED_SEQUENCE = {
  MULTIPLIER:   1664525,
  INCREMENT:    1013904223,
  MODULUS:      4294967296,
  INITIAL_SEED: 20261113,
} as const;

/** The one cue Flint raises itself: it arrived in a habitat, after a visit or a drop. A suggestion answers it like a host's cue. */
export const ARRIVED_CUE = 'arrived';
