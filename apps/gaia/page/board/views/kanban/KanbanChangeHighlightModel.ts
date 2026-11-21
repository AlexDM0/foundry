/**
 * Which Kanban cards to mark as changed: a diff of two consecutive boards, keyed as the Kanban model keys its cards. A card is marked when it
 * is new or its state moved; the first board marks nothing, since there is nothing it changed from.
 */
import { ChangeHighlightUtil } from '../../utils/ChangeHighlightUtil.ts';
import type { KanbanBoard }    from './@types/KanbanBoard.ts';

type SignedBoard = Pick<KanbanBoard, 'page'>;

/** A ticket's signature is its display state and its status, so a draft readied or a ticket held or released shows as a move too. */
function cardSignaturesOf(board: SignedBoard): ReadonlyMap<string, string> {
  const displayStateById = new Map(board.page.facts.tickets.map((facts) => [facts.ticketId, facts.displayState]));
  const ticketSignatures = board.page.tickets.map((ticket): [string, string] => [
    `ticket:${ticket.id}`,
    `${displayStateById.get(ticket.id) ?? ticket.status} ${ticket.status}${ticket.hold === null ? '' : ' held'}`,
  ]);
  const draftSignatures = board.page.facts.drafts.map((draft): [string, string] => [`draft:${draft.id}`, draft.state]);
  return new Map([...ticketSignatures, ...draftSignatures]);
}

/** Only cards the current board holds are answered: a card that went has nothing on screen to mark. */
function changedCardKeysBetween(previous: SignedBoard | null, current: SignedBoard): ReadonlySet<string> {
  return ChangeHighlightUtil.changedKeysBetween(previous === null ? null : cardSignaturesOf(previous), cardSignaturesOf(current));
}

export const KanbanChangeHighlightModel = Object.freeze({ changedCardKeysBetween, cardSignaturesOf });
