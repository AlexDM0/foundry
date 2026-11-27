/**
 * The jobs, the job counter and the merge-queue mark in progress.json. What matters: each is written only once set, so a file without them
 * stays byte-identical; a file with them round-trips byte for byte; and a key the tool does not know on a job, its cursor or its slot keeps
 * its place, through a change the Board makes to the job in place. An intake's title is written only once the product owner gave one, and
 * a job's option notes only while some wait. A job's entity and stage are written only once set: a job without them round-trips byte for
 * byte with neither key, one with them reads back, and a malformed one is refused.
 */
import { expect, test } from 'bun:test';

import { Board }                      from '../../../domain/tracker-model/Board.ts';
import { createLogger }               from '../../../domain/tracker-model/Logger.ts';
import { JsonTextUtil }               from '../../../shared/utils/JsonTextUtil.ts';
import { emptyProgress, fileRow }     from '../../../testing/ProgressFixtures.ts';
import type { StoredProgressFile }    from '../@types/StoredProgressFile.ts';
import { ProgressFileProblemWording } from '../ProgressFileProblemWording.ts';
import { ProgressFileMappingUtil }    from './ProgressFileMappingUtil.ts';
import { ProgressFileValidationUtil } from './ProgressFileValidationUtil.ts';

function storedTextWithJobs(): string {
  const progress = emptyProgress();
  fileRow(progress, { name: 'Example build', status: 'in-review', ticket: '001' });
  const [row] = progress.tasks;
  const document = {
    version:    3,
    trackerId:  progress.trackerId,
    project:    progress.project,
    startedAt:  progress.startedAt,
    view:       progress.view,
    nextTaskId: progress.nextTaskId,
    nextJobId:  3,
    jobs:       [{
      unknownLeadingJobKey: 'kept',
      id:                   'J2',
      kind:                 'merge',
      role:                 null,
      ticketIds:            ['001'],
      parentJobId:          null,
      attempt:              1,
      target:               'main',
      state:                'merging',
      childInstance:        1,
      eventCursor:          { instance: 1, unknownCursorKey: 0, sequence: 4 },
      answeredRequestIds:   [],
      crashResumes:         0,
      airlock:              {
        target: 'main', targetTip: 'a1b2c3d', branchTip: 'b2c3d4e', phase: 'merge-in', unknownSlotKey: true,
      },
      unknownTrailingJobKey: { nested: true },
    }],
    tasks: [{ ...row, mergeQueued: true }],
  };
  return JsonTextUtil.storedFileTextOf(document);
}

function storedTextWithIntake(intake: Readonly<Record<string, string>>): string {
  const progress = emptyProgress();
  return JsonTextUtil.storedFileTextOf({
    version:    3,
    trackerId:  progress.trackerId,
    project:    progress.project,
    startedAt:  progress.startedAt,
    view:       progress.view,
    nextTaskId: progress.nextTaskId,
    nextJobId:  2,
    jobs:       [{
      id:                 'J1',
      kind:               'product-owner',
      role:               'product-owner',
      ticketIds:          [],
      parentJobId:        null,
      attempt:            1,
      target:             null,
      state:              'running',
      childInstance:      1,
      eventCursor:        { instance: 1, sequence: 0 },
      answeredRequestIds: [],
      crashResumes:       0,
      intake,
    }],
    tasks: [],
  });
}

function storedDocumentOf(text: string): StoredProgressFile {
  const reading = ProgressFileValidationUtil.readingOf(JSON.parse(text));
  if (reading.verdict === 'unreadable') throw new Error(ProgressFileProblemWording.sentenceOf(reading.problem));
  return reading.document;
}

test('a file with jobs, the job counter and a merge-queue mark is written back byte for byte', () => {
  const text = storedTextWithJobs();
  expect(JsonTextUtil.storedFileTextOf(ProgressFileMappingUtil.storedDocumentOf(ProgressFileMappingUtil.progressOf(storedDocumentOf(text))))).toBe(text);
});

test('a job, its cursor and its Airlock keep a key the tool does not know where the file had it', () => {
  const [job] = ProgressFileMappingUtil.progressOf(storedDocumentOf(storedTextWithJobs())).jobs ?? [];
  expect(Object.keys(job ?? {}).at(0)).toBe('unknownLeadingJobKey');
  expect(Object.keys(job ?? {}).at(-1)).toBe('unknownTrailingJobKey');
  expect(Object.keys(job?.eventCursor ?? {})).toEqual(['instance', 'unknownCursorKey', 'sequence']);
  expect(Object.keys(job?.airlock ?? {}).at(-1)).toBe('unknownSlotKey');
});

test('an unknown key on a job survives a move and a launch the Board makes, and the counter moves on', () => {
  const progress = ProgressFileMappingUtil.progressOf(storedDocumentOf(storedTextWithJobs()));
  const board    = new Board({
    progress, tickets: [], epics: [], logger: createLogger(() => undefined)
  });
  board.moveJob('J2', 'gating', '2026-09-26T10:15:00+02:00');
  board.launchJob({
    kind: 'build', role: 'builder', ticketIds: [], parentJobId: null, attempt: 1, target: 'main'
  }, '2026-09-26T10:15:00+02:00');

  const stored = ProgressFileMappingUtil.storedDocumentOf(progress);
  expect(stored.nextJobId).toBe(4);
  expect(stored.jobs?.map((job) => job.id)).toEqual(['J2', 'J3']);
  expect(Object.keys(stored.jobs?.[0] ?? {}).at(0)).toBe('unknownLeadingJobKey');
  expect(Reflect.get(stored.jobs?.[0] ?? {}, 'unknownTrailingJobKey')).toEqual({ nested: true });
});

