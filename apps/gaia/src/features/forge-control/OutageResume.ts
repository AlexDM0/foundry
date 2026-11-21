/**
 * The fleet's one resume of every job a network outage stopped (decision 35): the forge's resume of interrupted work with the outage target,
 * sent to each forge whose API answers, one forge after another, and one answer per forge. It never retries and never runs a forge verb:
 * a forge that does not answer is `not-reached`, and the control stays there to be pressed again.
 */
import type { CommandVerdict, OutageResumeForgeAnswer } from '../../shared/@types/CommandVerdict.ts';

/** A forge as the resume reaches it: whether Gaia reads its API in a control contract it sends, and the outage endings it last read. */
export interface OutageResumeForge {
  readonly trackerId:     string;
  readonly apiAnswers:    boolean;
  readonly outageEndings: number;
}

/** Sends one forge the resume with the outage target, and answers how that forge ended it. */
export type ForgeOutageResumeSender = (trackerId: string) => Promise<CommandVerdict>;

function answerOf(forge: OutageResumeForge, verdict: CommandVerdict): OutageResumeForgeAnswer {
  const { trackerId } = forge;
  switch (verdict.verdict) {
    case 'done':
      return {
        trackerId, outcome: 'resumed', resumedCount: forge.outageEndings, refusalText: null
      };
    case 'nothing-to-do':
      return {
        trackerId, outcome: 'nothing-to-do', resumedCount: 0, refusalText: null
      };
    case 'refused':
      if (verdict.refusedBy === 'forge') {
        return {
          trackerId, outcome: 'refused', resumedCount: 0, refusalText: verdict.text
        };
      }
      return notReachedAnswerOf(trackerId);
    case 'unreachable':
    case 'not-supported':
    case 'restart-pending':
    case 'path-chosen':
    case 'outage-resume-answered':
      return notReachedAnswerOf(trackerId);
  }
}

function notReachedAnswerOf(trackerId: string): OutageResumeForgeAnswer {
  return {
    trackerId, outcome: 'not-reached', resumedCount: 0, refusalText: null
  };
}

/** In the fleet's order; the next forge is sent the resume only once the one before answered. */
async function resumeAll(fleet: readonly OutageResumeForge[], sendOutageResume: ForgeOutageResumeSender): Promise<OutageResumeForgeAnswer[]> {
  const answers: OutageResumeForgeAnswer[] = [];
  for (const forge of fleet) {
    answers.push(forge.apiAnswers ? answerOf(forge, await sendOutageResume(forge.trackerId)) : notReachedAnswerOf(forge.trackerId));
  }
  return answers;
}

export const OutageResume = { resumeAll, } as const;
