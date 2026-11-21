/**
 * What waits on User, as the board shows it: the attention entries the forge serves, split into the escalated entries and the rest, each
 * with its action opening the route of its served target; and the tab counts and the pill's label the header reads.
 */
import type { BoardDocument }                                                    from '../../@types/board/BoardDocument.ts';
import type { BoardAttentionEntryDocument }                                      from '../../@types/board/BoardFactDocuments.ts';
import type { BoardAttentionActionLabel, BoardAttentionKind, BoardDisplayState } from '../../@types/board/BoardVocabulary.ts';
import { BoardRouter, type BoardRoute, type BoardTab }                           from './BoardRouter.ts';

export type TabCountTone = 'waiting' | 'escalated' | 'neutral';

export interface AttentionAction {
  readonly label:   BoardAttentionActionLabel;
  readonly route:   BoardRoute;
  readonly primary: boolean;
}

/** An entry of the list with the button the board draws for it: the primary one only on an escalated question. */
export interface AttentionItem extends BoardAttentionEntryDocument {
  readonly action: AttentionAction;
}

export interface WaitingOnUser {
  /** Oldest first. */
  readonly escalated:      readonly AttentionItem[];
  /** Oldest first across kinds; a tie keeps the key order. */
  readonly byAge:          readonly AttentionItem[];
  readonly total:          number;
  readonly escalatedCount: number;
}

export interface TabCount {
  readonly count:     number;
  readonly tone:      TabCountTone;
  readonly ariaLabel: string;
}

export type TabCounts = Partial<Readonly<Record<BoardTab, TabCount>>>;

/** The board fields this model reads: the served entries, the open decisions the Questions tab counts and the incidents the Assistant tab counts. */
export type WaitingOnUserBoard = Pick<BoardDocument, 'attention' | 'decisions' | 'incidents'>;

/** How a row names its kind, and the state whose colours it takes; an escalated row takes the error colours instead. */
export interface AttentionKindWording {
  readonly text:  string;
  readonly state: BoardDisplayState;
}

export const ATTENTION_KIND_WORDING: Readonly<Record<BoardAttentionKind, AttentionKindWording>> = {
  'escalated-question': { text: 'Escalated', state: 'ready-for-review' },
  'question':           { text: 'Question', state: 'ready-for-review' },
  'draft-ticket':       { text: 'Draft', state: 'draft' },
  'filing-draft':       { text: 'Draft', state: 'draft' },
  'review':             { text: 'Review', state: 'ready-for-review' },
  'merge-accept':       { text: 'Accept', state: 'ready-for-review' },
};

export const NOTHING_WAITING: WaitingOnUser = {
  escalated: [], byAge: [], total: 0, escalatedCount: 0
};

const KANBAN_COUNTED_KINDS: ReadonlySet<BoardAttentionKind> = new Set(['draft-ticket', 'filing-draft', 'review', 'merge-accept']);

function itemOf(entry: BoardAttentionEntryDocument): AttentionItem {
  return { ...entry, action: { label: entry.actionLabel, route: BoardRouter.routeOfTarget(entry.target), primary: entry.kind === 'escalated-question' } };
}

function waitingOnUserOf(board: Pick<WaitingOnUserBoard, 'attention'>): WaitingOnUser {
  const items = board.attention.map(itemOf);
  const escalated = items.filter((item) => item.kind === 'escalated-question');
  return {
    escalated,
    byAge:          items.filter((item) => item.kind !== 'escalated-question'),
    total:          items.length,
    escalatedCount: escalated.length,
  };
}

function waitsWord(count: number): string {
  return count === 1 ? 'waits' : 'wait';
}

function plural(count: number, singular: string, pluralWord: string): string {
  return count === 1 ? singular : pluralWord;
}

function questionsTabCountOf(board: WaitingOnUserBoard, waiting: WaitingOnUser): TabCount | null {
  const count = board.decisions.length;
  if (count === 0) return null;
  const lead = `Questions, ${count} ${plural(count, 'question', 'questions')} ${waitsWord(count)} on User`;
  return {
    count,
    tone:      waiting.escalatedCount > 0 ? 'escalated' : 'waiting',
    ariaLabel: waiting.escalatedCount > 0 ? `${lead}, ${waiting.escalatedCount} escalated` : lead,
  };
}

function kanbanTabCountOf(waiting: WaitingOnUser): TabCount | null {
  const count = waiting.byAge.filter((item) => KANBAN_COUNTED_KINDS.has(item.kind)).length;
  if (count === 0) return null;
  return { count, tone: 'waiting', ariaLabel: `Kanban, ${count} ${waitsWord(count)} on User` };
}

function assistantTabCountOf(board: WaitingOnUserBoard): TabCount | null {
  const count = board.incidents.length;
  if (count === 0) return null;
  return { count, tone: 'neutral', ariaLabel: `Assistant, ${count} ${plural(count, 'incident', 'incidents')} the Assistant is settling` };
}

/** Questions, Kanban and the Assistant, each only while its count is above zero; Intake never, since its drafts and questions count elsewhere. */
function tabCountsOf(board: WaitingOnUserBoard, waiting: WaitingOnUser): TabCounts {
  const questions = questionsTabCountOf(board, waiting);
  const kanban = kanbanTabCountOf(waiting);
  const assistant = assistantTabCountOf(board);
  return {
    ...(questions === null ? {} : { questions }),
    ...(kanban === null ? {} : { kanban }),
    ...(assistant === null ? {} : { assistant }),
  };
}

/** `Waiting on User: 5, 1 escalated`, `Waiting on User: 2`, or `Waiting on User: none`. */
function pillAriaLabelOf(waiting: WaitingOnUser): string {
  if (waiting.total === 0) return 'Waiting on User: none';
  return waiting.escalatedCount > 0 ? `Waiting on User: ${waiting.total}, ${waiting.escalatedCount} escalated` : `Waiting on User: ${waiting.total}`;
}

export const WaitingOnUserModel = Object.freeze({ waitingOnUserOf, tabCountsOf, pillAriaLabelOf });
