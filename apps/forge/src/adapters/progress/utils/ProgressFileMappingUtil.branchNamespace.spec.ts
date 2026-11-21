/**
 * The branch namespace in progress.json. What matters: the key is written only once set, so the file of every board that never set one
 * stays byte-identical; a file with it round-trips byte for byte; and a namespace git or a case-folding file system could not keep apart
 * makes the file unreadable.
 */
import { expect, test } from 'bun:test';

import { JsonTextUtil }               from '../../../shared/utils/JsonTextUtil.ts';
import { emptyProgress }              from '../../../testing/ProgressFixtures.ts';
import { ProgressFileMappingUtil }    from './ProgressFileMappingUtil.ts';
import { ProgressFileValidationUtil } from './ProgressFileValidationUtil.ts';

function storedTextWithNamespace(branchNamespace: unknown): string {
  const progress = emptyProgress();
  return JsonTextUtil.storedFileTextOf({
    version:    3,
    trackerId:  progress.trackerId,
    project:    progress.project,
    startedAt:  progress.startedAt,
    view:       progress.view,
    nextTaskId: progress.nextTaskId,
    branchNamespace,
    tasks:      [],
  });
}

function roundTripOf(text: string): string {
  const reading = ProgressFileValidationUtil.readingOf(JSON.parse(text));
  if (reading.verdict === 'unreadable') throw new Error(reading.reason);
  return JsonTextUtil.storedFileTextOf(ProgressFileMappingUtil.storedDocumentOf(ProgressFileMappingUtil.progressOf(reading.document)));
}

test('a file holding a branch namespace is written back byte for byte', () => {
  const text = storedTextWithNamespace('web');
  expect(roundTripOf(text)).toBe(text);
});

test('a board that never set a namespace stores none', () => {
  const text = JsonTextUtil.storedFileTextOf(ProgressFileMappingUtil.storedDocumentOf(emptyProgress()));
  expect(roundTripOf(text)).toBe(text);
  expect(text).not.toContain('branchNamespace');
});

test('a namespace that is not lower-case letters, digits and inner dashes makes the file unreadable, naming the key', () => {
  for (const branchNamespace of ['Web', 'web/api', '', 7]) {
    expect(ProgressFileValidationUtil.readingOf(JSON.parse(storedTextWithNamespace(branchNamespace))), String(branchNamespace))
      .toMatchObject({ verdict: 'unreadable', reason: expect.stringContaining('branchNamespace is') });
  }
});
