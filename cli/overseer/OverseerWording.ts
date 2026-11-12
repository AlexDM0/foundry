/**
 * The words the Overseer's DrivePass needs and services may not hold: a code-opened decision's question, and what a launched session is told.
 * The role prompts that replace the launch text come with the prompt templates later in the chain.
 */
import { readFileSync }                from 'node:fs';
import { OperationRefusalWordingUtil } from '../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import { CLAUDE_API_KEY_VARIABLE }     from '../../src/lib/claude-code/ClaudeApiKeyVariable.ts';
import type { Incident }               from '../../src/lib/tracker-model/@types/Incident.ts';
import type { Job }                    from '../../src/lib/tracker-model/@types/Job.ts';
import type { Pipeline, PipelineGate } from '../../src/lib/tracker-model/@types/Pipeline.ts';
import type {
  CheckedGate,
  ConstitutionSources,
  PipelineCheck,
  PipelineCheckResult,
  PipelineSetup,
  PipelineSetupMode,
  PipelineSetupStep,
  ResearchFinding,
  SetupQuestion
} from '../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { DecisionDraft, DecisionWording } from '../../src/lib/tracker-model/@types/PlaybookStep.ts';
import { ALLOWED_MOVES_BY_INCIDENT_KIND }      from '../../src/services/control/constants/AllowedMovesByIncidentKind.ts';
import type { AssistantFacts }                 from '../../src/services/overseer/AssistantBoot.ts';
import type { AssistantChatFacts }             from '../../src/services/overseer/AssistantSession.ts';
import type { BatonPassFailure }               from '../../src/services/overseer/BatonPass.ts';
import type {
  AirlockFacts,
  JobLaunchFacts,
  JobLaunchText,
  ReviewFindingsFacts,
  OverseerNotice
} from '../../src/services/overseer/DrivePass.ts';
import type { RedHandoffFacts }                                       from '../../src/services/overseer/RedHandoff.ts';
import type { DraftFieldValue, SetupMessage }                         from '../../src/shared/@types/ControlContext.ts';
import { filledTemplateOf }                                           from '../../src/shared/FilledTemplate.ts';
import { resourceFilePathOf }                                         from '../../src/shared/ResourceFilePath.ts';
import { DISPATCH_PROTOCOL }                                          from '../../src/shared/constants/DispatchProtocol.ts';
import { ASSISTANT_TURN_CALL_BUDGET, RED_HANDOFF_RESUME_CALL_BUDGET } from '../../src/shared/constants/OverseerLimits.ts';
import { PRODUCT_NAMES }                                              from '../../src/shared/constants/ProductNames.ts';
import { LINE_GRAMMAR_WORDING }                                       from '../LineGrammarWording.ts';

function ticketsPhraseOf(ticketIds: readonly string[]): string {
  return ticketIds.length === 0 ? 'the board' : ticketIds.map((ticketId) => `#${ticketId}`).join(', ');
}

const API_KEY_NOT_SET_WORDING: DecisionWording = {
  questions: [{
    question:    `The pipeline sets API billing, and the environment of the Overseer has no ${CLAUDE_API_KEY_VARIABLE}. No agent starts until you set it.`,
    header:      'api-key-not-set',
    multiSelect: false,
    options:     [],
  }],
  context: `Set ${CLAUDE_API_KEY_VARIABLE} at OS level, never in a committed file, as the docs/cli.md section "API billing set-up" tells. `
    + 'Then stop the Overseer with `oversee stop` and start it again where the variable is set: each agent gets the key from the '
    + 'environment the Overseer started with.',
};

const API_AUTHENTICATION_FAILED_WORDING: DecisionWording = {
  questions: [{
    question:    'The API refused the authentication of an agent session under API billing. No agent starts until you answer.',
    header:      'api-authentication-failed',
    multiSelect: false,
    options:     [],
  }],
  context: `Make sure that ${CLAUDE_API_KEY_VARIABLE} holds a valid key, and that no managed forceLoginMethod or forceLoginOrgUUID `
    + 'setting refuses API keys. Then answer: the stopped sessions resume.',
};

function budgetReachedWordingOf(draft: DecisionDraft): DecisionWording {
  return {
    questions: [{
      question:    `The session of ${ticketsPhraseOf(draft.ticketIds)} stopped at its API budget (billing.maxBudgetUsd). Its job ended.`,
      header:      'budget-reached',
      multiSelect: false,
      options:     [],
    }],
    context: 'Change billing.maxBudgetUsd in the pipeline, or not. Then answer: a fresh agent can then take the ticket.',
  };
}

