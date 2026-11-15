/** How a run of the forge program ends as Gaia's command verdict: its done answer as an outcome, and each way it did not finish. */
import type { ForgeProgramVerdict, ForgeUpdateAnswer } from '../../../adapters/forge-program/@types/ForgeProgramAnswer.ts';
import type { CommandVerdict }                         from '../../../shared/@types/CommandVerdict.ts';

export type ForgeProgramFailure = Exclude<ForgeProgramVerdict<unknown>, { verdict: 'done' }>;

function verdictOfProgramFailure(programVerdict: ForgeProgramFailure): CommandVerdict {
  switch (programVerdict.verdict) {
    case 'refused':
      return {
        verdict: 'refused', refusedBy: 'forge', refusal: programVerdict.refusal, text: programVerdict.text,
      };
    case 'program-not-found':
      return { verdict: 'refused', refusedBy: 'gaia', refusal: 'program-not-found' };
    case 'root-missing':
      return { verdict: 'refused', refusedBy: 'gaia', refusal: 'repository-missing' };
    case 'timed-out':
      return { verdict: 'unreachable' };
    case 'answer-not-understood':
      return { verdict: 'not-supported' };
  }
}

function verdictOfProgram<Answer>(programVerdict: ForgeProgramVerdict<Answer>, outcomeOf: (answer: Answer) => 'done' | 'nothing-to-do'): CommandVerdict {
  return programVerdict.verdict === 'done' ? { verdict: outcomeOf(programVerdict.answer) } : verdictOfProgramFailure(programVerdict);
}

/**
 * A done update whose Baton pass failed left the old Overseer driving: the forge names the step `restart-not-taken`, and any other failed
 * step is read alike, since the pass failed either way and a restart is what is left to do.
 */
function verdictOfUpdate(programVerdict: ForgeProgramVerdict<ForgeUpdateAnswer>): CommandVerdict {
  if (programVerdict.verdict !== 'done') return verdictOfProgramFailure(programVerdict);
  const { outcome, batonPass } = programVerdict.answer;
  return batonPass.outcome === 'failed' ? { verdict: 'restart-pending' } : { verdict: outcome };
}

export const ProgramVerdictUtil = {
  verdictOfProgramFailure,
  verdictOfProgram,
  verdictOfUpdate,
} as const;
