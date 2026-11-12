/**
 * The write pipeline on real tracker files: the mutation runs with the lock held, a Board refusal and any other throw leave every stored
 * file as it was, an unreadable tracker is refused before the mutation runs, and the write order holds (progress.json, the pipeline and the
 * constitution's sources, the tickets, the deletions, log.jsonl, and the setup record last, so an Apply closes its record after everything
 * it stored), observed by breaking one write from inside the mutation, with no clock. A file whose bytes would not change
 * is left in place, observed by its inode, so a hold that changes nothing writes no file.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import { OperationRefusal, refusalIsOperationRefusal }    from '../../shared/OperationRefusal.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import {
  BROKEN_LOG_TEXT,
  EXAMPLE_TICKET_FILE_NAME,
  storedFileContentsOf,
  writeReadableTracker
} from '../../testing/TrackerFileFixtures.ts';
import { LockGenerationSteps }               from './TrackerLock.ts';
import { writeTracker, type TrackerChange }  from './TrackerPipeline.ts';
import { workspacePathsFor, type Workspace } from './Workspace.ts';
import { thrownFailureOf }                   from './testing/ThrownFailure.ts';

const CHANGED_AT = '2026-09-18T20:05:00+02:00';

const now = (): Date => new Date('2026-09-18T18:05:00Z');


let workspace: Workspace;

function ticketFilePath(): string {
  return join(workspace.ticketsDirectory, EXAMPLE_TICKET_FILE_NAME);
}

function newestLockRecord(): unknown {
  const newestGeneration = (LockGenerationSteps.generationsIn(workspace.lockDirectoryPath) ?? []).at(-1);
  if (newestGeneration === undefined) return null;
  return JSON.parse(readFileSync(LockGenerationSteps.generationPathFor(workspace.lockDirectoryPath, newestGeneration), 'utf8'));
}

/** An atomic replace lands a new inode, so a file keeping its inode was never written. */
function inodesOf(filePaths: readonly string[]): number[] {
  return filePaths.map((filePath) => statSync(filePath).ino);
}

function addExampleRow(change: TrackerChange, name = 'Example rendered row'): void {
  change.board.addTask({ name, startsNow: false, movesTheLink: false }, change.at);
}

beforeEach(() => {
  workspace = workspacePathsFor(createScratchDirectory('tracker-pipeline'));
  mkdirSync(workspace.ticketsDirectory, { recursive: true });
});

afterEach(() => {
  removeScratchDirectory(workspace.rootDirectory);
});