function decisionWordingOf(draft: DecisionDraft): DecisionWording {
  if (draft.kind === 'api-key-not-set') return API_KEY_NOT_SET_WORDING;
  if (draft.kind === 'api-authentication-failed') return API_AUTHENTICATION_FAILED_WORDING;
  if (draft.kind === 'budget-reached') return budgetReachedWordingOf(draft);
  return {
    questions: [{
      question:    `The Overseer needs a decision (${draft.kind}) about ${ticketsPhraseOf(draft.ticketIds)}.`,
      header:      draft.kind,
      multiSelect: false,
      options:     [],
    }],
    context: '',
  };
}

const NO_CHECKS_LINE = '(no checks line is stored)';

/** The review's last step while merge approval is on, so User accepts only a branch that merges cleanly and is green. */
function mergeApprovalStepOf(target: string, ticketId: string): string {
  return `- Merge approval is on. As the last step of your review, merge the target into the branch: \`git merge --no-edit ${target}\` `
    + `on \`ticket-${ticketId}\`. Resolve each conflict, commit the merge, and make the checks line green on the result. User accepts the `
    + 'merge only when the branch merges cleanly and is green.';
}

function gateEntryOf(gate: Readonly<PipelineGate>, position: number): string {
  const folder = gate.in === undefined ? '' : ` (in \`${gate.in}\`)`;
  const entry  = `${position}. \`${gate.name}\`: \`${gate.run}\`${folder}`;
  return gate.fix === undefined ? entry : `${entry}\n   Fix: \`${gate.fix}\`. Run it before you fix anything by hand.`;
}

/** The builder's gates in run order with each fix; an `overseerOnly` gate is named as the Overseer's, never as one to run or claim. */
function gateListOf(gates: readonly Readonly<PipelineGate>[] | null): string {
  const agentGates    = (gates ?? []).filter((gate) => gate.overseerOnly !== true);
  const overseerGates = (gates ?? []).filter((gate) => gate.overseerOnly === true);
  const overseerLine  = overseerGates.length === 0
    ? []
    : ['', `The Overseer alone runs ${overseerGates.map((gate) => `\`${gate.name}\``).join(', ')}: never run or claim it.`];
  if (agentGates.length === 0) {
    const none = overseerGates.length === 0 ? 'This repository has no gates' : 'No gate is yours to run';
    return [`${none}: nothing to pass before you report, and your report's \`gates\` is empty.`, ...overseerLine].join('\n');
  }
  return [
    'Pass every gate on your final commit before you report, in this order, and claim each in your report\'s `gates` with',
    'the commit it passed on:',
    '',
    ...agentGates.map((gate, index) => gateEntryOf(gate, index + 1)),
    ...overseerLine,
  ].join('\n');
}

/** What a prompt claims of the session's limits: a refusal only where a sandbox enforces it, else a rule the session must keep itself. */
const CONFINEMENT_WORDING = {
  'confined': {
    sandboxRefusal:          'the sandbox refuses it, and ',
    pipelineAgentLimits:     'You may write only your Hatch folder, and you have no network.',
    productOwnerBashNetwork: 'Bash reaches no network.',
    assistantNetwork:        'The Overseer refuses each of these, and you have no network.',
  },
  'unconfined-by-design': {
    sandboxRefusal:          '',
    pipelineAgentLimits:     'Write only to your Hatch folder, and do not use the network. No sandbox runs on this machine: nothing stops a command that breaks this rule.',
    productOwnerBashNetwork: 'Do not use the network from Bash.',
    assistantNetwork:        'The Overseer refuses each of these. Do not use the network.',
  },
} as const satisfies Record<JobLaunchFacts['confinement'], Record<string, string>>;

/**
 * The first line runs the product-owner skill on User's request; a fresh session taking over a replaced one also reads the drafts filed so
 * far and the answers its predecessor's questions got, in the same message.
 */
function productOwnerTextOf(job: Readonly<Job>, intake: NonNullable<JobLaunchFacts['intake']>, instructions: string, confinement: JobLaunchFacts['confinement']): JobLaunchText {
  const firstLine = `/${PRODUCT_NAMES.PRODUCT_OWNER_SKILL} ${intake.text}`.trim();
  const draftLines = intake.drafts.map((draft) => `- #${draft.id} ${draft.title}`);
  const answerLines = intake.carriedAnswers.flatMap((answer) => Object.entries(answer).map(([question, answerText]) => `- ${question}\n  Answer: ${answerText}`));
  const takeover = draftLines.length === 0 && answerLines.length === 0 ? [] : [
    'An earlier product-owner session on this request was replaced; carry its intake on.',
    ...(draftLines.length === 0 ? [] : ['Drafts it filed:', ...draftLines]),
    ...(answerLines.length === 0 ? [] : ['Answers User gave its questions:', ...answerLines]),
  ];
  const fills = {
    jobId: job.id, program: PRODUCT_NAMES.PROGRAM, skill: PRODUCT_NAMES.PRODUCT_OWNER_SKILL, productOwnerBashNetwork: CONFINEMENT_WORDING[confinement].productOwnerBashNetwork,
  };
  const roleBrief = filledTemplateOf(instructions, fills);
  return { firstMessage: [firstLine, ...(takeover.length === 0 ? [] : ['', ...takeover])].join('\n'), roleBrief };
}

