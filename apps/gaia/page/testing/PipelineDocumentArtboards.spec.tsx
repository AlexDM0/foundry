/**
 * The ticket documents' pipeline artboards as the page paints them. What matters: artboard 9 is the design step over the spec-then-plan
 * board, with no dialog, its proposal ready with the route's three changes, the Ticket tab marked Changed, and the agent's chat painted
 * with User's ask and the agent's reply; artboard 10 draws the review step dialog over it, its Pipeline documents after the brief.
 */
import { expect, test } from 'bun:test';

import { pipelineDocumentScreenMarkupOf }                            from './ArtboardScreens.tsx';
import { PIPELINE_DOCUMENT_SCREENS, pipelineDocumentDialogMarkupOf } from './PipelineDocumentArtboards.tsx';

const TRACKER_ID = 'example-tracker';

test('artboard 9 is the design step over the spec-then-plan board, with no dialog', () => {
  const [designStep] = PIPELINE_DOCUMENT_SCREENS;
  expect([designStep?.artboard, designStep?.boardRoute]).toEqual(['9', { tab: 'pipeline', item: 'setup/design' }]);
  expect(designStep?.board.pipeline.setup?.record.draft?.ticketWriting).toBe('spec-then-plan');
  expect(designStep === undefined ? null : pipelineDocumentDialogMarkupOf(designStep, TRACKER_ID)).toBe('');
});

test('artboard 10 draws the review step dialog with its Pipeline documents after the brief', () => {
  const reviewEditor = PIPELINE_DOCUMENT_SCREENS.find((screen) => screen.artboard === '10');
  const markup = reviewEditor === undefined ? '' : pipelineDocumentDialogMarkupOf(reviewEditor, TRACKER_ID);
  expect(markup.indexOf('Pipeline documents')).toBeGreaterThan(markup.indexOf('Brief'));
  expect(markup).toContain('Reads the spec and the plan, always.');
});

test('artboard 9 paints the ready proposal with its three changes, the Ticket tab marked Changed, and the agent\'s chat', () => {
  const [designStep] = PIPELINE_DOCUMENT_SCREENS;
  const markup = designStep === undefined ? '' : pipelineDocumentScreenMarkupOf(designStep, 'light');
  const ticketTab = markup.slice(markup.indexOf('data-phase="ticket"'), markup.indexOf('data-phase="build"'));
  expect([ticketTab.includes('Changed'), designStep?.board.pipeline.flow?.changeList.length, markup.includes('Proposal ready')]).toEqual([true, 3, true]);
  expect(markup).toContain('Spec, then plan. I want to review both.');
  expect(markup).toContain('The reviewer reads the plan only when you approved it.');
});
