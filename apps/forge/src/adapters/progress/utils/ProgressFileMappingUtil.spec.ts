/**
 * The model does not hold the format's `version`, so the mapping strips it and puts `version` 2 back first on the way out. Keys the tool
 * does not know are the owner's, so they survive both ways, at the top level, on rows and on a row's phases, in the file's order. A property
 * the model carries that is neither mapped nor read from the file is what a model field added without a stored form looks like at runtime,
 * and it never reaches the file. An optional row key such as `greenPhase` is written only once set, so a file without it keeps its bytes.
 * An unknown key named by an integer is the one exception to the order: it keeps its value but moves to the front of its object. A row's
 * `pipelineHashes` is a forge with entities' alone: a file without it keeps its bytes, also after a forge without entities gated the row.
 * The same holds for the stage keys of a crossing ticket (`stage`, `seals`, `packageReturns`): a row without them keeps its bytes through a
 * whole build, review and delivery on a forge without entities, a row with them reads them back in place, and a malformed one is refused
 * naming its field. The per-stage counts are read from the log (E74), so a row that still carries the retired `stageCounters` keeps it as an
 * unknown key, byte for byte and whatever it holds.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline }               from '../../../domain/tracker-model/@types/Pipeline.ts';
import { PipelineUtil }                from '../../../domain/tracker-model/utils/PipelineUtil.ts';
import { JsonTextUtil }                from '../../../shared/utils/JsonTextUtil.ts';
import { boardFixture, ticketFixture } from '../../../testing/BoardFixtures.ts';
import { emptyProgress, fileRow }      from '../../../testing/ProgressFixtures.ts';
import type { StoredProgressFile }     from '../@types/StoredProgressFile.ts';
import { ProgressFileMappingUtil }     from './ProgressFileMappingUtil.ts';
import { ProgressFileValidationUtil }  from './ProgressFileValidationUtil.ts';

/** Written as the writer indents it, so a round trip can be compared byte for byte. */
function storedTextWithUnknownKeys(): string {
  const progress = emptyProgress();
  fileRow(progress, { name: 'Example build' });
  const [row] = progress.tasks;
  const document = {
    version:       3,
    trackerId:     progress.trackerId,
    unknownTopKey: 'kept',
    project:       progress.project,
    startedAt:     progress.startedAt,
    view:          progress.view,
    nextTaskId:    progress.nextTaskId,
    tasks:         [{
      unknownLeadingRowKey: 1, ...row, history: [{ status: 'in-progress', unknownPhaseKey: true, at: '2026-09-18T20:05:00+02:00' }], unknownRowKey: 'kept'
    }],
    trailingKey: { nested: true },
  };
  return JsonTextUtil.storedFileTextOf(document);
}

/** Parsed from text and validated, as the ingestion does, since a typed literal cannot hold a key the type does not know. */
function storedDocumentOf(text: string): StoredProgressFile {
  const reading = ProgressFileValidationUtil.readingOf(JSON.parse(text));
  if (reading.verdict === 'unreadable') throw new Error(reading.reason);
  return reading.document;
}

function writtenTextOf(document: StoredProgressFile): string {
  return JsonTextUtil.storedFileTextOf(document);
}

test('every top-level key but version, unknown ones included, comes through in the file\'s order', () => {
  const progress = ProgressFileMappingUtil.progressOf(storedDocumentOf(storedTextWithUnknownKeys()));
  expect(Object.keys(progress), 'version 3').toEqual(['trackerId', 'unknownTopKey', 'project', 'startedAt', 'view', 'nextTaskId', 'tasks', 'trailingKey']);
});

test('a row and a phase keep a key the tool does not know, where the file had it', () => {
  const progress = ProgressFileMappingUtil.progressOf(storedDocumentOf(storedTextWithUnknownKeys()));
  const [row]    = progress.tasks;
  expect(Object.keys(row ?? {}).at(0)).toBe('unknownLeadingRowKey');
  expect(Object.keys(row ?? {}).at(-1)).toBe('unknownRowKey');
  expect(Object.keys(row?.history?.[0] ?? {})).toEqual(['status', 'unknownPhaseKey', 'at']);
});

test('the mapped progress is a new object, so the document handed in is not the one a command changes', () => {
  const document = storedDocumentOf(storedTextWithUnknownKeys());
  expect(ProgressFileMappingUtil.progressOf(document)).not.toBe(document);
});

test('a file with unknown keys at the top level, on rows and on phases is written back byte for byte', () => {
  const text   = storedTextWithUnknownKeys();
  const stored = ProgressFileMappingUtil.storedDocumentOf(ProgressFileMappingUtil.progressOf(storedDocumentOf(text)));
  expect(Object.keys(stored)).toEqual(['version', 'trackerId', 'unknownTopKey', 'project', 'startedAt', 'view', 'nextTaskId', 'tasks', 'trailingKey']);
  expect(writtenTextOf(stored)).toBe(text);
});

