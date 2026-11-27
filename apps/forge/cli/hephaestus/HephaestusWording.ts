/**
 * The words Hephaestus's DrivePass needs and services may not hold: a code-opened decision's question, and what a launched session is told.
 * The role prompts that replace the launch text come with the prompt templates later in the chain.
 */
import { readFileSync }                                       from 'node:fs';
import type { RedHandoffFacts }                               from '../../src/adapters/red-handoff/RedHandoffIngestion.ts';
import { UnreadableFileProblemWordingUtil }                   from '../../src/adapters/utils/UnreadableFileProblemWordingUtil.ts';
import type { AgentAdapter }                                  from '../../src/lib/agent-launch/AgentAdapter.ts';
import { AgentBillingUtil }                                   from '../../src/lib/agent-launch/utils/AgentBillingUtil.ts';
import type { DecisionQuestionOption }                        from '../../src/lib/tracker-model/@types/Decision.ts';
import type { Incident }                                      from '../../src/lib/tracker-model/@types/Incident.ts';
import type { Job }                                           from '../../src/lib/tracker-model/@types/Job.ts';
import type { Pipeline, PipelineGate }                        from '../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup, ResearchFinding, SetupQuestion } from '../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { DecisionDraft, DecisionWording }                from '../../src/lib/tracker-model/@types/PlaybookStep.ts';
import type { DocumentApprover, TicketDocumentKind }          from '../../src/lib/tracker-model/@types/TicketDocument.ts';
import { ENTITY_DECISION_ANSWERS }                            from '../../src/lib/tracker-model/constants/EntityDecisionAnswers.ts';
import { DEFAULT_CONSTITUTION_SOURCES }                       from '../../src/lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import { ROOT_ENTITY_KEY }                                    from '../../src/lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { ALLOWED_MOVES_BY_INCIDENT_KIND }                     from '../../src/services/control/constants/AllowedMovesByIncidentKind.ts';
import type { AssistantFacts }                                from '../../src/services/hephaestus/AssistantBoot.ts';
import type { AssistantChatFacts }                            from '../../src/services/hephaestus/AssistantSession.ts';
import type {
  CrossedPackageResult,
  CrossingStageFacts,
  RefusedPackageChange,
  SealedPackageReview
} from '../../src/services/hephaestus/CrossingStages.ts';
import type { DependentFixFacts, DependentFixWording } from '../../src/services/hephaestus/DependentFixTickets.ts';
import type {
  AirlockFacts,
  JobLaunchFacts,
  JobLaunchText,
  ReviewFindingsFacts
} from '../../src/services/hephaestus/DrivePass.ts';
import type { PackageNeedFacts, PackageNeedWording }                  from '../../src/services/hephaestus/EntityDecisionAnswers.ts';
import type { NeedsSettledFacts }                                     from '../../src/services/hephaestus/NeedTickets.ts';
import { filledTemplateOf }                                           from '../../src/shared/FilledTemplate.ts';
import { resourceFilePathOf }                                         from '../../src/shared/ResourceFilePath.ts';
import { DISPATCH_PROTOCOL }                                          from '../../src/shared/constants/DispatchProtocol.ts';
import { ASSISTANT_TURN_CALL_BUDGET, RED_HANDOFF_RESUME_CALL_BUDGET } from '../../src/shared/constants/HephaestusLimits.ts';
import { PRODUCT_NAMES }                                              from '../../src/shared/constants/ProductNames.ts';
import { LINE_GRAMMAR_WORDING }                                       from '../LineGrammarWording.ts';
import { PipelineAgentWording }                                       from '../PipelineAgentWording.ts';
import { documentLaunchTextOf }                                       from './DocumentLaunchText.ts';

function ticketsPhraseOf(ticketIds: readonly string[]): string {
  return ticketIds.length === 0 ? 'the board' : ticketIds.map((ticketId) => `#${ticketId}`).join(', ');
}

/** The adapter's billing and credentials, which the API billing decisions name. */
type BillingFactsOfAdapter = Pick<AgentAdapter, 'credentials' | 'billingOptions'>;

/** The variable the API way's key is read from; the API decisions open only for a vendor that bills that way. */
function apiKeyVariableNameOf(adapter: BillingFactsOfAdapter): string {
  return AgentBillingUtil.keyVariableNameOf(adapter.billingOptions, 'api') ?? 'the variable of the API key';
}

function apiKeyNotSetWordingOf(adapter: BillingFactsOfAdapter): DecisionWording {
  const billingKeyVariableName = apiKeyVariableNameOf(adapter);
  return {
    questions: [{
      question:    `The pipeline sets API billing, and the environment of Hephaestus has no ${billingKeyVariableName}. No agent starts until you set it.`,
      header:      'api-key-not-set',
      multiSelect: false,
      options:     [],
    }],
    context: `Set ${billingKeyVariableName} at OS level, never in a committed file, as the docs/cli.md section "API billing set-up" tells. `
      + 'Then stop Hephaestus with `stop` and start it again where the variable is set: each agent gets the key from the '
      + 'environment Hephaestus started with.',
  };
}

function apiAuthenticationFailedWordingOf(adapter: BillingFactsOfAdapter): DecisionWording {
  const billingKeyVariableName = apiKeyVariableNameOf(adapter);
  const { authenticationCheckSentence } = adapter.credentials;
  return {
    questions: [{
      question:    'The API refused the authentication of an agent session under API billing. No agent starts until you answer.',
      header:      'api-authentication-failed',
      multiSelect: false,
      options:     [],
    }],
    context: `Make sure that ${billingKeyVariableName} holds a valid key, and that ${authenticationCheckSentence}. Then answer: the stopped `
      + 'sessions resume.',
  };
}

