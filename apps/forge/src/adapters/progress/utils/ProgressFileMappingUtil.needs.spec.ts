/**
 * The needs build jobs declared, in progress.json. What matters: the key is written only once a job declared a need, so the file of every
 * board without one, every forge without entities among them, stays byte-identical; a file holding needs round-trips byte for byte, a key
 * this build does not know inside a need included; and a need of the wrong shape makes the file unreadable, naming its field.
 */
import { expect, test } from 'bun:test';

import { JsonTextUtil }               from '../../../shared/utils/JsonTextUtil.ts';
import { emptyProgress }              from '../../../testing/ProgressFixtures.ts';
import { ProgressFileProblemWording } from '../ProgressFileProblemWording.ts';
import { wordedReadingOf }            from '../testing/WordedProgressProblem.ts';
import { ProgressFileMappingUtil }    from './ProgressFileMappingUtil.ts';
import { ProgressFileValidationUtil } from './ProgressFileValidationUtil.ts';

const NEED = {
  jobId:     'J4',
  ticketIds: ['003'],
  entity:    'design-system',
  title:     'Export the basket total',
  body:      '## Acceptance\n\nA1. The web app reads the basket total.\n\n## Brief\n\nAlex Example needs the total.\n',
};

function storedTextWithNeeds(needs: unknown): string {
  const progress = emptyProgress();
  return JsonTextUtil.storedFileTextOf({
    version:    3,
    trackerId:  progress.trackerId,
    project:    progress.project,
    startedAt:  progress.startedAt,
    view:       progress.view,
    nextTaskId: progress.nextTaskId,
    tasks:      [],
    needs,
  });
}

function roundTripOf(text: string): string {
  const reading = ProgressFileValidationUtil.readingOf(JSON.parse(text));
  if (reading.verdict === 'unreadable') throw new Error(ProgressFileProblemWording.sentenceOf(reading.problem));
  return JsonTextUtil.storedFileTextOf(ProgressFileMappingUtil.storedDocumentOf(ProgressFileMappingUtil.progressOf(reading.document)));
}

test('a file holding needs is written back byte for byte, a key this build does not know kept in its place', () => {
  const text = storedTextWithNeeds([NEED, {
    ...NEED, title: 'Pin the lockfile', laterKey: true, entity: 'root'
  }]);
  expect(roundTripOf(text)).toBe(text);
});

test('a board where no job declared a need stores no needs key', () => {
  const text = JsonTextUtil.storedFileTextOf(ProgressFileMappingUtil.storedDocumentOf(emptyProgress()));
  expect(roundTripOf(text)).toBe(text);
  expect(text).not.toContain('needs');
});

test('the needs read are the model\'s needs', () => {
  const reading = ProgressFileValidationUtil.readingOf(JSON.parse(storedTextWithNeeds([NEED])));
  if (reading.verdict === 'unreadable') throw new Error(ProgressFileProblemWording.sentenceOf(reading.problem));
  expect(ProgressFileMappingUtil.progressOf(reading.document).needs).toEqual([NEED]);
});

test.each([
  ['needs that are no list', { needs: 'J4' }, 'needs is present but not an array'],
  ['a need that is no object', { needs: ['J4'] }, 'needs[0] is not an object'],
  ['a job id of the wrong shape', { needs: [{ ...NEED, jobId: '4' }] }, 'needs[0].jobId is "4"'],
  ['ticket ids that are no list of text', { needs: [{ ...NEED, ticketIds: [3] }] }, 'needs[0].ticketIds is not a list of ticket ids'],
  ['a body that is no text', { needs: [{ ...NEED, body: null }] }, 'needs[0].body is not a string'],
] as const)('%s makes the file unreadable, naming the field', (_caseName, document, reason) => {
  expect(wordedReadingOf(JSON.parse(storedTextWithNeeds(document.needs))))
    .toMatchObject({ verdict: 'unreadable', reason: expect.stringContaining(reason) });
});
