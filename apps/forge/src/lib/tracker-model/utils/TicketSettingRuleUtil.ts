/**
 * Which of a ticket's settings may change in its status: its hold, its network and its priority. The Board's moves throw the refusal these
 * give and its offers list what they leave open, so the two never drift.
 */
import type { TicketFrontmatter, TicketPriority, TicketStatus }            from '../@types/Ticket.ts';
import type { BoardRefusalDetail }                                         from '../BoardRefusal.ts';
import { SETTLED_TICKET_STATUSES, TICKET_STATUSES_EDITABLE_WITHOUT_FORCE } from '../constants/Statuses.ts';
import { TICKET_PRIORITIES }                                               from '../constants/TicketFields.ts';
import { TicketDefaultsUtil }                                              from './TicketDefaultsUtil.ts';

export type HoldAction = 'hold' | 'unhold';

/** A settled ticket is never built, reviewed or held again, so a hold on it neither starts nor ends. */
function holdCanChange(status: TicketStatus): boolean {
  return !SETTLED_TICKET_STATUSES.includes(status);
}

/** The refusal a hold or an unhold of the ticket meets now, `null` when it is open: a settled ticket, or a hold already as asked. */
function holdRefusalOf(frontmatter: Pick<TicketFrontmatter, 'id' | 'status' | 'hold'>, action: HoldAction): BoardRefusalDetail | null {
  const { id: ticketId, status } = frontmatter;
  if (!holdCanChange(status)) return {
    reason: 'hold-of-a-settled-ticket', ticketId, status, action
  };
  const isHeld = frontmatter.hold !== undefined;
  if (action === 'hold' && isHeld) return { reason: 'ticket-already-held', ticketId };
  if (action === 'unhold' && !isHeld) return { reason: 'ticket-not-held', ticketId };
  return null;
}

/** Only while no agent has claimed the ticket, so no agent already at work gains a grant. */
function networkCanChange(status: TicketStatus): boolean {
  return TICKET_STATUSES_EDITABLE_WITHOUT_FORCE.includes(status);
}

/**
 * The refusal a move of the ticket to `priority` meets now, `null` when it is open: its own priority, or `low` once an agent has claimed
 * it; raising is open in every status.
 */
function priorityRefusalOf(frontmatter: Pick<TicketFrontmatter, 'id' | 'status' | 'priority'>, priority: TicketPriority): BoardRefusalDetail | null {
  const { id: ticketId, status } = frontmatter;
  if (TicketDefaultsUtil.ticketPriorityOf(frontmatter) === priority) {
    return {
      reason: 'priority-unchanged', ticketId, status, priority
    };
  }
  if (priority === 'low' && !TICKET_STATUSES_EDITABLE_WITHOUT_FORCE.includes(status)) return { reason: 'lowering-a-ticket-that-is-not-pending', ticketId, status };
  return null;
}

/** Every priority the ticket may move to now, the highest first. */
function priorityChoicesOf(frontmatter: Pick<TicketFrontmatter, 'id' | 'status' | 'priority'>): TicketPriority[] {
  return [...TICKET_PRIORITIES].reverse().filter((priority) => priorityRefusalOf(frontmatter, priority) === null);
}

export const TicketSettingRuleUtil = Object.freeze({
  holdCanChange,
  holdRefusalOf,
  networkCanChange,
  priorityRefusalOf,
  priorityChoicesOf,
});
