/**
 * The agent step dialog's model, pure: the form a role's dialog starts from (the draft's stored settings, else the node's resolved pair,
 * else the defaults, and the builder's and the reviewer's pipeline documents), Reset's defaults, the one edit a Save sends, and every
 * word the dialog shows for a role: its title, what it does, when it runs and what it fixes, and the hint under each effort.
 */
import type { BoardLimitsDocument } from '../../../../@types/board/BoardFactDocuments.ts';
import type {
  BoardAgentPairDocument,
  BoardDraftEditDocument,
  BoardInstructionDocument,
  BoardPipelineDefinitionDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardAgentEffort, BoardAgentModel, BoardPipelineAgentRole }                         from '../../../../@types/board/BoardVocabulary.ts';
import { PipelineDocumentsSectionModel, type DocumentReadingDefaults, type DocumentReadingRules } from './PipelineDocumentsSectionModel.ts';

/** The roles a step dialog sets: the agent steps, the reviewer and the two re-reviewers. */
export type StepDialogRole = Extract<BoardPipelineAgentRole, 'productOwner' | 'specAgent' | 'planAgent' | 'builder' | 'reviewer' | 'reReviewer' | 'conflictReReviewer'>;

/** The roles whose own dialog is the agent step dialog. */
export type AgentStepRole = Extract<StepDialogRole, 'productOwner' | 'specAgent' | 'planAgent' | 'builder'>;

export interface AgentStepForm {
  readonly model:     BoardAgentModel;
  readonly effort:    BoardAgentEffort;
  /** Read top to bottom; an empty list leaves the role its built-in brief. */
  readonly entries:   readonly BoardInstructionDocument[];
  /** When the builder or the reviewer reads each pipeline document; null for every other role. */
  readonly documents: DocumentReadingRules | null;
}

interface AgentStepWords {
  readonly title:       string;
  readonly description: string;
  readonly runs:        string;
  readonly fixes:       string | null;
}

const AGENT_STEP_WORDS: Readonly<Record<AgentStepRole, AgentStepWords>> = Object.freeze({
  productOwner: {
    title:       'Ticket creation',
    description: 'Turns what User reports into draft tickets, each with a numbered Acceptance and a Brief.',
    runs:        'Once per filing session, when User asks for a ticket.',
    fixes:       null,
  },
  specAgent: {
    title:       'Spec',
    description: 'Writes the spec of each ticket with User: what and why, and the numbered Acceptance.',
    runs:        'When a ticket is filed, and again for each message on its spec.',
    fixes:       null,
  },
  planAgent: {
    title:       'Plan',
    description: 'Works out how from the approved spec: the approach, the changes and their order. The builder starts from its plan.',
    runs:        'When the spec is approved, again when it changes, and for each message on the plan.',
    fixes:       null,
  },
  builder: {
    title:       'Builder',
    description: 'Builds each readied ticket in its own worktree, then fixes its own red build gates.',
    runs:        'Once per attempt, after Human ticket review.',
    fixes:       'Red build gates, the conflicts and red build gates of the merge before review, and conflicts and red merge gates when no review ran after it.',
  },
});

const EFFORT_HINTS: Readonly<Record<BoardAgentEffort, string>> = Object.freeze({
  low:    'Fast and cheap: small, well-specified tickets.',
  medium: 'The usual depth for most tickets.',
  high:   'Deeper reasoning, for tickets with more to weigh.',
  xhigh:  'Deeper than high, for large or subtle tickets.',
  max:    'The deepest reasoning: slow, for the hardest tickets.',
});

/** The phase a role's step stands in, then what kind of step it is: "Build · Agent step". */
const AGENT_STEP_KICKERS: Readonly<Record<AgentStepRole, string>> = Object.freeze({
  productOwner: 'Ticket · Agent step',
  specAgent:    'Ticket · Agent step',
  planAgent:    'Ticket · Agent step',
  builder:      'Build · Agent step',
});

const AGENT_STEP_ROLES: readonly AgentStepRole[] = Object.freeze(['productOwner', 'specAgent', 'planAgent', 'builder']);

function isAgentStepRole(role: BoardPipelineAgentRole | null): role is AgentStepRole {
  return AGENT_STEP_ROLES.some((candidate) => candidate === role);
}

