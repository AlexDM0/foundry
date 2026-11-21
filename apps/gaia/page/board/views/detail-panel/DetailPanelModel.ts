/** Which form a routed detail opens and what fills it: the ticket form, the row form or the draft form, or the line naming what the board lacks. */
import type { BoardDocument }                            from '../../../@types/board/BoardDocument.ts';
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

function formModelOf(board: BoardDocument, item: DetailItem, format: DetailFormat): DetailPanelViewModel | null {
  switch (item.form) {
    case 'ticket':
      return TicketDetailModelUtil.ticketDetailModelOf(board, item.ticketId, item.section ?? DEFAULT_TICKET_SECTION, format);
    case 'ticket-row':
      return RowDetailModelUtil.ticketRowDetailModelOf(board, item.ticketId, format);
    case 'task-row':
      return RowDetailModelUtil.taskRowDetailModelOf(board, item.taskId, format);
    case 'draft':
      return DraftDetailModelUtil.draftDetailModelOf(board, item.draftId, format);
    default:
      return null;
  }
}

function detailPanelModelOf(board: BoardDocument, item: DetailItem, format: DetailFormat): DetailPanelViewModel {
  return formModelOf(board, item, format) ?? { form: 'missing', text: missingTextOf(item) };
}

export const DetailPanelModel = Object.freeze({ detailPanelModelOf });