/** A fresh agent has its role's full budget; a resumed session the red handoff's short one. */
function airlockCallBudgetOf(role: string, resumesSession: boolean): number {
  if (resumesSession) return RED_HANDOFF_RESUME_CALL_BUDGET;
  return role === 'builder' ? DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET : DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET;
}

/**
 * The ticket's builder or reviewer resumed into the Airlock is told the conflict, with the target tip and the conflicted files, or the
 * red gate on the merged tree; a fresh agent in place of a session that could not resume is also given the ticket, its Handoff and Review.
 */
function airlockAgentMessageOf(job: Readonly<Job>, ticket: JobLaunchFacts['tickets'][number], airlock: AirlockFacts): string {
  const role = job.role ?? job.kind;
  const task = airlock.phase === 'resolving' || airlock.redHandoff === null
    ? filledTemplateOf(readFileSync(resourceFilePathOf('prompts', 'AirlockConflictMessage.md'), 'utf8'), {
      ticketId:        ticket.id,
      role,
      jobId:           job.id,
      targetTip:       airlock.targetTip,
      branchTip:       airlock.branchTip,
      airlockWorktree: airlock.worktree,
      conflictedFiles: airlock.conflictedFiles.map((path) => `- ${path}`).join('\n'),
    }).trim()
    : `You are in the Airlock of #${ticket.id} as its ${role}, job ${job.id}. The Overseer merged the target tip ${airlock.targetTip} into `
      + `your branch in the worktree ${airlock.worktree}, and ran the gates on the merged tree. ${redHandoffMessageOf(airlock.redHandoff)}`;
  const reportTemplate = readFileSync(resourceFilePathOf('prompts', 'AirlockReportMessage.md'), 'utf8');
  const report = filledTemplateOf(reportTemplate, { callBudget: String(airlockCallBudgetOf(role, airlock.resumesSession)) }).trim();
  const takeoverLine = `The session of the earlier ${role} of #${ticket.id} could not be resumed, so you take over its work. Its ticket follows, with its Handoff and Review.`;
  const takeover = airlock.resumesSession ? [] : [takeoverLine, '', ticket.body.trim(), ''];
  return [...takeover, task, '', report].join('\n');
}

/**
 * A conflict re-reviewer reads its role's instruction files, the reviewer's brief among them, filled as a first review round's, and then
 * what the Airlock, or the merge before User's code review, asks of it: the merge it re-reviews, with no question to User.
 */
function conflictReReviewMessageOf(job: Readonly<Job>, ticket: JobLaunchFacts['tickets'][number], facts: JobLaunchFacts, airlock: AirlockFacts): string {
  const instructions = filledTemplateOf(facts.instructions, {
    ticketId:          ticket.id,
    ticketTitle:       ticket.title,
    ticketBody:        ticket.body.trim(),
    jobId:             job.id,
    round:             String(job.attempt),
    checksLine:        facts.checksLine ?? NO_CHECKS_LINE,
    callBudget:        String(DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET),
    program:           PRODUCT_NAMES.PROGRAM,
    mergeApprovalStep: '',
    sandboxRefusal:    CONFINEMENT_WORDING[facts.confinement].sandboxRefusal,
  }).trim();
  const conflictedFiles = airlock.conflictedFiles.map((path) => `- ${path}`).join('\n');
  const callBudget = String(DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET);
  const task = airlock.mergePlacement === 'airlock'
    ? filledTemplateOf(readFileSync(resourceFilePathOf('prompts', 'AirlockReReviewMessage.md'), 'utf8'), {
      ticketId: ticket.id, jobId: job.id, targetTip: airlock.targetTip, branchTip: airlock.branchTip, airlockWorktree: airlock.worktree, conflictedFiles, callBudget,
    }).trim()
    : filledTemplateOf(readFileSync(resourceFilePathOf('prompts', 'HumanCodeReviewReReviewMessage.md'), 'utf8'), {
      ticketId: ticket.id, jobId: job.id, targetTip: airlock.targetTip, branchTip: airlock.branchTip, worktree: airlock.worktree, conflictedFiles, callBudget,
    }).trim();
  return [instructions, '', task].join('\n');
}

