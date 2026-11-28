/**
 * `hephaestus-log` over a scratch board with no forge up: what matters is that each record prints as its stamp and sentence, that a line
 * that is no record is skipped and named on standard error, that `--json` is the records with their line numbers, and that `--follow`
 * prints what is appended until a stop signal.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname }                                  from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { HephaestusLogRecord }               from '../../src/adapters/@types/HephaestusLogRecord.ts';
import { HephaestusLogWordingUtil }               from '../../src/adapters/utils/HephaestusLogWordingUtil.ts';
import { hephaestusFilesIn }                      from '../../src/services/hephaestus/HephaestusFiles.ts';
import { requireWorkspace }                       from '../../src/services/tracker/Workspace.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { waitUntil }                              from '../../src/testing/WaitUntil.ts';
import { runCommandLine }                         from '../Main.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const AT = '2026-11-27T10:00:00+01:00';

const recordedGit = useRecordedGit();

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('hephaestus-log', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

function logFilePath(): string {
  return hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory).logFilePath;
}

function appendRecords(...records: HephaestusLogRecord[]): void {
  mkdirSync(dirname(logFilePath()), { recursive: true });
  appendFileSync(logFilePath(), records.map((record) => `${HephaestusLogWordingUtil.storedLineOf(record, AT)}\n`).join(''));
}

describeWhenGitIsRecorded('hephaestus-log', () => {
  test('prints each record as its stamp and sentence, and skips a line that is no record, naming it on standard error', async () => {
    appendRecords({ kind: 'talos-attached', talosStartNumber: 2 });
    appendFileSync(logFilePath(), 'refused: printed before the logger\n');
    appendRecords({ kind: 'hephaestus-stopped' });
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });

    expect(await runCommandLine(['hephaestus-log'], context), context.errorText()).toBe(0);

    expect(context.outputText()).toBe(`${AT} Attached to Talos 2.\n${AT} Hephaestus stopped; its Hephaestus lock is released.`);
    expect(context.errorText()).toContain(`Line 2 of ${logFilePath()} is no log record (it is not valid JSON (`);
  });

  test('--json prints the records with their line numbers, and a board with no log yet prints none', async () => {
    const emptyContext = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['hephaestus-log', '--json'], emptyContext), emptyContext.errorText()).toBe(0);
    expect(JSON.parse(emptyContext.outputText())).toEqual({ logFilePath: logFilePath(), records: [] });

    appendRecords({ kind: 'stop-signal-received' });
    const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['hephaestus-log', '--json'], context), context.errorText()).toBe(0);
    expect(JSON.parse(context.outputText())).toEqual({
      logFilePath: logFilePath(),
      records:     [{
        lineNumber: 1, at: AT, kind: 'stop-signal-received', details: 'Stop signal received.'
      }],
    });
  });

  test('--follow prints what is appended until a stop signal', async () => {
    writeFileSync(logFilePath(), `${HephaestusLogWordingUtil.storedLineOf({ kind: 'talos-attached', talosStartNumber: 2 }, AT)}\n`);
    let stop: () => void = () => undefined;
    const context = {
      ...createCapturedCommandContext({ currentDirectory: repositoryDirectory }),
      onStopSignal: (listener: () => void) => {
        stop = listener;
        return () => undefined;
      },
    };

    const following = runCommandLine(['hephaestus-log', '--follow'], context);
    await waitUntil(() => context.outputText().includes('Attached to Talos 2.'), () => context.outputText());
    appendRecords({ kind: 'talos-connection-closed', talosStartNumber: 2 });
    await waitUntil(() => context.outputText().includes('The connection to Talos 2 closed'), () => context.outputText());
    stop();

    expect(await following, context.errorText()).toBe(0);
    expect(context.outputText()).toBe(`${AT} Attached to Talos 2.\n${AT} The connection to Talos 2 closed; the next pass ensures a Talos.`);
  });
});
