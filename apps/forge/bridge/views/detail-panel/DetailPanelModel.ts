/** Which form a routed detail opens and what fills it: the ticket form, the row form or the draft form, or the line naming what the board lacks. */
import type { DetailBoardState }                         from '../../@types/DetailBoardState.ts';
import { DEFAULT_TICKET_SECTION, type DetailItem }       from '../../shell/DetailRoute.ts';
import type { DetailFormat }                             from './DetailFactsModel.ts';
import { DraftDetailModelUtil, type DraftDetailModel }   from './DraftDetailModel.ts';
import { RowDetailModelUtil, type RowDetailModel }       from './RowDetailModel.ts';
import { TicketDetailModelUtil, type TicketDetailModel } from './TicketDetailModel.ts';

/** A route can outlive what it names, so a missing item opens the panel on one line saying so. */
export interface MissingDetailModel {
  readonly form: 'missing';
  readonly text: string;
}

export type DetailPanelViewModel = TicketDetailModel | RowDetailModel | DraftDetailModel | MissingDetailModel;

function missingTextOf(item: DetailItem): string {
  switch (item.form) {
    case 'ticket':
    case 'ticket-row':
      return `No ticket #${item.ticketId} on this board.`;
    case 'task-row':
      return `No row ${String(item.taskId)} on this board.`;
    case 'draft':
      return `No open draft ${item.draftId} on this board.`;
    default:
      return '';
  }
}

function formModelOf(state: DetailBoardState, item: DetailItem, format: DetailFormat): DetailPanelViewModel | null {
  switch (item.form) {
    case 'ticket':
      return TicketDetailModelUtil.ticketDetailModelOf(state, item.ticketId, item.section ?? DEFAULT_TICKET_SECTION, format);
    case 'ticket-row':
      return RowDetailModelUtil.ticketRowDetailModelOf(state, item.ticketId, format);
    case 'task-row':
      return RowDetailModelUtil.taskRowDetailModelOf(state, item.taskId, format);
    case 'draft':
      return DraftDetailModelUtil.draftDetailModelOf(state, item.draftId, format);
    default:
      return null;
  }
}

function detailPanelModelOf(state: DetailBoardState, item: DetailItem, format: DetailFormat): DetailPanelViewModel {
  return formModelOf(state, item, format) ?? { form: 'missing', text: missingTextOf(item) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The board state as the panel reads it, or `null` while the document has no page, or a page without the facts and limits it reads. */
function detailBoardStateOf(document: unknown): DetailBoardState | null {
  if (!isRecord(document) || !isRecord(document['page'])) return null;
  const { page } = document;
  if (!Array.isArray(page['tickets']) || !isRecord(page['payload'])) return null;
  const { payload } = page;
  if (!isRecord(payload['boardFacts']) || !isRecord(payload['progress']) || !isRecord(payload['limits'])) return null;
  if (!Array.isArray(payload['boardFacts']['rows']) || !Array.isArray(payload['limits']['tickStepLadderMinutes'])) return null;
  return document as unknown as DetailBoardState;
}

export const DetailPanelModel = Object.freeze({ detailPanelModelOf, detailBoardStateOf });