/** The board's "no pipeline" question, which the setup answers: its Apply withdraws it, so User need not answer it by hand. */
const CHECKS_NOT_SET_WORDING: DecisionWording = {
  questions: [{
    question:    'No pipeline is set, so no ticket builds. Set up the pipeline on the Pipeline page, then press Apply.',
    header:      'checks-not-set',
    multiSelect: false,
    options:     [],
  }],
  context: 'Apply withdraws this question. A pipeline set by hand with '
    + `\`${PRODUCT_NAMES.PROGRAM} gate add\` or \`${PRODUCT_NAMES.PROGRAM} gate none\` leaves it open: answer it then with any text.`,
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

/** A decision of one question; with options, its answer is the label of the option User chose. */
function oneQuestionWordingOf(draft: DecisionDraft, question: string, options: DecisionQuestionOption[], context: string): DecisionWording {
  return {
    questions: [{
      question, header: draft.kind, multiSelect: false, options
    }],
    context,
  };
}

function optionOf(label: string, description: string): DecisionQuestionOption {
  return { label, description, isRecommended: false };
}

/** The need as the decision names it, `<entity>: <title>`, or a plain phrase when the draft names none. */
function needPhraseOf(draft: DecisionDraft): string {
  return draft.subject?.need === undefined ? 'a need' : `the need "${draft.subject.need}"`;
}

function packagePhraseOf(draft: DecisionDraft): string {
  return draft.subject?.packageEntity === undefined ? 'a package' : `the package \`${draft.subject.packageEntity}\``;
}

function sentenceStartOf(phrase: string): string {
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}`;
}

const CONTINUE_WITHOUT_THE_NEED = optionOf('Continue without the need', 'The ticket runs its stage again without the change.');

/**
 * The entity decisions, each with the choices `docs/cli.md` gives it. Only `work-in-other-entity`, `package-refused`,
 * `whitelist-removed-mid-crossing` and `dependent-broken` are acted on, so only they offer a choice Hephaestus carries out; the others
 * release the ticket.
 */
function entityDecisionWordingOf(draft: DecisionDraft): DecisionWording | null {
  const tickets = ticketsPhraseOf(draft.ticketIds);
  const answers = ENTITY_DECISION_ANSWERS;
  switch (draft.kind) {
    case 'need-for-root':
      return oneQuestionWordingOf(draft, `${tickets} declared ${needPhraseOf(draft)} for the root entity, which has no gates to check the change. `
        + 'Make the change yourself, or decline it.', [
        optionOf('The change is made', 'You made the change in the root entity. The ticket runs its stage again.'),
        CONTINUE_WITHOUT_THE_NEED,
      ], 'No ticket is filed for a need of the root entity while it has no gates.');
    case 'need-closes-circle':
      return oneQuestionWordingOf(draft, `${tickets} declared ${needPhraseOf(draft)}, which would close a circle in the entities' dependsOn. `
        + 'The need is refused.', [CONTINUE_WITHOUT_THE_NEED], 'To stop the ticket instead, abandon it on the board.');
    case 'need-abandoned':
      return oneQuestionWordingOf(draft, `The ticket filed for a need of ${tickets} was abandoned. The ticket no longer waits on it.`, [CONTINUE_WITHOUT_THE_NEED],
        'To stop the ticket instead, abandon it on the board.');
    case 'work-in-other-entity': {
      const owningEntities = draft.subject?.owningEntities ?? [];
      const paths = draft.subject?.paths ?? [];
      return oneQuestionWordingOf(draft, `All the work of ${tickets} belongs to another entity${owningEntities.length === 0 ? '' : ` (${codeListOf(owningEntities)})`}. `
        + 'Move the ticket to that entity, or abandon it.', [
        ...owningEntities.map((entityKey) => optionOf(
          `${answers.moveToEntityPrefix}${entityKey}`,
          `The ticket moves to \`${entityKey}\`. Its branch and worktree are dropped, and it builds again from the start in \`${entityKey}\`.`
        )),
        optionOf(answers.abandon, 'The ticket is abandoned.'),
      ], paths.length === 0 ? '' : `The build changed only these files: ${codeListOf(paths)}.`);
    }
    case 'package-refused':
      return oneQuestionWordingOf(draft, `The builder of ${packagePhraseOf(draft)} refused the change of ${tickets}: its constitution forbids it. `
        + 'Drop the package change, turn it into a need, or abandon the ticket.', [
        optionOf(answers.dropThePackageChange, 'The ticket goes back to stage 1, whose builder is told the reason and takes the change out of the package.'),
        optionOf(answers.turnItIntoANeed, 'The change goes to a ticket of the package, which this ticket waits on, and the ticket goes back to stage 1.'),
        optionOf(answers.abandon, 'The ticket is abandoned.'),
      ], '');
    case 'whitelist-removed-mid-crossing':
      return oneQuestionWordingOf(draft, `${sentenceStartOf(packagePhraseOf(draft))} left the whitelist while ${tickets} crossed into it. `
        + 'Finish the ticket under the old whitelist, or turn the package change into a need.', [
        optionOf(answers.finishUnderTheOldWhitelist, 'The stages of the ticket continue as its crossing stored them.'),
        optionOf(answers.turnThePackageChangeIntoANeed, 'The change goes to a ticket of the package, which this ticket waits on, and the ticket goes back to stage 1.'),
      ], '');
    case 'dependent-broken': {
      const dependentEntity = draft.subject?.dependentEntity;
      const dependentPhrase = dependentEntity === undefined ? 'a dependent entity' : `\`${dependentEntity}\``;
      return oneQuestionWordingOf(draft, `The change of ${packagePhraseOf(draft)} by ${tickets} breaks ${dependentPhrase}: its gate is still red `
        + 'after the package builder tried to fix it. File a fix ticket for it in the group of the ticket, or abandon the ticket.', [
        ...(dependentEntity === undefined ? [] : [optionOf(
          `${answers.fileAFixTicketForPrefix}${dependentEntity}`,
          `A ticket of \`${dependentEntity}\` that waits on this ticket goes into its group. The package build no longer runs the gates of `
          + `\`${dependentEntity}\`; the release of the group runs them, with both tickets.`
        )]),
        optionOf(answers.abandon, 'The ticket is abandoned.'),
      ], 'A ticket in no group goes into a new group named after it.');
    }
    case 'second-return':
      return oneQuestionWordingOf(draft, `${tickets} would go back to ${packagePhraseOf(draft)} a second time. The owner agreed to one way back, `
        + 'so the ticket stays at its stage.', [optionOf('Keep the ticket at its stage', 'The stage runs again.')], 'To stop the ticket instead, abandon it on the board.');
    default:
      return null;
  }
}

/** `adapter` is the agent adapter, whose billing and credentials the API billing decisions name. */
function decisionWordingOf(draft: DecisionDraft, adapter: BillingFactsOfAdapter): DecisionWording {
  if (draft.kind === 'checks-not-set') return CHECKS_NOT_SET_WORDING;
  if (draft.kind === 'api-key-not-set') return apiKeyNotSetWordingOf(adapter);
  if (draft.kind === 'api-authentication-failed') return apiAuthenticationFailedWordingOf(adapter);
  if (draft.kind === 'budget-reached') return budgetReachedWordingOf(draft);
  const entityDecisionWording = entityDecisionWordingOf(draft);
  if (entityDecisionWording !== null) return entityDecisionWording;
  return {
    questions: [{
      question:    `Hephaestus needs a decision (${draft.kind}) about ${ticketsPhraseOf(draft.ticketIds)}.`,
      header:      draft.kind,
      multiSelect: false,
      options:     [],
    }],
    context: '',
  };
}

const NO_CHECKS_LINE = '(no checks line is stored)';

/** The review's last step while merge approval is on, so User accepts only a branch that merges cleanly and is green. */
function mergeApprovalStepOf(target: string, ticketBranch: string): string {
  return `- Merge approval is on. As the last step of your review, merge the target into the branch: \`git merge --no-edit ${target}\` `
    + `on \`${ticketBranch}\`. Resolve each conflict, commit the merge, and make the checks line green on the result. User accepts the `
    + 'merge only when the branch merges cleanly and is green.';
}

