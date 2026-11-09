/**
 * The activity strip's rows, the static page's activity banner read from the board's rows: every running row (in progress, not ended),
 * whether its agent builds or reviews, the ticket it works on and how long it has run. Measuring a running row against the clock decides
 * only what the strip prints.
 */
import type { TaskDocument } from '../@types/BoardStateDocument.ts';
import { ElapsedTimeUtil }   from '../utils/ElapsedTimeUtil.ts';

export type ActivityKind = 'building' | 'reviewing';

export interface ActivityEntry {
  readonly taskId:                 number;
  readonly kind:                   ActivityKind;
  /** The display state the strip colours the row with, so a running agent looks the same as on the chart and the Kanban. */
  readonly stateToken:             'in-progress' | 'reviewing';
  readonly kindLabel:              string;
  /** The ticket the agent builds or reviews, or `null` for a free-standing row. */
  readonly ticketId:               string | null;
  readonly title:                  string;
  /** `null` when the running row carries no readable start, which the strip orders last and shows without a time. */
  readonly startEpochMilliseconds: number | null;
}

export const IDLE_ACTIVITY_TEXT = 'No agent is working right now.';

const LEADING_TASK_ID_PATTERN = /^#\d+\s+/;

const KIND_LABEL: Readonly<Record<ActivityKind, string>> = { building: 'Building', reviewing: 'Reviewing' };

const KIND_STATE: Readonly<Record<ActivityKind, ActivityEntry['stateToken']>> = { building: 'in-progress', reviewing: 'reviewing' };

type ActivityTask = Pick<TaskDocument, 'id' | 'name' | 'status' | 'start' | 'end' | 'ticket' | 'reviewOf'>;

function taskIsRunning(task: Pick<TaskDocument, 'status' | 'end'>): boolean {
  return task.status === 'in-progress' && task.end === null;
}

/** A row reviews only when it names the ticket it reviews: a name that merely reads like a review bar is never one. */
function activityKindOf(task: Pick<TaskDocument, 'reviewOf'>): ActivityKind {
  return task.reviewOf === undefined ? 'building' : 'reviewing';
}

function epochMillisecondsOf(stamp: string | null): number | null {
  if (stamp === null) return null;
  const parsed = Date.parse(stamp);
  return Number.isNaN(parsed) ? null : parsed;
}

function startOrder(start: number | null): number {
  return start ?? Number.POSITIVE_INFINITY;
}

/** Every running row, longest-running first; rows that started together keep their id order. */
function activityEntriesOf(tasks: readonly ActivityTask[], tickets: readonly { readonly id: string; readonly title: string }[]): ActivityEntry[] {
  const ticketTitleById = new Map(tickets.map((ticket) => [ticket.id, ticket.title]));
  return tasks
    .filter(taskIsRunning)
    .map((task): ActivityEntry => {
      const kind = activityKindOf(task);
      const ticketId = task.reviewOf ?? task.ticket;
      return {
        taskId:                 task.id,
        kind,
        stateToken:             KIND_STATE[kind],
        kindLabel:              KIND_LABEL[kind],
        ticketId,
        title:                  (ticketId === null ? undefined : ticketTitleById.get(ticketId)) ?? task.name.replace(LEADING_TASK_ID_PATTERN, ''),
        startEpochMilliseconds: epochMillisecondsOf(task.start),
      };
    })
    .sort((a, b) => startOrder(a.startEpochMilliseconds) - startOrder(b.startEpochMilliseconds) || a.taskId - b.taskId);
}

/** Empty for an entry without a start. */
function elapsedTextOf(entry: Pick<ActivityEntry, 'startEpochMilliseconds'>, nowEpochMilliseconds: number): string {
  return entry.startEpochMilliseconds === null ? '' : ElapsedTimeUtil.formatElapsed(nowEpochMilliseconds - entry.startEpochMilliseconds);
}

export const ActivityStripModel = Object.freeze({ activityEntriesOf, elapsedTextOf });
