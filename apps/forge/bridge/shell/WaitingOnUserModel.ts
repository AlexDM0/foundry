/**
 * What waits on User, as the Bridge shows it: the one list `AttentionEntries.ts` builds for the Bridge and the monitor snapshot alike,
 * split into the escalated entries and the rest, each with its action; and the tab counts and the pill's label the header reads.
 */
import type { DisplayState }                                               from '../../src/lib/tracker-model/@types/Task.ts';
import type { AttentionActionLabel, AttentionKind, MonitorAttentionEntry } from '../../src/shared/monitor/@types/MonitorSnapshot.ts';
import { attentionEntriesOf, routedAttentionEntryOf, type AttentionBoard } from '../../src/shared/monitor/AttentionEntries.ts';
import type { BridgeTab }                                                  from './HashRouter.ts';

export type TabCountTone = 'waiting' | 'escalated' | 'neutral';

export interface AttentionAction {
  readonly label:   AttentionActionLabel;
  readonly href:    string;
  readonly primary: boolean;
}

/** An entry of the list with the button the Bridge draws for it: the primary one only on an escalated question. */
export interface AttentionItem extends MonitorAttentionEntry {
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

export type TabCounts = Partial<Readonly<Record<BridgeTab, TabCount>>>;

/** The board fields this model reads: the list's, and the open incidents the Assistant tab counts. */
export interface WaitingOnUserBoard extends AttentionBoard {
  readonly incidents: readonly unknown[];
}

/** How a row names its kind, and the state whose colours it takes; an escalated row takes the error colours instead. */
export interface AttentionKindWording {
  readonly text:  string;
  readonly state: DisplayState;
}

export const ATTENTION_KIND_WORDING: Readonly<Record<AttentionKind, AttentionKindWording>> = {
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

const KANBAN_COUNTED_KINDS: ReadonlySet<AttentionKind> = new Set(['draft-ticket', 'filing-draft', 'review', 'merge-accept']);

function itemOf(entry: MonitorAttentionEntry): AttentionItem {
  return { ...entry, action: { label: entry.actionLabel, href: entry.route, primary: entry.kind === 'escalated-question' } };
}

function waitingOnUserOf(board: WaitingOnUserBoard): WaitingOnUser {
  const items = attentionEntriesOf(board).map(routedAttentionEntryOf).map(itemOf);
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
