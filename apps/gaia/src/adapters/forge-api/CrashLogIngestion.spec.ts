/**
 * The crash log ingestion against the crash log a scratch forge wrote and served after it started again (`overseer-fetch-presence`), and a
 * suspected one. What matters: the log reads with its error, the Assistant's job active at the crash and its tail; a board or a log the
 * forge could not read stays `null`, never empty; and a document that does not ingest names its keys.
 */
import { describe, expect, test } from 'bun:test';

import { CrashLogIngestion }      from './CrashLogIngestion.ts';
import { recordedCrashLogBodyOf } from './testing/PresenceDocuments.ts';

const INGESTION = new CrashLogIngestion();

describe('crashLogOf', () => {
  test('reads the crash log the forge wrote for a kill from outside: no error caught, the jobs active then and the tail of its log', () => {
    const recordedBody = recordedCrashLogBodyOf('started-after-a-crash');
    const reading = INGESTION.crashLogOf(recordedBody);
    expect(reading.crashLog).toMatchObject({
      number:     1,
      generation: 1,
      component:  'hephaestus',
      suspected:  false,
      recordedAt: recordedBody['recordedAt'],
      error:      null,
      activeJobs: [{
        jobId: 'J1', kind: 'assistant', ticketIds: [], state: 'running', interruption: null, airlockPhase: null,
      }],
    });
    expect(reading.crashLog?.logTail).toEqual(recordedBody['logTail'] as string[]);
    expect(reading.crashLog?.logTail?.at(-1)).toEndWith('Launched child instance 1 of job J1 (assistant) under Talos.');
  });

  test('reads a suspected crash with its error, and keeps a board and a log the forge could not read unread', () => {
    const suspected = {
      ...recordedCrashLogBodyOf('started-after-a-crash'),
      suspected: true,
      component: 'unknown',
      error:     {
        origin: 'uncaught-exception', name: 'Error', message: 'Example failure.', stack: null
      },
      activeJobs: null,
      logTail:    null,
    };
    expect(INGESTION.crashLogOf(suspected).crashLog).toMatchObject({
      suspected: true,
      component: 'unknown',
      error:     {
        origin: 'uncaught-exception', name: 'Error', message: 'Example failure.', stack: null
      },
      activeJobs: null,
      logTail:    null,
    });
  });

  test('names the keys of a refusal it was handed in place of a log', () => {
    const reading = INGESTION.crashLogOf(recordedCrashLogBodyOf('presence-serving'));
    expect(reading.crashLog).toBeNull();
    expect(reading.crashLog === null && 'reason' in reading ? reading.reason.invalidKeys[0] : null).toBe('number');
  });
});
