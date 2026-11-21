/**
 * The cues of the Flint slots: what the agent that a slot stands for does now, each derived from the data of the slot's screen. A lasting
 * cue names a state that holds while it shows, so Flint keeps its answer up in the slot for as long as it holds; any other cue is a moment,
 * answered once.
 */
import type { SpriteCue } from 'flint/SpriteHabitat';

export const FLINT_SLOT_CUES = Object.freeze({
  AGENT_READS:         'agent-reads',
  AGENT_WRITES:        'agent-writes',
  AGENT_REVIEWS:       'agent-reviews',
  AGENT_THINKS:        'agent-thinks',
  AGENT_WAITS_ON_USER: 'agent-waits-on-user',
  AGENT_IS_DONE:       'agent-is-done',
  AGENT_IS_IDLE:       'agent-is-idle',
} as const satisfies Readonly<Record<string, SpriteCue>>);

export type FlintSlotCue = typeof FLINT_SLOT_CUES[keyof typeof FLINT_SLOT_CUES];

export const LASTING_FLINT_SLOT_CUES: ReadonlySet<FlintSlotCue> = new Set<FlintSlotCue>([
  FLINT_SLOT_CUES.AGENT_READS,
  FLINT_SLOT_CUES.AGENT_WRITES,
  FLINT_SLOT_CUES.AGENT_REVIEWS,
  FLINT_SLOT_CUES.AGENT_WAITS_ON_USER,
]);
