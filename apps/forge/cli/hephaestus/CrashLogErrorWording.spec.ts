/** A crash log reads as it did before refusals were typed: a refusal's message is its code, so the crash log keeps its sentence. */
import { describe, expect, test } from 'bun:test';

import { OperationRefusal } from '../../src/shared/OperationRefusal.ts';
import { crashLogErrorOf }  from './CrashLogErrorWording.ts';

describe('the error a crash log keeps', () => {
  test('an uncaught typed refusal keeps the sentence its plain throw had', () => {
    const thrown = new OperationRefusal('unrepaired', { kind: 'merge-job-holds-no-slot', jobId: 'J4' });

    expect(crashLogErrorOf('uncaught-exception', thrown)).toMatchObject({ origin: 'uncaught-exception', name: 'OperationRefusal', message: 'Merge job J4 holds no slot.' });
  });

  test('a rejection carrying a refusal of words keeps those words', () => {
    const thrown = new OperationRefusal('unrepaired', 'job J7 has no readable child instance or cursor');
    const error  = crashLogErrorOf('unhandled-rejection', thrown);

    expect(error.message).toBe('job J7 has no readable child instance or cursor');
  });

  test('any other throw keeps its own name and message', () => {
    const uncaught = crashLogErrorOf('uncaught-exception', new RangeError('Example uncaught error'));

    expect(uncaught).toMatchObject({ origin: 'uncaught-exception', name: 'RangeError', message: 'Example uncaught error' });
    expect(crashLogErrorOf('unhandled-rejection', 'a bare string')).toEqual({
      origin: 'unhandled-rejection', name: 'string', message: 'a bare string', stack: null
    });
  });
});