// The documented exception in `docs/cli.md`: JavaScript lists an integer-like key before every other key, so it moves to the front.
test('an unknown key whose name is an integer keeps its value but moves to the front of its object on a write', () => {
  const text = storedTextWithUnknownKeys()
    .replace('"unknownTopKey": "kept",', '"unknownTopKey": "kept",\n  "2024": "top note",')
    .replace('"unknownRowKey": "kept"', '"unknownRowKey": "kept",\n      "2024": "row note"');
  const stored = ProgressFileMappingUtil.storedDocumentOf(ProgressFileMappingUtil.progressOf(storedDocumentOf(text)));
  expect(Object.keys(stored).slice(0, 2)).toEqual(['2024', 'version']);
  expect(Object.keys(stored.tasks[0] ?? {}).at(0)).toBe('2024');
  expect(stored).toMatchObject({ '2024': 'top note', tasks: [{ '2024': 'row note', unknownRowKey: 'kept' }] });
  expect(writtenTextOf(stored)).not.toBe(text);
});

// The retired Workflow dispatcher stored its state and run id here; a board it ran on keeps both keys as the owner's, unread and never rewritten.
test('a stored dispatcherState and dispatcherRunId are unknown keys: kept in place byte for byte, also across a Hephaestus state change', () => {
  const progress = emptyProgress();
  const text     = JsonTextUtil.storedFileTextOf({
    version:         3,
    trackerId:       progress.trackerId,
    project:         progress.project,
    startedAt:       progress.startedAt,
    view:            progress.view,
    nextTaskId:      progress.nextTaskId,
    hephaestusState: 'running',
    dispatcherState: 'finished',
    dispatcherRunId: 'wf_example-run',
    tasks:           [],
  });
  const mapped = ProgressFileMappingUtil.progressOf(storedDocumentOf(text));
  expect(writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(mapped))).toBe(text);

  mapped.hephaestusState = 'paused';
  expect(writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(mapped))).toBe(text.replace('"running"', '"paused"'));
});

test('an unknown key survives a change the Board makes to its row in place', () => {
  const progress = ProgressFileMappingUtil.progressOf(storedDocumentOf(storedTextWithUnknownKeys()));
  const [row]    = progress.tasks;
  if (row === undefined) throw new Error('the fixture files one row');
  Object.assign(row, { ...row, status: 'reviewed', reviewed: '2026-09-18T21:00:00+02:00' });
  const storedRow = ProgressFileMappingUtil.storedDocumentOf(progress).tasks[0];
  expect(Object.keys(storedRow ?? {})).toEqual([...Object.keys(row)]);
  expect(storedRow).toMatchObject({ unknownRowKey: 'kept', status: 'reviewed', reviewed: '2026-09-18T21:00:00+02:00' });
});

test('a property the model carries that is neither mapped nor read from the file never reaches the stored document', () => {
  const progress = ProgressFileMappingUtil.progressOf(storedDocumentOf(storedTextWithUnknownKeys()));
  const [row]    = progress.tasks;
  if (row === undefined) throw new Error('the fixture files one row');
  Object.assign(progress, { addedModelField: 'unmapped' });
  Object.assign(row, { addedModelField: 'unmapped' });
  Object.assign(row.history?.[0] ?? {}, { addedModelField: 'unmapped' });
  expect(writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(progress))).toBe(storedTextWithUnknownKeys());
});

test('a progress built in memory, with no file behind it, is written with only the keys the mapper names', () => {
  const progress = emptyProgress();
  fileRow(progress, { name: 'Example build' });
  Object.assign(progress.tasks[0] ?? {}, { addedModelField: 'unmapped' });
  expect(JSON.stringify(ProgressFileMappingUtil.storedDocumentOf(progress))).not.toContain('addedModelField');
});

test('a row\'s greenPhase is written only once set: a row stored without it is written back byte for byte, and one with it keeps it', () => {
  const progress = emptyProgress();
  fileRow(progress, { name: 'Example build' });
  const [row]       = progress.tasks;
  const gatedRow    = { ...row, pipelineHash: '0f871814e52ef878', greenTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904' };
  const textOf      = (tasks: object[]): string => JsonTextUtil.storedFileTextOf({
    version: 3, trackerId: progress.trackerId, project: progress.project, startedAt: progress.startedAt, view: progress.view, nextTaskId: progress.nextTaskId, tasks,
  });
  const withoutPhase = textOf([gatedRow]);
  const withPhase    = textOf([{ ...gatedRow, greenPhase: 'review' }]);

  const mappedWithout = ProgressFileMappingUtil.progressOf(storedDocumentOf(withoutPhase));
  expect(Object.keys(mappedWithout.tasks[0] ?? {})).not.toContain('greenPhase');
  expect(writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(mappedWithout))).toBe(withoutPhase);

  const mappedWith = ProgressFileMappingUtil.progressOf(storedDocumentOf(withPhase));
  expect(mappedWith.tasks[0]?.greenPhase).toBe('review');
  expect(writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(mappedWith))).toBe(withPhase);
});

