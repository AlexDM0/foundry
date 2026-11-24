/**
 * The tools a forge's agents may run. What matters: git is always one, run by every job; a program a prepare step or a gate runs (its
 * fix too, an entity's too) is a tool, and a shell word, a path or a variable is none; with no list of its own a forge approves every
 * program the pipeline runs that the machine has, and with one only what it lists; a launch's tools are the approved ones that were found.
 */
import { describe, expect, test } from 'bun:test';

import type { ExecutableResolver } from '../../lib/executable-resolver/ExecutableResolver.ts';
import { createPosixShellLine }    from '../../lib/shell-line/PosixShellLine.ts';
import type { Pipeline }           from '../../lib/tracker-model/@types/Pipeline.ts';
import { AgentTools }              from './AgentTools.ts';

const SHELL_LINE = createPosixShellLine({ userShell: () => '/bin/sh' });

const FOLDERS = ['/home/example/.bun/bin', '/usr/bin'];

const PROGRAMS: ReadonlySet<string> = new Set(['/home/example/.bun/bin/bun', '/usr/bin/git', '/usr/bin/make', '/opt/example/bin/gh']);

const RESOLVER: ExecutableResolver = {
  absolutePathOf: () => ({ verdict: 'refused', cause: 'not-on-search-path', reason: 'example' }),
  programAt:      (path) => (PROGRAMS.has(path) ? { verdict: 'found', path } : { verdict: 'refused', cause: 'not-there', reason: 'example' }),
};

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
    expect(AgentTools.toolFactsOf(PIPELINE, SHELL_LINE, FOLDERS, RESOLVER).map(({ name, path, approved }) => [name, path, approved])).toEqual([
      ['git', '/usr/bin/git', true],
      ['bun', '/home/example/.bun/bin/bun', true],
      ['make', '/usr/bin/make', true],
      ['docker', null, false],
    ]);
  });

  test('with a list only what it lists is approved, at its kept path, a listed tool no step runs included, and git always', () => {
    const listed: Pipeline = { ...PIPELINE, tools: [{ name: 'bun', path: '/home/example/.bun/bin/bun' }, { name: 'gh', path: '/opt/example/bin/gh' }] };
    expect(AgentTools.toolFactsOf(listed, SHELL_LINE, FOLDERS, RESOLVER).map(({ name, path, approved }) => [name, path, approved])).toEqual([
      ['git', '/usr/bin/git', true],
      ['bun', '/home/example/.bun/bin/bun', true],
      ['make', '/usr/bin/make', false],
      ['docker', null, false],
      ['gh', '/opt/example/bin/gh', true],
    ]);
  });
});

describe('launchToolsOf', () => {
  test('gives a launch the approved tools that were found, git from the lookup where no folder holds it', () => {
    expect(AgentTools.launchToolsOf(PIPELINE, SHELL_LINE, ['/home/example/.bun/bin'], RESOLVER, '/opt/git/bin/git')).toEqual([
      { name: 'git', path: '/opt/git/bin/git' },
      { name: 'bun', path: '/home/example/.bun/bin/bun' },
    ]);
  });
});
