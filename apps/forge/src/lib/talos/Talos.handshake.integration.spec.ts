/**
 * The handshake end to end with the Talos binary. What matters: a wrong secret is refused and Talos keeps serving, since nobody without the
 * secret may end it; a `hello` of another protocol, older or newer, is answered `version-mismatch`, after which Talos quits cleanly with its
 * record reading `quit` `protocol-mismatch` and its process gone; and a second Talos of a claimed start number exits 0 having spawned nothing.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                     from '../../testing/ChildProcessCaseTimeout.ts';
import { createScratchTalos, SCRATCH_TALOS_SECRET, type ScratchTalos } from '../../testing/ScratchTalos.ts';
import { waitUntil }                                                   from '../../testing/WaitUntil.ts';
import { processIsGone }                                               from '../process-identity/ProcessIdentity.ts';
import { TALOS_PROTOCOL_VERSION }                                      from './constants/TalosProtocol.ts';

const START_NUMBER = 1;

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

test('a wrong secret is refused and Talos keeps serving', async () => {
  const scratch = scratchTalos();
  scratch.writeStartFile(START_NUMBER);
  const talos = scratch.spawnTalos(START_NUMBER);
  const intruder = await scratch.connect(START_NUMBER);
  intruder.send({ kind: 'hello', requiredProtocolVersion: TALOS_PROTOCOL_VERSION + 1, secret: 'another-secret' });
  expect(await intruder.nextFrame(() => true)).toEqual({ kind: 'refused', reason: 'secret' });
  await intruder.closed;

  const client = await scratch.attach(START_NUMBER);
  expect(scratch.talosRecordOf(START_NUMBER)?.state).toBe('serving');
  client.send({ kind: 'quit', frameId: 1, reason: 'restart' });
  expect(await client.nextFrame((frame) => frame.kind === 'done')).toEqual({ kind: 'done', frameId: 1, verdict: 'done' });
  expect(await scratch.exitCodeOf(talos, START_NUMBER)).toBe(0);
  expect(scratch.talosRecordOf(START_NUMBER)).toMatchObject({ state: 'quit', quitReason: 'restart' });
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test.each([
  ['0', 0],
  ['1, whose launch took no quit act from its client', 1],
  ['one above its own', TALOS_PROTOCOL_VERSION + 1],
])('a hello of protocol %s is answered version-mismatch and Talos quits cleanly', async (_title, requiredProtocolVersion) => {
  const scratch = scratchTalos();
  scratch.writeStartFile(START_NUMBER);
  const talos = scratch.spawnTalos(START_NUMBER);
  const client = await scratch.connect(START_NUMBER);
  client.send({ kind: 'hello', requiredProtocolVersion, secret: SCRATCH_TALOS_SECRET });
  expect(await client.nextFrame(() => true)).toEqual({ kind: 'version-mismatch', protocolVersion: TALOS_PROTOCOL_VERSION });
  await client.closed;
  expect(await scratch.exitCodeOf(talos, START_NUMBER)).toBe(0);
  expect(scratch.talosRecordOf(START_NUMBER)).toMatchObject({ state: 'quit', quitReason: 'protocol-mismatch', protocolVersion: TALOS_PROTOCOL_VERSION });
  await waitUntil(() => processIsGone(talos.pid), 'the Talos process going');
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a second Talos of the same start number exits 0 and spawns nothing', async () => {
  const scratch = scratchTalos();
  scratch.writeStartFile(START_NUMBER);
  const firstTalos = scratch.spawnTalos(START_NUMBER);
  const client = await scratch.attach(START_NUMBER);
  const secondTalos = scratch.spawnTalos(START_NUMBER);
  expect(await scratch.exitCodeOf(secondTalos, START_NUMBER)).toBe(0);

  client.send({ kind: 'launch', frameId: 1, launch: scratch.lineLaunch('jobs/J-1/gate-1', 1, 'console.log("ran");') });
  expect(await client.nextFrame((frame) => frame.kind === 'done')).toEqual({ kind: 'done', frameId: 1, verdict: 'done' });
  expect((await scratch.endedRecordOf('jobs/J-1/gate-1', 1)).talos?.processId).toBe(firstTalos.pid);
  client.send({ kind: 'quit', frameId: 2, reason: 'restart' });
  expect(await scratch.exitCodeOf(firstTalos, START_NUMBER)).toBe(0);
  expect(scratch.talosRecordOf(START_NUMBER)?.talos?.processId).toBe(firstTalos.pid);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
