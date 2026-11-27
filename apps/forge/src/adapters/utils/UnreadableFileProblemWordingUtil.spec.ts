/**
 * The served words of an unreadable file's incident. What matters: a problem stored as facts serves as `file` and today's `reason`, numbers
 * stored as text included; facts stored with no problem, and another incident's, serve as they are stored.
 */
import { expect, test } from 'bun:test';

import { StoredFileProblemFactsUtil }       from '../../shared/utils/StoredFileProblemFactsUtil.ts';
import { UnreadableFileProblemWordingUtil } from './UnreadableFileProblemWordingUtil.ts';

const FILE = 'jobs/J2/start.json';

test.each([
  [{ code: 'version-differs', field: 'version', expectedVersion: 1 } as const, 'its version is not 1'],
  [{ code: 'not-json', parserError: 'JSON Parse error: Unexpected EOF' } as const, 'it is not valid JSON (JSON Parse error: Unexpected EOF)'],
  [{ code: 'field-is-not', field: 'resume', expected: 'a-count' } as const, 'its "resume" is not a count'],
  [{ code: 'field-is-not', field: 'launchSnapshot.refs', expected: 'a-record-of-commits' } as const, 'its "launchSnapshot.refs" is not a record of commits'],
  [{ code: 'not-the-phase', field: 'phase', expectedPhase: 'build' } as const, 'its "phase" is not the phase "build"'],
  [{ code: 'chat-not-an-object', field: 'chats[1]' } as const, 'its chats[1] is not an object'],
])('a problem stored as facts serves as the file and its sentence: %p', (problem, reason) => {
  const facts = { file: FILE, ...StoredFileProblemFactsUtil.factsOf(problem) };
  expect(UnreadableFileProblemWordingUtil.wordedIncidentFactsOf({ kind: 'system-file-unreadable', facts })).toEqual({ file: FILE, reason });
});

test('facts stored with a reason, and another incident\'s facts, serve as they are stored', () => {
  const storedWithAReason = { file: FILE, reason: 'its version is not 1' };
  expect(UnreadableFileProblemWordingUtil.wordedIncidentFactsOf({ kind: 'system-file-unreadable', facts: storedWithAReason })).toEqual(storedWithAReason);
  expect(UnreadableFileProblemWordingUtil.wordedIncidentFactsOf({ kind: 'blocked', facts: { problem: 'example' } })).toEqual({ problem: 'example' });
});