function gateEntryOf(gate: Readonly<PipelineGate>, position: number): string {
  const folder = gate.in === undefined ? '' : ` (in \`${gate.in}\`)`;
  const entry  = `${position}. \`${gate.name}\`: \`${gate.run}\`${folder}`;
  return gate.fix === undefined ? entry : `${entry}\n   Fix: \`${gate.fix}\`. Run it before you fix anything by hand.`;
}

/** The builder's gates in run order with each fix; a `forgeOnly` gate is named as Hephaestus's, never as one to run or claim. */
function gateListOf(gates: readonly Readonly<PipelineGate>[] | null): string {
  const agentGates    = (gates ?? []).filter((gate) => gate.forgeOnly !== true);
  const hephaestusGates = (gates ?? []).filter((gate) => gate.forgeOnly === true);
  const hephaestusLine  = hephaestusGates.length === 0
    ? []
    : ['', `Hephaestus alone runs ${hephaestusGates.map((gate) => `\`${gate.name}\``).join(', ')}: never run or claim it.`];
  if (agentGates.length === 0) {
    const none = hephaestusGates.length === 0 ? 'This repository has no gates' : 'No gate is yours to run';
    return [`${none}: nothing to pass before you report, and your report's \`gates\` is empty.`, ...hephaestusLine].join('\n');
  }
  return [
    'Pass every gate on your final commit before you report, in this order, and claim each in your report\'s `gates` with',
    'the commit it passed on:',
    '',
    ...agentGates.map((gate, index) => gateEntryOf(gate, index + 1)),
    ...hephaestusLine,
  ].join('\n');
}

type PromptFills = AgentAdapter['promptFills'];

/** What a prompt claims of the session's limits: a refusal only where a sandbox enforces it, else a rule the session must keep itself. */
const CONFINEMENT_WORDING = {
  'confined': {
    sandboxRefusal:           'the sandbox refuses it, and ',
    pipelineAgentLimits:      'You may write only your Hatch folder, and you have no network.',
    productOwnerShellNetwork: 'Shell commands reach no network.',
    assistantNetwork:         'Hephaestus refuses each of these, and you have no network.',
  },
  'unconfined-by-design': {
    sandboxRefusal:           '',
    pipelineAgentLimits:      'Write only to your Hatch folder, and do not use the network. No sandbox runs on this machine: nothing stops a command that breaks this rule.',
    productOwnerShellNetwork: 'Do not use the network from a shell command.',
    assistantNetwork:         'Hephaestus refuses each of these. Do not use the network.',
  },
} as const satisfies Record<JobLaunchFacts['confinement'], Record<string, string>>;

/**
 * The first line runs the product-owner skill on User's request; a fresh session taking over a replaced one also reads the drafts filed so
 * far and the answers its predecessor's questions got, in the same message.
 */
function productOwnerTextOf(job: Readonly<Job>, intake: NonNullable<JobLaunchFacts['intake']>, instructions: string, confinement: JobLaunchFacts['confinement']): JobLaunchText {
  const draftLines = intake.drafts.map((draft) => `- #${draft.id} ${draft.title}`);
  const answerLines = intake.carriedAnswers.flatMap((answer) => Object.entries(answer).map(([question, answerText]) => `- ${question}\n  Answer: ${answerText}`));
  const takeover = draftLines.length === 0 && answerLines.length === 0 ? [] : [
    'An earlier product-owner session on this request was replaced; carry its intake on.',
    ...(draftLines.length === 0 ? [] : ['Drafts it filed:', ...draftLines]),
    ...(answerLines.length === 0 ? [] : ['Answers User gave its questions:', ...answerLines]),
  ];
  const fills = {
    jobId: job.id, program: PRODUCT_NAMES.PROGRAM, skill: PRODUCT_NAMES.PRODUCT_OWNER_SKILL, productOwnerShellNetwork: CONFINEMENT_WORDING[confinement].productOwnerShellNetwork,
  };
  const roleBrief = filledTemplateOf(instructions, fills);
  return { firstMessage: [intake.firstLine, ...(takeover.length === 0 ? [] : ['', ...takeover])].join('\n'), roleBrief };
}

/** A fresh agent has its role's full budget; a resumed session the red handoff's short one. */
function airlockCallBudgetOf(role: string, resumesSession: boolean): number {
  if (resumesSession) return RED_HANDOFF_RESUME_CALL_BUDGET;
  return role === 'builder' ? DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET : DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET;
}

type LaunchTicket = JobLaunchFacts['tickets'][number];

const EXPOSED_SURFACE_DEFINITION = 'What the package exposes is all that a different entity can use: the entry points, the exported names, '
  + 'their types and their behaviour.';

function codeListOf(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(', ');
}

/** Bullets that a placeholder on its own line under a heading takes: empty, the heading keeps its one blank line. */
function placeholderBulletsOf(lines: readonly string[]): string {
  return lines.map((line) => `\n- ${line}`).join('');
}

/** The entities a need may name, by stage: not the stage 1 whitelist, not the home entity in stage 2 (E24), not the sealed packages in stage 4. */
function needEntityPhraseOf(crossingStage: CrossingStageFacts | null): string {
  if (crossingStage?.stage === 'build' && crossingStage.whitelistedPackages.length > 0) return 'a different entity that the whitelist does not name';
  if (crossingStage?.stage === 'package-build') return `an entity that is not this package and not \`${crossingStage.homeEntity}\``;
  if (crossingStage?.stage === 'adapt' && crossingStage.crossedPackages.length > 0) {
    return `a different entity that is not a sealed package (${codeListOf(crossingStage.crossedPackages.map((result) => result.entity))})`;
  }
  return 'a different entity';
}

function needDeclarationLineOf(crossingStage: CrossingStageFacts | null): string {
  return `When the work needs a change in ${needEntityPhraseOf(crossingStage)}, do not make that change. Declare a need before you write there: `
    + `\`${PRODUCT_NAMES.PROGRAM} need declare "<title>" --entity <key> --body-file <path>\`. The body is the body of a ticket: a numbered `
    + '`## Acceptance` that gives the intended use, and a `## Brief`. Do not name the job: Hephaestus adds it. Then commit your work, '
    + 'and end with the outcome `needs-declared`. When each need is settled, Hephaestus starts this stage again.';
}

/** A package whose builder refused the ticket's change (E22): stage 1 takes the change back out of the package. */
function refusedPackageChangeLineOf(refused: Readonly<RefusedPackageChange>): string {
  const reason = refused.refusedReason.trim();
  const reasonText = reason === '' ? 'It gave no reason.' : `Its reason:\n\n${reason.split('\n').map((line) => (line === '' ? '' : `  ${line}`)).join('\n')}\n`;
  return `The builder of \`${refused.entity}\` refused the change of this ticket in that package. ${reasonText}\n  Remove each change of `
    + `\`${refused.entity}\` from the branch. Customs sends your session back for a change of \`${refused.entity}\`.`;
}

/**
 * A builder of an entity: where it writes, the proposal its whitelist permits in stage 1, and how it declares a need for another entity. A
 * job of the root entity declares no need, since every entity consumes the root entity and each need would close a circle (E13).
 */
