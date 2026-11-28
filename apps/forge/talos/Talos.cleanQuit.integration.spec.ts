/**
 * The clean quit end to end with the Talos binary, its wait 300 milliseconds: a `quit` ends every agent and line `paused`, and Talos records
 * `quit` with the reason and exits within the wait and the stop sweep; a `hello` of another protocol does the same with `protocol-mismatch`.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { TALOS_PROTOCOL_VERSION }                  from '../src/domain/talos/constants/TalosProtocol.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from '../src/testing/ChildProcessCaseTimeout.ts';
import { fakeStartedLineSelectorOf }               from '../src/testing/FakeAgentAdapter.ts';
import { fakeAgentChildLaunch }                    from '../src/testing/FakeAgentChildLaunch.ts';
import {
  createScratchTalos,
  SCRATCH_TALOS_SECRET,
  type ScratchTalos,
  type ServingTalos
} from '../src/testing/ScratchTalos.ts';
import { waitUntil } from '../src/testing/WaitUntil.ts';

const START_NUMBER = 1;
const QUIT_WAIT_MILLISECONDS = 300;
/** The stop sweep's own bound: twenty `force` rounds a hundred milliseconds apart, and the slack of a spawned Talos ending. */
const STOP_SWEEP_MILLISECONDS = 2000 + 1000;
/** The grace a worktree job's launch carries: an agent that ends on its quit act must not make the quit wait it out. */
const TREE_STOP_AT_END_GRACE_MILLISECONDS = 5000;
const SESSION_FOLDER = 'jobs/J-1';
const STUBBORN_AGENT_FOLDER = 'jobs/J-2';
const LINE_FOLDER = 'jobs/J-3/gate-1';
/** An agent's launch whose child never reads its stdin, so its closed input does not end it. */
const IGNORES_ITS_INPUT = 'setInterval(() => undefined, 60000);';

let currentScratchTalos: ScratchTalos | null = null;

beforeEach(() => {
  currentScratchTalos = createScratchTalos();
});

afterEach(async () => {
  await currentScratchTalos?.remove();
});

function scratchTalos(): ScratchTalos {
  if (currentScratchTalos === null) throw new Error('no scratch Talos outside a test');
  return currentScratchTalos;
}

async function servingWithTwoAgentsAndALine(): Promise<ServingTalos> {
  const scratch = scratchTalos();
  const serving = await scratch.serve(START_NUMBER, { cleanQuitWaitMilliseconds: QUIT_WAIT_MILLISECONDS });
  const sessionSteps = [{ kind: 'print', line: fakeStartedLineSelectorOf('fake-session') }, { kind: 'await-line' }] as const;
  const treeStopAtEnd = { treeStopAtEndGraceMilliseconds: TREE_STOP_AT_END_GRACE_MILLISECONDS };
  await serving.send({ kind: 'launch', launch: fakeAgentChildLaunch(scratch.boardFolder, SESSION_FOLDER, 1, sessionSteps, treeStopAtEnd) });
  const stubbornLaunch = fakeAgentChildLaunch(scratch.boardFolder, STUBBORN_AGENT_FOLDER, 1, [], { ...treeStopAtEnd, argv: [process.execPath, '-e', IGNORES_ITS_INPUT] });
  await serving.send({ kind: 'launch', launch: stubbornLaunch });
  await serving.send({ kind: 'launch', launch: scratch.lineLaunch(LINE_FOLDER, 1, IGNORES_ITS_INPUT) });
  await waitUntil(() => scratch.eventsOf(SESSION_FOLDER, 1).length > 0, 'the session started');
  return serving;
}

function expectEveryChildPaused(): void {
  const scratch = scratchTalos();
  expect(scratch.childRecordOf(SESSION_FOLDER, 1)?.end).toMatchObject({ reason: 'paused', exitCode: 0, signal: null });
  expect(scratch.childRecordOf(STUBBORN_AGENT_FOLDER, 1)?.end?.reason).toBe('paused');
  expect(scratch.childRecordOf(STUBBORN_AGENT_FOLDER, 1)?.end?.signal).not.toBeNull();
  expect(scratch.childRecordOf(LINE_FOLDER, 1)?.end?.reason).toBe('paused');
}

test('a quit ends every agent and line paused, records quit restart and exits within the wait and the stop sweep', async () => {
  const scratch = scratchTalos();
  const serving = await servingWithTwoAgentsAndALine();
  const quitAskedAt = performance.now();
  expect(await serving.quit()).toBe(0);
  expect(performance.now() - quitAskedAt).toBeLessThan(QUIT_WAIT_MILLISECONDS + STOP_SWEEP_MILLISECONDS);
  expectEveryChildPaused();
  expect(scratch.talosRecordOf(START_NUMBER)).toMatchObject({ state: 'quit', quitReason: 'restart' });
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a hello of another protocol ends every agent and line paused and records quit protocol-mismatch', async () => {
  const scratch = scratchTalos();
  const serving = await servingWithTwoAgentsAndALine();
  const quitAskedAt = performance.now();
  const otherClient = await scratch.connect(START_NUMBER);
  otherClient.send({ kind: 'hello', requiredProtocolVersion: TALOS_PROTOCOL_VERSION + 1, secret: SCRATCH_TALOS_SECRET });
  expect(await otherClient.nextFrame(() => true)).toEqual({ kind: 'version-mismatch', protocolVersion: TALOS_PROTOCOL_VERSION });
  expect(await scratch.exitCodeOf(serving.talos, START_NUMBER)).toBe(0);
  expect(performance.now() - quitAskedAt).toBeLessThan(QUIT_WAIT_MILLISECONDS + STOP_SWEEP_MILLISECONDS);
  expectEveryChildPaused();
  expect(scratch.talosRecordOf(START_NUMBER)).toMatchObject({ state: 'quit', quitReason: 'protocol-mismatch' });
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
