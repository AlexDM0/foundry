/**
 * The Tickets view and the Kanban as the tickets habitat of Flint (`flint/`): there Flint is the clerk of the board. It inks a draft that
 * is readied, makes a ticket that is filed, reorders, chains, holds and ships, jars a bug a review found, and chases the bug a delivered
 * ticket let out, which the view performs with that ticket's row or card (`page/board/flint/UseTicketsHabitat.ts`).
 */
import type { SpriteCue, SpriteHabitat, SpriteSuggestion } from 'flint/SpriteHabitat';
import { ARRIVED_CUE }                                     from 'flint/SpriteHabitat';

export const TICKETS_CUES = Object.freeze({
  DRAFT_READIED:           'draft-readied',
  TICKET_FILED:            'ticket-filed',
  PRIORITY_CHANGED:        'priority-changed',
  DEPENDENCY_ADDED:        'dependency-added',
  TICKET_HELD:             'ticket-held',
  TICKET_DELIVERED:        'ticket-delivered',
  REVIEW_FILED_A_TICKET:   'review-filed-a-ticket',
  BUG_SOURCE_IS_NOT_SHOWN: 'bug-source-is-not-shown',
} satisfies Readonly<Record<string, SpriteCue>>);

export const TICKETS_SPRITE_HABITAT: SpriteHabitat = Object.freeze({
  kind:        'tickets',
  description: 'The tickets of the board: their status, priority, holds and dependencies, as a table or as lanes.',
  suggestions: Object.freeze<SpriteSuggestion[]>([
    { when: ARRIVED_CUE, respond: 'wave' },
    { when: TICKETS_CUES.DRAFT_READIED, respond: 'ink-draft', note: 'A draft ticket was readied and waits for a builder.' },
    { when: TICKETS_CUES.TICKET_FILED, respond: 'make-ticket', note: 'A ticket was filed.' },
    { when: TICKETS_CUES.PRIORITY_CHANGED, respond: 'reorder', note: 'The priority of a ticket changed.' },
    { when: TICKETS_CUES.DEPENDENCY_ADDED, respond: 'chain', note: 'A ticket waits on one more ticket.' },
    { when: TICKETS_CUES.TICKET_HELD, respond: 'hold', note: 'A ticket is held.' },
    { when: TICKETS_CUES.TICKET_DELIVERED, respond: 'ship', note: 'A ticket was delivered.' },
    { when: TICKETS_CUES.REVIEW_FILED_A_TICKET, respond: 'bug-jar', note: 'A review found a problem and filed it as a ticket.' },
    { when: TICKETS_CUES.BUG_SOURCE_IS_NOT_SHOWN, respond: 'escaped-bug', note: 'A bug was filed against a delivered ticket that is not shown.' },
  ]),
});