function builderEntityScopeOf(job: Readonly<Job>, facts: JobLaunchFacts): string {
  if (job.entity === undefined) return '';
  const { entity } = job;
  const crossingStage = facts.crossingStage ?? null;
  const whitelistedPackages = crossingStage?.stage === 'build' ? crossingStage.whitelistedPackages : [];
  const proposalLines = whitelistedPackages.length === 0 ? [] : [
    `In this stage you can also change the files of a package that the whitelist of \`${entity}\` names: ${codeListOf(whitelistedPackages)}. `
    + 'This change is a proposal. After your report, the builder of each package builds it in its own stage, and its reviewer seals it.',
  ];
  const isRootEntityJob = entity === (facts.rootEntityKey ?? ROOT_ENTITY_KEY);
  const refusedLines = crossingStage?.stage === 'build' ? (crossingStage.refusedPackageChanges ?? []).map(refusedPackageChangeLineOf) : [];
  return placeholderBulletsOf([
    `This job builds in the entity \`${entity}\`. Change only the files in the homes of \`${entity}\` and in its \`reach\`. Customs sends `
    + 'your session back one time for a change to a different file, and a second such change fails the job.',
    ...proposalLines,
    ...refusedLines,
    ...(isRootEntityJob ? [] : [needDeclarationLineOf(crossingStage)]),
  ]);
}

/** The package reviewer confirms or corrects the package builder's statement, which decides whether the adapt stage runs (E40). */
function exposedSurfaceConfirmationLineOf(packageEntity: string, exposedSurfaceChanged: boolean): string {
  return `The builder of \`${packageEntity}\` stated that what the package exposes ${exposedSurfaceChanged ? 'changed' : 'did not change'} `
    + `from the proposal of stage 1. ${EXPOSED_SURFACE_DEFINITION} Compare the proposal with the branch at your HEAD, with your own fixes. `
    + 'In your report, set `exposedSurfaceConfirmed` to true when the statement is correct, and to false when it is not correct. When it '
    + 'is false, write in your `reviewText` what changed.';
}

/** The package reviewer's text, which can name problems in the home's files (E32), indented under its bullet. */
function packageReviewLineOf(homeEntity: string, packageReview: Readonly<SealedPackageReview>): string {
  const reviewText = packageReview.reviewText.trim();
  if (reviewText === '') return `The reviewer of \`${packageReview.entity}\` wrote no review text.`;
  const indentedText = reviewText.split('\n').map((line) => (line === '' ? '' : `  ${line}`)).join('\n');
  return `The reviewer of \`${packageReview.entity}\` wrote this review. Examine each problem that it gives in the files of \`${homeEntity}\`:\n\n`
    + indentedText;
}

/** A reviewer of an entity: what it reviews and where it may fix, by the stage of a crossing ticket. */
function reviewerEntityScopeOf(job: Readonly<Job>, crossingStage: CrossingStageFacts | null): string {
  if (job.entity === undefined) return '';
  const { entity } = job;
  const fixScope = `Fix only in the files in the homes of \`${entity}\` and in its \`reach\`.`;
  if (crossingStage?.stage === 'package-review') {
    const home = crossingStage.homeEntity;
    return placeholderBulletsOf([
      `This review is stage 3 of the ticket: the package review of \`${entity}\`. The ticket belongs to the entity \`${home}\`. Review the `
      + `change of the branch in the files of \`${entity}\` and its \`reach\`. ${fixScope}`,
      `When you see a problem in the files of \`${home}\`, write it in your \`reviewText\`. Do not fix it, and do not file a ticket for it. `
      + `The builder and the reviewer of \`${home}\` get your \`reviewText\`.`,
      `After your review, Hephaestus seals the change of the ticket in \`${entity}\`. No later stage of the ticket can change it.`,
      exposedSurfaceConfirmationLineOf(entity, crossingStage.exposedSurfaceChanged),
    ]);
  }
  if (crossingStage?.stage === 'review' && crossingStage.crossedPackages.length > 0) {
    return placeholderBulletsOf([
      `This review is stage 5 of the ticket: the review of \`${entity}\`. ${fixScope}`,
      `The change of the ticket in ${codeListOf(crossingStage.crossedPackages.map(({ entity: packageEntity }) => packageEntity))} is sealed. `
      + 'Do not change the files of these packages. When the cause of a problem is in a package, write it in your `reviewText`, and claim '
      + 'the item `does-not-hold`. The ticket then goes back to the builder of the adapt stage, which can send it back to the package.',
      ...crossingStage.crossedPackages.map((packageReview) => packageReviewLineOf(entity, packageReview)),
    ]);
  }
  return placeholderBulletsOf([`This review is of the entity \`${entity}\`. ${fixScope}`]);
}

function crossedPackageResultOf(result: Readonly<CrossedPackageResult>): string {
  const exposed = result.exposedSurfaceChanged
    ? 'What the package exposes changed from the proposal.'
    : 'What the package exposes is the same as in the proposal.';
  return [`### The package \`${result.entity}\``, '', exposed, '', result.reviewText.trim()].join('\n');
}

/**
 * Stage 4: the resumed session of stage 1 gets the adapt message alone; a fresh one, since that session cannot continue (E43), gets it
 * before its build prompt, whose ticket holds the handoff of stage 1.
 */
function adaptMessageOf(job: Readonly<Job>, ticket: LaunchTicket, facts: JobLaunchFacts, adapt: Extract<CrossingStageFacts, { stage: 'adapt' }>): string {
  const homeEntity = job.entity ?? '';
  const message = filledTemplateOf(promptOf('AdaptMessage.md'), {
    opening: adapt.resumesSession
      ? `The package stages of #${ticket.id} are complete. Your session of stage 1 continues.`
      : `The session of stage 1 of #${ticket.id} cannot continue. You continue its work on the same branch. The ticket below holds its handoff.`,
    ticketId:       ticket.id,
    packageResults: adapt.crossedPackages.map(crossedPackageResultOf).join('\n\n'),
    stageRules:     adaptStageRulesOf(homeEntity, adapt),
    closing:        adapt.resumesSession
      ? `Run the gates of \`${homeEntity}\` again, and end with your report.`
      : `The build prompt of \`${homeEntity}\` follows.`,
  }).trim();
  return adapt.resumesSession ? message : `${message}\n\n${builderInstructionsOf(job, ticket, facts)}`;
}

/** The rules of stage 4: the sealed packages, where the builder writes, the way back to a package, and the Acceptance evidence it owns. */
function adaptStageRulesOf(homeEntity: string, adapt: Extract<CrossingStageFacts, { stage: 'adapt' }>): string {
  return filledTemplateOf(promptOf('AdaptStageRules.md'), {
    homeEntity,
    sealedPackages: codeListOf(adapt.crossedPackages.map((result) => result.entity)),
  }).trim();
}

/**
 * A home review that did not hold sends the ticket back to stage 4 (E51). The session it resumes may not have run stage 4, since `adapt` was
 * skipped, so it is told the stage's rules after the findings.
 */
