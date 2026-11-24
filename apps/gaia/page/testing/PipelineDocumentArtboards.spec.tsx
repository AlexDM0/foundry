/**
 * The ticket documents' pipeline artboards as the page paints them. What matters: artboard 9 is the design step over the spec-then-plan
 * board, with no dialog; artboard 10 draws the review step dialog over it, its Pipeline documents after the brief.
 */
import { expect, test } from 'bun:test';

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
