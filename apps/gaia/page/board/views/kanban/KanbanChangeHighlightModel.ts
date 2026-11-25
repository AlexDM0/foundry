/**
 * Which Kanban cards to mark as changed: a diff of two consecutive boards, keyed as the Kanban model keys its cards. A card is marked when it
 * is new or its state moved; the first board marks nothing, since there is nothing it changed from.
 */
import { ChangeHighlightUtil } from '../../utils/ChangeHighlightUtil.ts';
import type { KanbanBoard }    from './@types/KanbanBoard.ts';
import { KanbanModel }         from './KanbanModel.ts';

type SignedBoard = Pick<KanbanBoard, 'page'>;

/** A Kanban card's signature is its display state and its status, so a ticket held or released shows as a move too; a draft readied is new. */
function cardSignaturesOf(board: SignedBoard): ReadonlyMap<string, string> {
  const displayStateById = new Map(board.page.facts.tickets.map((facts) => [facts.ticketId, facts.displayState]));
  return new Map(board.page.tickets.filter(KanbanModel.ticketIsOnKanban).map((ticket): [string, string] => [
    `ticket:${ticket.id}`,
    `${displayStateById.get(ticket.id) ?? ticket.status} ${ticket.status}${ticket.hold === null ? '' : ' held'}`,
  ]));
}

/** Only cards the current board holds are answered: a card that went has nothing on screen to mark. */
function changedCardKeysBetween(previous: SignedBoard | null, current: SignedBoard): ReadonlySet<string> {
  return ChangeHighlightUtil.changedKeysBetween(previous === null ? null : cardSignaturesOf(previous), cardSignaturesOf(current));
}

export const KanbanChangeHighlightModel = Object.freeze({ changedCardKeysBetween, cardSignaturesOf });