function adaptAfterTheHomeReviewOf(ticketId: string, homeEntity: string, findingsMessage: string, adapt: Extract<CrossingStageFacts, { stage: 'adapt' }>): string {
  return [
    findingsMessage,
    '',
    `Your session continues as stage 4 of ticket #${ticketId}: adapt. The rules of this stage apply to your fix.`,
    '',
    adaptStageRulesOf(homeEntity, adapt),
  ].join('\n');
}

/** What the package review wrote when it did not hold, which the package build it sent back fixes (E34). */
function packageReviewFindingsSectionOf(packageEntity: string, packageReviewFindings: string): string {
  return [
    `## Why the package build of \`${packageEntity}\` runs again`,
    '',
    `The package review of \`${packageEntity}\` found a claim that does not hold. Fix what does not hold. Its review follows:`,
    '',
    packageReviewFindings.trim(),
  ].join('\n');
}

/** What the adapt builder wrote the package must give, when it sent the ticket back to this package build (E41, E42). */
function packageReturnSectionOf(homeEntity: string, packageEntity: string, packageReturnReason: string): string {
  const indentedReason = packageReturnReason.trim().split('\n').map((line) => (line === '' ? '' : `  ${line}`)).join('\n');
  return [
    `## Why the ticket is back in \`${packageEntity}\``,
    '',
    `In stage 4, the builder of \`${homeEntity}\` sent the ticket back to \`${packageEntity}\`. Hephaestus lifted the seal of `
    + `\`${packageEntity}\`. The builder of \`${homeEntity}\` wrote what the package must give:`,
    '',
    indentedReason,
    '',
    `Make this change in \`${packageEntity}\`, if its constitution allows it. This ticket goes back one time only.`,
  ].join('\n');
}

/** Stage 2: the package builder reads why the ticket came back to it, if it did, then the rules of its stage, then the build prompt of its package. */
function packageBuildMessageOf(job: Readonly<Job>, ticket: LaunchTicket, facts: JobLaunchFacts, packageBuild: Extract<CrossingStageFacts, { stage: 'package-build' }>): string {
  const packageEntity = job.entity ?? '';
  const stageRules = filledTemplateOf(promptOf('PackageBuildPrompt.md'), {
    ticketId:                 ticket.id,
    ticketBranch:             ticket.branch,
    target:                   job.target ?? '',
    homeEntity:               packageBuild.homeEntity,
    packageEntity,
    exposedSurfaceDefinition: EXPOSED_SURFACE_DEFINITION,
  }).trim();
  const packageReturn = packageBuild.packageReturnReason === undefined
    ? ''
    : `${packageReturnSectionOf(packageBuild.homeEntity, packageEntity, packageBuild.packageReturnReason)}\n\n`;
  const packageReviewFindings = packageBuild.packageReviewFindings === undefined
    ? ''
    : `${packageReviewFindingsSectionOf(packageEntity, packageBuild.packageReviewFindings)}\n\n`;
  return `${packageReturn}${packageReviewFindings}${stageRules}\n\n${builderInstructionsOf(job, ticket, facts)}`;
}

/** Where a session at the root of a folder tracker's worktree finds its project, since its ticket names paths from the project's folder. */
function projectFolderLinesOf(facts: JobLaunchFacts): string {
  if (facts.projectFolder === undefined) return '';
  return [
    `Your working directory is the root of this worktree. The project of this board is in the folder \`${facts.projectFolder}\` of`,
    'the worktree. A path in the ticket starts from that folder. A path that starts with `/` starts from the root of the worktree.',
    '',
    '',
  ].join('\n');
}

const DOCUMENT_TITLE: Readonly<Record<TicketDocumentKind, string>> = { spec: 'Spec', plan: 'Plan' };

const DOCUMENT_APPROVER_TEXT: Readonly<Record<DocumentApprover, string>> = { person: 'User', pipeline: 'the pipeline' };

/** The ticket's spec and plan as the role reads them, after the filled brief; nothing for a ticket without documents. */
function ticketDocumentsSectionOf(ticket: LaunchTicket): string {
  const documents = ticket.documents ?? [];
  if (documents.length === 0) return '';
  const documentParts = documents.map((reading) => [
    `### ${DOCUMENT_TITLE[reading.document]}, version ${reading.versionNumber}, approved by ${DOCUMENT_APPROVER_TEXT[reading.approvedBy]}`,
    '',
    reading.text.trim(),
  ].join('\n'));
  const section = filledTemplateOf(readFileSync(resourceFilePathOf('prompts', 'TicketDocumentsSection.md'), 'utf8'), { documents: documentParts.join('\n\n'), });
  return `\n\n${section.trim()}\n`;
}

/** A builder's instruction files, filled for its ticket and attempt, then the ticket's documents it reads. */
function builderInstructionsOf(job: Readonly<Job>, ticket: LaunchTicket, facts: JobLaunchFacts): string {
  return projectFolderLinesOf(facts) + filledTemplateOf(facts.instructions, {
    ticketId:       ticket.id,
    ticketBranch:   ticket.branch,
    ticketTitle:    ticket.title,
    ticketBody:     ticket.body.trim(),
    jobId:          job.id,
    attempt:        String(job.attempt),
    target:         job.target ?? '',
    gateList:       gateListOf(facts.gates),
    callBudget:     String(DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET),
    program:        PRODUCT_NAMES.PROGRAM,
    sandboxRefusal: CONFINEMENT_WORDING[facts.confinement].sandboxRefusal,
    entityScope:    builderEntityScopeOf(job, facts),
  }) + ticketDocumentsSectionOf(ticket);
}

/**
 * A reviewer's instruction files, filled for its ticket and round, then the ticket's documents it reads; `mergeApprovalStep` is empty where
 * no approval step applies.
 */
function reviewerInstructionsOf(job: Readonly<Job>, ticket: LaunchTicket, facts: JobLaunchFacts, mergeApprovalStep: string): string {
  return projectFolderLinesOf(facts) + filledTemplateOf(facts.instructions, {
    ticketId:       ticket.id,
    ticketBranch:   ticket.branch,
    ticketTitle:    ticket.title,
    ticketBody:     ticket.body.trim(),
    jobId:          job.id,
    round:          String(job.attempt),
    checksLine:     facts.checksLine ?? NO_CHECKS_LINE,
    callBudget:     String(DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET),
    program:        PRODUCT_NAMES.PROGRAM,
    mergeApprovalStep,
    sandboxRefusal: CONFINEMENT_WORDING[facts.confinement].sandboxRefusal,
    reviewScope:    reviewerEntityScopeOf(job, facts.crossingStage ?? null),
  }) + ticketDocumentsSectionOf(ticket);
}

/**
 * The ticket's builder or reviewer resumed into the Airlock is told the conflict, with the target tip and the conflicted files, or the
 * red gate on the merged tree; a package's builder that resolves its part of a crossing ticket's conflict is told to leave the merge open.
 * A fresh agent in place of a session that could not resume first reads the instruction files of the role it stands in for, then the
 * ticket, its Handoff and Review; a resumed session read them at its own launch.
 */
