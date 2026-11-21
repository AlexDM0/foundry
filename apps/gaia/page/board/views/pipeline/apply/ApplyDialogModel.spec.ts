/**
 * The first Apply's model. What matters: the "Resume the board" line counts the committed tickets and names the concurrency limit only when
 * the facts carry one; the constitution note shows only while the draft holds a constitution; the command carries the record, its draft
 * revision and the checkbox's value as given. Over entities: the description counts the entities and the version; the pace is worded in
 * jobs; the line about committed tickets without an entity shows only when Apply turns the pipeline into entities; the Apply refusal is the
 * one the forge serves, in its sentence unchanged, each ticket its facts name a link to its detail, and none is predicted on a board whose
 * served facts carry none; an entity without gates or with the default constitution is worth a look, and the root kept for a person is not.
 */
import { describe, expect, test }                                                                      from 'bun:test';
import type { BoardPipelineDefinitionDocument, BoardPipelineEntityDocument, BoardSetupRecordDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardForgeRefusalDocument }                                                              from '../../../../@types/board/BoardRelayDocuments.ts';
import { pipelineBoardStateOf }                                                                        from '../../../testing/PipelineFixture.ts';
import { ApplyDialogModel }                                                                            from './ApplyDialogModel.ts';

function record() {
  const { setup } = pipelineBoardStateOf('A4').pipeline;
  if (setup === null) throw new Error('the fixture A4 has no setup');
  return setup.record;
}

describe('Resume the board', () => {
  test('counts the committed tickets and names the limit when the facts carry one', () => {
    expect(ApplyDialogModel.resumeTextOf(3, 2)).toBe('The 3 committed tickets start building, 2 at a time.');
    expect(ApplyDialogModel.resumeTextOf(1, 2)).toBe('The committed ticket starts building, 2 at a time.');
    expect(ApplyDialogModel.resumeTextOf(0, null)).toBe('No ticket is committed yet. New tickets start building.');
  });
});

describe('the constitution note and the command', () => {
  test('the note shows only while the draft holds a constitution', () => {
    expect(ApplyDialogModel.constitutionNoteOf(record())).toBe('Apply commits CONSTITUTION.md to main, then stores the pipeline.');
    expect(ApplyDialogModel.constitutionNoteOf({ ...record(), constitution: null })).toBeNull();
  });

  test('the command carries the record, its draft revision and resumesBoard as given', () => {
    expect(ApplyDialogModel.applyCommandOf(record(), false)).toEqual({
      boardCommandVersion: 1, kind: 'pipeline-apply', setupId: 'S1', draftRevision: 7, resumesBoard: false,
    });
  });
});

function monorepoRecord(): BoardSetupRecordDocument {
  const { setup } = pipelineBoardStateOf('mono-design').pipeline;
  if (setup === null) throw new Error('the fixture mono-design has no setup');
  return setup.record;
}

const STORED_MONOREPO_PIPELINE = pipelineBoardStateOf('mono-live').pipeline.applied;

const ADMIN_ENTITY: BoardPipelineEntityDocument = {
  kind:             'app',
  home:             ['/apps/admin'],
  summary:          null,
  constitutionPath: null,
  prepare:          [],
  gates:            [],
  phases:           { build: [], review: [], merge: [] },
  review:           null,
  agents:           {},
  whitelist:        [],
  reach:            [],
  dependsOn:        [],
  concurrency:      null,
};

const NOTHING_STORED = pipelineBoardStateOf('A0').pipeline.applied;

function withAdmin(record: BoardSetupRecordDocument): BoardSetupRecordDocument {
  const draft: BoardPipelineDefinitionDocument | null = record.draft === null ? null : { ...record.draft, entities: { ...record.draft.entities, admin: ADMIN_ENTITY } };
  return { ...record, draft };
}

