/**
 * The presence documents and the crash log the `hephaestus-fetch-presence` recording holds, read from its answers: Example Storefront serving,
 * and after User started it again after a crash. Test-only.
 */
import { recordedPresenceAnswersOf, type PresenceSituation } from '../../../testing/RecordedAnswers.ts';

const PRESENCE_CALL_SHAPE = 'GET /api/v1/presence with bearer';

const CRASH_LOG_CALL_SHAPE = 'GET /api/v1/crash-log?number=1 with bearer';

function recordedBodyOf(situation: PresenceSituation, callShape: string): unknown {
  const recorded = recordedPresenceAnswersOf(situation).find((answer) => answer.callShape === callShape)?.answer;
  if (recorded === undefined || recorded.verdict !== 'answered') throw new Error(`The presence recording holds no answer to ${callShape} in ${situation}.`);
  return JSON.parse(recorded.bodyText) as unknown;
}

export function recordedPresenceDocumentOf(situation: PresenceSituation): Record<string, unknown> {
  return recordedBodyOf(situation, PRESENCE_CALL_SHAPE) as Record<string, unknown>;
}

/** The crash log the forge wrote for the crash, read after it served again; in `presence-serving`, its refusal of a log it does not have. */
export function recordedCrashLogBodyOf(situation: PresenceSituation): Record<string, unknown> {
  return recordedBodyOf(situation, CRASH_LOG_CALL_SHAPE) as Record<string, unknown>;
}

export const PRESENCE_RECORDING_CALL_SHAPES = { presence: PRESENCE_CALL_SHAPE, crashLog: CRASH_LOG_CALL_SHAPE } as const;
