/**
 * The Merge queue as the merge-queue habitat of Flint (`flint/`): there Flint works the Airlock. It goes into the Airlock when a target
 * gets a holder, shows a conflict when a candidate's prediction against its target turns conflicting, and chains a ticket that joins a
 * target's order.
 */
import {
  ARRIVED_CUE,
  type SpriteCue,
  type SpriteHabitat,
  type SpriteSuggestion
} from '../../../lib/flint/FlintInterface.ts';

export const MERGE_QUEUE_CUES = Object.freeze({
  AIRLOCK_TAKEN:      'airlock-taken',
  CONFLICT_PREDICTED: 'conflict-predicted',
  TICKET_QUEUED:      'ticket-queued',
} satisfies Readonly<Record<string, SpriteCue>>);

export const MERGE_QUEUE_SPRITE_HABITAT: SpriteHabitat = Object.freeze({
  kind:        'merge-queue',
  description: 'The merge queue: per target, the job that holds the Airlock and the candidates waiting in their order.',
  suggestions: Object.freeze<SpriteSuggestion[]>([
    { when: ARRIVED_CUE, respond: 'wave' },
    { when: MERGE_QUEUE_CUES.AIRLOCK_TAKEN, respond: 'airlock', note: 'A job took the Airlock of a target.' },
    { when: MERGE_QUEUE_CUES.CONFLICT_PREDICTED, respond: 'conflict', note: 'A candidate is now predicted to conflict with its target.' },
    { when: MERGE_QUEUE_CUES.TICKET_QUEUED, respond: 'chain', note: 'A ticket joined the order of a target.' },
  ]),
});
