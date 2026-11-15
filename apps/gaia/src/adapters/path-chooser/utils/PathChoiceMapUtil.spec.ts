/**
 * The chooser's answer read in. What matters: a chosen folder loses only its last separator, the root folder and a file keep theirs, an
 * empty answer is a cancel and never a path, and every run that is no clean answer is named for why, never read as a choice.
 */
import { describe, expect, test } from 'bun:test';

import { PathChoiceMapUtil } from './PathChoiceMapUtil.ts';

function finishedRun(exitCode: number, standardOutput: string): Parameters<typeof PathChoiceMapUtil.verdictOfRun>[0] {
  return {
    verdict: 'finished', exitCode, standardOutput, standardError: '',
  };
}

describe('chosenPathOf', () => {
  test('drops the line end and a folder\'s last separator', () => {
    expect(PathChoiceMapUtil.chosenPathOf('/Users/example/Development/example-storefront/\n')).toBe('/Users/example/Development/example-storefront');
  });

  test('keeps a file\'s path whole', () => {
    expect(PathChoiceMapUtil.chosenPathOf('/Users/example/.bun/bin/forge\n')).toBe('/Users/example/.bun/bin/forge');
  });

  test('keeps the root folder\'s only separator', () => {
    expect(PathChoiceMapUtil.chosenPathOf('/\n')).toBe('/');
  });

  test('reads an empty line as no path at all', () => {
    expect(PathChoiceMapUtil.chosenPathOf('\n')).toBe('');
  });
});

describe('verdictOfRun', () => {
  test('answers chosen with the path of a clean answer', () => {
    expect(PathChoiceMapUtil.verdictOfRun(finishedRun(0, '/Users/example/Development/example-storefront/\n')))
      .toEqual({ verdict: 'chosen', path: '/Users/example/Development/example-storefront' });
  });

  test('answers cancelled for the empty line the script answers on a cancel', () => {
    expect(PathChoiceMapUtil.verdictOfRun(finishedRun(0, '\n'))).toEqual({ verdict: 'cancelled' });
  });

  test('answers failed for any exit but 0, whatever it wrote', () => {
    expect(PathChoiceMapUtil.verdictOfRun(finishedRun(1, '/Users/example/Development/\n'))).toEqual({ verdict: 'failed' });
  });

  test('answers timed-out when nobody answered within the bound', () => {
    expect(PathChoiceMapUtil.verdictOfRun({ verdict: 'timed-out' })).toEqual({ verdict: 'timed-out' });
  });

  test('answers chooser-not-found on a machine without osascript, and failed when the folder to run in is gone', () => {
    expect(PathChoiceMapUtil.verdictOfRun({ verdict: 'not-found', missing: 'program' })).toEqual({ verdict: 'chooser-not-found' });
    expect(PathChoiceMapUtil.verdictOfRun({ verdict: 'not-found', missing: 'working-directory' })).toEqual({ verdict: 'failed' });
  });
});
