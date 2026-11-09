/**
 * The ids a recorded move reads from its command line. What matters: an `--incident` value is checked as `I<n>` exactly as a positional
 * incident id is, with the same wording, so a mistyped one is refused before anything is recorded rather than stored and never matched;
 * either id is accepted in lower case and stored upper-cased, and neither accepts the number 0 or a leading zero, which the Board never writes.
 */
import { describe, expect, test } from 'bun:test';

import { incidentIdOf, incidentOf, jobIdOf } from './RecordedIncidentMove.ts';
import { createArgumentParser }              from './arguments/ArgumentParser.ts';

const USAGE = 'example usage';

function refusalMessageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return 'no refusal';
}

describe('an --incident value', () => {
  test('is optional: without it the move names no incident', () => {
    expect(incidentOf(createArgumentParser(['J4']), USAGE)).toEqual({});
  });

  test('is stored upper-cased when it is an incident id', () => {
    expect(incidentOf(createArgumentParser(['J4', '--incident', 'i7']), USAGE)).toEqual({ incidentId: 'I7' });
  });

  test('is refused, worded as a positional incident id is, when it is not an incident id', () => {
    const positionalWording = refusalMessageOf(() => incidentIdOf('X7', USAGE));
    expect(refusalMessageOf(() => incidentOf(createArgumentParser(['J4', '--incident', 'X7']), USAGE))).toBe(positionalWording);
    expect(positionalWording).toBe(`"X7" is not an incident id. Write I and its number, as I4.\n  Usage: ${USAGE}`);
    expect(refusalMessageOf(() => incidentOf(createArgumentParser(['J4', '--incident', 'I0']), USAGE))).toContain('"I0" is not an incident id.');
  });
});

describe('a job id', () => {
  test('is stored upper-cased', () => {
    expect(jobIdOf('j12', USAGE)).toBe('J12');
  });

  test('is refused when it is missing, zero or not J and a number', () => {
    expect(refusalMessageOf(() => jobIdOf(undefined, USAGE))).toBe(`Name the job, as J4.\n  Usage: ${USAGE}`);
    expect(refusalMessageOf(() => jobIdOf('J0', USAGE))).toContain('"J0" is not a job id.');
    expect(refusalMessageOf(() => jobIdOf('J04', USAGE))).toContain('"J04" is not a job id.');
    expect(refusalMessageOf(() => jobIdOf('I4', USAGE))).toContain('"I4" is not a job id.');
  });
});