function airlockAgentMessageOf(job: Readonly<Job>, ticket: LaunchTicket, facts: JobLaunchFacts, airlock: AirlockFacts, promptFills: PromptFills): string {
  const role = job.role ?? job.kind;
  const conflictTemplate = airlock.leavesTheMergeOpen === true ? 'AirlockOpenMergeMessage.md' : 'AirlockConflictMessage.md';
  const task = airlock.phase === 'resolving' || airlock.redHandoff === null
    ? filledTemplateOf(readFileSync(resourceFilePathOf('prompts', conflictTemplate), 'utf8'), {
      ticketId:        ticket.id,
      role,
      jobId:           job.id,
      targetTip:       airlock.targetTip,
      branchTip:       airlock.branchTip,
      airlockWorktree: airlock.worktree,
      conflictedFiles: airlock.conflictedFiles.map((path) => `- ${path}`).join('\n'),
    }).trim()
    : `You are in the Airlock of #${ticket.id} as its ${role}, job ${job.id}. Hephaestus merged the target tip ${airlock.targetTip} into `
      + `your branch in the worktree ${airlock.worktree}, and ran the gates on the merged tree. ${redHandoffMessageOf(airlock.redHandoff)}`;
  const reportTemplate = readFileSync(resourceFilePathOf('prompts', 'AirlockReportMessage.md'), 'utf8');
  const report = filledTemplateOf(reportTemplate, { ...promptFills, callBudget: String(airlockCallBudgetOf(role, airlock.resumesSession)) }).trim();
  const takeoverLine = `The session of the earlier ${role} of #${ticket.id} could not be resumed, so you take over its work. Its ticket follows, with its Handoff and Review.`;
  if (airlock.resumesSession) return [task, '', report].join('\n');
  const instructions = (role === 'builder' ? builderInstructionsOf(job, ticket, facts) : reviewerInstructionsOf(job, ticket, facts, '')).trim();
  return [...(instructions === '' ? [] : [instructions, '']), takeoverLine, '', ticket.body.trim(), '', task, '', report].join('\n');
}

/**
 * A conflict re-reviewer reads its role's instruction files, the reviewer's brief among them, filled as a first review round's, and then
 * what the Airlock, or the merge before User's code review, asks of it: the merge it re-reviews, with no question to User.
 */
function conflictReReviewMessageOf(job: Readonly<Job>, ticket: LaunchTicket, facts: JobLaunchFacts, airlock: AirlockFacts, promptFills: PromptFills): string {
  const instructions = reviewerInstructionsOf(job, ticket, facts, '').trim();
  const conflictedFiles = airlock.conflictedFiles.map((path) => `- ${path}`).join('\n');
  const callBudget = String(DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET);
  const task = airlock.mergePlacement === 'airlock'
    ? filledTemplateOf(readFileSync(resourceFilePathOf('prompts', 'AirlockReReviewMessage.md'), 'utf8'), {
      ...promptFills,
      ticketId:        ticket.id,
      jobId:           job.id,
      targetTip:       airlock.targetTip,
      branchTip:       airlock.branchTip,
      airlockWorktree: airlock.worktree,
      conflictedFiles,
      callBudget,
    }).trim()
    : filledTemplateOf(readFileSync(resourceFilePathOf('prompts', 'HumanCodeReviewReReviewMessage.md'), 'utf8'), {
      ...promptFills,
      ticketId:  ticket.id,
      jobId:     job.id,
      targetTip: airlock.targetTip,
      branchTip: airlock.branchTip,
      worktree:  airlock.worktree,
      conflictedFiles,
      callBudget,
    }).trim();
  return [instructions, '', task].join('\n');
}

function incidentTextOf(incident: Readonly<Incident>): string {
  const tickets = incident.ticketIds.length === 0 ? '' : ` on #${incident.ticketIds.join(', #')}`;
  const job     = incident.jobId === null ? '' : `, job ${incident.jobId}`;
  return [
    `${incident.id} ${incident.kind}${tickets}${job}`,
    ...Object.entries(UnreadableFileProblemWordingUtil.wordedIncidentFactsOf(incident)).map(([fact, value]) => `  ${fact}: ${value}`),
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
    return `Before the review of #${ticketId}, Hephaestus merged the target's tip into your branch and ran the gates on the merged tree. `
      + redHandoffMessageOf({ ...handover.redHandoff, resume: facts.resume, resumesAllowed: facts.resumesAllowed });
  }
  return [
    `The review of #${ticketId} found a claim that does not hold, so your session is resumed with its findings`
    + ` (resume ${facts.resume} of ${facts.resumesAllowed}). Fix what does not hold, commit, and end with your report again.`,
    '',
    facts.reviewSection,
  ].join('\n');
}

function settledNeedLineOf(need: Readonly<NeedsSettledFacts['needs'][number]>): string {
  const ticket = need.ticketId === null ? 'no ticket: User decided it' : `#${need.ticketId}, ${need.status ?? 'gone'}`;
  return `- ${need.entity}: ${need.title} (${ticket})`;
}

/**
 * The first line of a build that runs its stage again once the needs the stage declared are settled: the resumed session continues, and a
 * fresh session gets it before its build prompt, as the notes of the session before it.
 */
function needsSettledMessageOf(ticketId: string, facts: Readonly<NeedsSettledFacts>): string {
  const opening = facts.resumesSession
    ? `The needs that you declared for #${ticketId} are settled. Your session continues.`
    : `An earlier session of #${ticketId} declared needs in other entities. They are settled now. The commits of that session are on your branch.`;
  return [
    opening,
    '',
    ...facts.needs.map(settledNeedLineOf),
    '',
    `Before you continue the work, merge \`${facts.mainLine}\` into your branch: \`git merge --no-edit ${facts.mainLine}\`. If a conflict occurs, `
    + 'resolve it and commit the merge. Then continue the work of the ticket and end with your report.',
  ].join('\n');
}

type SessionConfinement = JobLaunchFacts['confinement'];

type PipelineAgentFacts = NonNullable<JobLaunchFacts['pipelineAgent']>;

