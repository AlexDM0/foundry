/**
 * The words the pipeline setup agent reads about its record: the step blocks it works under, and the message for each move User or a
 * check makes on the record. Both the command line's control context and Hephaestus's send these messages.
 */
import { readFileSync } from 'node:fs';

import { EntityRefusalWording } from '../src/adapters/pipeline/EntityRefusalWording.ts';
import type { AgentAdapter }    from '../src/lib/agent-launch/AgentAdapter.ts';
import type {
  CheckedGate,
  ConstitutionSources,
  PipelineCheck,
  PipelineCheckResult,
  PipelineSetupMode,
  PipelineSetupStep
} from '../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { EntityRefusal }                 from '../src/lib/tracker-model/utils/EntityValidationUtil.ts';
import type { DraftFieldValue, SetupMessage } from '../src/shared/@types/ControlContext.ts';
import { filledTemplateOf }                   from '../src/shared/FilledTemplate.ts';
import { resourceFilePathOf }                 from '../src/shared/ResourceFilePath.ts';
import { PRODUCT_NAMES }                      from '../src/shared/constants/ProductNames.ts';

type PromptFills = AgentAdapter['promptFills'];

function promptOf(fileName: string): string {
  return readFileSync(resourceFilePathOf('prompts', fileName), 'utf8');
}

/** The shortest fence markdown reads as one. */
const MARKDOWN_FENCE_LENGTH = 3;