describe('a row\'s pipelineHashes', () => {
  const AT = '2026-11-17T10:00:00+01:00';
  const GREEN_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const SINGLE_PIPELINE: Pipeline = {
    version: 5, prepare: [], gates: [{ name: 'verify', run: 'bun run verify' }], phases: { build: ['verify'], review: ['verify'], merge: ['verify'] }
  };

  function textOfRows(rows: object[]): string {
    const progress = emptyProgress();
    return JsonTextUtil.storedFileTextOf({
      version: 3, trackerId: progress.trackerId, project: progress.project, startedAt: progress.startedAt, view: progress.view, nextTaskId: 2, tasks: rows,
    });
  }

  function greenRowOf(extraKeys: object = {}): object {
    const progress = emptyProgress();
    const row      = fileRow(progress, { name: 'Example build', ticket: '001' });
    return {
      ...row, pipelineHash: PipelineUtil.phaseHashOf(SINGLE_PIPELINE, 'review'), ...extraKeys, greenPhase: 'review', greenTree: GREEN_TREE
    };
  }

  test('a row stored without it is read without it and written back byte for byte', () => {
    const stored = textOfRows([greenRowOf()]);
    const mapped = ProgressFileMappingUtil.progressOf(storedDocumentOf(stored));

    expect(Object.keys(mapped.tasks[0] ?? {})).not.toContain('pipelineHashes');
    expect(writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(mapped))).toBe(stored);
  });

  test('a row stored with it reads each entity\'s hash back and is written back byte for byte, in the file\'s place', () => {
    const stored = textOfRows([greenRowOf({ pipelineHashes: { 'shop': '0f871814e52ef878', 'design-system': '9a1c2e7d3b4f5a60' } })]);
    const mapped = ProgressFileMappingUtil.progressOf(storedDocumentOf(stored));

    expect(mapped.tasks[0]?.pipelineHashes).toEqual({ 'shop': '0f871814e52ef878', 'design-system': '9a1c2e7d3b4f5a60' });
    expect(writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(mapped))).toBe(stored);
  });

  test('a forge without entities never writes it: its gate run settles on the row and the file is written back byte for byte', () => {
    const stored   = textOfRows([greenRowOf()]);
    const progress = ProgressFileMappingUtil.progressOf(storedDocumentOf(stored));
    const [row]    = progress.tasks;
    if (row === undefined) throw new Error('the file holds one row');
    const { board } = boardFixture({ tasks: progress.tasks, tickets: [ticketFixture({ id: '001', status: 'in-review', task: row.id })], pipeline: SINGLE_PIPELINE });

    board.recordPipelineJudgedBy('001', GREEN_TREE, board.gateRunStampOf('review'), AT);
    board.recordPipelineJudgedBy('001', GREEN_TREE, board.gateRunStampOf('review'), AT);

    expect(writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(progress))).toBe(stored);
  });

  test('a row whose pipelineHashes is not a record of hashes is refused, naming the field', () => {
    for (const pipelineHashes of [['0f871814e52ef878'], { shop: 7 }, 'shop']) {
      const reading = ProgressFileValidationUtil.readingOf(JSON.parse(textOfRows([greenRowOf({ pipelineHashes })])));
      expect(reading.verdict === 'unreadable' ? reading.reason : null).toBe('tasks[0].pipelineHashes is present and is not a record of a hash for each entity key');
    }
  });
});

