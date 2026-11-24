/**
 * Test-only: the two artboards of the ticket documents' pipeline settings, 9 (the design step's Ticket phase with a spec, then a plan) and
 * 10 (the review step dialog with its Pipeline documents), each as the board it paints from and the route it shows, and artboard 10's
 * dialog as the page draws it over that board, for the visual pass to paint beside the other artboards.
 */
import { createElement }        from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { BoardDocument }                    from '../@types/board/BoardDocument.ts';
import { BoardGoToContext, BoardTrackerContext } from '../board/shell/BoardRouteLinks.ts';
import type { BoardRoute }                       from '../board/shell/BoardRouter.ts';
import { ControlSurroundingsContext }            from '../board/shell/ControlAvailability.ts';
import { fakeControlSurroundingsOf }             from '../board/testing/FakeControlSurroundings.ts';
import { pipelineBoardStateOf }                  from '../board/testing/PipelineFixture.ts';
import { PipelineDialogs }                       from '../board/views/pipeline/dialogs/PipelineDialogs.tsx';
import type { FlowOpenRequest }                  from '../board/views/pipeline/flow/PipelineFlowModel.ts';

export type PipelineDocumentArtboard = '9' | '10';

export interface PipelineDocumentScreen {
  readonly artboard:    PipelineDocumentArtboard;
  readonly title:       string;
  /** The artboard's file among the owner's drawings of the ticket documents. */
  readonly designFile:  string;
  readonly board:       BoardDocument;
  readonly boardRoute:  BoardRoute;
  /** The dialog the artboard draws over the board; null draws the board alone. */
  readonly openRequest: FlowOpenRequest | null;
}

/** The design step, where the Ticket phase opens on its four steps. */
const DESIGN_STEP_ROUTE: BoardRoute = { tab: 'pipeline', item: 'setup/design' };

const REVIEW_STEP_REQUEST: FlowOpenRequest = { kind: 'node', nodeId: 'review', action: { kind: 'dialog', dialog: 'review-step', focusesReReview: false } };

export const PIPELINE_DOCUMENT_SCREENS: readonly PipelineDocumentScreen[] = [
  {
    artboard:    '9',
    title:       'Pipeline design, Ticket phase with spec and plan',
    designFile:  'PipelineDesignTicket.dc.html',
    board:       pipelineBoardStateOf('A2-spec-then-plan'),
    boardRoute:  DESIGN_STEP_ROUTE,
    openRequest: null,
  },
  {
    artboard:    '10',
    title:       'Review agent editor, ticket documents',
    designFile:  'ReviewerAgentEditor.dc.html',
    board:       pipelineBoardStateOf('A2-spec-then-plan'),
    boardRoute:  DESIGN_STEP_ROUTE,
    openRequest: REVIEW_STEP_REQUEST,
  },
];

/** The artboard's dialog as the page draws it, with every control live; an empty string where the artboard draws none. */
export function pipelineDocumentDialogMarkupOf(screen: PipelineDocumentScreen, trackerId: string): string {
  if (screen.openRequest === null) return '';
  const dialogs = createElement(PipelineDialogs, { facts: screen.board, request: screen.openRequest, onClose: () => undefined });
  const { surroundings } = fakeControlSurroundingsOf();
  return renderToStaticMarkup(createElement(
    BoardTrackerContext,
    { value: trackerId },
    createElement(BoardGoToContext, { value: () => undefined }, createElement(ControlSurroundingsContext, { value: surroundings }, dialogs)),
  ));
}
