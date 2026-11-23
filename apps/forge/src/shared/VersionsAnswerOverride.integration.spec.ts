/**
 * What the versions test setting means at each value it comes with. Each case runs in a child process, so the setting is read from an
 * environment the spec never writes in-process.
 */
import { join }         from 'node:path';
import { expect, test } from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from '../testing/ChildProcessCaseTimeout.ts';
import { jsonPrintedByAChildProcess }              from '../testing/JsonPrintedByAChildProcess.ts';
import { VERSIONS_ANSWER_VARIABLE }                from './Environment.ts';
import { PRODUCT_NAMES }                           from './constants/ProductNames.ts';

const VERSIONS_ANSWER_MODULE_PATH = join(import.meta.dir, 'VersionsAnswerOverride.ts');

function versionsAnswerSeenByAChildProcess(childEnvironment: Record<string, string>): unknown {
  const source = [
    `const loaded = await import(${JSON.stringify(VERSIONS_ANSWER_MODULE_PATH)});`,
    'try { console.log(JSON.stringify(loaded.versionsAnswerOverride() ?? null)); }',
    'catch (error) { console.log(JSON.stringify(error.name)); }',
  ].join('\n');
  return jsonPrintedByAChildProcess(childEnvironment, source);
}

test('the versions answer is the current and the minimum supported version, unset or blank is none, and any other value is refused', () => {
  expect(VERSIONS_ANSWER_VARIABLE).toBe(`${PRODUCT_NAMES.ENVIRONMENT_PREFIX}VERSIONS_ANSWER`);
  expect(versionsAnswerSeenByAChildProcess({ [VERSIONS_ANSWER_VARIABLE]: '1.3/1.0' })).toEqual({ current: { major: 1, minor: 3 }, minimumSupported: { major: 1, minor: 0 } });
  expect(versionsAnswerSeenByAChildProcess({ [VERSIONS_ANSWER_VARIABLE]: ' 2.1/2.1 ' })).toEqual({ current: { major: 2, minor: 1 }, minimumSupported: { major: 2, minor: 1 } });
  expect(versionsAnswerSeenByAChildProcess({})).toBeNull();
  for (const clearedValue of ['', '  ']) {
    expect(versionsAnswerSeenByAChildProcess({ [VERSIONS_ANSWER_VARIABLE]: clearedValue }), JSON.stringify(clearedValue)).toBeNull();
  }
  for (const refusedValue of ['1.3', '1.3/', '1.0/1.3', '1.3/1.0/0.0', '1.03/1.0', 'v1.3/1.0', '1.3 / 1.0', 'newest']) {
    expect(versionsAnswerSeenByAChildProcess({ [VERSIONS_ANSWER_VARIABLE]: refusedValue }), refusedValue).toBe('OperationRefusal');
  }
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
