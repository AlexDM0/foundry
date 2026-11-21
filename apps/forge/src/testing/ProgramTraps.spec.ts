/**
 * What matters: a trapped program reached in the spec's own process, or by a binary it spawns, runs the recording stub, never the real
 * program, and the attempt fails the case naming the program. `Bun.which` and a spawn without `env` read the environment from process
 * start, so the guard hands both the current one; each form is planted here against gpgconf, which a case may run, and claude only
 * resolved, never run. The release is derived from `BOUNDARY_SPECS`: it lets the gpg boundary's real-system spec through and nothing else,
 * and the specs that call it are exactly the released ones. A resolution is checked before gpgconf runs, so a failing case never starts
 * the real one.
 */
import { delimiter, join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { hostExecutableResolver }       from '../lib/executable-resolver/ExecutableResolverFor.ts';
import { GpgDirectories }               from '../services/hephaestus/GpgDirectories.ts';
import { environmentCopy }              from '../shared/Environment.ts';
import { BOUNDARY_SPECS }               from './BoundarySpecs.ts';
import { repositoryRootOfThisCheckout } from './ImportGraph.ts';
import {
  failOnAnyTrappedProgramAttempt,
  programTrapFolders,
  releaseTrappedProgramForThisSpecFile,
  trapFoldersOf,
  trapReleaseVerdictOf,
  TRAPPED_PROGRAMS,
  type TrappedProgram,
  withTheEnvironment,
  withTheSearchPath
} from './ProgramTraps.ts';
import { repositoryTypeScriptSources } from './RepositorySources.ts';

const GPG_BOUNDARY_SPEC = 'src/services/hephaestus/GpgDirectories.integration.spec.ts';
/** This spec calls the release only to watch it refused. */
const THIS_SPEC = 'src/testing/ProgramTraps.spec.ts';
const EXAMPLE_HOME = '/home/alex-example';
const EXAMPLE_SEARCH_PATH = '/example/bin';
const LISTED_SPECS = [...new Set(BOUNDARY_SPECS.flatMap(({ specs }) => specs))];

function stubPathOf(program: TrappedProgram): string {
  const [runFolder] = trapFoldersOf(program);
  return join(runFolder ?? '', program);
}

function resolvedOn(program: TrappedProgram, searchPath: string | undefined): string | null {
  return Bun.which(program, { PATH: searchPath ?? '' });
}

describe('a trapped program reached in the spec\'s own process', () => {
  for (const program of TRAPPED_PROGRAMS) {
    test(`the host resolver finds the ${program} stub ahead of the real program`, () => {
      expect(hostExecutableResolver().absolutePathOf(program, [])).toEqual({ verdict: 'found', path: stubPathOf(program) });
    });
  }

  test('the real gpgconf read runs the stub, answers as a missing gpgconf, and the attempt fails the case naming gpgconf', () => {
    expect(hostExecutableResolver().absolutePathOf('gpgconf', [])).toEqual({ verdict: 'found', path: stubPathOf('gpgconf') });
    expect(GpgDirectories.read(EXAMPLE_HOME)).toBeNull();
    expect(() => failOnAnyTrappedProgramAttempt()).toThrow(/gpgconf executed in .* with arguments: --list-dirs/);
    expect(() => failOnAnyTrappedProgramAttempt()).not.toThrow();
  });

  test('a lookup naming no search path is handed the current one, and one naming its own keeps it', () => {
    expect(withTheSearchPath(['gpgconf'], EXAMPLE_SEARCH_PATH)).toEqual(['gpgconf', { PATH: EXAMPLE_SEARCH_PATH }]);
    expect(withTheSearchPath(['gpgconf', { cwd: '/' }], EXAMPLE_SEARCH_PATH)).toEqual(['gpgconf', { cwd: '/', PATH: EXAMPLE_SEARCH_PATH }]);
    expect(withTheSearchPath(['gpgconf', { PATH: '/own/bin' }], EXAMPLE_SEARCH_PATH)).toEqual(['gpgconf', { PATH: '/own/bin' }]);
  });
});

describe('a trapped program reached by a spawned binary', () => {
  for (const program of TRAPPED_PROGRAMS) {
    test(`a spawn with no env of its own gets the run's PATH, on which ${program} is the stub`, () => {
      const [, options] = withTheEnvironment([['example-binary']], environmentCopy()) as [string[], { env: Record<string, string> }];
      expect(resolvedOn(program, options.env['PATH'])).toBe(stubPathOf(program));
      const [objectForm] = withTheEnvironment([{ cmd: ['example-binary'] }], environmentCopy()) as [{ env: Record<string, string> }];
      expect(resolvedOn(program, objectForm.env['PATH'])).toBe(stubPathOf(program));
    });
  }

  test('a spawn with an env of its own keeps it, the gap the trap leaves to `cli/testing/CliProcess.ts`', () => {
    const ownEnvironment = { PATH: EXAMPLE_SEARCH_PATH };
    expect(withTheEnvironment([['example-binary'], { env: ownEnvironment }], environmentCopy())).toEqual([['example-binary'], { env: ownEnvironment }]);
  });

  test('every trap leads the run\'s PATH, the recording stubs ahead of the lasting ones', () => {
    const folders = programTrapFolders();
    expect(folders).toHaveLength(TRAPPED_PROGRAMS.length * 2);
    expect(environmentCopy()['PATH']?.split(delimiter).slice(0, folders.length)).toEqual([...folders]);
  });
});

describe('the release of a trap', () => {
  test('gpgconf is released for the gpg boundary\'s real-system spec', () => {
    expect(trapReleaseVerdictOf('gpgconf', GPG_BOUNDARY_SPEC)).toEqual({ verdict: 'released' });
  });

  test('gpgconf stays trapped for every other listed spec and for a default spec', () => {
    const released = [...LISTED_SPECS, 'src/services/hephaestus/GpgDirectories.spec.ts']
      .filter((specPath) => trapReleaseVerdictOf('gpgconf', specPath).verdict === 'released');
    expect(LISTED_SPECS.length).toBeGreaterThan(1);
    expect(released).toEqual([GPG_BOUNDARY_SPEC]);
  });

  test('claude stays trapped for every listed spec', () => {
    expect(LISTED_SPECS.filter((specPath) => trapReleaseVerdictOf('claude', specPath).verdict === 'released')).toEqual([]);
  });

  test('a refused release throws as the file loads', () => {
    expect(() => releaseTrappedProgramForThisSpecFile('gpgconf', import.meta.path)).toThrow(`The gpgconf trap stays on: ${THIS_SPEC} is no real-system spec.`);
    expect(() => releaseTrappedProgramForThisSpecFile('claude', join(repositoryRootOfThisCheckout(), GPG_BOUNDARY_SPEC))).toThrow('no spec may take the claude trap off');
  });

  test('the specs that take a trap off are exactly the ones released, both ways', () => {
    const releaseCall = new RegExp(`${releaseTrappedProgramForThisSpecFile.name}\\('([a-z]+)'`, 'g');
    const callers = repositoryTypeScriptSources(repositoryRootOfThisCheckout()).filter(({ path }) => path !== THIS_SPEC)
      .flatMap(({ path, text }) => [...text.matchAll(releaseCall)].map((match) => `${match[1] ?? ''} ${path}`));
    const released = TRAPPED_PROGRAMS.flatMap((program) => LISTED_SPECS
      .filter((specPath) => trapReleaseVerdictOf(program, specPath).verdict === 'released').map((specPath) => `${program} ${specPath}`));
    expect(callers.length).toBeGreaterThan(0);
    expect(callers.sort()).toEqual(released.sort());
  });
});
