/** The board's jobs and decisions under the names the Agents view reads them by: the job with its live facts, and an open decision as an ask. */
import type { BoardDecisionDocument } from '../../../@types/board/BoardDecisionDocuments.ts';
import type {
  BoardEndedJobDocument,
  BoardJobDocument,
  BoardLastToolCallDocument,
  BoardSubagentDocument
} from '../../../@types/board/BoardJobDocuments.ts';

export type LastToolCallDocument = BoardLastToolCallDocument;

export type SubagentDocument = BoardSubagentDocument;

export type AgentJobDocument = BoardJobDocument;

/** A job that left the board, as the board's `endedJobs` serves it, newest last. */
export type EndedAgentJobDocument = BoardEndedJobDocument;

export type JobDecisionDocument = Pick<BoardDecisionDocument, 'id' | 'jobId'>;

/** An open decision as the Asks User strip reads it: what it asks first, and since when. */
export type AskingDecisionDocument = Pick<BoardDecisionDocument, 'id' | 'jobId' | 'questions' | 'openedAt'>;