describe('writeTracker', () => {
  test('the mutation runs with the lock held', async () => {
    writeReadableTracker(workspace);

    const written = await writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: () => newestLockRecord(),
    });

    expect(written.result).toMatchObject({ processId: process.pid, state: 'held' });
  });

  test('the returned Board carries the mutation, and nothing is rendered: no progress.html is written', async () => {
    writeReadableTracker(workspace);

    const written = await writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: (change) => addExampleRow(change),
    });

    expect(written.board.tasks().map((task) => task.name)).toEqual(['Example rendered row']);
    expect(written.malformedTickets).toEqual([]);
    expect(written.malformedEpics).toEqual([]);
    expect(existsSync(workspace.htmlFilePath)).toBe(false);
  });

  test('a Board refusal arrives as a refused OperationRefusal carrying its detail, and every file stays byte for byte', async () => {
    writeReadableTracker(workspace);
    const filesBefore = storedFileContentsOf(workspace);

    const failure = await thrownFailureOf(() => writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: (change) => {
        addExampleRow(change);
        change.board.holdTicket('001', 'Waiting on Alex Example', change.at);
        change.board.holdTicket('001', 'Waiting on Alex Example', change.at);
      },
    }));

    expect(refusalIsOperationRefusal(failure) ? failure.status : null).toBe('refused');
    expect(refusalIsOperationRefusal(failure) ? failure.detail : null).toEqual({
      kind:         'board-refusal',
      boardRefusal: { reason: 'ticket-already-held', ticketId: '001' },
    });
    expect(storedFileContentsOf(workspace)).toEqual(filesBefore);
  });

  test('any other throw arrives as it was thrown, and nothing is written', async () => {
    writeReadableTracker(workspace);
    const filesBefore   = storedFileContentsOf(workspace);
    const thrownFailure = new Error('the mutation failed');

    const failure = await thrownFailureOf(() => writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: (change) => {
        addExampleRow(change);
        throw thrownFailure;
      },
    }));

    expect(failure).toBe(thrownFailure);
    expect(storedFileContentsOf(workspace)).toEqual(filesBefore);
    expect(existsSync(workspace.htmlFilePath)).toBe(false);
  });

  test('an OperationRefusal thrown by the mutation arrives as it was thrown, with its own status', async () => {
    writeReadableTracker(workspace);
    const thrownRefusal = new OperationRefusal('refused', 'Example refusal from the mutation.');

    const failure = await thrownFailureOf(() => writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: () => { throw thrownRefusal; },
    }));

    expect(failure).toBe(thrownRefusal);
  });

  test('an unreadable tracker is refused as unrepaired, and the mutation is never called', async () => {
    writeReadableTracker(workspace);
    writeFileSync(workspace.logFilePath, BROKEN_LOG_TEXT);
    let mutationWasCalled = false;

    const failure = await thrownFailureOf(() => writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: () => { mutationWasCalled = true; },
    }));

    expect(refusalIsOperationRefusal(failure) ? failure.status : null).toBe('unrepaired');
    expect(refusalIsOperationRefusal(failure) ? failure.detail?.kind : null).toBe('unreadable-tracker');
    expect(mutationWasCalled).toBe(false);
  });

  test('a ticket write that fails does so after progress.json is written and before log.jsonl', async () => {
    writeReadableTracker(workspace);
    const logBefore = readFileSync(workspace.logFilePath, 'utf8');

    const failure = await thrownFailureOf(() => writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: (change) => {
        addExampleRow(change);
        change.board.holdTicket('001', 'Waiting on Alex Example', change.at);
        rmSync(ticketFilePath());
        mkdirSync(ticketFilePath());
      },
    }));

    expect(String(failure), 'the ticket write is what failed').toContain(`/${EXAMPLE_TICKET_FILE_NAME}'`);
    expect(readFileSync(workspace.progressFilePath, 'utf8')).toContain('Example rendered row');
    expect(readFileSync(workspace.logFilePath, 'utf8')).toBe(logBefore);
  });

  test('the ticket files are deleted after progress.json is written, and the callback is handed their count', async () => {
    writeReadableTracker(workspace);
    writeFileSync(join(workspace.ticketsDirectory, '002-broken-by-hand.md'), 'no frontmatter here\n');
    const observedDeletions: { deletedTicketCount: number; progressAtDeletion: string }[] = [];

    await writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: (change) => {
        addExampleRow(change);
        change.deleteAllTicketFilesAfterwards((deletedTicketCount) => {
          observedDeletions.push({ deletedTicketCount, progressAtDeletion: readFileSync(workspace.progressFilePath, 'utf8') });
        });
      },
    });

    expect(observedDeletions.map((deletion) => deletion.deletedTicketCount)).toEqual([2]);
    expect(observedDeletions[0]?.progressAtDeletion ?? '').toContain('Example rendered row');
    expect(readdirSync(workspace.ticketsDirectory)).toEqual([]);
  });

  test('the stored log entry count is the count read before the mutation logged anything', async () => {
    writeReadableTracker(workspace);

    const written = await writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: (change) => {
        change.board.recordNote('Example note', change.at);
        return change.storedLogEntryCount;
      },
    });

    expect(written.result).toBe(1);
    expect(readFileSync(workspace.logFilePath, 'utf8').trimEnd().split('\n')).toHaveLength(2);
  });

  test('a hold that changes nothing writes no file: every stored file keeps its inode and its bytes', async () => {
    writeReadableTracker(workspace);
    const storedFilePaths = [workspace.progressFilePath, workspace.logFilePath, ticketFilePath()];
    const inodesBefore = inodesOf(storedFilePaths);
    const contentsBefore = storedFileContentsOf(workspace);
    const filesWritten: string[] = [];

    await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: () => {}, afterFileWritten: (filePath) => filesWritten.push(filePath),
    });

    expect(filesWritten).toEqual([]);
    expect(inodesOf(storedFilePaths)).toEqual(inodesBefore);
    expect(storedFileContentsOf(workspace)).toEqual(contentsBefore);
  });

  test('a hold writes only the files whose bytes change: a held ticket rewrites its ticket and the log, and progress.json stays in place', async () => {
    writeReadableTracker(workspace);
    const progressInodeBefore = inodesOf([workspace.progressFilePath]);
    const filesWritten: string[] = [];

    await writeTracker({
      workspace,
      at:               CHANGED_AT,
      now,
      mutate:           (change) => { change.board.holdTicket('001', 'Waiting on Alex Example', change.at); },
      afterFileWritten: (filePath) => filesWritten.push(filePath),
    });

    expect(filesWritten).toEqual([ticketFilePath(), workspace.logFilePath]);
    expect(inodesOf([workspace.progressFilePath])).toEqual(progressInodeBefore);
    expect(readFileSync(ticketFilePath(), 'utf8')).toContain('Waiting on Alex Example');
  });
});