describe('over entities', () => {
  test('the description counts the entities and names the version Apply stores', () => {
    expect(ApplyDialogModel.descriptionOf(monorepoRecord(), NOTHING_STORED))
      .toBe('Nothing is stored yet. Apply stores the Forge level and 3 entities as one pipeline, version 1.');
    expect(ApplyDialogModel.descriptionOf(monorepoRecord(), STORED_MONOREPO_PIPELINE))
      .toBe('Apply stores the Forge level and 3 entities as one pipeline, version 2.');
    expect(ApplyDialogModel.descriptionOf(record(), NOTHING_STORED)).toBe('The board starts using it as shown on the flow.');
  });

  test('the pace is worded in jobs, and the single note of CONSTITUTION.md gives way to the list', () => {
    expect(ApplyDialogModel.resumeTextOf(3, 2, ApplyDialogModel.resumePaceOf(monorepoRecord()))).toBe('The 3 committed tickets start building, 2 jobs at once.');
    expect(ApplyDialogModel.resumePaceOf(record())).toBe('at-a-time');
    expect(ApplyDialogModel.constitutionNoteOf(monorepoRecord())).toBeNull();
  });

  test('the committed tickets without an entity are counted only when Apply turns the pipeline into entities', () => {
    const tickets = [{ status: 'committed', entity: null }, { status: 'committed', entity: 'web' }, { status: 'draft', entity: null }];
    expect(ApplyDialogModel.pendingTicketWithoutEntityCountOf(tickets)).toBe(1);
    expect(ApplyDialogModel.pendingWithoutEntityTextOf(monorepoRecord(), NOTHING_STORED, 2))
      .toBe('2 committed tickets name no entity. After Apply the product owner gives each one an entity.');
    expect(ApplyDialogModel.pendingWithoutEntityTextOf(monorepoRecord(), NOTHING_STORED, 1))
      .toBe('1 committed ticket names no entity. After Apply the product owner gives it an entity.');
    expect(ApplyDialogModel.pendingWithoutEntityTextOf(monorepoRecord(), NOTHING_STORED, 0)).toBeNull();
    expect(ApplyDialogModel.pendingWithoutEntityTextOf(monorepoRecord(), STORED_MONOREPO_PIPELINE, 2)).toBeNull();
    expect(ApplyDialogModel.pendingWithoutEntityTextOf(record(), NOTHING_STORED, 2)).toBeNull();
  });
});

/** The refusal the forge serves for turning a pipeline into entities while tickets are in flight, with a sentence as forge words it. */
const SERVED_IN_FLIGHT_REFUSAL: BoardForgeRefusalDocument = {
  refusedBy: 'forge',
  code:      'entities-while-tickets-in-flight',
  fields:    { setupId: 'S2', ticketIds: ['14', '15'] },
  text:      'Example: this pipeline cannot turn into entities yet: tickets #14, #15 are in flight. Apply once they land.',
};

describe('the Apply refusal the forge serves', () => {
  test('shows the served refusal in its sentence unchanged, with a link to each ticket its facts name', () => {
    expect(ApplyDialogModel.applyRefusalOf(SERVED_IN_FLIGHT_REFUSAL)).toEqual({
      title:       'Apply is refused',
      text:        SERVED_IN_FLIGHT_REFUSAL.text,
      ticketLinks: [
        { ticketId: '14', text: 'Open 14', route: { tab: 'kanban', item: 'ticket/14' } },
        { ticketId: '15', text: 'Open 15', route: { tab: 'kanban', item: 'ticket/15' } },
      ],
      disabledReason: SERVED_IN_FLIGHT_REFUSAL.text,
    });
  });

  test('a refusal whose facts name no ticket shows its sentence with no link', () => {
    const standing: BoardForgeRefusalDocument = {
      refusedBy: 'forge', code: 'entity-refusals-stand', fields: { setupId: 'S1' }, text: 'Example: the draft holds a refusal.',
    };
    expect(ApplyDialogModel.applyRefusalOf(standing)?.ticketLinks).toEqual([]);
  });

  test('predicts none on a board whose served facts carry none, whatever the draft and the tickets in flight', () => {
    const board = pipelineBoardStateOf('mono-editing');
    expect(board.pipeline.flow?.ticketIdsInFlight.length).toBeGreaterThan(0);
    expect(ApplyDialogModel.applyRefusalOf(board.pipeline.setup?.applyRefusal ?? null)).toBeNull();
  });
});

describe('worth a look', () => {
  test('an entity without gates and one with the default constitution, never the root kept for a person', () => {
    expect(ApplyDialogModel.worthALookOf(monorepoRecord())).toEqual([]);
    expect(ApplyDialogModel.worthALookOf(withAdmin(monorepoRecord())).map((item) => [item.reason, item.title, item.linkText])).toEqual([
      ['no-gates', 'admin has no gates', 'Open admin'],
      ['default-constitution', 'admin reads the default constitution', 'Open admin'],
    ]);
  });
});