test('a file without jobs, a job counter or a merge-queue mark stores none of them', () => {
  const progress = emptyProgress();
  fileRow(progress, { name: 'Example build' });
  const text   = JsonTextUtil.storedFileTextOf(ProgressFileMappingUtil.storedDocumentOf(progress));
  const stored = ProgressFileMappingUtil.storedDocumentOf(ProgressFileMappingUtil.progressOf(storedDocumentOf(text)));
  expect(JsonTextUtil.storedFileTextOf(stored)).toBe(text);
  expect(Object.hasOwn(stored, 'jobs')).toBe(false);
  expect(Object.hasOwn(stored, 'nextJobId')).toBe(false);
  expect(Object.hasOwn(stored.tasks[0] ?? {}, 'mergeQueued')).toBe(false);
});

test('an intake with a title and one without it are each written back byte for byte, the untitled one with no title key', () => {
  for (const intake of [{ text: 'Alex Example asks for a basket.', title: 'Example basket' }, { text: 'Alex Example asks for a basket.' }]) {
    const text   = storedTextWithIntake(intake);
    const stored = ProgressFileMappingUtil.storedDocumentOf(ProgressFileMappingUtil.progressOf(storedDocumentOf(text)));
    expect(JsonTextUtil.storedFileTextOf(stored)).toBe(text);
    expect(Object.keys(stored.jobs?.[0]?.intake ?? {})).toEqual(Object.keys(intake));
  }
});

test('a job with option notes is written back byte for byte, and one whose notes were taken stores no notes key', () => {
  const progress = emptyProgress();
  const text     = JsonTextUtil.storedFileTextOf({
    version:    3,
    trackerId:  progress.trackerId,
    project:    progress.project,
    startedAt:  progress.startedAt,
    view:       progress.view,
    nextTaskId: progress.nextTaskId,
    nextJobId:  2,
    jobs:       [{
      id:                 'J1',
      kind:               'build',
      role:               'builder',
      ticketIds:          ['001'],
      parentJobId:        null,
      attempt:            1,
      target:             'main',
      state:              'running',
      childInstance:      1,
      eventCursor:        { instance: 1, sequence: 0 },
      answeredRequestIds: [],
      crashResumes:       0,
      pendingOptionNotes: [{ question: 'Which basket?', options: [{ label: 'Wicker', touches: ['src/basket/Wicker.ts'], tradeOff: 'Lighter.' }] }],
    }],
    tasks: [],
  });
  const read = ProgressFileMappingUtil.progressOf(storedDocumentOf(text));
  expect(JsonTextUtil.storedFileTextOf(ProgressFileMappingUtil.storedDocumentOf(read))).toBe(text);

  const board = new Board({
    progress: read, tickets: [], epics: [], logger: createLogger(() => undefined)
  });
  board.takeQuestionOptionNotes('J1', ['Which basket?']);
  expect(Object.hasOwn(ProgressFileMappingUtil.storedDocumentOf(read).jobs?.[0] ?? {}, 'pendingOptionNotes')).toBe(false);
});

function storedTextWithBuildJob(entityAndStage: Readonly<Record<string, unknown>>): string {
  const progress = emptyProgress();
  return JsonTextUtil.storedFileTextOf({
    version:    3,
    trackerId:  progress.trackerId,
    project:    progress.project,
    startedAt:  progress.startedAt,
    view:       progress.view,
    nextTaskId: progress.nextTaskId,
    nextJobId:  2,
    jobs:       [{
      id:                 'J1',
      kind:               'build',
      role:               'builder',
      ticketIds:          ['001'],
      parentJobId:        null,
      attempt:            1,
      target:             'main',
      state:              'running',
      childInstance:      1,
      eventCursor:        { instance: 1, sequence: 0 },
      answeredRequestIds: [],
      crashResumes:       0,
      ...entityAndStage,
    }],
    tasks: [],
  });
}

test('a job without an entity or a stage is written back byte for byte with neither key', () => {
  const text   = storedTextWithBuildJob({});
  const stored = ProgressFileMappingUtil.storedDocumentOf(ProgressFileMappingUtil.progressOf(storedDocumentOf(text)));
  expect(JsonTextUtil.storedFileTextOf(stored)).toBe(text);
  expect(Object.hasOwn(stored.jobs?.[0] ?? {}, 'entity')).toBe(false);
  expect(Object.hasOwn(stored.jobs?.[0] ?? {}, 'stage')).toBe(false);
});

test('a job with an entity and a stage reads them back and is written back byte for byte', () => {
  const text       = storedTextWithBuildJob({ entity: 'design-system', stage: 2 });
  const read       = ProgressFileMappingUtil.progressOf(storedDocumentOf(text));
  const [readJob]  = read.jobs ?? [];
  expect(readJob?.entity).toBe('design-system');
  expect(readJob?.stage).toBe(2);
  expect(JsonTextUtil.storedFileTextOf(ProgressFileMappingUtil.storedDocumentOf(read))).toBe(text);
});

test('a job with a blank entity or a stage below one is refused, naming the field', () => {
  for (const [entityAndStage, field] of [[{ entity: ' ' }, 'jobs[0].entity'], [{ stage: 0 }, 'jobs[0].stage'], [{ stage: 1.5 }, 'jobs[0].stage']] as const) {
    const reading = ProgressFileValidationUtil.readingOf(JSON.parse(storedTextWithBuildJob(entityAndStage)));
    expect(reading.verdict).toBe('unreadable');
    expect(reading.verdict === 'unreadable' ? ProgressFileProblemWording.sentenceOf(reading.problem) : '').toContain(field);
  }
});
