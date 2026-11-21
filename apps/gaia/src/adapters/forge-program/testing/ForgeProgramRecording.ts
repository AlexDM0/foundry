/**
 * The process-run a forge-program recording spec hands ForgeProgram: it runs the scratch forge in place of the example program and keeps
 * each answer under the call shape ForgeProgram made; `recordAnswers` records them once the run has drawn every value, each replaced by its
 * example. Test-only.
 */
import type { ProcessRun, ProgramRunAnswer } from '../../../lib/process-run/ProcessRun.ts';
import { recordAnswer }                      from '../../../testing/BoundaryRecordings.ts';
import { runCallShapeOf }                    from '../../../testing/RecordedRuns.ts';
import type { ScratchForge }                 from '../../../testing/ScratchForge.ts';

import { EXAMPLE_FORGE_PROGRAM_PATH } from './RecordedForgeProgram.ts';

export interface ForgeProgramRecordingRun extends ProcessRun {
  readonly lastAnswer:    () => ProgramRunAnswer | null;
  /** Records every answer kept, with the values the run drew replaced by their examples. */
  readonly recordAnswers: () => void;
}

export interface ForgeProgramRecordingOptions {
  readonly recordingName: string;
  readonly scratchForge:  ScratchForge;
  readonly program:       string;
}

function exampleAnswerOf<Answer>(scratchForge: ScratchForge, answer: Answer): Answer {
  return JSON.parse(scratchForge.exampleTextOf(JSON.stringify(answer))) as Answer;
}

export function forgeProgramRecordingRun(options: ForgeProgramRecordingOptions): ForgeProgramRecordingRun {
  const { recordingName, scratchForge, program } = options;
  let lastAnswer: ProgramRunAnswer | null = null;
  const keptAnswers: { readonly callShape: string; readonly answer: unknown }[] = [];
  const realProgramOf = (requestedProgram: string): string => (requestedProgram === EXAMPLE_FORGE_PROGRAM_PATH ? program : requestedProgram);
  return {
    run: async (request) => {
      const answer = await scratchForge.processRun.run({ ...request, program: realProgramOf(request.program) });
      keptAnswers.push({ callShape: runCallShapeOf(request.program, request.programArguments), answer });
      lastAnswer = answer;
      return answer;
    },
    startOwned: (request) => {
      throw new Error(`The ${recordingName} recording starts nothing owned, and was asked to start ${request.program}.`);
    },
    startDetached: (request) => {
      throw new Error(`The ${recordingName} recording starts nothing detached, and was asked to start ${request.program}.`);
    },
    lastAnswer:    () => lastAnswer,
    recordAnswers: () => {
      for (const { callShape, answer } of keptAnswers.splice(0)) recordAnswer(recordingName, callShape, exampleAnswerOf(scratchForge, answer));
    },
  };
}
