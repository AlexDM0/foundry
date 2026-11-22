/**
 * How a forge program's run ends as Gaia's command verdict. What matters: a done update whose restart the live Hephaestus did not take is
 * restart pending, not plain done, since the old code still drives; a pass that was done or not needed leaves the update's own outcome; a
 * refusal keeps the forge's code and sentence for the page contract's mapper to word; and each way the program did not finish is Gaia's
 * own verdict. The failed pass is a value of the internal model: no forge was recorded answering it yet (docs/backlog.md).
 */
import { describe, expect, test } from 'bun:test';

import type {
  ForgeRestart,
  ForgeProgramVerdict,
  ForgeStopAnswer,
  ForgeUpdateAnswer,
} from '../../../adapters/forge-program/@types/ForgeProgramAnswer.ts';

import { ProgramVerdictUtil } from './ProgramVerdictUtil.ts';

function updateDoneWith(restart: ForgeRestart): ForgeProgramVerdict<ForgeUpdateAnswer> {
  return { verdict: 'done', answer: { outcome: 'done', installVersion: 27, restart } };
}

describe('the verdict of an update', () => {
  test('is restart pending when the live Hephaestus did not take the restart', () => {
    expect(ProgramVerdictUtil.verdictOfUpdate(updateDoneWith({ outcome: 'failed', failedStep: 'restart-not-taken' }))).toEqual({ verdict: 'restart-pending' });
  });

  test('is restart pending for a restart that failed at a step the forge does not name yet, since the old code drives either way', () => {
    expect(ProgramVerdictUtil.verdictOfUpdate(updateDoneWith({ outcome: 'failed', failedStep: 'example-step' }))).toEqual({ verdict: 'restart-pending' });
  });

  test('is the update\'s own outcome when the pass was done or not needed', () => {
    expect(ProgramVerdictUtil.verdictOfUpdate(updateDoneWith({ outcome: 'done' }))).toEqual({ verdict: 'done' });
    expect(ProgramVerdictUtil.verdictOfUpdate(updateDoneWith({ outcome: 'not-needed' }))).toEqual({ verdict: 'done' });
    const nothingToDo: ForgeProgramVerdict<ForgeUpdateAnswer> = { verdict: 'done', answer: { outcome: 'nothing-to-do', installVersion: 27, restart: { outcome: 'not-needed' } } };
    expect(ProgramVerdictUtil.verdictOfUpdate(nothingToDo)).toEqual({ verdict: 'nothing-to-do' });
  });

  test('keeps the forge\'s refusal code and sentence', () => {
    const refused: ForgeProgramVerdict<ForgeUpdateAnswer> = { verdict: 'refused', refusal: 'restart-failed', text: 'The restart failed after it was taken.' };
    expect(ProgramVerdictUtil.verdictOfUpdate(refused)).toEqual({
      verdict: 'refused', refusedBy: 'forge', refusal: 'restart-failed', text: 'The restart failed after it was taken.',
    });
  });
});

describe('the verdict of a program run that did not finish', () => {
  test('is Gaia\'s own refusal, unreachable or not supported, by how it ended', () => {
    expect([
      ProgramVerdictUtil.verdictOfProgramFailure({ verdict: 'program-not-found', program: null }),
      ProgramVerdictUtil.verdictOfProgramFailure({ verdict: 'root-missing', root: '/Users/example/development/example-storefront' }),
      ProgramVerdictUtil.verdictOfProgramFailure({ verdict: 'timed-out' }),
      ProgramVerdictUtil.verdictOfProgramFailure({ verdict: 'answer-not-understood', reason: 'no-json', exitCode: 1 }),
    ]).toEqual([
      { verdict: 'refused', refusedBy: 'gaia', refusal: 'program-not-found' },
      { verdict: 'refused', refusedBy: 'gaia', refusal: 'repository-missing' },
      { verdict: 'unreachable' },
      { verdict: 'not-supported' },
    ]);
  });

  test('takes a done run\'s outcome from its answer', () => {
    const stopped: ForgeProgramVerdict<ForgeStopAnswer> = { verdict: 'done', answer: { outcome: 'nothing-to-do' } };
    expect(ProgramVerdictUtil.verdictOfProgram(stopped, (answer) => answer.outcome)).toEqual({ verdict: 'nothing-to-do' });
  });
});
