/**
 * The contract's board command mapped into forge's. What matters: each kind maps to forge's command of the same kind with equal fields,
 * optional fields kept only when sent, a comment's anchor too; a typed draft edit of each target maps to the model's edit; and the mapped
 * command shares no array with the contract's, so the model may change it without touching what was read.
 */
import { describe, expect, test } from 'bun:test';

import { BOARD_COMMAND_SAMPLES, DRAFT_EDIT_SAMPLES } from '../../../testing/BoardCommandSamples.ts';
import { BoardCommandMappingUtil }                   from './BoardCommandMappingUtil.ts';

describe('a board command', () => {
  for (const command of Object.values(BOARD_COMMAND_SAMPLES)) {
    test(`${command.kind} maps to forge's command of the same kind with equal fields`, () => {
      expect<unknown>(BoardCommandMappingUtil.controlCommandOf(command)).toEqual(command);
    });
  }

  test('an optional field the body did not send stays absent', () => {
    const mapped = BoardCommandMappingUtil.controlCommandOf({ kind: 'job-fresh', jobId: 'J1' });

    expect(mapped).toEqual({ kind: 'job-fresh', jobId: 'J1' });
    expect(Object.hasOwn(mapped, 'incidentId')).toBe(false);
  });

  test('an anchor with no columns, quote or diagram keeps none of them', () => {
    const anchor = {
      view: 'code', versionNumber: 5, lines: { from: 17, to: 23 }, sectionPath: ['3 Behaviour'], surroundingLines: { from: 15, to: 25 }
    } as const;
    const mapped = BoardCommandMappingUtil.controlCommandOf({
      kind: 'ticket-document-comment', ticketReference: '7', document: 'spec', anchor, text: 'Split this block.'
    });

    expect(mapped.kind === 'ticket-document-comment' ? mapped.anchor : null).toEqual({ ...anchor, sectionPath: ['3 Behaviour'] });
    expect(Object.keys(mapped.kind === 'ticket-document-comment' ? mapped.anchor ?? {} : {})).toEqual(['view', 'versionNumber', 'lines', 'sectionPath', 'surroundingLines']);
  });

  test('a list is copied, never shared', () => {
    const command = BOARD_COMMAND_SAMPLES['ticket-ready'];
    const mapped = BoardCommandMappingUtil.controlCommandOf(command);

    expect(mapped.kind === 'ticket-ready' ? mapped.ticketReferences : null).not.toBe(command.ticketReferences);
  });
});

describe('a typed draft edit', () => {
  for (const edit of DRAFT_EDIT_SAMPLES) {
    test(`of target ${edit.target} maps to the model's edit`, () => {
      expect<unknown>(BoardCommandMappingUtil.draftEditOf(edit)).toEqual(edit);
    });
  }
});
