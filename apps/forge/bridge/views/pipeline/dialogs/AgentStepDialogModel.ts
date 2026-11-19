/**
 * The agent step dialog's model, pure: the form a role's dialog starts from (the draft's stored settings, else the node's resolved pair,
 * else the defaults), Reset's defaults, the one edit a Save sends, and every word the dialog shows for a role: its title, what it does,
 * when it runs and what it fixes, and the hint under each effort.
 */
import type { InstructionEntry, Pipeline, PipelineAgentRole } from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { AgentEffort, AgentModel, AgentPair }            from '../../../../src/lib/tracker-model/@types/Ticket.ts';
import { DEFAULT_INSTRUCTIONS_OF_ROLE }                       from '../../../../src/lib/tracker-model/constants/PipelineDefaults.ts';
import { WORKER_EFFORT, WORKER_MODEL }                        from '../../../../src/shared/constants/OverseerLimits.ts';
import type { PipelineDraftEdit }                             from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';

/** The roles a step dialog sets: the two agent steps, the reviewer and the two re-reviewers. */
export type StepDialogRole = Extract<PipelineAgentRole, 'productOwner' | 'builder' | 'reviewer' | 'reReviewer' | 'conflictReReviewer'>;

/** The roles whose own dialog is the agent step dialog. */
export type AgentStepRole = Extract<StepDialogRole, 'productOwner' | 'builder'>;

export interface AgentStepForm {
  readonly model:   AgentModel;
  readonly effort:  AgentEffort;
  /** Read top to bottom; an empty list leaves the role its built-in brief. */
  readonly entries: readonly InstructionEntry[];
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
  builder: {
    title:       'Builder',
    description: 'Builds each readied ticket in its own worktree, then fixes its own red build gates.',
    runs:        'Once per attempt, after Human ticket review.',
    fixes:       'Red build gates, the conflicts and red build gates of the merge before review, and conflicts and red merge gates when no review ran after it.',
  },
});

const EFFORT_HINTS: Readonly<Record<AgentEffort, string>> = Object.freeze({
  low:    'Fast and cheap: small, well-specified tickets.',
  medium: 'The usual depth for most tickets.',
  high:   'Deeper reasoning, for tickets with more to weigh.',
  xhigh:  'Deeper than high, for large or subtle tickets.',
  max:    'The deepest reasoning: slow, for the hardest tickets.',
});

/** The phase a role's step stands in, then what kind of step it is: "Build · Agent step". */
const AGENT_STEP_KICKERS: Readonly<Record<AgentStepRole, string>> = Object.freeze({
  productOwner: 'Ticket · Agent step',
  builder:      'Build · Agent step',
});

function isAgentStepRole(role: PipelineAgentRole | null): role is AgentStepRole {
  return role === 'productOwner' || role === 'builder';
}

/** The draft's stored settings first; where it stores none, the pair the facts resolved, then the defaults; the role's default list. */
function formOf(role: StepDialogRole, draft: Pipeline | null, resolvedSettings: AgentPair | null): AgentStepForm {
  const stored = draft?.agents?.[role];
  return {
    model:   stored?.model ?? resolvedSettings?.model ?? WORKER_MODEL,
    effort:  stored?.effort ?? resolvedSettings?.effort ?? WORKER_EFFORT,
    entries: stored?.instructions ?? DEFAULT_INSTRUCTIONS_OF_ROLE[role],
  };
}

/** What Reset to default puts in the form: the model and effort every worker role runs on, and the role's default instruction list. */
function resetFormOf(role: StepDialogRole): AgentStepForm {
  return { model: WORKER_MODEL, effort: WORKER_EFFORT, entries: DEFAULT_INSTRUCTIONS_OF_ROLE[role] };
}

/** The one edit a Save sends for a role: its model, its effort and its instruction list in order. */
function roleEditOf(role: StepDialogRole, form: AgentStepForm): PipelineDraftEdit {
  return { target: 'role', role, value: { model: form.model, effort: form.effort, instructions: [...form.entries] } };
}

/** An effort's meter level is its place in the choices plus one; an effort outside them fills no bar. */
function levelOf(effort: AgentEffort, efforts: readonly string[]): number {
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

function effortHintOf(effort: AgentEffort): string {
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