function promptOf(fileName: string): string {
  return readFileSync(resourceFilePathOf('prompts', fileName), 'utf8');
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

function constitutionLinesOf(constitution: Readonly<PipelineSetup>['constitution']): string[] {
  if (constitution === null) return [`No constitution is drafted yet. The SOURCES ticks select: ${PipelineAgentWording.sourceTicksTextOf(DEFAULT_CONSTITUTION_SOURCES)}.`];
  const sources = constitution.annotations.map((annotation) => `- Line "${annotation.lineText}" (occurrence ${annotation.occurrence}): `
    + `${annotation.kind}${annotation.path === null ? '' : `, ${annotation.path}`}`);
  return [
    `Revision ${constitution.revision}. The SOURCES ticks select: ${PipelineAgentWording.sourceTicksTextOf(constitution.draftedFrom)}.`,
    PipelineAgentWording.fencedBlockOf(constitution.markdown, 'markdown'),
    ...(sources.length === 0 ? ['No line names a source.'] : ['Sources:', ...sources]),
  ];
}

function pipelineBlockOf(pipeline: Readonly<Pipeline>): string {
  return PipelineAgentWording.fencedBlockOf(JSON.stringify(pipeline, null, 2), 'json');
}

/** The session's own part of the record: the forge's, or its entity's, which holds nothing until the session records into it. */
function levelPartOf(setup: Readonly<PipelineSetup>, entityKey: string | null): Pick<PipelineSetup, 'findings' | 'questions' | 'constitution'> {
  if (entityKey === null) return setup;
  const parts = setup.entities ?? {};
  return (Object.hasOwn(parts, entityKey) ? parts[entityKey] : undefined) ?? { findings: [], questions: [], constitution: null };
}

/** For the session of one entity: what it works on, and what it must not change. */
function entityLevelLineOf(entityKey: string): string {
  return `This session works on the entity ${entityKey} only. The findings, questions and constitution below are of this entity. `
    + `Propose edits only of the fields entity:${entityKey}/<field>. Another session works on each other entity.`;
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
    const part = levelPartOf(setup, facts.entity);
    sections.push(
      `Setup ${setup.setupId}, mode ${setup.mode}. The current step is ${setup.currentStep}. Steps: ${stepStates}.`,
      ...(facts.entity === null ? [] : [entityLevelLineOf(facts.entity)]),
      `### Findings\n\n${part.findings.length === 0 ? 'None yet.' : part.findings.map(findingLineOf).join('\n')}`,
      `### Questions\n\n${part.questions.length === 0 ? 'None yet.' : part.questions.flatMap(questionLinesOf).join('\n')}`,
      `### Constitution\n\n${constitutionLinesOf(part.constitution).join('\n\n')}`,
      `### Draft pipeline\n\n${setup.draft === null ? 'No draft yet.' : `Revision ${setup.draftRevision}.\n\n${pipelineBlockOf(setup.draft)}`}`,
      `### Edits\n\n${edits.length === 0 ? 'None yet.' : edits.join('\n')}`,
    );
  }
  if (facts.mode !== 'advise' && facts.installedConstitution !== null) {
    sections.push(`### The installed default constitution\n\n${PipelineAgentWording.fencedBlockOf(facts.installedConstitution, 'markdown')}`);
  }
  if (facts.mode === 'advise') {
    sections.push(`### Gate history, newest last\n\n${facts.gateHistory.length === 0 ? 'None recorded.' : facts.gateHistory.join('\n')}`);
  }
  return sections.join('\n\n');
}

/**
 * The first line runs the pipeline setup skill, which holds the procedure; the current step's block and the record's facts follow, and with
 * no record a first setup reads the research block.
 */
function pipelineAgentTextOf(
  job: Readonly<Job>,
  facts: PipelineAgentFacts,
  instructions: string,
  confinement: SessionConfinement,
  promptFills: PromptFills,
): JobLaunchText {
  const fills = { jobId: job.id, program: PRODUCT_NAMES.PROGRAM };
  const procedure = filledTemplateOf(promptOf('PipelineAgentPrompt.md'), {
    ...fills,
    skill:               PRODUCT_NAMES.PIPELINE_SETUP_SKILL,
    pipelineAgentLimits: CONFINEMENT_WORDING[confinement].pipelineAgentLimits,
    lineGrammar:         LINE_GRAMMAR_WORDING[facts.lineGrammar],
    setupFacts:          setupFactsTextOf(facts),
    stepInstructions:    PipelineAgentWording.stepInstructionsOf(facts.mode, facts.setup?.currentStep ?? 'research', promptFills),
  });
  return { firstMessage: `${facts.firstLine}\n\n${procedure}`, roleBrief: filledTemplateOf(instructions, fills) };
}

/**
 * A builder's and a reviewer's first message is its role's instruction files, the constitution first, filled with its ticket and checks
 * line; an airlock role's instruction files are its role brief, beside the first message its merge prompt gives it. The instruction files
 * take the adapter's names of its tools and files before the job's own fills, so a ticket's text is never filled in turn.
 */
function launchTextOf(job: Readonly<Job>, unfilledFacts: JobLaunchFacts, promptFills: PromptFills): JobLaunchText {
  const facts = { ...unfilledFacts, instructions: filledTemplateOf(unfilledFacts.instructions, promptFills) };
  if (facts.intake !== null) return productOwnerTextOf(job, facts.intake, facts.instructions, facts.confinement);
  if (facts.pipelineAgent !== undefined && facts.pipelineAgent !== null) return pipelineAgentTextOf(job, facts.pipelineAgent, facts.instructions, facts.confinement, promptFills);
  const documentLaunchText = documentLaunchTextOf(job, facts);
  if (documentLaunchText !== null) return documentLaunchText;
  if (facts.assistant !== null) return assistantTextOf(job, facts.assistant, facts.instructions, facts.confinement);
  const subject = ticketsPhraseOf(job.ticketIds);
  const roleBrief = `You are the ${job.role ?? job.kind} of job ${job.id}.`;
  const [ticket] = facts.tickets;
  if (job.kind === 'merge-agent' && ticket !== undefined && facts.airlock?.phase === 're-reviewing') {
    return { firstMessage: conflictReReviewMessageOf(job, ticket, facts, facts.airlock, promptFills), roleBrief };
  }
  if (job.kind === 'merge-agent' && ticket !== undefined && facts.airlock !== null) {
    return { firstMessage: airlockAgentMessageOf(job, ticket, facts, facts.airlock, promptFills), roleBrief };
  }
  if (job.kind === 'review' && ticket !== undefined) {
    // Merge approval is once per ticket, at its end (E36): a package review of stage 3 does not merge the target in.
    const approvesTheMerge = facts.mergeApprovalIsOn === true && facts.crossingStage?.stage !== 'package-review';
    const mergeApprovalStep = approvesTheMerge && job.target !== null ? mergeApprovalStepOf(job.target, ticket.branch) : '';
    return { firstMessage: reviewerInstructionsOf(job, ticket, facts, mergeApprovalStep), roleBrief };
  }
  if (job.kind !== 'build' || ticket === undefined) return { firstMessage: `Job ${job.id}: work as the ${job.role ?? job.kind} on ${subject}, attempt ${job.attempt}.`, roleBrief };
  const needsSettled = facts.needsSettled ?? null;
  if (needsSettled?.resumesSession === true) return { firstMessage: needsSettledMessageOf(ticket.id, needsSettled), roleBrief };
  if (needsSettled !== null) {
    return { firstMessage: `${needsSettledMessageOf(ticket.id, needsSettled)}\n\n${freshBuilderMessageOf(job, ticket, facts, true)}`, roleBrief };
  }
  const reviewFindings = facts.reviewFindings ?? null;
  const crossingStage = facts.crossingStage ?? null;
  if (reviewFindings !== null && crossingStage?.stage === 'adapt') {
    return { firstMessage: adaptAfterTheHomeReviewOf(ticket.id, job.entity ?? '', reviewFindingsMessageOf(ticket.id, reviewFindings), crossingStage), roleBrief };
  }
  if (reviewFindings !== null) return { firstMessage: reviewFindingsMessageOf(ticket.id, reviewFindings), roleBrief };
  return { firstMessage: freshBuilderMessageOf(job, ticket, facts, false), roleBrief };
}