/** A fence longer than any run of backticks in the text, so a document holding a fence of its own is shown whole. */
function fencedBlockOf(text: string, language: string): string {
  const longestRun = Math.max(0, ...[...text.matchAll(/`+/gu)].map((run) => run[0].length));
  const fence = '`'.repeat(Math.max(MARKDOWN_FENCE_LENGTH, longestRun + 1));
  return `${fence}${language}\n${text.endsWith('\n') ? text : `${text}\n`}${fence}`;
}

/**
 * The step blocks a step works under: the research block also while the agent or billing is open, since the agent starts reading at once; the entities
 * block, which turns the layout the research found into entities; the design block also at Apply, so the agent still answers User's
 * changes there. An advise session reads the design rules too.
 */
function stepPromptFilesOf(mode: PipelineSetupMode, step: PipelineSetupStep): readonly string[] {
  if (mode === 'advise') return ['PipelineAgentAdvise.md', 'PipelineAgentDesign.md'];
  switch (step) {
    case 'agent':
    case 'billing':
    case 'research':
      return ['PipelineAgentResearch.md'];
    case 'entities':
      return ['PipelineAgentEntities.md'];
    case 'constitution':
      return ['PipelineAgentConstitution.md'];
    case 'design':
    case 'apply':
      return ['PipelineAgentDesign.md'];
  }
}

function stepInstructionsOf(mode: PipelineSetupMode, step: PipelineSetupStep, promptFills: PromptFills): string {
  const fills = { ...promptFills, program: PRODUCT_NAMES.PROGRAM, pipelineSetupSkill: PRODUCT_NAMES.PIPELINE_SETUP_SKILL };
  return stepPromptFilesOf(mode, step).map((fileName) => filledTemplateOf(promptOf(fileName), fills).trim()).join('\n\n');
}

function sourceTicksTextOf(draftedFrom: Readonly<ConstitutionSources>): string {
  const ticks = [
    ...(draftedFrom.contributing ? ['CONTRIBUTING.md'] : []),
    ...(draftedFrom.research ? ['the research findings'] : []),
    ...(draftedFrom.installedDefault ? ['the installed default constitution'] : []),
  ];
  return ticks.length === 0 ? 'none' : ticks.join(', ');
}

/** A Continue carries the next step's block, unless the agent already works under it. */
function stepContinuedMessageOf(mode: PipelineSetupMode, step: PipelineSetupStep, currentStep: PipelineSetupStep, promptFills: PromptFills): string {
  const moved = `User completed the ${step} step. The current step is ${currentStep}.`;
  const nextInstructions = stepInstructionsOf(mode, currentStep, promptFills);
  return nextInstructions === stepInstructionsOf(mode, step, promptFills) ? moved : `${moved}\n\n${nextInstructions}`;
}

function checkedGateLinesOf(gate: Readonly<CheckedGate>): string {
  const heading = `- \`${gate.name}\`: ${gate.verdict}. Runs: ${gate.outcomes.join(', ')}.`;
  return gate.output === '' ? heading : `${heading} The end of the output:\n\n${fencedBlockOf(gate.output, '')}`;
}

function prepareResultOf(prepare: Readonly<PipelineCheckResult['prepare']>): string {
  const failedSteps = prepare.failedSteps.map((step, index) => (step === null ? `run ${index + 1} passed` : `run ${index + 1} failed at \`${step}\``));
  const result = `${failedSteps.join(', ')}.`;
  return prepare.output === '' ? result : `${result} The end of the output:\n\n${fencedBlockOf(prepare.output, '')}`;
}

/** The check's result for the agent, or why it could not run; a check that has no result yet tells nothing. */
function checkEndedMessageOf(check: Readonly<PipelineCheck>): string {
  if (check.result === null) {
    return `User's check of draft revision ${check.draftRevision} could not run: ${check.reason ?? 'no reason was recorded'}. `
      + 'Tell User. Do not run a gate or a script yourself.';
  }
  return filledTemplateOf(promptOf('PipelineAgentCheck.md'), {
    draftRevision:  String(check.draftRevision),
    snapshotCommit: check.result.snapshotCommit,
    prepareResult:  prepareResultOf(check.result.prepare),
    gateResults:    check.result.gates.map(checkedGateLinesOf).join('\n'),
    program:        PRODUCT_NAMES.PROGRAM,
  }).trim();
}

/** The constitution as User left it: the whole new text and the new SOURCES ticks, each only when the move changed it. */
function constitutionEditedMessageOf(revision: number, markdown: string | null, draftedFrom: Readonly<ConstitutionSources> | null): string {
  const lines = [`User changed the constitution (revision ${revision}). Keep User's change when you change the constitution.`];
  if (markdown !== null) lines.push('The full text is now:', fencedBlockOf(markdown, 'markdown'));
  if (draftedFrom !== null) lines.push(`The SOURCES ticks now select: ${sourceTicksTextOf(draftedFrom)}.`);
  return lines.join('\n\n');
}

/** Each draft field the move changed, with the value the draft holds there now, so the agent never reads the draft again. */
function draftChangesTextOf(changes: readonly DraftFieldValue[]): string {
  if (changes.length === 0) return 'No value of the draft changed.';
  const lines = changes.map(({ field, value }) => `- \`${field}\`: ${value === null ? 'null (the draft holds no value here)' : JSON.stringify(value)}`);
  return ['The draft now holds these values:', ...lines].join('\n');
}

/** The refusals the draft's entities still hold, which Continue and Apply wait on; nothing when none stands. */
function standingEntityRefusalsTextOf(standingEntityRefusals: readonly EntityRefusal[]): string[] {
  if (standingEntityRefusals.length === 0) return [];
  const lines = standingEntityRefusals.map((refusal) => `- ${EntityRefusalWording.reasonOf(refusal)}`);
  return [['The draft\'s entities still hold these refusals, so Continue and Apply wait until User resolves them:', ...lines].join('\n')];
}

/**
 * What the pipeline agent reads when User answers, edits, undoes, discards, continues or asks for a check on its setup record, and when
 * User's check ends. The agent has no read of the record, so each message carries what changed.
 */
function setupMessageWordingOf(message: SetupMessage, promptFills: PromptFills): string {
  switch (message.kind) {
    case 'question-answered':
      return 'letters' in message.reply
        ? `User answered ${message.questionId}: ${message.reply.letters.join(', ')}.`
        : `User answered ${message.questionId}: ${message.reply.text}`;
    case 'step-continued':
      return stepContinuedMessageOf(message.mode, message.step, message.currentStep, promptFills);
    case 'constitution-edited':
      return constitutionEditedMessageOf(message.revision, message.markdown, message.draftedFrom);
    case 'draft-edited':
      return [
        `User changed the draft pipeline (revision ${message.draftRevision}): ${message.fields.join(', ')}. `
          + 'Keep User\'s change when you propose a change.',
        draftChangesTextOf(message.changes),
        ...standingEntityRefusalsTextOf(message.standingEntityRefusals),
      ].join('\n\n');
    case 'draft-edit-undone':
      return `User undid edit ${message.editId} (${message.field}) of the draft pipeline (revision ${message.draftRevision}).\n\n`
        + draftChangesTextOf(message.changes);
    case 'draft-batch-undone':
      return `User undid the edits ${message.editIds.join(', ')} (${message.fields.join(', ')}) of the draft pipeline together `
        + `(revision ${message.draftRevision}).\n\n${draftChangesTextOf(message.changes)}`;
    case 'draft-discarded':
      return `User discarded all proposed changes to the draft pipeline (revision ${message.draftRevision}).\n\n${draftChangesTextOf(message.changes)}`;
    case 'setup-resumed':
      if (message.mainMovedByCommits === 0) return 'User resumed the setup. Main did not move.';
      return filledTemplateOf(promptOf('PipelineAgentMainMoved.md'), {
        count:        String(message.mainMovedByCommits),
        commits:      message.mainMovedByCommits === 1 ? 'commit' : 'commits',
        changedPaths: message.changedPaths.length === 0 ? 'none' : message.changedPaths.join(', '),
      }).trim().replaceAll('\n', ' ');
    case 'check-requested':
      return `User asked for a check of draft revision ${message.draftRevision}. Hephaestus runs these gates two times in a fresh worktree `
        + `of main: ${message.gateNames.join(', ')}. You get the result in a later message. Do not run a gate or a script yourself.`;
    case 'check-ended':
      return checkEndedMessageOf(message.check);
  }
}

export const PipelineAgentWording = Object.freeze({
  setupMessageWordingOf,
  stepInstructionsOf,
  sourceTicksTextOf,
  fencedBlockOf,
});