function incidentTextOf(incident: Readonly<Incident>): string {
  const tickets = incident.ticketIds.length === 0 ? '' : ` on #${incident.ticketIds.join(', #')}`;
  const job     = incident.jobId === null ? '' : `, job ${incident.jobId}`;
  return [
    `${incident.id} ${incident.kind}${tickets}${job}`,
    ...Object.entries(incident.facts).map(([fact, value]) => `  ${fact}: ${value}`),
    `  moves: ${ALLOWED_MOVES_BY_INCIDENT_KIND[incident.kind].join(', ')}; default ${incident.defaultMove}`,
  ].join('\n');
}

function incidentsTextOf(incidents: readonly Readonly<Incident>[]): string {
  return incidents.length === 0 ? 'No incident is open.' : incidents.map(incidentTextOf).join('\n\n');
}

/** One numbered chat delivering incidents; the turn it opens ends with its `result`, and what is still open then takes its default. */
function assistantChatTextOf(facts: AssistantChatFacts): string {
  return `Chat ${facts.sequence}: settle these incidents in this turn, each with one of its moves and \`--incident <I>\`.\n\n${incidentsTextOf(facts.incidents)}`;
}

/** The Assistant's brief and its first message, chat 1: its open incidents, the newest incident records and a board summary. */
function assistantTextOf(job: Readonly<Job>, assistant: AssistantFacts, instructions: string, confinement: JobLaunchFacts['confinement']): JobLaunchText {
  const { summary } = assistant;
  const statusCounts = Object.entries(summary.ticketCountByStatus).map(([status, count]) => `${status} ${count}`).join(', ');
  const jobLines = summary.liveJobs.map((live) => `- ${live.id} ${live.kind} ${live.state}${live.ticketIds.length === 0 ? '' : ` #${live.ticketIds.join(', #')}`}`);
  const historyLines = assistant.history.map((record) => `- ${record.at} ${record.kind} ${record.incidentId} ${record.fields}`);
  const firstMessage = [
    `Chat 1: you are job ${job.id}, the Assistant of this board, booted fresh. Settle the open incidents below in this turn.`,
    '',
    '## Open incidents',
    incidentsTextOf(assistant.incidents),
    '',
    '## Newest incident records',
    ...(historyLines.length === 0 ? ['None.'] : historyLines),
    '',
    '## Board',
    `Tickets: ${statusCounts === '' ? 'none' : statusCounts}. Open decisions for User: ${summary.openDecisionCount}.`,
    ...(jobLines.length === 0 ? ['No job is live.'] : ['Live jobs:', ...jobLines]),
  ].join('\n');
  const fills = {
    jobId: job.id, program: PRODUCT_NAMES.PROGRAM, callBudget: String(ASSISTANT_TURN_CALL_BUDGET), assistantNetwork: CONFINEMENT_WORDING[confinement].assistantNetwork,
  };
  const roleBrief = filledTemplateOf(instructions, fills);
  return { firstMessage, roleBrief };
}

/**
 * The first line of a builder's session resumed because its review found a claim that does not hold, or because its branch could not be
 * brought up to the target before the reviewer: a conflicted merge, or a red gate on the merged tree, worded as a red handoff.
 */
function reviewFindingsMessageOf(ticketId: string, facts: Readonly<ReviewFindingsFacts>): string {
  const handover = facts.targetCatchUp ?? null;
  if (handover?.kind === 'conflict') {
    return filledTemplateOf(readFileSync(resourceFilePathOf('prompts', 'TargetConflictMessage.md'), 'utf8'), {
      ticketId,
      targetTip:       handover.targetTip,
      conflictedFiles: handover.conflictedFiles.map((path) => `- ${path}`).join('\n'),
      resume:          String(facts.resume),
      resumesAllowed:  String(facts.resumesAllowed),
    }).trim();
  }
  if (handover?.kind === 'gate-red') {
    return `Before the review of #${ticketId}, the Overseer merged the target's tip into your branch and ran the gates on the merged tree. `
      + redHandoffMessageOf({ ...handover.redHandoff, resume: facts.resume, resumesAllowed: facts.resumesAllowed });
  }
  return [
    `The review of #${ticketId} found a claim that does not hold, so your session is resumed with its findings`
    + ` (resume ${facts.resume} of ${facts.resumesAllowed}). Fix what does not hold, commit, and end with your report again.`,
    '',
    facts.reviewSection,
  ].join('\n');
}

type SessionConfinement = JobLaunchFacts['confinement'];

type PipelineAgentFacts = NonNullable<JobLaunchFacts['pipelineAgent']>;

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
 * The step blocks a step works under: the research block also while billing is open, since the agent starts reading at once, and the
 * design block also at Apply, so the agent still answers User's changes there. An advise session reads the design rules too.
 */
function stepPromptFilesOf(mode: PipelineSetupMode, step: PipelineSetupStep): readonly string[] {
  if (mode === 'advise') return ['PipelineAgentAdvise.md', 'PipelineAgentDesign.md'];
  switch (step) {
    case 'billing':
    case 'research':
      return ['PipelineAgentResearch.md'];
    case 'constitution':
      return ['PipelineAgentConstitution.md'];
    case 'design':
    case 'apply':
      return ['PipelineAgentDesign.md'];
  }
}

function stepInstructionsOf(mode: PipelineSetupMode, step: PipelineSetupStep): string {
  const fills = { program: PRODUCT_NAMES.PROGRAM };
  return stepPromptFilesOf(mode, step).map((fileName) => filledTemplateOf(promptOf(fileName), fills).trim()).join('\n\n');
}

function findingLineOf(finding: Readonly<ResearchFinding>): string {
  const value  = finding.value === null ? '' : `: ${finding.value}`;
  const script = finding.script === null
    ? ''
    : `; script \`${finding.script.name}\` runs \`${finding.script.run}\`: ${finding.script.meaning} (${finding.script.gateCandidate}`
      + `${finding.script.needs.length === 0 ? '' : `, needs ${finding.script.needs.join(', ')}`})`;
  const paths   = finding.sourcePaths.length === 0 ? '' : ` [${finding.sourcePaths.join(', ')}]`;
  const recheck = finding.needsRecheck ? ' Needs a recheck.' : '';
  return `- ${finding.findingId} ${finding.topic}, ${finding.label}${value}${script}${paths}${recheck}`;
}

function questionLinesOf(question: Readonly<SetupQuestion>): string[] {
  const subject = question.subject === null ? '' : `, ${question.subject.kind} ${question.subject.reference}`;
  const options = question.options.map((option) => `  ${option.letter}) ${option.text}${question.recommended.includes(option.letter) ? ' (recommended)' : ''}`);
  const { answer } = question;
  const answerLine = answer === null
    ? '  Open.'
    : `  Answer: ${'letters' in answer ? answer.letters.join(', ') : answer.text}`;
  return [`- ${question.questionId} (${question.step}${subject}${question.multiple ? ', several options' : ''}): ${question.question}`, ...options, answerLine];
}

function sourceTicksTextOf(draftedFrom: Readonly<ConstitutionSources>): string {
  const ticks = [
    ...(draftedFrom.contributing ? ['CONTRIBUTING.md'] : []),
    ...(draftedFrom.research ? ['the research findings'] : []),
    ...(draftedFrom.installedDefault ? ['the installed default constitution'] : []),
  ];
  return ticks.length === 0 ? 'none' : ticks.join(', ');
}

function constitutionLinesOf(setup: Readonly<PipelineSetup>): string[] {
  const { constitution } = setup;
  if (constitution === null) return ['No constitution is drafted yet.'];
  const sources = constitution.annotations.map((annotation) => `- Line "${annotation.lineText}" (occurrence ${annotation.occurrence}): `
    + `${annotation.kind}${annotation.path === null ? '' : `, ${annotation.path}`}`);
  return [
    `Revision ${constitution.revision}. The SOURCES ticks select: ${sourceTicksTextOf(constitution.draftedFrom)}.`,
    fencedBlockOf(constitution.markdown, 'markdown'),
    ...(sources.length === 0 ? ['No line names a source.'] : ['Sources:', ...sources]),
  ];
}

function pipelineBlockOf(pipeline: Readonly<Pipeline>): string {
  return fencedBlockOf(JSON.stringify(pipeline, null, 2), 'json');
}

/** The record as the agent reads it in its first message: a fresh session in place of a replaced one starts from it. */
function setupFactsTextOf(facts: PipelineAgentFacts): string {
  const { setup } = facts;
  const sections: string[] = [];
  if (setup === null) {
    sections.push('No setup record names this job.');
    sections.push(facts.storedPipeline === null ? 'No pipeline is stored.' : `The stored pipeline:\n\n${pipelineBlockOf(facts.storedPipeline)}`);
  } else {
    const stepStates = Object.entries(setup.stepStates).map(([step, state]) => `${step} ${state}`).join(', ');
    const edits = setup.edits.map((edit) => `- ${edit.editId} by ${edit.by}, ${edit.field}: ${edit.summary}${edit.undone ? ' (undone)' : ''}`);
    sections.push(
      `Setup ${setup.setupId}, mode ${setup.mode}. The current step is ${setup.currentStep}. Steps: ${stepStates}.`,
      `### Findings\n\n${setup.findings.length === 0 ? 'None yet.' : setup.findings.map(findingLineOf).join('\n')}`,
      `### Questions\n\n${setup.questions.length === 0 ? 'None yet.' : setup.questions.flatMap(questionLinesOf).join('\n')}`,
      `### Constitution\n\n${constitutionLinesOf(setup).join('\n\n')}`,
      `### Draft pipeline\n\n${setup.draft === null ? 'No draft yet.' : `Revision ${setup.draftRevision}.\n\n${pipelineBlockOf(setup.draft)}`}`,
      `### Edits\n\n${edits.length === 0 ? 'None yet.' : edits.join('\n')}`,
    );
  }
  if (facts.mode !== 'advise' && facts.installedConstitution !== null) {
    sections.push(`### The installed default constitution\n\n${fencedBlockOf(facts.installedConstitution, 'markdown')}`);
  }
  if (facts.mode === 'advise') {
    sections.push(`### Gate history, newest last\n\n${facts.gateHistory.length === 0 ? 'None recorded.' : facts.gateHistory.join('\n')}`);
  }
  return sections.join('\n\n');
}

/** The current step's block and the record's facts; with no record, a first setup reads the research block. */
function pipelineAgentTextOf(job: Readonly<Job>, facts: PipelineAgentFacts, instructions: string, confinement: SessionConfinement): JobLaunchText {
  const fills = { jobId: job.id, program: PRODUCT_NAMES.PROGRAM };
  return {
    firstMessage: filledTemplateOf(promptOf('PipelineAgentPrompt.md'), {
      ...fills,
      pipelineAgentLimits: CONFINEMENT_WORDING[confinement].pipelineAgentLimits,
      lineGrammar:         LINE_GRAMMAR_WORDING[facts.lineGrammar],
      setupFacts:          setupFactsTextOf(facts),
      stepInstructions:    stepInstructionsOf(facts.mode, facts.setup?.currentStep ?? 'research'),
    }),
    roleBrief: filledTemplateOf(instructions, fills),
  };
}

/**
 * A builder's and a reviewer's first message is its role's instruction files, the constitution first, filled with its ticket and checks
 * line; an airlock role's instruction files are its role brief, beside the first message its merge prompt gives it.
 */
function launchTextOf(job: Readonly<Job>, facts: JobLaunchFacts): JobLaunchText {
  if (facts.intake !== null) return productOwnerTextOf(job, facts.intake, facts.instructions, facts.confinement);
  if (facts.pipelineAgent !== undefined && facts.pipelineAgent !== null) return pipelineAgentTextOf(job, facts.pipelineAgent, facts.instructions, facts.confinement);
  if (facts.assistant !== null) return assistantTextOf(job, facts.assistant, facts.instructions, facts.confinement);
  const { sandboxRefusal } = CONFINEMENT_WORDING[facts.confinement];
  const subject = ticketsPhraseOf(job.ticketIds);
  const roleBrief = `You are the ${job.role ?? job.kind} of job ${job.id}.`;
  const [ticket] = facts.tickets;
  if (job.kind === 'merge-agent' && ticket !== undefined && facts.airlock?.phase === 're-reviewing') {
    return { firstMessage: conflictReReviewMessageOf(job, ticket, facts, facts.airlock), roleBrief };
  }
  if (job.kind === 'merge-agent' && ticket !== undefined && facts.airlock !== null) {
    return { firstMessage: airlockAgentMessageOf(job, ticket, facts.airlock), roleBrief };
  }
  if (job.kind === 'review' && ticket !== undefined) {
    return {
      firstMessage: filledTemplateOf(facts.instructions, {
        ticketId:          ticket.id,
        ticketTitle:       ticket.title,
        ticketBody:        ticket.body.trim(),
        jobId:             job.id,
        round:             String(job.attempt),
        checksLine:        facts.checksLine ?? NO_CHECKS_LINE,
        callBudget:        String(DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET),
        program:           PRODUCT_NAMES.PROGRAM,
        mergeApprovalStep: facts.mergeApprovalIsOn === true && job.target !== null ? mergeApprovalStepOf(job.target, ticket.id) : '',
        sandboxRefusal,
      }),
      roleBrief,
    };
  }
  if (job.kind !== 'build' || ticket === undefined) return { firstMessage: `Job ${job.id}: work as the ${job.role ?? job.kind} on ${subject}, attempt ${job.attempt}.`, roleBrief };
  const reviewFindings = facts.reviewFindings ?? null;
  if (reviewFindings !== null) return { firstMessage: reviewFindingsMessageOf(ticket.id, reviewFindings), roleBrief };
  return {
    firstMessage: filledTemplateOf(facts.instructions, {
      ticketId:    ticket.id,
      ticketTitle: ticket.title,
      ticketBody:  ticket.body.trim(),
      jobId:       job.id,
      attempt:     String(job.attempt),
      target:      job.target ?? '',
      gateList:    gateListOf(facts.gates),
      callBudget:  String(DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET),
      program:     PRODUCT_NAMES.PROGRAM,
      sandboxRefusal,
    }),
    roleBrief,
  };
}

function windDownMessage(): string {
  return readFileSync(resourceFilePathOf('prompts', 'WindDownMessage.md'), 'utf8').trim().replaceAll('\n', ' ');
}

function resumeMessage(): string {
  return readFileSync(resourceFilePathOf('prompts', 'ResumeMessage.md'), 'utf8').trim().replaceAll('\n', ' ');
}

/** The first line of a session resumed after its question was answered: each question with User's answer, in the agent's own words. */
function answerMessageOf(answer: Readonly<Record<string, string>>): string {
  const answerLines = Object.entries(answer).map(([question, answerText]) => `Question: ${question}\nAnswer: ${answerText}`);
  return `You were interrupted while waiting for the answer to your question; carry on with it.\n\n${answerLines.join('\n\n')}`;
}

/** A Continue carries the next step's block, unless the agent already works under it. */
function stepContinuedMessageOf(mode: PipelineSetupMode, step: PipelineSetupStep, currentStep: PipelineSetupStep): string {
  const moved = `User completed the ${step} step. The current step is ${currentStep}.`;
  const nextInstructions = stepInstructionsOf(mode, currentStep);
  return nextInstructions === stepInstructionsOf(mode, step) ? moved : `${moved}\n\n${nextInstructions}`;
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

/**
 * What the pipeline agent reads when User answers, edits, undoes, discards, continues or asks for a check on its setup record, and when
 * User's check ends. The agent has no read of the record, so each message carries what changed.
 */
function setupMessageWordingOf(message: SetupMessage): string {
  switch (message.kind) {
    case 'question-answered':
      return 'letters' in message.reply
        ? `User answered ${message.questionId}: ${message.reply.letters.join(', ')}.`
        : `User answered ${message.questionId}: ${message.reply.text}`;
    case 'step-continued':
      return stepContinuedMessageOf(message.mode, message.step, message.currentStep);
    case 'constitution-edited':
      return constitutionEditedMessageOf(message.revision, message.markdown, message.draftedFrom);
    case 'draft-edited':
      return `User changed the draft pipeline (revision ${message.draftRevision}): ${message.fields.join(', ')}. `
        + `Keep User's change when you propose a change.\n\n${draftChangesTextOf(message.changes)}`;
    case 'draft-edit-undone':
      return `User undid edit ${message.editId} (${message.field}) of the draft pipeline (revision ${message.draftRevision}).\n\n`
        + draftChangesTextOf(message.changes);
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
      return `User asked for a check of draft revision ${message.draftRevision}. The Overseer runs these gates two times in a fresh worktree `
        + `of main: ${message.gateNames.join(', ')}. You get the result in a later message. Do not run a gate or a script yourself.`;
    case 'check-ended':
      return checkEndedMessageOf(message.check);
  }
}

/**
 * The first line of a session resumed to fix its red gate or Customs check, which points it to the Baton pass; a merge of the target that
 * conflicted before User's code review asks the session to merge that tip again itself.
 */
function redHandoffMessageOf(facts: Readonly<RedHandoffFacts>): string {
  if (facts.kind === 'merge-conflict') {
    return filledTemplateOf(readFileSync(resourceFilePathOf('prompts', 'MainMergeConflictMessage.md'), 'utf8'), {
      mergedTip:      facts.mergedTip ?? '',
      target:         facts.name,
      commit:         facts.commit,
      batonPassPath:  facts.batonPassPath,
      resume:         String(facts.resume),
      resumesAllowed: String(facts.resumesAllowed),
      callBudget:     String(facts.callBudget),
    }).trim().replaceAll('\n', ' ');
  }
  return filledTemplateOf(readFileSync(resourceFilePathOf('prompts', 'RedHandoffMessage.md'), 'utf8'), {
    what:           facts.kind === 'gate' ? `the \`${facts.name}\` gate` : `Customs check ${facts.name}`,
    commit:         facts.commit,
    exitCode:       facts.exitCode === null ? '' : ` with exit code ${facts.exitCode}`,
    batonPassPath:  facts.batonPassPath,
    resume:         String(facts.resume),
    resumesAllowed: String(facts.resumesAllowed),
    callBudget:     String(facts.callBudget),
  }).trim().replaceAll('\n', ' ');
}

const EARLIER_SESSION_NOTE = 'An earlier session was interrupted; uncommitted changes are its work.';

/**
 * A fresh job after a `replaced` one inherits its worktree, and is told so before anything else; one taking over a red handoff the
 * replaced session could not be resumed for opens with that handoff's message.
 */
function launchTextWithEarlierSessionNoteOf(job: Readonly<Job>, facts: JobLaunchFacts): JobLaunchText {
  const text = launchTextOf(job, facts);
  if (!facts.earlierSessionReplaced) return text;
  const redHandoff = facts.redHandoff ?? null;
  const opening = redHandoff === null ? EARLIER_SESSION_NOTE : `${EARLIER_SESSION_NOTE} ${redHandoffMessageOf(redHandoff)}`;
  return { ...text, firstMessage: `${opening}\n\n${text.firstMessage}` };
}

/** What `oversee status` reads of the live Overseer's state document; anything it does not recognise reads as no document. */
export interface OverseerStateReading {
  runtimeState:     string;
  notices:          OverseerNotice[];
  batonPassWarning: BatonPassFailure | null;
}

function overseerStateOf(document: unknown): OverseerStateReading | null {
  if (typeof document !== 'object' || document === null) return null;
  const { overseer, notices } = document as { overseer?: unknown; notices?: unknown };
  if (typeof overseer !== 'object' || overseer === null || !Array.isArray(notices)) return null;
  const { state: runtimeState, batonPassWarning } = overseer as { state?: unknown; batonPassWarning?: unknown };
  if (typeof runtimeState !== 'string') return null;
  return { runtimeState, notices: notices as OverseerNotice[], batonPassWarning: (batonPassWarning ?? null) as BatonPassFailure | null };
}

function noticeTextOf(notice: OverseerNotice): string {
  switch (notice.kind) {
    case 'install-version-changed':
      return `the install version changed, so launches are held: run \`${PRODUCT_NAMES.PROGRAM} update\``;
    case 'new-code':
      return `new code: run \`${PRODUCT_NAMES.PROGRAM} update\``;
    case 'claude-md-block-committed':
      return `launches onto ${notice.target} wait: commit the CLAUDE.md change \`update\` made`;
    case 'attribution-found':
      return `ticket #${notice.ticketId} carries an AI attribution`;
    case 'rounds-not-converging':
      return `ticket #${notice.ticketId}'s review rounds are not converging`;
    case 'dirty-main-checkout':
      return notice.blockingFiles.length === 0
        ? `landings on ${notice.target} wait: the main checkout is on ${notice.branch ?? 'no branch'}, not ${notice.target}`
        : `landings on ${notice.target} wait: the main checkout's changes to ${notice.blockingFiles.join(', ')} block the fast-forward`;
    case 'target-file-held':
      return `landings on ${notice.target} wait: another process holds ${notice.heldFiles.join(', ')} open, so git cannot replace what is held; close that program`;
    case 'incident-defaulted':
      return `incident ${notice.incidentId} took its default, ${notice.move}, as no Assistant handled it (${notice.cause})`;
    case 'cleanup-declined':
      return `git declined the ${notice.cleanup} cleanup of ${notice.groupBranch}, so it is left in place: ${notice.reason}`;
    case 'instructions-missing':
      return `job ${notice.jobId} is not launched: the instruction file ${notice.path} its pipeline names is missing`;
    case 'agent-program-refused':
      return OperationRefusalWordingUtil.agentProgramRefusalTextOf(notice.jobId, notice.cause, notice.reason);
    case 'watcher-endpoint-does-not-fit':
      return `job ${notice.jobId} is not launched: this platform cannot bind the Watcher endpoint ${notice.endpoint}; move the home folder to a shorter path`;
  }
}

function batonPassWarningTextOf(failure: BatonPassFailure): string {
  return `the Baton pass to code ${failure.successorCodeVersion} failed at ${failure.step}: ${failure.error}; this Overseer keeps driving`;
}

export const OverseerWording = Object.freeze({
  decisionWordingOf,
  launchTextOf: launchTextWithEarlierSessionNoteOf,
  assistantChatTextOf,
  windDownMessage,
  resumeMessage,
  redHandoffMessageOf,
  answerMessageOf,
  setupMessageWordingOf,
  overseerStateOf,
  noticeTextOf,
  batonPassWarningTextOf,
});
