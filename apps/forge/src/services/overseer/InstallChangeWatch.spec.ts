/**
 * The Overseer learns of an update only through this watch, so what matters: the on-disk binary is asked again at each sweep and after
 * each landing and not on every look, the manifest is read on every look, an install change wins over new code, and nothing here ever
 * restarts anything: the watch only answers. A look never waits for the binary, which once blocked the Overseer's API under load, and
 * never runs two at once. The child it runs answers as the real binary did, recorded by
 * `src/testing/RecordedCommand.versionCheck.integration.spec.ts`; one that never answers is killed at its deadline, since a pass after a
 * landing awaits it.
 */
import { join } from 'node:path';

import {
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import { VERSION_CHECK_RECORDING }                                               from '../../testing/RecordedBoundaryCommands.ts';
import { recordedCommandOf }                                                     from '../../testing/RecordedCommand.ts';
import { createInstallChangeWatch, type ProgramVersions, versionsFromTheBinary } from './InstallChangeWatch.ts';

const EXAMPLE_BUN = '/opt/example/bin/bun';
const EXAMPLE_CHECKOUT = '/home/alex-example/agent-progress';
const IN_MEMORY: ProgramVersions = { codeVersion: 'code-in-memory', installVersion: 17 };
// Enough turns for an answer to settle and the next ask to start; none of it waits on a clock.
const MICROTASK_TURNS = 20;
const SHORT_DEADLINE_MILLISECONDS = 5;

function watchOver(onDisk: ProgramVersions, options: { manifestMatches?: boolean; landingMark?: string } = {}) {
  const answers: ProgramVersions[] = [];
  let current = onDisk;
  let landingMark = options.landingMark ?? 'tip-1';
  let manifestMatches = options.manifestMatches ?? true;
  let learnedCount = 0;
  let lastAnswer: Promise<ProgramVersions | null> = Promise.resolve(null);
  const watch = createInstallChangeWatch({
    inMemory:       IN_MEMORY,
    versionsOnDisk: () => {
      answers.push(current);
      lastAnswer = Promise.resolve(current);
      return lastAnswer;
    },
    manifestMatches: () => manifestMatches,
    landingMark:     () => landingMark,
    onLearned:       () => { learnedCount += 1; },
  });
  return {
    watch,
    answers,
    learnedCount:       () => learnedCount,
    // The watch's own handler is attached to the answer first, so it has run once this resolves.
    answered:           async () => { await lastAnswer; },
    putOnDisk:          (versions: ProgramVersions) => { current = versions; },
    land:               (tip: string) => { landingMark = tip; },
    setManifestMatches: (matches: boolean) => { manifestMatches = matches; },
  };
}

async function learnedWatchOver(onDisk: ProgramVersions) {
  const subject = watchOver(onDisk);
  await subject.watch.learnVersionsOnDisk();
  return subject.watch;
}

describe('when the on-disk binary is asked', () => {
  test('once at the first look, then only after a sweep or a landing', async () => {
    const subject = watchOver(IN_MEMORY);
    await subject.watch.learnVersionsOnDisk();
    expect(subject.watch.installVersionChanged()).toBe(false);
    subject.putOnDisk({ ...IN_MEMORY, installVersion: 18 });
    expect(subject.watch.installVersionChanged()).toBe(false);
    expect(subject.answers.length).toBe(1);
    subject.watch.noteSweep();
    subject.watch.installVersionChanged();
    await subject.answered();
    expect(subject.watch.installVersionChanged()).toBe(true);
    subject.putOnDisk({ ...IN_MEMORY, codeVersion: 'code-landed' });
    subject.land('tip-2');
    subject.watch.installVersionChanged();
    await subject.answered();
    expect(subject.watch.installVersionChanged()).toBe(false);
    expect(subject.watch.newCodeOnDisk()).toBe(true);
    expect(subject.answers.length).toBe(3);
  });

  test('a look never waits for the binary: it answers what the watch last learned, and the changed answer calls onLearned', async () => {
    const subject = watchOver({ ...IN_MEMORY, installVersion: 18 });
    expect(subject.watch.installVersionChanged()).toBe(false);
    expect(subject.learnedCount()).toBe(0);
    await subject.answered();
    expect(subject.learnedCount()).toBe(1);
    expect(subject.watch.installVersionChanged()).toBe(true);
    subject.watch.noteSweep();
    subject.watch.installVersionChanged();
    await subject.answered();
    expect(subject.learnedCount()).toBe(1);
  });

  test('a pass after a landing waits for the binary\'s answer before it reads the install version; after a sweep it does not wait', async () => {
    const finishers: Array<(versions: ProgramVersions) => void> = [];
    let landingMark = 'tip-1';
    const watch = createInstallChangeWatch({
      inMemory:        IN_MEMORY,
      versionsOnDisk:  async () => new Promise<ProgramVersions>((resolve) => { finishers.push(resolve); }),
      manifestMatches: () => true,
      landingMark:     () => landingMark,
      onLearned:       () => undefined,
    });
    const learning = watch.learnVersionsOnDisk();
    finishers[0]?.(IN_MEMORY);
    await learning;
    landingMark = 'tip-2';
    let settled = false;
    const settling = watch.versionsSettled().then(() => { settled = true; });
    for (let i = 0; i < MICROTASK_TURNS; i++) await Promise.resolve();
    expect(settled).toBe(false);
    finishers[1]?.({ ...IN_MEMORY, installVersion: 18 });
    await settling;
    expect(watch.installVersionChanged()).toBe(true);
    watch.noteSweep();
    await watch.versionsSettled();
    expect(finishers.length).toBe(3);
  });

  test('a sweep while the binary runs asks it once more after it answered, never two at once', async () => {
    const finishers: Array<(versions: ProgramVersions) => void> = [];
    let running = 0;
    let mostAtOnce = 0;
    const watch = createInstallChangeWatch({
      inMemory:       IN_MEMORY,
      versionsOnDisk: async () => {
        running += 1;
        mostAtOnce = Math.max(mostAtOnce, running);
        const answer = await new Promise<ProgramVersions>((resolve) => { finishers.push(resolve); });
        running -= 1;
        return answer;
      },
      manifestMatches: () => true,
      landingMark:     () => null,
      onLearned:       () => undefined,
    });
    const learning = watch.learnVersionsOnDisk();
    watch.noteSweep();
    watch.installVersionChanged();
    expect(finishers.length).toBe(1);
    finishers[0]?.(IN_MEMORY);
    for (let i = 0; i < MICROTASK_TURNS && finishers.length < 2; i++) await Promise.resolve();
    finishers[1]?.({ ...IN_MEMORY, installVersion: 18 });
    await learning;
    expect(finishers.length).toBe(2);
    expect(mostAtOnce).toBe(1);
    expect(watch.installVersionChanged()).toBe(true);
  });
});

describe('what the watch answers', () => {
  test('an install version on disk that differs holds launches; new code alone is only new code', async () => {
    expect((await learnedWatchOver({ codeVersion: 'code-landed', installVersion: 18 })).installVersionChanged()).toBe(true);
    expect((await learnedWatchOver({ codeVersion: 'code-landed', installVersion: 18 })).newCodeOnDisk()).toBe(false);
    expect((await learnedWatchOver({ codeVersion: 'code-landed', installVersion: 17 })).newCodeOnDisk()).toBe(true);
    expect((await learnedWatchOver(IN_MEMORY)).newCodeOnDisk()).toBe(false);
  });

  test('a manifest an update moved is an install change at once, without waiting for a sweep, and clears once it matches again', async () => {
    const subject = watchOver(IN_MEMORY);
    await subject.watch.learnVersionsOnDisk();
    expect(subject.watch.installVersionChanged()).toBe(false);
    subject.setManifestMatches(false);
    expect(subject.watch.installVersionChanged()).toBe(true);
    subject.setManifestMatches(true);
    expect(subject.watch.installVersionChanged()).toBe(false);
  });

  test('a binary that gives no answer changes nothing the watch last learned', async () => {
    let answer: ProgramVersions | null = { ...IN_MEMORY, installVersion: 18 };
    const watch = createInstallChangeWatch({
      inMemory: IN_MEMORY, versionsOnDisk: async () => answer, manifestMatches: () => true, landingMark: () => null, onLearned: () => undefined
    });
    await watch.learnVersionsOnDisk();
    expect(watch.installVersionChanged()).toBe(true);
    answer = null;
    await watch.learnVersionsOnDisk();
    expect(watch.installVersionChanged()).toBe(true);
  });
});

describe('the on-disk binary, on the answers the real one gave', () => {
  const placeholders = { [VERSION_CHECK_RECORDING.BUN_PLACEHOLDER]: EXAMPLE_BUN, [VERSION_CHECK_RECORDING.CHECKOUT_PLACEHOLDER]: EXAMPLE_CHECKOUT };

  async function versionsOnRecordedAnswers(programCommand: readonly string[], situation?: string): Promise<ProgramVersions | null> {
    const recorded = recordedCommandOf(VERSION_CHECK_RECORDING.BOUNDARY, placeholders, situation);
    const spawn = spyOn(Bun, 'spawn').mockImplementation(((argv: readonly string[]) => recorded.spawn(argv)) as unknown as typeof Bun.spawn);
    try {
      return await versionsFromTheBinary(programCommand, EXAMPLE_CHECKOUT);
    } finally {
      spawn.mockRestore();
    }
  }

  test('version --json answers the code version and the install version', async () => {
    expect(await versionsOnRecordedAnswers([EXAMPLE_BUN, join(EXAMPLE_CHECKOUT, 'agent-progress.ts')]))
      .toEqual({ codeVersion: expect.any(String), installVersion: expect.any(Number) });
  });

  test('a binary that does not answer by the deadline is killed and answers null', async () => {
    let killed = false;
    let endTheChild: (exitCode: number) => void = () => undefined;
    const hungChild = {
      stdout: new ReadableStream<Uint8Array>({ start: () => undefined }),
      exited: new Promise<number>((resolve) => { endTheChild = resolve; }),
      kill:   () => {
        killed = true;
        endTheChild(1);
      },
    };
    const spawn = spyOn(Bun, 'spawn').mockImplementation((() => hungChild) as unknown as typeof Bun.spawn);
    try {
      expect(await versionsFromTheBinary([EXAMPLE_BUN, join(EXAMPLE_CHECKOUT, 'agent-progress.ts')], EXAMPLE_CHECKOUT, SHORT_DEADLINE_MILLISECONDS)).toBeNull();
      expect(killed).toBe(true);
    } finally {
      spawn.mockRestore();
    }
  });

  test('a program that cannot start (ENOENT) answers null, and so does no program', async () => {
    expect(await versionsOnRecordedAnswers([join(EXAMPLE_CHECKOUT, 'missing-program')], VERSION_CHECK_RECORDING.MISSING_SITUATION)).toBeNull();
    expect(await versionsFromTheBinary([], EXAMPLE_CHECKOUT)).toBeNull();
  });
});
