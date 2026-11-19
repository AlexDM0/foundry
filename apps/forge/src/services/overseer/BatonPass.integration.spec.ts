/**
 * What the checked Baton pass does to real processes and a real port, its decisions being held in `src/services/overseer/BatonPass.spec.ts`: a
 * silent successor really dies of the kill, one that exited reads as exited, and a port its holder still has is refused by the kernel until that
 * holder is gone. The whole Baton pass between two real Overseers is held by `cli/overseer/OverseerCommand.integration.spec.ts`.
 */
import { mkdirSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import { sameProcess, type ProcessIdentity }                    from '../../lib/process-identity/ProcessIdentity.ts';
import { nativePlatformPorts }                                  from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory }       from '../../testing/ScratchWorkspace.ts';
import { type BatonPassStep, type BatonPassStepRun, BatonPass } from './BatonPass.ts';

const ports = nativePlatformPorts();
const { identityOf } = ports.processSupervision;

const SCHEDULE = { readyTries: 40, releaseTries: 40, intervalMilliseconds: 10 };
const PREPARATION_STEPS: readonly BatonPassStep[] = ['read-board', 'read-jobs', 'read-child-records', 'install-version'];
const SUCCESSOR_CODE = 'code-successor';

let overseerDirectory = '';
let batonPassFilePath = '';

beforeEach(() => {
  overseerDirectory = createScratchDirectory('baton-pass');
  mkdirSync(overseerDirectory, { recursive: true });
  batonPassFilePath = BatonPass.batonPassFilePathOf(overseerDirectory, 1);
  BatonPass.writeBatonPass(batonPassFilePath, { state: 'requested' });
});

afterEach(() => {
  removeScratchDirectory(overseerDirectory);
});

function ownIdentity(): ProcessIdentity {
  const identity = identityOf(process.pid);
  if (identity === null) throw new Error('the spec process has no readable identity');
  return identity;
}

function passingSteps(): BatonPassStepRun[] {
  return PREPARATION_STEPS.map((step) => ({ step, run: () => undefined }));
}

async function handOverAgainst(successor: () => Promise<void>, successorIdentity: ProcessIdentity | null) {
  let released = 0;
  const [outcome] = await Promise.all([
    BatonPass.handOver({
      ports,
      batonPassFilePath,
      successor:            successorIdentity,
      successorCodeVersion: SUCCESSOR_CODE,
      release:              () => {
        released += 1;
        return Promise.resolve();
      },
      recordFailure:    () => Promise.resolve(),
      logSuccessorKill: () => undefined,
      schedule:         SCHEDULE,
    }),
    successor(),
  ]);
  return { outcome, released };
}

function successorRequest() {
  return {
    batonPassFilePath, codeVersion: SUCCESSOR_CODE, predecessorIsLive: () => true, schedule: SCHEDULE
  };
}

describe('a successor failing before released', () => {
  test('a successor that reports nothing within the ready tries is killed and counted as failed before released', async () => {
    const silent = Bun.spawn(['sleep', '30'], {
      detached: true, stdin: 'ignore', stdout: 'ignore', stderr: 'ignore'
    });
    const silentIdentity = identityOf(silent.pid);
    const { outcome, released } = await handOverAgainst(() => Promise.resolve(), silentIdentity);
    expect(outcome).toMatchObject({ verdict: 'kept-driving', failure: { step: 'report-ready', successorCodeVersion: SUCCESSOR_CODE } });
    expect(released).toBe(0);
    await silent.exited;
    expect(silent.signalCode).toBe('SIGKILL');
    const after = identityOf(silent.pid);
    expect(after !== null && silentIdentity !== null && sameProcess(after, silentIdentity)).toBe(false);
  });

  test('a successor that exits without a report fails at once, and one never started fails at spawn', async () => {
    const exited = Bun.spawn(['true']);
    const exitedIdentity = identityOf(exited.pid) ?? { ...ownIdentity(), processId: exited.pid, startStamp: '0' };
    await exited.exited;
    expect((await handOverAgainst(() => Promise.resolve(), exitedIdentity)).outcome).toMatchObject({ verdict: 'kept-driving', failure: { step: 'report-ready' } });
    BatonPass.writeBatonPass(batonPassFilePath, { state: 'requested' });
    expect((await handOverAgainst(() => Promise.resolve(), null)).outcome).toMatchObject({ verdict: 'kept-driving', failure: { step: 'spawn' } });
  });
});

