/** Whether a ticket may move between two statuses, and the stamps it carries after the move. */
import type { RowedTicketStatus, TicketFrontmatter, TicketStatus } from '../@types/Ticket.ts';
import type { BoardRefusalDetail }                                 from '../BoardRefusal.ts';
import { LEGAL_SOURCE_STATUSES_FOR_TICKET_STATUS }                 from '../constants/TicketMoveLegality.ts';

export type TicketStamps = Pick<TicketFrontmatter, 'started' | 'finished' | 'delivered' | 'abandonedAt'>;

export interface TicketStampsAfterMove extends TicketStamps {
  clearsReason: boolean;
}

/** A move that may run reaches a status with a row; a refused one carries the Board's refusal. */
export type TicketMoveVerdict =
  | { verdict: 'open'; targetStatus: RowedTicketStatus }
  | { verdict: 'refused'; refusal: BoardRefusalDetail };

function ticketMoveIsLegal(currentStatus: TicketStatus, targetStatus: TicketStatus): boolean {
  return LEGAL_SOURCE_STATUSES_FOR_TICKET_STATUS[targetStatus].includes(currentStatus);
}

/**
 * Whether a move of the ticket between the two statuses may run, else its first refusal: no move stays in its status, no move reaches
 * `draft` (filing and `ticket unready` do) and only the filer's close reaches `ready-for-review`, a draft or a ticket ready for review leaves
 * only by `ticket ready` or abandonment, and the legality table holds unless `checksLegality` is false, the deliberate override.
 */
function moveVerdictOf(ticketId: string, status: TicketStatus, targetStatus: TicketStatus, checksLegality: boolean): TicketMoveVerdict {
  const refused = (refusal: BoardRefusalDetail): TicketMoveVerdict => ({ verdict: 'refused', refusal });
  if (status === targetStatus) return refused({ reason: 'ticket-already-in-status', ticketId, status });
  if (targetStatus === 'draft') return refused({ reason: 'move-to-draft', ticketId, status });
  if (targetStatus === 'ready-for-review') return refused({ reason: 'move-to-ready-for-review', ticketId, status });
  if (status === 'draft' && targetStatus !== 'abandoned') return refused({ reason: 'move-of-a-draft', ticketId, targetStatus });
  if (status === 'ready-for-review' && targetStatus !== 'abandoned') return refused({ reason: 'move-of-a-ticket-ready-for-review', ticketId, targetStatus });
  if (checksLegality && !ticketMoveIsLegal(status, targetStatus)) {
    return refused({
      reason: 'illegal-ticket-move',
      ticketId,
      status,
      targetStatus,
    });
  }
  return { verdict: 'open', targetStatus };
}

/**
 * `started`, `finished` and `delivered` are set only when still null, while `abandonedAt` is always set: abandoning twice is deciding twice.
 * A reopen clears all four and the reason, since the work starts over.
 */
function stampsAfterMoveOf(frontmatter: Readonly<TicketStamps>, targetStatus: TicketStatus, at: string): TicketStampsAfterMove {
  const {
    started,
    finished,
    delivered,
    abandonedAt,
  } = frontmatter;
  switch (targetStatus) {
    case 'draft':
    case 'ready-for-review':
    case 'committed':
      return {
        started:      null,
        finished:     null,
        delivered:    null,
        abandonedAt:  null,
        clearsReason: true,
      };
    case 'in-progress':
      return {
        started:      started ?? at,
        finished,
        delivered,
        abandonedAt,
        clearsReason: false,
      };
    case 'in-review':
    case 'reviewed':
      return {
        started,
        finished:     finished ?? at,
        delivered,
        abandonedAt,
        clearsReason: false,
      };
    case 'delivered':
      return {
        started,
        finished,
        delivered:    delivered ?? at,
        abandonedAt,
        clearsReason: false,
      };
    case 'abandoned':
      return {
        started,
        finished,
        delivered,
        abandonedAt:  at,
        clearsReason: false,
      };
  }
}

export const TicketMoveUtil = { ticketMoveIsLegal, moveVerdictOf, stampsAfterMoveOf } as const;
