/**
 * How a stopped child's end is recorded where the runtime cannot tell: a real Watcher runs a real child, and the seam plays Windows, whose kill from
 * outside the handle reads as exit 1 with no signal. What matters is that the record says `signalled` once the
 * Watcher's own force reached the child, and that a child ending by itself keeps its exit code.
 */
import { readFileSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }         from '../../testing/ChildProcessCaseTimeout.ts';
import { createFakeWindowsKernel, fakeWindowsSupervision } from '../../testing/FakeWindowsKernel.ts';
import { nativePlatformPorts }                             from '../../testing/NativePlatformPorts.ts';
import { waitUntil }                                       from '../../testing/WaitUntil.ts';
import { type WatcherJob, createWatcherJob }               from '../../testing/WatcherJob.ts';
import type { ProcessIdentity, ProcessTreeStopOutcome }    from '../process-identity/ProcessIdentity.ts';
import { type WatcherPorts, runWatcherOnPorts }            from './Watcher.ts';
import { watcherFilesOf }                                  from './WatcherFiles.ts';
import { type WatcherEnd, watcherRecordOfStored }          from './WatcherRecord.ts';

const FIXED_STAMP = '2026-10-31T10:20:00+01:00';
const TERMINATED_BY_OUTSIDE_EXIT_CODE = 1;

// Any stop signal reads as the exit 1 a TerminateProcess from outside this handle leaves.
const SERVES_UNTIL_TERMINATED = `process.on('SIGTERM', () => process.exit(${TERMINATED_BY_OUTSIDE_EXIT_CODE})); console.log('serving'); setInterval(() => undefined, 60000);`;
const EXITS_BY_ITSELF = `process.exit(${TERMINATED_BY_OUTSIDE_EXIT_CODE});`;

const native = nativePlatformPorts();

/** The real process calls, with the Windows answers for the stages and for how a child ended. */
function portsPlayingWindows(forceVerdict: ProcessTreeStopOutcome = { verdict: 'signalled' }): WatcherPorts {
  const windows = fakeWindowsSupervision(createFakeWindowsKernel());
  return {
    endpoint:    native.localEndpoint,
    supervision: {
      ...native.processSupervision,
      endOf:    windows.endOf,
      stopTree: (leader: ProcessIdentity, stage) => {
        if (stage === 'ask') return { verdict: 'no-ask-stage' };
        process.kill(leader.processId, 'SIGTERM');
        return forceVerdict;
      },
    },
  };
}

let job: WatcherJob;

beforeEach(() => {
  job = createWatcherJob();
});

afterEach(() => {
  job.remove();
});

async function endOfRun(childScript: string, stopFrameSent: boolean, forceVerdict?: ProcessTreeStopOutcome): Promise<WatcherEnd> {
  job.writeLaunch(1, 'process', childScript);
  const watcherExit = runWatcherOnPorts([job.jobFolder, '1'], () => FIXED_STAMP, portsPlayingWindows(forceVerdict));
  await waitUntil(() => recordOf()?.state === 'running', 'the child running');
  const client = await job.attach(1);
  if (stopFrameSent) {
    await client.nextFrame((frame) => frame.kind === 'message');
    client.send({ kind: 'stop', graceMilliseconds: 0 });
  }
  await client.nextFrame((frame) => frame.kind === 'state' && frame.state === 'ended');
  client.send({ kind: 'stop', graceMilliseconds: 0 });
  await watcherExit;
  client.close();
  const end = recordOf()?.end;
  if (end === undefined) throw new Error('the Watcher recorded no end');
  return end;
}

function recordOf() {
  try {
    return watcherRecordOfStored(JSON.parse(readFileSync(watcherFilesOf(job.jobFolder, 1).watcherRecordPath, 'utf8')));
  } catch {
    return null;
  }
}

test('a child ended by the force stage records signalled SIGKILL though the runtime reports exit 1', async () => {
  expect(await endOfRun(SERVES_UNTIL_TERMINATED, true)).toEqual({ reason: 'signalled', exitCode: null, signal: 'SIGKILL' });
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a child ended by a force that one surviving member made a refusal still records signalled SIGKILL', async () => {
  const oneMemberSurvived: ProcessTreeStopOutcome = { verdict: 'refused', reason: 'example surviving member' };
  expect(await endOfRun(SERVES_UNTIL_TERMINATED, true, oneMemberSurvived)).toEqual({ reason: 'signalled', exitCode: null, signal: 'SIGKILL' });
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a child that ends by itself keeps its exit, as a kill from outside the Watcher does: the crash path', async () => {
  expect(await endOfRun(EXITS_BY_ITSELF, false)).toEqual({ reason: 'exited', exitCode: TERMINATED_BY_OUTSIDE_EXIT_CODE, signal: null });
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
