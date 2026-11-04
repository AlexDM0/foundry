/**
 * Records what the native executable resolver answers for a name in the one folder of a planted `PATH` and for a name in no folder of it.
 * What matters is the found path as the resolver spells it, and the refusal of a missing name; the lookup runs in a child process, since
 * `PATH` is read from the environment.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join }                                from 'node:path';

import {
  afterAll,
  beforeAll,
  expect,
  test
} from 'bun:test';

import { jsonPrintedByAChildProcess }                                                  from './JsonPrintedByAChildProcess.ts';
import { recordAnswer }                                                                from './RecordedAnswers.ts';
import { EXECUTABLE_CALL_SHAPES, PLANTED_EXECUTABLE_NAME, RECORDED_GATE_PLACEHOLDERS } from './RecordedGateLines.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory }                     from './ScratchWorkspace.ts';

const MISSING_EXECUTABLE_NAME = 'example-missing-gate-tool';
const EXECUTABLE_MODE = 0o755;

let scratch = '';
let plantedFolder = '';

beforeAll(() => {
  scratch = createCanonicalScratchDirectory('recorded-executable-lookup');
  plantedFolder = join(scratch, 'bin');
  mkdirSync(plantedFolder, { recursive: true });
  writeFileSync(join(plantedFolder, PLANTED_EXECUTABLE_NAME), '#!/bin/sh\n');
  chmodSync(join(plantedFolder, PLANTED_EXECUTABLE_NAME), EXECUTABLE_MODE);
});

afterAll(() => {
  removeScratchDirectory(scratch);
});

function nativeAnswerOf(name: string): unknown {
  const resolverModule = JSON.stringify(join(import.meta.dir, '..', 'lib', 'executable-resolver', 'ExecutableResolverFor.ts'));
  return jsonPrintedByAChildProcess({ PATH: plantedFolder }, [
    `process.chdir(${JSON.stringify(scratch)});`,
    `const { executableResolverFor } = await import(${resolverModule});`,
    `console.log(JSON.stringify(executableResolverFor(process.platform).absolutePathOf(${JSON.stringify(name)}, [])));`,
  ].join('\n'));
}

function asRecorded(answer: unknown): unknown {
  return JSON.parse(JSON.stringify(answer).replaceAll(scratch, RECORDED_GATE_PLACEHOLDERS.SCRATCH));
}

test('a name in the planted PATH folder is found there', () => {
  const answer = nativeAnswerOf(PLANTED_EXECUTABLE_NAME);

  expect(answer).toEqual({ verdict: 'found', path: join(plantedFolder, PLANTED_EXECUTABLE_NAME) });
  recordAnswer(EXECUTABLE_CALL_SHAPES.ON_A_PLANTED_PATH, asRecorded(answer));
});

test('a name in no PATH folder is refused as not on the search path', () => {
  const answer = nativeAnswerOf(MISSING_EXECUTABLE_NAME);

  expect(answer).toMatchObject({ verdict: 'refused', cause: 'not-on-search-path' });
  recordAnswer(EXECUTABLE_CALL_SHAPES.MISSING, asRecorded(answer));
});
