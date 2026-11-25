/**
 * Test-only: the two artboards of the ticket documents' pipeline settings, 9 (the design step's Ticket phase with a spec, then a plan) and
 * 10 (the review step dialog with its Pipeline documents), each as the board it paints from, the route it shows and the pipeline agent's
 * conversation, and artboard 10's dialog as the page draws it over that board, for the visual pass to paint beside the other artboards.
 */
import { createElement }        from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { BoardDocument }                    from '../@types/board/BoardDocument.ts';
import type { BoardTranscriptEntryDocument }     from '../@types/board/ConversationDocument.ts';
import { BoardGoToContext, BoardTrackerContext } from '../board/shell/BoardRouteLinks.ts';
import type { BoardRoute }                       from '../board/shell/BoardRouter.ts';
import { ControlSurroundingsContext }            from '../board/shell/ControlAvailability.ts';
import { fakeControlSurroundingsOf }             from '../board/testing/FakeControlSurroundings.ts';
import { pipelineBoardStateOf }                  from '../board/testing/PipelineFixture.ts';
import { exampleTranscriptEntry }                from '../board/testing/TranscriptEntryFixture.ts';
import { PipelineDialogs }                       from '../board/views/pipeline/dialogs/PipelineDialogs.tsx';
import type { FlowOpenRequest }                  from '../board/views/pipeline/flow/PipelineFlowModel.ts';

export type PipelineDocumentArtboard = '9' | '10';

export interface PipelineDocumentScreen {
  readonly artboard:        PipelineDocumentArtboard;
  readonly title:           string;
  /** The artboard's file among the owner's drawings of the ticket documents. */
  readonly designFile:      string;
  readonly board:           BoardDocument;
  readonly boardRoute:      BoardRoute;
  /** The dialog the artboard draws over the board; null draws the board alone. */
  readonly openRequest:     FlowOpenRequest | null;
  /** The pipeline agent's conversation so far, which its panel shows. */
  readonly agentTranscript: readonly BoardTranscriptEntryDocument[];
}

/** The design step, where the Ticket phase opens on its four steps. */
const DESIGN_STEP_ROUTE: BoardRoute = { tab: 'pipeline', item: 'setup/design' };

/** User asks for a spec, then a plan, and the agent's turn says what it changed and where the reviewer's reading of the plan is set. */
const SPEC_THEN_PLAN_AGENT_TRANSCRIPT: readonly BoardTranscriptEntryDocument[] = [
  exampleTranscriptEntry({ cursor: '1.1', role: 'user', text: 'Spec, then plan. I want to review both.' }),
  exampleTranscriptEntry({
    cursor: '1.2',
    role:   'assistant',
    text:   'Ticket creation is now two writing steps, Spec and Plan, each with your review. The plan agent runs on Opus at high effort, '
      + 'because the builder starts from its plan instead of finding the work itself.\n\n'
      + 'The reviewer reads the plan only when you approved it. Double-click Review in the Review phase to change that.',
  }),
  exampleTranscriptEntry({ cursor: '1.3', role: 'turn-end', text: '' }),
];

const REVIEW_STEP_REQUEST: FlowOpenRequest = { kind: 'node', nodeId: 'review', action: { kind: 'dialog', dialog: 'review-step', focusesReReview: false } };

export const PIPELINE_DOCUMENT_SCREENS: readonly PipelineDocumentScreen[] = [
  {
    artboard:        '9',
    title:           'Pipeline design, Ticket phase with spec and plan',
    designFile:      'PipelineDesignTicket.dc.html',
    board:           pipelineBoardStateOf('A2-spec-then-plan'),
    boardRoute:      DESIGN_STEP_ROUTE,
    openRequest:     null,
    agentTranscript: SPEC_THEN_PLAN_AGENT_TRANSCRIPT,
  },
  {
    artboard:        '10',
    title:           'Review agent editor, ticket documents',
    designFile:      'ReviewerAgentEditor.dc.html',
    board:           pipelineBoardStateOf('A2-spec-then-plan'),
    boardRoute:      DESIGN_STEP_ROUTE,
    openRequest:     REVIEW_STEP_REQUEST,
    agentTranscript: SPEC_THEN_PLAN_AGENT_TRANSCRIPT,
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