describe('a row\'s stage keys', () => {
  const AT = '2026-11-17T10:00:00+01:00';
  const STAGE_KEYS = ['stage', 'seals', 'packageReturns'];
  const CROSSING_KEYS = {
    stage:          { name: 'package-review', entity: 'design-system', unknownStageKey: 'kept' },
    seals:          { 'design-system': '5d41402abc4b2a76' },
    packageReturns: 1,
  };

  function textOfRows(rows: object[]): string {
    const progress = emptyProgress();
    return JsonTextUtil.storedFileTextOf({
      version: 3, trackerId: progress.trackerId, project: progress.project, startedAt: progress.startedAt, view: progress.view, nextTaskId: 2, tasks: rows,
    });
  }

  function ticketRowOf(extraKeys: object = {}): object {
    const progress = emptyProgress();
    return { ...fileRow(progress, { name: 'Example build', ticket: '001' }), ...extraKeys };
  }

  test('a row stored without them is read without them and written back byte for byte', () => {
    const stored = textOfRows([ticketRowOf()]);
    const mapped = ProgressFileMappingUtil.progressOf(storedDocumentOf(stored));

    for (const key of STAGE_KEYS) expect(Object.keys(mapped.tasks[0] ?? {}), key).not.toContain(key);
    expect(writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(mapped))).toBe(stored);
  });

  test('a row stored with them reads each back and is written back byte for byte, unknown keys kept in place', () => {
    const stored = textOfRows([ticketRowOf(CROSSING_KEYS)]);
    const mapped = ProgressFileMappingUtil.progressOf(storedDocumentOf(stored));

    expect(mapped.tasks[0]).toMatchObject({
      stage:          { name: 'package-review', entity: 'design-system' },
      seals:          { 'design-system': '5d41402abc4b2a76' },
      packageReturns: 1,
    });
    expect(Object.keys(mapped.tasks[0]?.stage ?? {})).toEqual(['name', 'entity', 'unknownStageKey']);
    expect(writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(mapped))).toBe(stored);
  });

  test('a row that still carries the retired stageCounters keeps it as an unknown key, byte for byte, whatever it holds (E74)', () => {
    const retiredCounters = [
      {
        'design-system/2': {
          redHandoffs: 1, failedPasses: 0, reviewRounds: 0, unknownCounterKey: 'kept'
        }
      },
      { 'shop/1': { redHandoffs: 0, failedPasses: -1 } },
      'not counts at all',
    ];
    for (const stageCounters of retiredCounters) {
      const stored  = textOfRows([ticketRowOf({ ...CROSSING_KEYS, stageCounters, trailingRowKey: 'kept' })]);
      const reading = ProgressFileValidationUtil.readingOf(JSON.parse(stored));
      const mapped  = ProgressFileMappingUtil.progressOf(storedDocumentOf(stored));

      expect(reading.verdict, JSON.stringify(stageCounters)).not.toBe('unreadable');
      expect(Reflect.get(mapped.tasks[0] ?? {}, 'stageCounters')).toEqual(stageCounters);
      expect(writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(mapped))).toBe(stored);
    }
  });

  test('a stage the Board moves in place is written with the new values in the file\'s order', () => {
    const stored = textOfRows([ticketRowOf(CROSSING_KEYS)]);
    const mapped = ProgressFileMappingUtil.progressOf(storedDocumentOf(stored));
    const stage  = mapped.tasks[0]?.stage;
    if (stage === undefined) throw new Error('the row holds a stage');
    stage.name   = 'adapt';
    stage.entity = 'shop';

    const written = writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(mapped));
    expect(written).toBe(stored.replace('"package-review"', '"adapt"').replace('"entity": "design-system"', '"entity": "shop"'));
  });

  test('a forge without entities never writes them: a ticket built, reviewed and delivered keeps its row free of them', () => {
    const stored   = textOfRows([ticketRowOf()]);
    const progress = ProgressFileMappingUtil.progressOf(storedDocumentOf(stored));
    const [row]    = progress.tasks;
    if (row === undefined) throw new Error('the file holds one row');
    const { board } = boardFixture({ tasks: progress.tasks, tickets: [ticketFixture({ id: '001', status: 'committed', task: row.id })] });

    for (const status of ['in-progress', 'in-review', 'reviewed', 'delivered'] as const) board.moveTicket('001', status, { checksLegality: true }, AT);

    const writtenRow = JSON.parse(writtenTextOf(ProgressFileMappingUtil.storedDocumentOf(progress))).tasks[0];
    expect(writtenRow.status).toBe('delivered');
    for (const key of STAGE_KEYS) expect(Object.keys(writtenRow), key).not.toContain(key);
  });

  test('a row whose stage keys are malformed is refused, naming the field', () => {
    const stageReason = 'tasks[0].stage is present and is not a stage name, one of build, package-build, package-review, adapt, review, with the key of the entity that runs it';
    const refusals: [object, string][] = [
      [{ stage: { name: 'landing', entity: 'shop' } }, stageReason],
      [{ stage: { name: 'build', entity: '' } }, stageReason],
      [{ stage: 'build' }, stageReason],
      [{ seals: { 'design-system': 7 } }, 'tasks[0].seals is present and is not a record of a seal for each package entity key'],
      [{ packageReturns: 0 }, 'tasks[0].packageReturns is present and is not a whole number of at least 1'],
    ];
    for (const [extraKeys, reason] of refusals) {
      const reading = ProgressFileValidationUtil.readingOf(JSON.parse(textOfRows([ticketRowOf(extraKeys)])));
      expect(reading.verdict === 'unreadable' ? reading.reason : null, JSON.stringify(extraKeys)).toBe(reason);
    }
  });
});
