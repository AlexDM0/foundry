/**
 * The tools a forge's agents may run. What matters: git is always one, run by every job; a program a prepare step or a gate runs (its
 * fix too, an entity's too) is a tool, and a shell word, a path or a variable is none; with no list of its own a forge approves every
 * program the pipeline runs that the machine has, and with one only what it lists; a launch's tools are the approved ones that were found,
 * git among them only as the program folders hold it; a kept or found tool inside a forbidden root is no tool, and a launch states the
 * kept one it leaves off.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline }               from '../../domain/tracker-model/@types/Pipeline.ts';
import type { ExecutableResolver }     from '../../lib/executable-resolver/ExecutableResolver.ts';
import type { ToolSearch }             from '../../lib/program-folders/utils/ProgramSearchUtil.ts';
import { createPosixShellLine }        from '../../lib/shell-line/PosixShellLine.ts';
import { AgentTools, type ToolPlaces } from './AgentTools.ts';

const SHELL_LINE = createPosixShellLine({ userShell: () => '/bin/sh' });

function searchIn(folders: readonly string[], fileNamesOf: (name: string) => readonly string[] = (name) => [name]): ToolSearch {
  return { folders, pathsOf: (name) => folders.flatMap((folder) => fileNamesOf(name).map((fileName) => `${folder}/${fileName}`)) };
}

const FOLDERS = searchIn(['/home/example/.bun/bin', '/usr/bin']);

const PROGRAMS: ReadonlySet<string> = new Set(['/home/example/.bun/bin/bun', '/usr/bin/git', '/usr/bin/make', '/opt/example/bin/gh']);

const RESOLVER: ExecutableResolver = {
  absolutePathOf: () => ({ verdict: 'refused', cause: 'not-on-search-path', name: 'example' }),
  programAt:      (path) => (PROGRAMS.has(path) ? { verdict: 'found', path } : { verdict: 'refused', cause: 'not-there', path }),
};

const PLACES: ToolPlaces = {
  shellLine: SHELL_LINE, search: FOLDERS, resolver: RESOLVER, forbiddenRoots: []
};

const FORBIDDEN_ROOT = '/home/example/repository';

const PIPELINE: Pipeline = {
  version: 5,
  prepare: [{ name: 'install', run: 'cd web && bun install --frozen-lockfile' }],
  gates:   [
    { name: 'types', run: 'bun run typecheck', fix: 'make fix' },
    { name: 'integration', run: 'EXAMPLE=1 docker compose up && ./scripts/check.sh && echo done' },
  ],
  phases: { build: ['types', 'integration'], review: [], merge: [] },
};

describe('toolUsesOf', () => {
  test('names git for every job, then each program the prepare steps and gates run, with where each runs it', () => {
    const uses = AgentTools.toolUsesOf(PIPELINE, SHELL_LINE);
    expect([...uses.keys()]).toEqual(['git', 'bun', 'make', 'docker']);
    expect(uses.get('bun')).toEqual([{ kind: 'prepare', name: 'install', entity: null }, { kind: 'gate', name: 'types', entity: null }]);
    expect(uses.get('make')).toEqual([{ kind: 'gate', name: 'types', entity: null }]);
    expect(uses.get('git')).toEqual([{ kind: 'every-job' }]);
  });

  test('names an entity\'s programs with the entity, and with no pipeline only git', () => {
    const overEntities: Pipeline = {
      ...PIPELINE,
      prepare:  [],
      gates:    [],
      phases:   { build: [], review: [], merge: [] },
      entities: {
        web: {
          kind: 'root', home: ['/'], prepare: [], gates: [{ name: 'lint', run: 'bun run lint' }], phases: { build: ['lint'], review: [], merge: [] }
        }
      },
    };
    expect(AgentTools.toolUsesOf(overEntities, SHELL_LINE).get('bun')).toEqual([{ kind: 'gate', name: 'lint', entity: 'web' }]);
    expect([...AgentTools.toolUsesOf(null, SHELL_LINE).keys()]).toEqual(['git']);
  });
});

describe('toolFactsOf', () => {
  test('with no list of its own every program the machine has is approved, and one it lacks is listed missing', () => {
    expect(AgentTools.toolFactsOf(PIPELINE, PLACES).map(({ name, path, approved }) => [name, path, approved])).toEqual([
      ['git', '/usr/bin/git', true],
      ['bun', '/home/example/.bun/bin/bun', true],
      ['make', '/usr/bin/make', true],
      ['docker', null, false],
    ]);
  });

  test('with a list only what it lists is approved, at its kept path, a listed tool no step runs included, and git always', () => {
    const listed: Pipeline = { ...PIPELINE, tools: [{ name: 'bun', path: '/home/example/.bun/bin/bun' }, { name: 'gh', path: '/opt/example/bin/gh' }] };
    expect(AgentTools.toolFactsOf(listed, PLACES).map(({ name, path, approved }) => [name, path, approved])).toEqual([
      ['git', '/usr/bin/git', true],
      ['bun', '/home/example/.bun/bin/bun', true],
      ['make', '/usr/bin/make', false],
      ['docker', null, false],
      ['gh', '/opt/example/bin/gh', true],
    ]);
  });
});

describe('foundPathOf', () => {
  test('finds a tool under the first of the platform\'s file names a folder holds, as a Windows program is found by its extension', () => {
    const windowsLike = searchIn(['/opt/example/bin', '/usr/bin'], (name) => [`${name}.exe`, `${name}.cmd`, name]);
    const resolver: ExecutableResolver = { ...RESOLVER, programAt: (path) => (path === '/usr/bin/make.cmd' ? { verdict: 'found', path } : RESOLVER.programAt(path, [])) };
    expect(AgentTools.foundPathOf('make', windowsLike, resolver, [])).toBe('/usr/bin/make.cmd');
    expect(AgentTools.foundPathOf('docker', windowsLike, resolver, [])).toBeNull();
  });
});

describe('launchToolsOf', () => {
  test('gives a launch the approved tools that were found, and no git where no program folder holds it', () => {
    expect(AgentTools.launchToolsOf(PIPELINE, { ...PLACES, search: searchIn(['/home/example/.bun/bin']) })).toEqual({
      tools:        [{ name: 'bun', path: '/home/example/.bun/bin/bun' }],
      refusedTools: [],
    });
  });

  test('leaves off a kept tool inside a forbidden root, saying why, and finds no tool there by its name', () => {
    const plantedPath = `${FORBIDDEN_ROOT}/bin/bun`;
    const resolver: ExecutableResolver = {
      ...RESOLVER,
      programAt: (path, forbiddenRoots) => (forbiddenRoots.some((root) => path.startsWith(`${root}/`))
        ? {
          verdict: 'refused', cause: 'inside-forbidden-root', path, forbiddenRoot: FORBIDDEN_ROOT
        }
        : path === plantedPath ? { verdict: 'found', path } : RESOLVER.programAt(path, [])),
    };
    const places: ToolPlaces = { ...PLACES, resolver, forbiddenRoots: [FORBIDDEN_ROOT] };
    const planted: Pipeline = { ...PIPELINE, tools: [{ name: 'git', path: '/usr/bin/git' }, { name: 'bun', path: plantedPath }] };
    expect(AgentTools.launchToolsOf(planted, places)).toEqual({
      tools:        [{ name: 'git', path: '/usr/bin/git' }],
      refusedTools: [{ name: 'bun', path: plantedPath, forbiddenRoot: FORBIDDEN_ROOT }],
    });
    expect(AgentTools.foundPathOf('bun', searchIn([`${FORBIDDEN_ROOT}/bin`]), resolver, [FORBIDDEN_ROOT])).toBeNull();
  });
});