// The Board's `pipelineIsSet` is "a pipeline was handed in", so the hold of resumes and new work rests on this mapping of the reading.
describe('the pipeline a hold hands the Board', () => {
  test.each<[string, string | null, 'older' | 'malformed' | null]>([
    ['no file', null, null],
    ['an older file', '{ "prepare": [], "gates": [] }\n', 'older'],
    ['a malformed file', '{ "version": 2, "prepare": [], "gates": [] }\n', 'malformed'],
  ])('%s gives the Board no pipeline, as unset, and names the unreadable verdict to the change', async (_case, pipelineText, verdict) => {
    writeReadableTracker(workspace);
    if (pipelineText !== null) writeFileSync(workspace.pipelineFilePath, pipelineText);

    const written = await writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: (change) => ({ pipeline: change.board.pipeline(), unreadableVerdict: change.unreadablePipeline?.verdict ?? null }),
    });

    expect(written.result).toEqual({ pipeline: null, unreadableVerdict: verdict });
  });

  test('a readable minimal file gives the Board that pipeline, which counts as set', async () => {
    writeReadableTracker(workspace);
    writeFileSync(workspace.pipelineFilePath, '{ "version": 2, "prepare": [], "gates": [], "phases": { "build": [], "review": [], "merge": [] } }\n');

    const written = await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: (change) => change.board.pipeline()
    });

    expect(written.result).toEqual({
      version: 2, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
    });
  });
});

