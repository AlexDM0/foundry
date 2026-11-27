/**
 * `ensureTalos` with the Talos binary and the machine's own processes and endpoints. What matters: a start from nothing serves and a second
 * ensure attaches to it; a Talos of another protocol version, as one started from another program on disk, quits cleanly and the next one
 * starts; and a Talos killed with SIGKILL leaves its line running, which the next ensure stops and settles before it starts a new Talos,
 * so no orphan outlives its commander.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { childFilesOf }                            from '../../lib/talos/TalosFiles.ts';
import { TALOS_PROTOCOL_VERSION }                  from '../../lib/talos/constants/TalosProtocol.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from '../../testing/ChildProcessCaseTimeout.ts';
import { detailsLoggerOf }                         from '../../testing/LoggedDetails.ts';
import { nativePlatformPorts }                     from '../../testing/NativePlatformPorts.ts';
import { createScratchTalos, type ScratchTalos }   from '../../testing/ScratchTalos.ts';
import { waitUntil }                               from '../../testing/WaitUntil.ts';
import { connectToTalos, type TalosConnection }    from './TalosConnection.ts';
import {
  createTalosStartHold,
  ensureTalos,
  spawnTalos,
  type TalosAvailability,
  type TalosStartContext
} from './TalosStart.ts';
import { createUnreadableBoardFiles } from './UnreadableBoardFiles.ts';

const SHORT_BOUNDS = {
  leaseMilliseconds:           60_000,
  renewalIntervalMilliseconds: 15_000,
  cleanQuitWaitMilliseconds:   300,
  tickMilliseconds:            50,
  tickGapMilliseconds:         200,
} as const;
/** Bounds the waits only; each ends on Talos's own record. */
const WAITS = {
  frameTimeoutMilliseconds: 2000, startTries: 400, quitTries: 400, intervalMilliseconds: 25
} as const;
const LINE_FOLDER = 'jobs/J-1/install';
const STAYS_UNTIL_STOPPED = 'setInterval(() => undefined, 60000);';

let currentScratchTalos: ScratchTalos | null = null;
const openConnections: TalosConnection[] = [];

beforeEach(() => {
  currentScratchTalos = createScratchTalos();
});

afterEach(async () => {
  for (const connection of openConnections.splice(0)) connection.close();
  await currentScratchTalos?.remove();
});

function scratchTalos(): ScratchTalos {
  if (currentScratchTalos === null) throw new Error('no scratch Talos outside a test');
  return currentScratchTalos;
}

function startContext(logged: string[] = []): TalosStartContext {
  const scratch = scratchTalos();
  return {
    boardFolder:          scratch.boardFolder,
    monitorFolder:        scratch.monitorFolder,
    trackerId:            'tracker-example',
    codeVersion:          'code-example',
    repositoryRoot:       scratch.boardFolder,
    ports:                nativePlatformPorts(),
    bounds:               SHORT_BOUNDS,
    waits:                WAITS,
    connect:              connectToTalos,
    startTalos:           spawnTalos,
    hold:                 createTalosStartHold(),
    log:                  detailsLoggerOf(logged),
    unreadableBoardFiles: createUnreadableBoardFiles(detailsLoggerOf(logged)),
  };
}

function connectionOf(availability: TalosAvailability): TalosConnection {
  if (availability.verdict !== 'attached' && availability.verdict !== 'started') throw new Error(`no Talos to talk to: ${JSON.stringify(availability)}`);
  openConnections.push(availability.connection);
  return availability.connection;
}

function talosProcessIdOf(startNumber: number): number {
  const processId = scratchTalos().talosRecordOf(startNumber)?.talos?.processId;
  if (processId === undefined) throw new Error(`Talos ${startNumber} names no process`);
  return processId;
}

async function quitCleanly(connection: TalosConnection, startNumber: number): Promise<void> {
  expect(await connection.send({ kind: 'quit', reason: 'restart' })).toMatchObject({ verdict: 'done' });
  await waitUntil(() => scratchTalos().talosRecordOf(startNumber)?.state === 'quit', `Talos ${startNumber} recording its quit`);
}

test('a start from nothing serves the required protocol, and a second ensure attaches to it', async () => {
  const started = await ensureTalos(startContext());
  expect(started).toMatchObject({
    verdict: 'started', startNumber: 1, previousTalos: 'none', sweptOrphans: 0
  });
  expect(scratchTalos().talosRecordOf(1)).toMatchObject({ state: 'serving', protocolVersion: TALOS_PROTOCOL_VERSION });

  const attached = await ensureTalos(startContext());
  expect(attached).toMatchObject({ verdict: 'attached', startNumber: 1 });
  await quitCleanly(connectionOf(attached), 1);
  connectionOf(started);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a Talos of another protocol version quits cleanly and the next one starts', async () => {
  const scratch = scratchTalos();
  scratch.writeStartFile(1, SHORT_BOUNDS);
  scratch.spawnTalosOfTheNextProtocol(1);
  await waitUntil(() => scratch.talosRecordOf(1)?.state === 'serving', 'the Talos of the next protocol serving');
  expect(scratch.talosRecordOf(1)?.protocolVersion).toBe(TALOS_PROTOCOL_VERSION + 1);

  const started = await ensureTalos(startContext());

  expect(started).toMatchObject({
    verdict: 'started', startNumber: 2, previousTalos: 'quit', sweptOrphans: 0
  });
  expect(scratch.talosRecordOf(1)).toMatchObject({ state: 'quit', quitReason: 'protocol-mismatch' });
  await quitCleanly(connectionOf(started), 2);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a Talos killed with SIGKILL leaves its line running, which the next ensure stops before it starts the next Talos', async () => {
  const scratch = scratchTalos();
  const { processSupervision } = nativePlatformPorts();
  const first = connectionOf(await ensureTalos(startContext()));
  expect(await first.send({ kind: 'launch', launch: scratch.lineLaunch(LINE_FOLDER, 1, STAYS_UNTIL_STOPPED) })).toMatchObject({ verdict: 'done' });
  await waitUntil(() => scratch.childRecordOf(LINE_FOLDER, 1)?.state === 'running', 'the line running');
  const lineProcessId = scratch.childRecordOf(LINE_FOLDER, 1)?.childProcess?.processId ?? 0;
  const talosProcessId = talosProcessIdOf(1);

  process.kill(talosProcessId, 'SIGKILL');
  await waitUntil(() => processSupervision.processIsGone(talosProcessId), 'the killed Talos gone');
  expect(processSupervision.processIsGone(lineProcessId)).toBe(false);

  const logged: string[] = [];
  const second = await ensureTalos(startContext(logged));

  expect(second).toMatchObject({
    verdict: 'started', startNumber: 2, previousTalos: 'lost', sweptOrphans: 1
  });
  await waitUntil(() => processSupervision.processIsGone(lineProcessId), 'the orphan line stopped');
  const lostCausePath = join(dirname(childFilesOf(scratch.boardFolder, LINE_FOLDER, 1).recordPath), 'child-1.lost-cause');
  expect(existsSync(lostCausePath) ? readFileSync(lostCausePath, 'utf8') : null).toBe('talos-lost\n');
  expect(logged).toEqual(['Talos 1 was lost; 1 of its children were swept.']);
  await quitCleanly(connectionOf(second), 2);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