/** A builder's message by the stage of its ticket; after settled needs no earlier session continues, so an adapt stage starts fresh too. */
function freshBuilderMessageOf(job: Readonly<Job>, ticket: LaunchTicket, facts: JobLaunchFacts, afterSettledNeeds: boolean): string {
  const crossingStage = facts.crossingStage ?? null;
  if (crossingStage?.stage === 'adapt') {
    return adaptMessageOf(job, ticket, facts, afterSettledNeeds ? { ...crossingStage, resumesSession: false } : crossingStage);
  }
  if (crossingStage?.stage === 'package-build') return packageBuildMessageOf(job, ticket, facts, crossingStage);
  return builderInstructionsOf(job, ticket, facts);
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

/**
 * The first line of a session resumed to fix its red gate or Customs check, which points it to the restart; a merge of the target that
 * conflicted before User's code review asks the session to merge that tip again itself.
 */
function redHandoffMessageOf(facts: Readonly<RedHandoffFacts>): string {
  if (facts.kind === 'merge-conflict') {
    return filledTemplateOf(readFileSync(resourceFilePathOf('prompts', 'MainMergeConflictMessage.md'), 'utf8'), {
      mergedTip:           facts.mergedTip ?? '',
      target:              facts.name,
      commit:              facts.commit,
      gateFailureNotePath: facts.gateFailureNotePath,
      resume:              String(facts.resume),
      resumesAllowed:      String(facts.resumesAllowed),
      callBudget:          String(facts.callBudget),
    }).trim().replaceAll('\n', ' ');
  }
  return filledTemplateOf(readFileSync(resourceFilePathOf('prompts', 'RedHandoffMessage.md'), 'utf8'), {
    what:                facts.kind === 'gate' ? `the \`${facts.name}\` gate` : `Customs check ${facts.name}`,
    commit:              facts.commit,
    exitCode:            facts.exitCode === null ? '' : ` with exit code ${facts.exitCode}`,
    gateFailureNotePath: facts.gateFailureNotePath,
    resume:              String(facts.resume),
    resumesAllowed:      String(facts.resumesAllowed),
    callBudget:          String(facts.callBudget),
  }).trim().replaceAll('\n', ' ');
}

const EARLIER_SESSION_NOTE = 'An earlier session was interrupted; uncommitted changes are its work.';

/**
 * A fresh job after a `replaced` one inherits its worktree, and is told so before anything else; one taking over a red handoff the
 * replaced session could not be resumed for opens with that handoff's message.
 */
/** `promptFills` are the agent adapter's names of its tools and files, which the prompts a session reads at launch are filled with. */
function launchTextWithEarlierSessionNoteOf(job: Readonly<Job>, facts: JobLaunchFacts, promptFills: PromptFills): JobLaunchText {
  const text = launchTextOf(job, facts, promptFills);
  if (!facts.earlierSessionReplaced) return text;
  const redHandoff = facts.redHandoff ?? null;
  const opening = redHandoff === null ? EARLIER_SESSION_NOTE : `${EARLIER_SESSION_NOTE} ${redHandoffMessageOf(redHandoff)}`;
  return { ...text, firstMessage: `${opening}\n\n${text.firstMessage}` };
}

/** The proposal of the crossing ticket as a fenced diff, which a diff's own backtick fences cannot close. */
function proposalBlockOf(proposal: string): string {
  if (proposal.trim() === '') return 'Git could not show the proposal. Read it on the branch of the ticket.';
  return ['~~~~diff', proposal.trimEnd(), '~~~~'].join('\n');
}

/** The need's ticket of a package change that User turned into a need (E19, E22): what the package must hold, why, and the proposal. */
function packageNeedWordingOf(facts: PackageNeedFacts): PackageNeedWording {
  const cause = facts.cause === 'package-refused'
    ? `The builder of \`${facts.packageEntity}\` refused this change, because the constitution of the package forbids it. Its reason:\n\n`
      + `${(facts.refusedReason ?? '').trim() === '' ? '(no reason given)' : (facts.refusedReason ?? '').trim()}`
    : `\`${facts.packageEntity}\` left the whitelist of \`${facts.homeEntity}\` while the ticket crossed into it.`;
  return {
    title: `Change ${facts.packageEntity} for #${facts.ticketId} of ${facts.homeEntity}`,
    body:  [
      '## Acceptance',
      '',
      `A1. \`${facts.packageEntity}\` holds the change that ticket #${facts.ticketId} of \`${facts.homeEntity}\` proposed for it, as far as `
      + `the constitution of \`${facts.packageEntity}\` permits.`,
      '',
      '## Brief',
      '',
      `Ticket #${facts.ticketId} of \`${facts.homeEntity}\` proposed a change of \`${facts.packageEntity}\`. ${cause}`,
      '',
      `User turned the change into this ticket. Ticket #${facts.ticketId} waits for it. The proposal, from the branch \`${facts.ticketBranch}\`:`,
      '',
      proposalBlockOf(facts.proposal),
      '',
    ].join('\n'),
  };
}

/** The fix ticket of a dependent that a crossing ticket's package change breaks (E26): bring the dependent in line with the change. */
function dependentFixWordingOf(facts: DependentFixFacts): DependentFixWording {
  return {
    title: `Fix ${facts.dependentEntity} for the change of ${facts.packageEntity} in #${facts.ticketId}`,
    body:  [
      '## Acceptance',
      '',
      `A1. The gates of \`${facts.dependentEntity}\` pass with the change of \`${facts.packageEntity}\` that ticket #${facts.ticketId} makes.`,
      '',
      '## Brief',
      '',
      `Ticket #${facts.ticketId} of \`${facts.homeEntity}\` changes \`${facts.packageEntity}\`. The change breaks \`${facts.dependentEntity}\`: `
      + `a gate of \`${facts.dependentEntity}\` is red with it. User filed this ticket in the group \`${facts.group}\` with ticket `
      + `#${facts.ticketId}. This ticket waits on it and starts from the branch of the group, which holds the change. The release of the group `
      + 'lands both tickets on the main line together.',
      '',
      `Change only \`${facts.dependentEntity}\`. Do not change \`${facts.packageEntity}\`. The change is on the branch \`${facts.ticketBranch}\`.`,
      '',
    ].join('\n'),
  };
}

export const HephaestusWording = Object.freeze({
  decisionWordingOf,
  packageNeedWordingOf,
  dependentFixWordingOf,
  launchTextOf: launchTextWithEarlierSessionNoteOf,
  assistantChatTextOf,
  windDownMessage,
  resumeMessage,
  redHandoffMessageOf,
  answerMessageOf,
});
