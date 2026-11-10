/**
 * The Assistant view as data: the live Assistant session, or none while a fresh one boots; its open incidents; and the handled ones read
 * back from the log through `IncidentTrailUtil`, each with the moves, notes and escalations made under it.
 */
import type { ConversationBoardDocument, SessionJobDocument } from '../../@types/ConversationDocuments.ts';
import type { TranscriptEntryDocument }                       from '../../api/TranscriptStreamClient.ts';
import { IncidentTrailUtil, type IncidentEntry }              from '../../utils/IncidentTrailUtil.ts';
import { JobStateUtil }                                       from '../../utils/JobStateUtil.ts';

export interface AssistantModel {
  /** `null` while no Assistant session is up: a fresh one is booting. */
  readonly assistantJobId:   string | null;
  readonly openIncidents:    readonly IncidentEntry[];
  readonly settledIncidents: readonly IncidentEntry[];
}

/** The Assistant's job kind as the board stores it. */
const ASSISTANT_JOB_KIND = 'assistant';

function liveAssistantOf(jobs: readonly SessionJobDocument[]): SessionJobDocument | null {
  return jobs.find((job) => job.kind === ASSISTANT_JOB_KIND && JobStateUtil.isUp(job.state)) ?? null;
}

function assistantModelOf(board: ConversationBoardDocument): AssistantModel {
  const history = board.questionHistory ?? [];
  const openIds = new Set(board.incidents.map((incident) => incident.id));
  return {
    assistantJobId:   liveAssistantOf(board.jobs)?.id ?? null,
    openIncidents:    IncidentTrailUtil.openIncidentEntriesOf(board.incidents, history),
    settledIncidents: IncidentTrailUtil.settledIncidentEntriesOf(history, openIds),
  };
}

/** The messages User sent that no `user` line of the transcript carries yet: queued until the Assistant is idle. */
function queuedMessagesOf(sentTexts: readonly string[], entries: readonly TranscriptEntryDocument[]): string[] {
  return sentTexts.filter((text) => !entries.some((entry) => entry.role === 'user' && entry.text.includes(text)));
}

export const AssistantModelUtil = Object.freeze({ assistantModelOf, queuedMessagesOf });