describe('the old Overseer rebinding its port after taking a Baton pass back', () => {
  const PORT_HOLDER_SOURCE = 'const server = Bun.serve({ hostname: \'127.0.0.1\', port: 0, reusePort: false, fetch: () => new Response(\'\') }); '
    + 'console.log(server.port); setInterval(() => undefined, 1000);';

  /** Spawned in the spec's own process group, so the Baton pass's group kill is refused and it outlives that first signal. */
  async function portHoldingSuccessor() {
    const holder = Bun.spawn([process.execPath, '-e', PORT_HOLDER_SOURCE], { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' });
    const reader = holder.stdout.getReader();
    const { value } = await reader.read();
    reader.releaseLock();
    const identity = identityOf(holder.pid);
    if (identity === null) throw new Error('the port holder has no readable identity');
    return { holder, identity, port: Number(new TextDecoder().decode(value).trim()) };
  }

  function servingOn(port: number) {
    return Bun.serve({
      hostname: '127.0.0.1', port, reusePort: false, fetch: () => new Response('')
    });
  }

  test('a silent successor still holding the port after its kill is waited for, and the old Overseer then serves again on that port', async () => {
    const { holder, identity, port } = await portHoldingSuccessor();
    try {
      const { outcome } = await handOverAgainst(async () => {
        await BatonPass.prepareAndAwaitRelease(successorRequest(), passingSteps());
      }, identity);
      expect(outcome).toMatchObject({ verdict: 'taken-back', failure: { step: 'serve' } });
      // The kill lands at the rebind's first wait, which comes only once it read the successor live; the port frees with the holder's exit.
      const firstRebindWait = spyOn(Bun, 'sleep').mockImplementationOnce(async () => {
        holder.kill('SIGKILL');
        await holder.exited;
      });
      let binds = 0;
      const rebound = await BatonPass.rebindAfterTakeBack({
        ports,
        successor:            identity,
        tries:                SCHEDULE.releaseTries,
        intervalMilliseconds: SCHEDULE.intervalMilliseconds,
        bind:                 () => {
          binds += 1;
          return Promise.resolve(servingOn(port));
        },
      });
      expect(firstRebindWait).toHaveBeenCalledTimes(1);
      firstRebindWait.mockRestore();
      expect(rebound.verdict).toBe('bound');
      if (rebound.verdict === 'bound') {
        expect(rebound.bound.port).toBe(port);
        await rebound.bound.stop(true);
      }
      expect(binds).toBe(1);
    } finally {
      holder.kill('SIGKILL');
    }
  });

  test('a successor outliving the tries is never bound over; a port still held fails each try; a refused bind is tried again until it holds', async () => {
    const { holder, identity, port } = await portHoldingSuccessor();
    let binds = 0;
    const bind = () => {
      binds += 1;
      return Promise.resolve(servingOn(port));
    };
    const rebindOver = (successor: ProcessIdentity | null, bindOnce: typeof bind) => BatonPass.rebindAfterTakeBack({
      ports, successor, tries: 3, intervalMilliseconds: SCHEDULE.intervalMilliseconds, bind: bindOnce
    });
    try {
      expect(await rebindOver(identity, bind)).toEqual({ verdict: 'successor-live' });
      expect(binds).toBe(0);
      expect(await rebindOver(null, bind)).toMatchObject({ verdict: 'bind-failed' });
      expect(binds).toBe(3);
    } finally {
      holder.kill('SIGKILL');
      await holder.exited;
    }
    binds = 0;
    const refusedOnce = () => (binds === 0 ? (binds += 1, Promise.reject(new Error('Example bind refusal'))) : bind());
    const rebound = await rebindOver(null, refusedOnce);
    expect(rebound.verdict).toBe('bound');
    if (rebound.verdict === 'bound') await rebound.bound.stop(true);
    expect(binds).toBe(2);
  });
});