describe('the setup record a hold reads and writes', () => {
  const FIRST_SETUP = {
    mode: 'setup', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
  } as const;

  test('a setup move writes pipeline-setup.json after log.jsonl, and a start over removes it', async () => {
    writeReadableTracker(workspace);
    const writtenPaths: string[] = [];

    await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: (change) => change.board.openSetup(FIRST_SETUP, change.at), afterFileWritten: (filePath) => writtenPaths.push(filePath)
    });

    expect(writtenPaths).toEqual([workspace.progressFilePath, workspace.logFilePath, workspace.pipelineSetupFilePath]);
    expect(JSON.parse(readFileSync(workspace.progressFilePath, 'utf8'))).toMatchObject({ nextSetupId: 2 });
    expect(JSON.parse(readFileSync(workspace.pipelineSetupFilePath, 'utf8'))).toMatchObject({ formatVersion: 1, setupId: 'S1', currentStep: 'billing' });
    const written = await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: (change) => change.board.pipelineSetup()?.setupId
    });
    expect(written.result).toBe('S1');

    await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: (change) => change.board.startOverSetup('S1', change.at)
    });
    expect(existsSync(workspace.pipelineSetupFilePath)).toBe(false);
  });

  test('an Apply writes the pipeline and the constitution\'s sources after progress.json, then log.jsonl, and removes the record last', async () => {
    writeReadableTracker(workspace);
    const constitution = { path: 'CONSTITUTION.md', markdown: '# Example Agency\n\n- Keep the basket page fast.\n', blob: 'b'.repeat(40) };
    await writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: (change) => {
        const { setup } = change.board.openSetup(FIRST_SETUP, change.at);
        change.board.setConstitution(setup.setupId, {
          markdown:    constitution.markdown,
          annotations: [{
            lineText: '- Keep the basket page fast.', occurrence: 1, kind: 'research', path: null
          }]
        }, change.at);
      },
    });
    const writtenPaths: string[] = [];

    await writeTracker({
      workspace,
      at:               CHANGED_AT,
      now,
      mutate:           (change) => change.board.requestApply('S1', { draftRevision: 0, resumesBoard: true, mainConstitution: constitution }, change.at),
      afterFileWritten: (filePath) => writtenPaths.push(filePath),
    });

    expect(writtenPaths).toEqual([
      workspace.progressFilePath, workspace.pipelineFilePath, workspace.constitutionSourcesFilePath, workspace.logFilePath, workspace.pipelineSetupFilePath
    ]);
    expect(existsSync(workspace.pipelineSetupFilePath)).toBe(false);
    expect(JSON.parse(readFileSync(workspace.pipelineFilePath, 'utf8'))).toMatchObject({ version: 2, constitution: { path: 'CONSTITUTION.md' } });
    expect(JSON.parse(readFileSync(workspace.constitutionSourcesFilePath, 'utf8'))).toMatchObject({ formatVersion: 1, blob: constitution.blob });
    expect(JSON.parse(readFileSync(workspace.progressFilePath, 'utf8'))).toMatchObject({ overseerState: 'running' });
  });

  test('a malformed record is a verdict: other writes go on, a setup move is refused, and the file stays byte for byte', async () => {
    writeReadableTracker(workspace);
    writeFileSync(workspace.pipelineSetupFilePath, '{ "formatVersion": 1 }\n');

    await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: addExampleRow
    });
    const refusal = await thrownFailureOf(() => writeTracker({
      workspace, at: CHANGED_AT, now, mutate: (change) => change.board.openSetup(FIRST_SETUP, change.at)
    }));

    expect(readFileSync(workspace.progressFilePath, 'utf8')).toContain('Example rendered row');
    const boardRefusal = { reason: 'pipeline-setup-unreadable', problem: 'setupId is missing' } as const;
    expect(refusalIsOperationRefusal(refusal) && refusal.detail).toEqual({ kind: 'board-refusal', boardRefusal });
    expect(readFileSync(workspace.pipelineSetupFilePath, 'utf8')).toBe('{ "formatVersion": 1 }\n');
  });
});

describe('the gate profile runs a hold reads and writes', () => {
  const PROFILE_REQUEST = {
    setupId: null, phase: 'build', gate: { name: 'tests', run: 'bun test' }, prepare: []
  } as const;

  test('a profile move writes gate-profiles.json before log.jsonl, and a later hold reads the run back', async () => {
    writeReadableTracker(workspace);
    const writtenPaths: string[] = [];

    await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: (change) => change.board.queueGateProfile(PROFILE_REQUEST, change.at), afterFileWritten: (filePath) => writtenPaths.push(filePath)
    });

    expect(writtenPaths).toEqual([workspace.gateProfilesFilePath, workspace.logFilePath]);
    expect(JSON.parse(readFileSync(workspace.gateProfilesFilePath, 'utf8'))).toMatchObject({ formatVersion: 1, nextRunNumber: 2, runs: [{ profileRunId: 'P1' }] });
    const written = await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: (change) => change.board.gateProfileRuns().map((run) => run.state)
    });
    expect(written.result).toEqual(['queued']);
  });

  test('a malformed file is a verdict: other writes go on, a profile move is refused, and the file stays byte for byte', async () => {
    writeReadableTracker(workspace);
    writeFileSync(workspace.gateProfilesFilePath, '{ "formatVersion": 1 }\n');

    await writeTracker({
      workspace, at: CHANGED_AT, now, mutate: addExampleRow
    });
    const refusal = await thrownFailureOf(() => writeTracker({
      workspace, at: CHANGED_AT, now, mutate: (change) => change.board.queueGateProfile(PROFILE_REQUEST, change.at)
    }));

    expect(readFileSync(workspace.progressFilePath, 'utf8')).toContain('Example rendered row');
    const boardRefusal = { reason: 'gate-profiles-unreadable', problem: 'nextRunNumber is missing' } as const;
    expect(refusalIsOperationRefusal(refusal) && refusal.detail).toEqual({ kind: 'board-refusal', boardRefusal });
    expect(readFileSync(workspace.gateProfilesFilePath, 'utf8')).toBe('{ "formatVersion": 1 }\n');
  });
});
