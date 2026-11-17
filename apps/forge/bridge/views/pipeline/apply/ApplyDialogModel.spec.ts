/**
 * The first Apply's model. What matters: the "Resume the board" line counts the pending tickets and names the concurrency limit only when
 * the facts carry one; the constitution note shows only while the draft holds a constitution; the command carries the record, its draft
 * revision and the checkbox's value as given. Over entities: the description counts the entities and the version; the pace is worded in
 * jobs; the line about pending tickets without an entity shows only when Apply turns the pipeline into entities; E94 shows only in update
 * mode over a stored pipeline without entities while tickets are in flight, never on a first Apply, each ticket a link to its detail; an
 * entity without gates or with the default constitution is worth a look, and the root kept for a person is not.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline, PipelineEntity } from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup }            from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { pipelineBoardStateOf }          from '../../../testing/PipelineFixture.ts';
import { ApplyDialogModel }              from './ApplyDialogModel.ts';

function record() {
  const setup = pipelineBoardStateOf('A4').pipelineSetup ?? null;
  if (setup === null) throw new Error('the fixture A4 has no setup');
  return setup.record;
}

describe('Resume the board', () => {
  test('counts the pending tickets and names the limit when the facts carry one', () => {
    expect(ApplyDialogModel.resumeTextOf(3, 2)).toBe('The 3 pending tickets start building, 2 at a time.');
    expect(ApplyDialogModel.resumeTextOf(1, 2)).toBe('The pending ticket starts building, 2 at a time.');
    expect(ApplyDialogModel.resumeTextOf(0, null)).toBe('No ticket is pending yet. New tickets start building.');
  });
});

describe('the constitution note and the command', () => {
  test('the note shows only while the draft holds a constitution', () => {
    expect(ApplyDialogModel.constitutionNoteOf(record())).toBe('Apply commits CONSTITUTION.md to main, then stores the pipeline.');
    expect(ApplyDialogModel.constitutionNoteOf({ ...record(), constitution: null })).toBeNull();
  });

  test('the command carries the record, its draft revision and resumesBoard as given', () => {
    expect(ApplyDialogModel.applyCommandOf(record(), false)).toEqual({
      kind: 'pipeline-apply', setupId: 'S1', draftRevision: 7, resumesBoard: false,
    });
  });
});

function monorepoRecord(): PipelineSetup {
  const setup = pipelineBoardStateOf('mono-design').pipelineSetup ?? null;
  if (setup === null) throw new Error('the fixture mono-design has no setup');
  return setup.record;
}

const STORED_SINGLE_PIPELINE = pipelineBoardStateOf('A5').pipeline;

const STORED_MONOREPO_PIPELINE = pipelineBoardStateOf('mono-live').pipeline;

const ADMIN_ENTITY: PipelineEntity = {
  kind: 'app', home: ['/apps/admin'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] },
};

function withAdmin(record: PipelineSetup): PipelineSetup {
  const draft: Pipeline | null = record.draft === null ? null : { ...record.draft, entities: { ...record.draft.entities, admin: ADMIN_ENTITY } };
  return { ...record, draft };
}

describe('over entities', () => {
  test('the description counts the entities and names the version Apply stores', () => {
    expect(ApplyDialogModel.descriptionOf(monorepoRecord(), undefined))
      .toBe('Nothing is stored yet. Apply stores the Forge level and 3 entities as one pipeline, version 1.');
    expect(ApplyDialogModel.descriptionOf(monorepoRecord(), STORED_MONOREPO_PIPELINE))
      .toBe('Apply stores the Forge level and 3 entities as one pipeline, version 2.');
    expect(ApplyDialogModel.descriptionOf(record(), undefined)).toBe('The board starts using it as shown on the flow.');
  });

  test('the pace is worded in jobs, and the single note of CONSTITUTION.md gives way to the list', () => {
    expect(ApplyDialogModel.resumeTextOf(3, 2, ApplyDialogModel.resumePaceOf(monorepoRecord()))).toBe('The 3 pending tickets start building, 2 jobs at once.');
    expect(ApplyDialogModel.resumePaceOf(record())).toBe('at-a-time');
    expect(ApplyDialogModel.constitutionNoteOf(monorepoRecord())).toBeNull();
  });

  test('the pending tickets without an entity are counted only when Apply turns the pipeline into entities', () => {
    expect(ApplyDialogModel.pendingTicketWithoutEntityCountOf([{ status: 'pending' }, { status: 'pending', entity: 'web' }, { status: 'draft' }])).toBe(1);
    expect(ApplyDialogModel.pendingWithoutEntityTextOf(monorepoRecord(), undefined, 2))
      .toBe('2 pending tickets name no entity. After Apply the product owner gives each one an entity.');
    expect(ApplyDialogModel.pendingWithoutEntityTextOf(monorepoRecord(), undefined, 1))
      .toBe('1 pending ticket names no entity. After Apply the product owner gives it an entity.');
    expect(ApplyDialogModel.pendingWithoutEntityTextOf(monorepoRecord(), undefined, 0)).toBeNull();
    expect(ApplyDialogModel.pendingWithoutEntityTextOf(monorepoRecord(), STORED_MONOREPO_PIPELINE, 2)).toBeNull();
    expect(ApplyDialogModel.pendingWithoutEntityTextOf(record(), undefined, 2)).toBeNull();
  });
});

describe('E94 before Apply', () => {
  const board = { storedPipeline: STORED_SINGLE_PIPELINE, ticketIdsInFlight: ['14'] };

  test('shows in update mode over a stored pipeline without entities while a ticket is in flight, with a link to its detail', () => {
    expect(ApplyDialogModel.entitiesRefusalOf({ ...monorepoRecord(), mode: 'update' }, board)).toEqual({
      title:          'Apply is refused',
      text:           'Ticket 14 is in progress, in review or reviewed, so this pipeline cannot turn into entities yet. Apply once it lands.',
      ticketLinks:    [{ ticketId: '14', text: 'Open 14', href: '#kanban/ticket/14' }],
      disabledReason: 'Ticket 14 is in flight',
    });
    expect(ApplyDialogModel.entitiesRefusalOf({ ...monorepoRecord(), mode: 'update' }, { ...board, ticketIdsInFlight: ['14', '15', '16'] })?.text)
      .toBe('Tickets 14, 15 and 16 are in progress, in review or reviewed, so this pipeline cannot turn into entities yet. Apply once they land.');
  });

  test('never shows on a first Apply, over a stored pipeline with entities, without a pipeline, with no ticket in flight, or in single mode', () => {
    expect(ApplyDialogModel.entitiesRefusalOf(monorepoRecord(), board)).toBeNull();
    expect(ApplyDialogModel.entitiesRefusalOf({ ...monorepoRecord(), mode: 'update' }, { ...board, storedPipeline: STORED_MONOREPO_PIPELINE })).toBeNull();
    expect(ApplyDialogModel.entitiesRefusalOf({ ...monorepoRecord(), mode: 'update' }, { ...board, storedPipeline: undefined })).toBeNull();
    expect(ApplyDialogModel.entitiesRefusalOf({ ...monorepoRecord(), mode: 'update' }, { ...board, ticketIdsInFlight: [] })).toBeNull();
    expect(ApplyDialogModel.entitiesRefusalOf({ ...record(), mode: 'update' }, board)).toBeNull();
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
