/**
 * What the questions habitat cues between two payloads (Flint's board wiring design, "New habitats", `questions`), each row once, in the order
 * of the table. Asking begins when a decision is open and none is selected, the selection being the decision the question panel shows. It
 * is a knock in place of an ask once User selected another decision than the oldest two times since Flint last asked or knocked, while the
 * oldest open decision, by `openedAt` and then id, stayed the oldest; the count starts again whenever the oldest changes. A look at the
 * oldest decision itself, or closing the panel, is no pass over it. Every incident has a default
 * move, so an incident that opens lights the fuse. An incident settles when the history gains a record that it was handled, answered or
 * took its default move; an escalation is no settling, since its decision opens. A waiver is answered when the history gains a
 * `decision-answered` record for a decision its `decision-opened` record names as a `waiver`; any other decision that gains one is answered.
 */
import type { SpriteCue } from 'flint/SpriteHabitat';
import { QUESTIONS_CUES } from './QuestionsSpriteHabitat.ts';

/** How many times User selects another decision, with the oldest decision still waiting, before Flint knocks rather than asks. */
const SELECTION_CHANGES_BEFORE_KNOCK = 2;

const WAIVER_KIND = 'waiver';

/** The records that close an incident; `incident-escalated` is not one, since the incident becomes a decision. */
const INCIDENT_SETTLING_KINDS: ReadonlySet<string> = new Set(['incident-handled', 'incident-answered', 'incident-defaulted']);

/** The fields of the board the habitat reads; the decision, incident and history documents satisfy them unchanged. */
export interface QuestionsFacts {
  /** The open decisions. */
  readonly decisions:          readonly { readonly id: string; readonly openedAt: string }[];
  readonly selectedDecisionId: string | null;
  readonly incidents:          readonly { readonly id: string; readonly defaultMove: string }[];
  readonly history:            QuestionHistory;
}

/** The log records of the questions; the board's history entries satisfy them unchanged, naming no decision or incident with `null`. */
export type QuestionHistory = readonly {
  readonly kind:        string;
  readonly decisionId?: string | null;
  readonly incidentId?: string | null;
  readonly fields:      Readonly<Record<string, unknown>>;
}[];

/** What the habitat keeps between two payloads. */
export interface QuestionsReading {
  readonly facts:                       QuestionsFacts;
  readonly selectionChangesUnderOldest: number;
}

export interface QuestionsStep {
  readonly reading:  QuestionsReading;
  readonly cueNames: readonly SpriteCue[];
}

function firstReadingOf(facts: QuestionsFacts): QuestionsReading {
  return { facts, selectionChangesUnderOldest: 0 };
}

function oldestDecisionIdOf(facts: QuestionsFacts): string | null {
  const [oldest] = [...facts.decisions].sort((a, b) => a.openedAt.localeCompare(b.openedAt) || a.id.localeCompare(b.id));
  return oldest?.id ?? null;
}

function isAsking(facts: QuestionsFacts): boolean {
  return facts.decisions.length > 0 && facts.selectedDecisionId === null;
}

function waiverIdsOf(history: QuestionHistory): ReadonlySet<string> {
  return new Set(history.flatMap((record) => (
    record.kind === 'decision-opened' && record.fields['kind'] === WAIVER_KIND && typeof record.decisionId === 'string' ? [record.decisionId] : []
  )));
}

function answeredDecisionIdsOf(history: QuestionHistory): ReadonlySet<string> {
  return new Set(history.flatMap((record) => (record.kind === 'decision-answered' && typeof record.decisionId === 'string' ? [record.decisionId] : [])));
}

function settledIncidentIdsOf(history: QuestionHistory): ReadonlySet<string> {
  return new Set(history.flatMap((record) => (INCIDENT_SETTLING_KINDS.has(record.kind) && typeof record.incidentId === 'string' ? [record.incidentId] : [])));
}

/** The ids in `next` that `previous` did not hold. */
function newIdsOf(previous: ReadonlySet<string>, next: ReadonlySet<string>): readonly string[] {
  return [...next].filter((id) => !previous.has(id));
}

/** Whether an incident settled between the two histories; the board occasions read it too. */
function incidentSettled(previous: QuestionHistory, next: QuestionHistory): boolean {
  return newIdsOf(settledIncidentIdsOf(previous), settledIncidentIdsOf(next)).length > 0;
}

function stepOf(previous: QuestionsReading, next: QuestionsFacts): QuestionsStep {
  const previousFacts = previous.facts;
  const oldestDecisionId = oldestDecisionIdOf(next);
  const oldestStays = oldestDecisionId !== null && oldestDecisionId === oldestDecisionIdOf(previousFacts);
  const { selectedDecisionId } = next;
  const passesTheOldest = selectedDecisionId !== previousFacts.selectedDecisionId && selectedDecisionId !== null && selectedDecisionId !== oldestDecisionId;
  const selectionChanges = oldestStays ? previous.selectionChangesUnderOldest + (passesTheOldest ? 1 : 0) : 0;
  const beginsAsking = isAsking(next) && !isAsking(previousFacts);
  const knocks = beginsAsking && selectionChanges >= SELECTION_CHANGES_BEFORE_KNOCK;
  const previousIncidentIds = new Set(previousFacts.incidents.map((incident) => incident.id));
  const waiverIds = waiverIdsOf(next.history);
  const newlyAnsweredDecisionIds = newIdsOf(answeredDecisionIdsOf(previousFacts.history), answeredDecisionIdsOf(next.history));
  const happenings: readonly (readonly [SpriteCue, boolean])[] = [
    [QUESTIONS_CUES.DECISION_WAITS, beginsAsking && !knocks],
    [QUESTIONS_CUES.OLDEST_DECISION_PASSED, knocks],
    [QUESTIONS_CUES.INCIDENT_OPENED, next.incidents.some((incident) => !previousIncidentIds.has(incident.id) && incident.defaultMove !== '')],
    [QUESTIONS_CUES.INCIDENT_SETTLED, incidentSettled(previousFacts.history, next.history)],
    [QUESTIONS_CUES.WAIVER_ANSWERED, newlyAnsweredDecisionIds.some((decisionId) => waiverIds.has(decisionId))],
    [QUESTIONS_CUES.DECISION_ANSWERED, newlyAnsweredDecisionIds.some((decisionId) => !waiverIds.has(decisionId))],
  ];
  return {
    reading:  { facts: next, selectionChangesUnderOldest: beginsAsking ? 0 : selectionChanges },
    cueNames: happenings.flatMap(([cueName, happened]) => (happened ? [cueName] : [])),
  };
}

export const QuestionsSpriteModel = Object.freeze({ firstReadingOf, stepOf, incidentSettled });
