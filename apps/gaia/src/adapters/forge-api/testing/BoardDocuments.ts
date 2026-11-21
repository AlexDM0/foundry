/**
 * The board documents, stream events and command answers the board's ingestion specs read, taken through the forge client from the
 * `overseer-fetch-board` recording of a scratch forge at the supported forge version. Test-only.
 */
import type { ForgeStreamEvent, ForgeStreamFollow, OverseerAccess }           from '../../../lib/forge-client/@types/ForgeClientAnswer.ts';
import { forgeClientOf, type ForgeClient }                                    from '../../../lib/forge-client/ForgeClient.ts';
import { recordedBoardAnswersOf, recordedOverseerFetch, type BoardSituation } from '../../../testing/RecordedAnswers.ts';

/** The tracker id the recording's scratch forge was drawn with, as the registry names it. */
export const RECORDED_TRACKER_ID = 'example-storefront-7c41';

const EXAMPLE_ACCESS: OverseerAccess = { overseerUrl: 'http://127.0.0.1:47100', bearerToken: 'example-token-0123456789abcdef' };

/** Each recorded stream sends its handshake and one event of what it carries, then stays open until it is stopped. */
const RECORDED_EVENTS_PER_STREAM = 2;

function clientOf(situation: BoardSituation): ForgeClient {
  return forgeClientOf({ overseerFetch: recordedOverseerFetch(recordedBoardAnswersOf(situation)) });
}

/** The parsed board document the forge answered in one situation; a spec fails when it answered none. */
export async function recordedBoardDocumentOf(situation: Extract<BoardSituation, 'board-at-work' | 'board-install-held'>): Promise<unknown> {
  const answer = await clientOf(situation).boardOf(EXAMPLE_ACCESS);
  if (answer.verdict !== 'answered') throw new Error(`The ${situation} answers hold no board document: ${answer.verdict}.`);
  return answer.document;
}

/** A board command's answer as the forge gave it: its status and its parsed body. */
export async function recordedCommandAnswerOf(
  situation: Extract<BoardSituation, 'board-command-applied' | 'board-command-refused' | 'board-command-unknown-kind' | 'board-install-held' | 'intake-conversation'>,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const answer = await clientOf(situation).sendBoardCommand(EXAMPLE_ACCESS, { kind: 'ticket-hold' });
  if (answer.verdict !== 'answered') throw new Error(`The ${situation} answers hold no command answer: ${answer.verdict}.`);
  return { status: answer.status, body: answer.body };
}

async function recordedEventsOf(follow: (onEvent: (event: ForgeStreamEvent) => void) => ForgeStreamFollow): Promise<readonly ForgeStreamEvent[]> {
  const events: ForgeStreamEvent[] = [];
  const following = follow((event) => {
    events.push(event);
    if (events.length === RECORDED_EVENTS_PER_STREAM) following.stop();
  });
  await following.ended;
  return events;
}

export async function recordedBoardStreamEventsOf(): Promise<readonly ForgeStreamEvent[]> {
  return recordedEventsOf((onEvent) => clientOf('board-at-work').followEvents(EXAMPLE_ACCESS, null, onEvent));
}

/** The product owner's job stream the intake conversation recorded; its job id is the one the recording called. */
export async function recordedJobStreamEventsOf(jobId: string): Promise<readonly ForgeStreamEvent[]> {
  return recordedEventsOf((onEvent) => clientOf('intake-conversation').followJobStream(EXAMPLE_ACCESS, jobId, null, null, onEvent));
}

export async function recordedProfileStreamEventsOf(profileRunId: string): Promise<readonly ForgeStreamEvent[]> {
  return recordedEventsOf((onEvent) => clientOf('gate-profile-run').followProfileStream(EXAMPLE_ACCESS, profileRunId, null, null, onEvent));
}

/** The id the recording drew for a path segment, read from the paths it was called at. */
export function recordedPathSegmentOf(situation: BoardSituation, pattern: RegExp): string {
  for (const { callShape } of recordedBoardAnswersOf(situation)) {
    const segment = pattern.exec(callShape)?.[1];
    if (segment !== undefined) return segment;
  }
  throw new Error(`The ${situation} recording calls no path that matches ${String(pattern)}.`);
}
