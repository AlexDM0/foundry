/** Each refusal's words are the reason the resolver itself gave before it answered a cause and its values. */
import { expect, test } from 'bun:test';

import type { ExecutableRefusal }   from '../lib/executable-resolver/ExecutableResolver.ts';
import { ExecutableRefusalWording } from './ExecutableRefusalWording.ts';

const SENTENCES: readonly (readonly [ExecutableRefusal, string])[] = [
  [{ cause: 'not-a-program-name', name: './example' }, './example is a path, not a program name'],
  [{ cause: 'not-on-search-path', name: 'example' }, 'example is not on the search path'],
  [{ cause: 'relative-search-folder', name: 'example' }, 'example was found relative to the working directory'],
  [{ cause: 'relative-path', path: 'bin/example' }, 'bin/example is not an absolute path'],
  [{ cause: 'inside-forbidden-root', path: '/example/repository/bin/tool', forbiddenRoot: '/example/repository' }, '/example/repository/bin/tool sits inside /example/repository'],
  [{ cause: 'batch-target', path: 'C:\\example\\tool.cmd' }, 'C:\\example\\tool.cmd is a batch file, which takes no quoted or multi-line argument'],
  [{ cause: 'not-there', path: '/opt/example/bin/gh' }, '/opt/example/bin/gh is not there'],
  [{ cause: 'not-executable', path: '/opt/example/bin/gh' }, '/opt/example/bin/gh is not a program this user may run'],
  [{ cause: 'no-adapter', platformName: 'example-os' }, 'no executable resolver exists for the platform example-os'],
];

test.each(SENTENCES.map(([refusal, sentence]) => [refusal.cause, refusal, sentence] as const))('words %s as before', (_cause, refusal, sentence) => {
  expect(ExecutableRefusalWording.sentenceOf(refusal)).toBe(sentence);
});
