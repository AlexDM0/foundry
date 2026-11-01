/**
 * One contract for the `ExecutableResolver` port: an absolute path or a refusal, never a relative answer and never a path inside a forbidden
 * root, a link out of or into one included. The platform without an adapter refuses every name.
 */
import { expect, test } from 'bun:test';

import { type PortClause, runPortContract } from '../../testing/PortContract.ts';
import type { ExecutableResolver }          from './ExecutableResolver.ts';
import { executableResolverFor }            from './ExecutableResolverFor.ts';
import { createPosixExecutableResolver }    from './PosixExecutableResolver.ts';
import { createWindowsExecutableResolver }  from './WindowsExecutableResolver.ts';

const FAKE_SEARCH_PATH: Readonly<Record<string, string>> = {
  'example-tool':  '/opt/example/bin/example-tool',
  'planted-tool':  '/repository/bin/planted-tool',
  'linked-tool':   '/opt/example/bin/linked-tool',
  'relative-tool': 'bin/relative-tool',
  'dotted-tool':   '/opt/example/./dotted-tool',
  'hidden-tool':   '/repository/..hidden/hidden-tool',
  './local-tool':  '/opt/example/local-tool',
};
const FAKE_LINKS: Readonly<Record<string, string>> = { '/opt/example/bin/linked-tool': '/repository/tools/linked-tool' };

const FAKE_PRIMITIVES = {
  lookUp:     (name: string) => (Object.hasOwn(FAKE_SEARCH_PATH, name) ? FAKE_SEARCH_PATH[name] ?? null : null),
  realPathOf: (path: string) => (Object.hasOwn(FAKE_LINKS, path) ? FAKE_LINKS[path] ?? path : path),
};

const CLAUSES: readonly PortClause<ExecutableResolver>[] = [
  {
    claim: 'answers the absolute path of a program on the search path',
    check: (resolver) => {
      expect(resolver.absolutePathOf('example-tool', ['/repository'])).toEqual({ verdict: 'found', path: '/opt/example/bin/example-tool' });
    },
  },
  {
    claim: 'refuses an unknown name, a path for a name, a hit through a relative search folder, and a hit inside a forbidden root, directly or through a link',
    check: (resolver) => {
      for (const name of ['absent-tool', './local-tool', 'relative-tool', 'dotted-tool', 'planted-tool', 'hidden-tool', 'linked-tool']) {
        expect(resolver.absolutePathOf(name, ['/repository']).verdict).toBe('refused');
      }
    },
  },
  {
    claim: 'names the repository root as the reason for a path inside it',
    check: (resolver) => {
      expect(resolver.absolutePathOf('planted-tool', ['/repository'])).toMatchObject({ verdict: 'refused', cause: 'inside-forbidden-root' });
    },
  },
];

runPortContract('ExecutableResolver', [
  { name: 'PosixExecutableResolver on a fake search path', build: () => createPosixExecutableResolver(FAKE_PRIMITIVES) },
  { name: 'WindowsExecutableResolver on a fake search path', build: () => createWindowsExecutableResolver(FAKE_PRIMITIVES) },
], CLAUSES);

test('the native adapter finds a real program by its absolute path', () => {
  const resolution = executableResolverFor('darwin').absolutePathOf('sh', []);
  expect(resolution).toMatchObject({ verdict: 'found', path: expect.stringMatching(/^\/.*\/sh$/) });
});

test('a platform with no adapter refuses every name', () => {
  expect(executableResolverFor('example-platform').absolutePathOf('sh', [])).toMatchObject({ verdict: 'refused', cause: 'no-adapter' });
});