/** Each role's pair, instruction list and pipeline documents the forge falls back on, as its board's limits serve them. */
export type AgentStepDefaults = Pick<BoardLimitsDocument, 'defaultAgentPairOfRole' | 'defaultInstructionsOfRole'> & DocumentReadingDefaults;

/** The draft's stored settings first; where it stores none, the pair the facts resolved, then the served defaults; the role's default list. */
function formOf(role: StepDialogRole, draft: BoardPipelineDefinitionDocument | null, resolvedSettings: BoardAgentPairDocument | null, defaults: AgentStepDefaults): AgentStepForm {
  const stored = draft?.agents[role];
  const defaultPair = defaults.defaultAgentPairOfRole[role];
  return {
    model:     stored?.model ?? resolvedSettings?.model ?? defaultPair.model,
    effort:    stored?.effort ?? resolvedSettings?.effort ?? defaultPair.effort,
    entries:   stored?.instructions ?? defaults.defaultInstructionsOfRole[role],
    documents: PipelineDocumentsSectionModel.isDocumentReadingRole(role) ? PipelineDocumentsSectionModel.rulesOf(role, stored?.documents, defaults) : null,
  };
}

/** What Reset to default puts in the form: the role's default pair, instruction list and pipeline documents, as the forge serves them. */
function resetFormOf(role: StepDialogRole, defaults: AgentStepDefaults): AgentStepForm {
  const defaultPair = defaults.defaultAgentPairOfRole[role];
  return {
    model:     defaultPair.model,
    effort:    defaultPair.effort,
    entries:   defaults.defaultInstructionsOfRole[role],
    documents: PipelineDocumentsSectionModel.isDocumentReadingRole(role) ? PipelineDocumentsSectionModel.defaultRulesOf(role, defaults) : null,
  };
}

/** The one edit a Save sends for a role: its model, its effort, its instruction list in order, and its documents where they differ from the default. */
function roleEditOf(role: StepDialogRole, form: AgentStepForm, defaults: DocumentReadingDefaults): BoardDraftEditDocument {
  const settings = { model: form.model, effort: form.effort, instructions: [...form.entries] };
  const storedDocuments = form.documents === null || !PipelineDocumentsSectionModel.isDocumentReadingRole(role)
    ? null
    : PipelineDocumentsSectionModel.storedRulesOf(role, form.documents, defaults);
  return { target: 'role', role, value: storedDocuments === null ? settings : { ...settings, documents: storedDocuments } };
}

/** An effort's meter level is its place in the choices plus one; an effort outside them fills no bar. */
function levelOf(effort: BoardAgentEffort, efforts: readonly string[]): number {
  return efforts.indexOf(effort) + 1;
}

function meterNameOf(title: string, form: Pick<AgentStepForm, 'model' | 'effort'>): string {
  return `${title}: ${form.model}, effort ${form.effort}`;
}

/** Over entities, the product owner also names the entity each draft ticket belongs to. */
const PRODUCT_OWNER_OVER_ENTITIES_DESCRIPTION
  = 'Turns what User reports into draft tickets, each with a numbered Acceptance and a Brief, and names the entity each ticket belongs to.';

function wordsOf(role: AgentStepRole, overEntities = false): AgentStepWords {
  const words = AGENT_STEP_WORDS[role];
  return overEntities && role === 'productOwner' ? { ...words, description: PRODUCT_OWNER_OVER_ENTITIES_DESCRIPTION } : words;
}

function kickerOf(role: AgentStepRole): string {
  return AGENT_STEP_KICKERS[role];
}

function effortHintOf(effort: BoardAgentEffort): string {
  return EFFORT_HINTS[effort];
}

/** The question "Ask the pipeline agent" sends, naming the step. */
function questionOf(title: string): string {
  return `Which model, effort and instructions fit the ${title} step on this board?`;
}

export const AgentStepDialogModel = Object.freeze({
  kickerOf,
  effortHintOf,
  formOf,
  isAgentStepRole,
  levelOf,
  meterNameOf,
  questionOf,
  resetFormOf,
  roleEditOf,
  wordsOf,
});
