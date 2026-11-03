/**
 * The Overseer learns of an update only through this watch, so what matters: the on-disk binary is asked again at each sweep and after
 * each landing and not on every look, the manifest is read on every look, an install change wins over new code, and nothing here ever
 * restarts anything: the watch only answers. The child it runs answers as the real binary did, recorded by
 * `src/testing/RecordedCommand.versionCheck.integration.spec.ts`.
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

function watchOver(onDisk: ProgramVersions, options: { manifestMatches?: boolean; landingMark?: string } = {}) {
  const answers: ProgramVersions[] = [];
  let current = onDisk;
  let landingMark = options.landingMark ?? 'tip-1';
  let manifestMatches = options.manifestMatches ?? true;
  const watch = createInstallChangeWatch({
    inMemory:       IN_MEMORY,
    versionsOnDisk: () => {
      answers.push(current);
      return current;
    },
    manifestMatches: () => manifestMatches,
    landingMark:     () => landingMark,
  });
  return {
    watch,
    answers,
    putOnDisk:          (versions: ProgramVersions) => { current = versions; },
    land:               (tip: string) => { landingMark = tip; },
    setManifestMatches: (matches: boolean) => { manifestMatches = matches; },
  };
}

describe('when the on-disk binary is asked', () => {
  test('once at the first look, then only after a sweep or a landing', () => {
    const subject = watchOver(IN_MEMORY);
    expect(subject.watch.installVersionChanged()).toBe(false);
    subject.putOnDisk({ ...IN_MEMORY, installVersion: 18 });
    expect(subject.watch.installVersionChanged()).toBe(false);
    expect(subject.answers.length).toBe(1);
    subject.watch.noteSweep();
    expect(subject.watch.installVersionChanged()).toBe(true);
    subject.putOnDisk({ ...IN_MEMORY, codeVersion: 'code-landed' });
    subject.land('tip-2');
    expect(subject.watch.installVersionChanged()).toBe(false);
    expect(subject.watch.newCodeOnDisk()).toBe(true);
    expect(subject.answers.length).toBe(3);
  });
});

describe('what the watch answers', () => {
  test('an install version on disk that differs holds launches; new code alone is only new code', () => {
    expect(watchOver({ codeVersion: 'code-landed', installVersion: 18 }).watch.installVersionChanged()).toBe(true);
    expect(watchOver({ codeVersion: 'code-landed', installVersion: 18 }).watch.newCodeOnDisk()).toBe(false);
    expect(watchOver({ codeVersion: 'code-landed', installVersion: 17 }).watch.newCodeOnDisk()).toBe(true);
    expect(watchOver(IN_MEMORY).watch.newCodeOnDisk()).toBe(false);
  });

  test('a manifest an update moved is an install change at once, without waiting for a sweep, and clears once it matches again', () => {
    const subject = watchOver(IN_MEMORY);
    expect(subject.watch.installVersionChanged()).toBe(false);
    subject.setManifestMatches(false);
    expect(subject.watch.installVersionChanged()).toBe(true);
    subject.setManifestMatches(true);
    expect(subject.watch.installVersionChanged()).toBe(false);
  });

  test('a binary that gives no answer changes nothing the watch last learned', () => {
    let answer: ProgramVersions | null = { ...IN_MEMORY, installVersion: 18 };
    const watch = createInstallChangeWatch({
      inMemory: IN_MEMORY, versionsOnDisk: () => answer, manifestMatches: () => true, landingMark: () => null
    });
    expect(watch.installVersionChanged()).toBe(true);
    answer = null;
    watch.noteSweep();
    expect(watch.installVersionChanged()).toBe(true);
  });
});

describe('the on-disk binary, on the answers the real one gave', () => {
  const placeholders = { [VERSION_CHECK_RECORDING.BUN_PLACEHOLDER]: EXAMPLE_BUN, [VERSION_CHECK_RECORDING.CHECKOUT_PLACEHOLDER]: EXAMPLE_CHECKOUT };

  function versionsOnRecordedAnswers(programCommand: readonly string[], situation?: string): ProgramVersions | null {
    const recorded = recordedCommandOf(VERSION_CHECK_RECORDING.BOUNDARY, placeholders, situation);
    const spawnSync = spyOn(Bun, 'spawnSync').mockImplementation(((argv: readonly string[]) => recorded.spawnSync(argv)) as unknown as typeof Bun.spawnSync);
    try {
      return versionsFromTheBinary(programCommand, EXAMPLE_CHECKOUT);
    } finally {
      spawnSync.mockRestore();
    }
  }

  test('version --json answers the code version and the install version', () => {
    expect(versionsOnRecordedAnswers([EXAMPLE_BUN, join(EXAMPLE_CHECKOUT, 'agent-progress.ts')]))
      .toEqual({ codeVersion: expect.any(String), installVersion: expect.any(Number) });
  });

  test('a program that cannot start (ENOENT) answers null, and so does no program', () => {
    expect(versionsOnRecordedAnswers([join(EXAMPLE_CHECKOUT, 'missing-program')], VERSION_CHECK_RECORDING.MISSING_SITUATION)).toBeNull();
    expect(versionsFromTheBinary([], EXAMPLE_CHECKOUT)).toBeNull();
  });
});
