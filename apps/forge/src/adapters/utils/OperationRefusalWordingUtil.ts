/**
 * Words an `OperationRefusal` for its channel: its own message, or its detail. A Board refusal carries only its reason code and facts, and
 * the install-version mismatch is worded as one paragraph, so a refusal is always one report.
 */
import type { JobMoveTarget }                                from '../../lib/tracker-model/@types/Job.ts';
import type { NeedGap }                                      from '../../lib/tracker-model/@types/Need.ts';
import type { TaskStatus }                                   from '../../lib/tracker-model/@types/Task.ts';
import type { IncompleteTicket, ReadinessGap, TicketStatus } from '../../lib/tracker-model/@types/Ticket.ts';
import type { BoardRefusalDetail }                           from '../../lib/tracker-model/BoardRefusal.ts';
import { LEGAL_SOURCE_STATES_FOR_JOB_MOVE }                  from '../../lib/tracker-model/constants/JobMoveLegality.ts';
import { LEGAL_SOURCE_STATUSES_FOR_TICKET_STATUS }           from '../../lib/tracker-model/constants/TicketMoveLegality.ts';
import type { EntityRefusal }                                from '../../lib/tracker-model/utils/EntityValidationUtil.ts';
import type { OptionNotesProblem }                           from '../../lib/tracker-model/utils/OptionConsequencesUtil.ts';
import { TicketMoveUtil }                                    from '../../lib/tracker-model/utils/TicketMoveUtil.ts';
import type { RoleCommandRefusalReason }                     from '../../shared/@types/RoleCommandRefusalReason.ts';
import type { UnreadableTracker }                            from '../../shared/@types/UnreadableTracker.ts';
import { type BranchNamespaceRefusal, branchNamesOf }        from '../../shared/BranchNames.ts';
import type { OperationRefusal }                             from '../../shared/OperationRefusal.ts';
import type { OperationRefusalDetail }                       from '../../shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                     from '../../shared/constants/ProductNames.ts';
import { ROOT_OVERRIDE_VARIABLE }                            from '../../shared/constants/RootOverrideVariable.ts';
import { StatusWordingUtil }                                 from './StatusWordingUtil.ts';
import { TicketPhraseUtil }                                  from './TicketPhraseUtil.ts';

type InstallVersionMismatchDetail = Extract<OperationRefusalDetail, { kind: 'install-version-mismatch' }>;

type OlderProgramPresentDetail = Extract<OperationRefusalDetail, { kind: 'older-program-present' }>;

type GitBelowFloorDetail = Extract<OperationRefusalDetail, { kind: 'git-below-floor' }>;

/**
 * Who reads the sentence: a person at the command line, or User through the API, in the Bridge or a monitor. User runs no command, so an
 * API sentence names what is wrong and, where an action exists, the Bridge control or a neutral action, never a command line or a flag.
 */
type RefusalChannel = 'command-line' | 'api';

const TALOS_UNAVAILABLE_REASON_WORDING: Readonly<Record<Extract<OperationRefusalDetail, { kind: 'talos-unavailable' }>['reason'], string>> = {
  'endpoint-does-not-fit': 'cannot bind its endpoint on this platform; move the home folder to a shorter path',
  'start-refused':         'refused its start, as its log in the board\'s talos folder says',
  'not-serving':           'did not serve within its start wait',
};

const NOTHING_WAS_WRITTEN = 'Nothing was written.';

const EXAMPLE_TICKET_ID = '<id>';

const CHART_RANGE_BOUND_TEXT: Readonly<Record<'from' | 'to', string>> = { from: 'The start', to: 'The end' };

function adviceFor(channel: RefusalChannel, commandLineAdvice: string, apiAdvice: string): string {
  return channel === 'command-line' ? commandLineAdvice : apiAdvice;
}

/** The sentences joined by a space, an empty one left out. */
function sentencesOf(...sentences: readonly string[]): string {
  return sentences.filter((sentence) => sentence !== '').join(' ');
}

/** `1 agent is`, `2 agents are`: the count, its noun and the verb agreeing with it. */
function countedText(count: number, singularNoun: string): string {
  return count === 1 ? `1 ${singularNoun} is` : `${count} ${singularNoun}s are`;
}

function legalSourcesText(targetStatus: TicketStatus): string {
  return LEGAL_SOURCE_STATUSES_FOR_TICKET_STATUS[targetStatus].join(' or ');
}

const READINESS_GAP_TEXT: Readonly<Record<ReadinessGap, string>> = {
  'acceptance-unnumbered': 'its `## Acceptance` holds no numbered item (acceptance-unnumbered)',
  'brief-missing':         'it has no `## Brief` with a non-blank line (brief-missing)',
};

const NEED_GAP_TEXT: Readonly<Record<NeedGap, string>> = {
  'entity-missing':        'it names no entity (entity-missing)',
  'title-missing':         'it has no title (title-missing)',
  'acceptance-unnumbered': READINESS_GAP_TEXT['acceptance-unnumbered'],
  'brief-missing':         READINESS_GAP_TEXT['brief-missing'],
};

function incompleteTicketText(incompleteTicket: IncompleteTicket): string {
  return `ticket #${incompleteTicket.ticketId} is incomplete: ${incompleteTicket.gaps.map((gap) => READINESS_GAP_TEXT[gap]).join(', and ')}`;
}

/** The statuses a ticket verb still reaches; the Overseer makes every other lifecycle move, so those are named as `ticket status`. */
const OPTION_NOTES_PROBLEM_TEXT: Readonly<Record<OptionNotesProblem, string>> = {
  'not-an-object': 'is not a JSON object',
  'not-text':      'is not text, or it is blank',
  'not-a-list':    'is not a list with at least one item',
  'repeated':      'repeats the label of an earlier option',
  'unknown-key':   'is not a field of the notes: write question and options, each option with label, touches, tradeOff and acceptanceEffect',
};

const STATUSES_A_TICKET_VERB_REACHES: ReadonlySet<TaskStatus> = new Set(['committed', 're-review', 'abandoned']);

function ticketMoveArgumentsFor(ticketId: string, targetStatus: TaskStatus): string {
  return STATUSES_A_TICKET_VERB_REACHES.has(targetStatus) ? `${StatusWordingUtil.verbFor(targetStatus)} ${ticketId}` : `status ${ticketId} ${targetStatus}`;
}

function boardRefusalSentenceOf(detail: BoardRefusalDetail, channel: RefusalChannel): string {
  switch (detail.reason) {
    case 'unknown-task':
      return sentencesOf(`There is no task #${detail.taskId}.`, adviceFor(channel, `Run \`${PRODUCT_NAMES.PROGRAM} status\` to see the rows this tracker holds.`, ''));
    case 'ticket-owned-row':
      return `Task #${detail.taskId} belongs to ticket #${detail.ticketId}, so moving it here would leave the row and the ticket disagreeing. `
        + adviceFor(
          channel,
          `Run \`${PRODUCT_NAMES.PROGRAM} ticket ${ticketMoveArgumentsFor(detail.ticketId, detail.targetStatus)}\` instead, which moves both, `
            + 'or pass --force to move only the row.',
          'Move the ticket instead, which moves both.'
        );
    case 'ticket-already-has-row':
      return sentencesOf(
        `Ticket #${detail.ticketId} already has task #${detail.taskId} ("${detail.taskName}").`,
        adviceFor(channel, 'Pass --force to move the ticket on to the new row, or leave --ticket off.', '')
      );
    case 'ticket-id-already-filed':
      return `Ticket #${detail.ticketId} is already on the board, so a second ticket cannot take its id. ${NOTHING_WAS_WRITTEN}`;
    case 'task-belongs-to-another-ticket':
      return sentencesOf(
        `Task #${detail.taskId} already belongs to ticket #${detail.owningTicketId}.`,
        adviceFor(channel, `Pass --force to move it to ticket #${detail.ticketId}.`, '')
      );
    case 'ticket-already-in-status':
      return `Ticket #${detail.ticketId} is already ${detail.status}, so nothing was changed and nothing was logged.`;
    case 'illegal-ticket-move':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, `
        + `and a move to ${detail.targetStatus} takes a ticket that is ${legalSourcesText(detail.targetStatus)}.`
        + adviceFor(channel, ` Run \`${PRODUCT_NAMES.PROGRAM} ticket status ${detail.ticketId} ${detail.targetStatus}\` if you mean to set it directly.`, '');
    case 'move-to-draft':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, and no move returns a ticket to draft: `
        + `filing is the only way in. ${adviceFor(channel, `Run \`${PRODUCT_NAMES.PROGRAM} ticket hold ${detail.ticketId}\``, 'Hold it')} to keep it from being built for now.`;
    case 'move-of-a-draft':
      return `Ticket #${detail.ticketId} is a draft ticket, so it was not moved: `
        + adviceFor(channel, `run \`${PRODUCT_NAMES.PROGRAM} ticket ready ${detail.ticketId}\` to ready it to build`, 'ready it to build')
        + ', which checks its Acceptance and Brief.';
    case 'move-to-ready-for-review':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, and no move takes a ticket to ready for review: `
        + `only the filer's close does${adviceFor(channel, `, with \`${PRODUCT_NAMES.PROGRAM} ticket submit\` or \`intake close\``, '')}. ${NOTHING_WAS_WRITTEN}`;
    case 'move-of-a-ticket-ready-for-review':
      return `Ticket #${detail.ticketId} is ready for review, so it was not moved: `
        + `User reviews it and ${adviceFor(channel, `runs \`${PRODUCT_NAMES.PROGRAM} ticket ready ${detail.ticketId}\` to ready it`, 'readies it')} to build.`;
    case 'ready-of-a-ticket-not-in-draft':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, not a draft ticket, `
        + `so nothing was readied: only a draft ticket is readied. ${NOTHING_WAS_WRITTEN}`;
    case 'incomplete-tickets':
      return `Nothing was readied: ${detail.incompleteTickets.map(incompleteTicketText).join('; ')}. `
        + `Number every Acceptance item as \`A1.\` at the start of a line and write a \`## Brief\`, then ready ${detail.incompleteTickets.length === 1 ? 'it' : 'them'} again.`;
    case 'ticket-without-entity': {
      const single = detail.ticketIds.length === 1;
      return `Nothing was readied: ${detail.ticketIds.map((ticketId) => `ticket #${ticketId}`).join(', ')} ${single ? 'has' : 'have'} no entity, `
        + 'and each ticket builds in the pipeline of its entity. '
        + adviceFor(
          channel,
          `Give ${single ? 'it' : 'each'} one with \`${PRODUCT_NAMES.PROGRAM} ticket entity <id> <key> --reason <text>\`, then ready ${single ? 'it' : 'them'} again.`,
          `The product owner gives each ticket its entity; then ready ${single ? 'it' : 'them'} again.`
        );
    }
    case 'work-outside-entity': {
      const ticketTexts = detail.ticketsOutside.map(({ ticketId, entity, paths }) => `ticket #${ticketId} of ${entity} names ${paths.join(', ')} as its work`);
      return `Nothing was readied: ${ticketTexts.join('; ')}, outside its entity and the packages it may cross into. `
        + 'A ticket builds only in its own entity: file that work as a ticket of the entity that owns it, or correct the Brief, then ready it again.';
    }
    case 'abandon-without-reason':
      return adviceFor(
        channel,
        `Ticket #${detail.ticketId} was not moved: abandon needs --reason. `
          + `Say why the work was dropped, for example \`${PRODUCT_NAMES.PROGRAM} ticket abandon 3 --reason "superseded by #7"\`.`,
        `Ticket #${detail.ticketId} was not moved: abandon needs a reason. Say why the work was dropped.`
      );
    case 'tokens-without-a-row':
      return `Ticket #${detail.ticketId} has no row, so ${adviceFor(channel, '--tokens has', 'its tokens have')} nowhere to be recorded: `
        + `a low-priority ticket gets its row when it is started.${adviceFor(channel, ' Drop --tokens.', '')}`;
    case 'rereview-outside-review': {
      const firstReviewAdvice = channel === 'command-line' && TicketMoveUtil.ticketMoveIsLegal(detail.status, 'in-review')
        ? ` Run \`${PRODUCT_NAMES.PROGRAM} ticket status ${detail.ticketId} in-review\` to send it to its first reviewer.`
        : '';
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, `
        + `and another review pass needs a ticket that is in-review.${firstReviewAdvice}`;
    }
    case 'review-record-without-a-review-bar':
      return `Ticket #${detail.ticketId} has no in-progress review bar, so there is no review pass to record and nothing was logged. `
        + `A review is recorded on its own bar${adviceFor(channel, `: \`${PRODUCT_NAMES.PROGRAM} task add "<name>" --review-of ${detail.ticketId} --start\` starts one`, '')}.`;
    case 'review-bar-without-a-round':
      return `Review bar #${detail.taskId} of ticket #${detail.ticketId} stores no round, so the pass cannot be recorded and nothing was logged. `
        + `Start the pass on a bar of its own${adviceFor(channel, ` with \`${PRODUCT_NAMES.PROGRAM} task add "<name>" --review-of ${detail.ticketId} --start\``, '')}.`;
    case 'review-record-on-a-row-that-is-not-a-review-bar':
      return sentencesOf(
        `Row #${detail.taskId} is not an in-progress review bar, so the review of ticket #${detail.ticketId} cannot be recorded on it and nothing was logged.`,
        adviceFor(channel, 'Pass --bar the row your review runs on, the `agent-progress row:` line of your prompt.', '')
      );
    case 'review-record-on-a-bar-outside-the-bundle':
      return `Review bar #${detail.taskId} reviews ticket #${detail.reviewOf}, which was not claimed with ticket #${detail.ticketId}, `
        + `so the review cannot be recorded on it and nothing was logged.${adviceFor(channel, ' Pass --bar the review bar of the bundle holding the ticket.', '')}`;
    case 'unclaimable-status':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, `
        + `and a claim takes a ticket that is ${legalSourcesText('in-progress')}. `
        + NOTHING_WAS_WRITTEN;
    case 'claim-waits-on-dependencies':
      return `Ticket #${detail.ticketId} is ${TicketPhraseUtil.waitingOnText(detail.unsettledTicketIds)}, `
        + `which must be reviewed or delivered before it is claimed. ${NOTHING_WAS_WRITTEN}`;
    case 'claim-of-a-held-ticket':
      return `Ticket #${detail.ticketId} is held, so it is not claimed. Nothing was written; `
        + `${adviceFor(channel, `\`${PRODUCT_NAMES.PROGRAM} ticket unhold ${detail.ticketId}\``, 'unholding it')} lets it be claimed.`;
    case 'claim-under-review':
      return `Ticket #${detail.ticketId} is under review: its review row #${detail.reviewBarTaskId} is in progress. ${NOTHING_WAS_WRITTEN}`;
    case 'claim-after-a-ticket-not-in-review':
      return `Ticket #${detail.ticketId} was not claimed after #${detail.afterTicketId}: #${detail.afterTicketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, `
        + `and ${adviceFor(channel, '--after names', 'a claim after another ticket takes')} a predecessor that is in-review. ${NOTHING_WAS_WRITTEN}`;
    case 'claim-after-a-ticket-outside-the-bundle':
      return `Ticket #${detail.ticketId} was not claimed after #${detail.afterTicketId}: `
        + `the two are not in one release bundle of the same group. ${NOTHING_WAS_WRITTEN}`;
    case 'claim-after-a-ticket-it-does-not-wait-on':
      return `Ticket #${detail.ticketId} was not claimed after #${detail.afterTicketId}: `
        + `it does not wait on #${detail.afterTicketId}. ${NOTHING_WAS_WRITTEN}`;
    case 'concurrency-limit-reached':
      return `${TicketPhraseUtil.namedTicketsText(detail.ticketIds)} ${detail.ticketIds.length === 1 ? 'was' : 'were'} not claimed: `
        + `${countedText(detail.agentsInFlight, 'agent')} in flight (${countedText(detail.inProgressRowCount, 'row')} in progress) `
        + `and the concurrency limit is ${detail.limit} ${detail.limit === 1 ? 'agent' : 'agents'}. Nothing was written; claim once an agent has finished.`;
    case 'unknown-dependency':
      return sentencesOf(
        `There is no ticket ${TicketPhraseUtil.ticketReferencesText(detail.missingTicketIds)}.`,
        adviceFor(channel, `Run \`${PRODUCT_NAMES.PROGRAM} ticket list\` to see what this tracker holds.`, '')
      );
    case 'unknown-linked-ticket':
      return sentencesOf(
        `There is no ticket #${detail.missingTicketId}. ${NOTHING_WAS_WRITTEN}`,
        adviceFor(channel, `Run \`${PRODUCT_NAMES.PROGRAM} ticket list\` to see what this tracker holds.`, '')
      );
    case 'introduced-by-on-a-non-bug':
      return `Ticket #${detail.ticketId} is a ${detail.type}, and only a bug names the ticket that introduced it. ${NOTHING_WAS_WRITTEN}`;
    case 'introduced-by-itself':
      return `Ticket #${detail.ticketId} cannot be introduced by itself. ${NOTHING_WAS_WRITTEN}`;
    case 'introduced-by-an-undelivered-ticket':
      return `Ticket #${detail.ticketId} cannot be introduced by #${detail.causeTicketId}: it is ${StatusWordingUtil.statusTextFor(detail.status)}, `
        + `and only a delivered ticket's change lets a bug escape. ${NOTHING_WAS_WRITTEN}`;
    case 'malformed-epic-key':
      return `"${detail.epicKey}" is not a usable epic key: a key is lower-case letters and digits, in words joined by single hyphens, `
        + `such as \`checkout-redesign\`, and not a device name Windows reserves (con, prn, aux, nul, com1-9, lpt1-9). ${NOTHING_WAS_WRITTEN}`;
    case 'malformed-group-name':
      return `"${detail.group}" is not a usable group name: a group is lower-case letters and digits, in words joined by single hyphens, `
        + `such as \`checkout-redesign\`, on every OS. ${NOTHING_WAS_WRITTEN}`;
    case 'group-name-case-twin':
      return `Group "${detail.group}" differs from the existing group "${detail.existingGroup}" only in case, and a case-insensitive `
        + `file system gives both one branch and one worktree. ${NOTHING_WAS_WRITTEN}`;
    case 'group-of-a-settled-ticket':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, and it was not put into a group: `
        + `no agent will work it again. ${NOTHING_WAS_WRITTEN}`;
    case 'ticket-already-in-a-group':
      return `Ticket #${detail.ticketId} is already in group ${detail.group}, and a ticket stays in the group it is in. ${NOTHING_WAS_WRITTEN}`;
    case 'epic-already-exists':
      return `There is already an epic ${detail.epicKey}. Nothing was written; `
        + `${adviceFor(channel, `\`${PRODUCT_NAMES.PROGRAM} epic edit ${detail.epicKey}\` changes it`, 'edit that epic to change it')}.`;
    case 'unknown-epic':
      return `There is no epic ${detail.missingEpicKeys.join(', ')}. `
        + adviceFor(channel, `Nothing was written; run \`${PRODUCT_NAMES.PROGRAM} epic list\` to see what this tracker holds.`, NOTHING_WAS_WRITTEN);
    case 'epic-still-named':
      return `Epic ${detail.epicKey} was not removed: ${TicketPhraseUtil.ticketReferencesText(detail.ticketIds)} still `
        + `${detail.ticketIds.length === 1 ? 'names' : 'name'} it. Nothing was written; `
        + adviceFor(channel, `\`${PRODUCT_NAMES.PROGRAM} ticket epic <id> --remove ${detail.epicKey}\` takes it off a ticket.`, 'take it off each ticket first.');
    case 'unknown-draft':
      return sentencesOf(
        `There is no open draft ${detail.draftId}. ${NOTHING_WAS_WRITTEN}`,
        adviceFor(channel, `Run \`${PRODUCT_NAMES.PROGRAM} draft list\` to see what this tracker holds.`, '')
      );
    case 'draft-claimed-by-another-owner':
      return `Draft ${detail.draftId} was not claimed: ${detail.owner} holds it. ${NOTHING_WAS_WRITTEN} `
        + adviceFor(
          channel,
          `Add --force to take it over, or wait for \`${PRODUCT_NAMES.PROGRAM} draft release ${detail.draftId}\`.`,
          'Take it over, or wait until it is released.'
        );
    case 'draft-closed-into-unknown-tickets':
      return `Draft ${detail.draftId} was not closed: there is no ticket ${detail.missingTicketReferences.join(', ')}. ${NOTHING_WAS_WRITTEN} `
        + 'File the tickets first, then close the draft into their ids.';
    case 'draft-has-open-questions':
      return `Draft ${detail.draftId} was not closed: ${detail.openQuestionIds.join(', ')} ${detail.openQuestionIds.length === 1 ? 'is' : 'are'} `
        + `still open. ${NOTHING_WAS_WRITTEN} `
        + adviceFor(
          channel,
          `Answer them with \`${PRODUCT_NAMES.PROGRAM} draft answer\`, or drop the moot ones with \`${PRODUCT_NAMES.PROGRAM} draft drop\`.`,
          'Answer them, or drop the moot ones.'
        );
    case 'unknown-draft-question':
      return sentencesOf(
        `Draft ${detail.draftId} has no question ${detail.questionId}. ${NOTHING_WAS_WRITTEN}`,
        adviceFor(channel, `Run \`${PRODUCT_NAMES.PROGRAM} draft show ${detail.draftId}\` to see its questions.`, '')
      );
    case 'unknown-draft-item':
      return sentencesOf(
        `Draft ${detail.draftId} has no note or question ${detail.itemId}. ${NOTHING_WAS_WRITTEN}`,
        adviceFor(channel, `Run \`${PRODUCT_NAMES.PROGRAM} draft show ${detail.draftId}\` to see what it holds.`, '')
      );
    case 'draft-question-option-count':
      return `A question takes ${detail.minimum} to ${detail.maximum} options, and ${detail.optionCount} ${detail.optionCount === 1 ? 'was' : 'were'} given. `
        + NOTHING_WAS_WRITTEN;
    case 'draft-question-without-recommendation':
      return `A question needs ${adviceFor(channel, '--recommended <letter>, ', '')}the option the agent recommends. ${NOTHING_WAS_WRITTEN}`;
    case 'unknown-draft-option-letters':
      return `There is no option ${detail.unknownLetters.join(', ')}: the options are ${detail.optionLetters.join(', ')}. ${NOTHING_WAS_WRITTEN}`;
    case 'several-letters-on-single-select-question':
      return `${detail.letters.join(', ')} names several options, and the question takes one: only a question asked `
        + `${adviceFor(channel, 'with --multiple takes several', 'to take several options does')}. ${NOTHING_WAS_WRITTEN}`;
    case 'unknown-gate':
      return `There is no gate ${detail.gateName}: ${detail.gateNames.length === 0 ? 'none is stored' : `the gates are ${detail.gateNames.join(', ')}`}. `
        + NOTHING_WAS_WRITTEN;
    case 'gate-without-phase':
      return `The gate ${detail.gateName} must run in at least one phase: build, review or merge. ${NOTHING_WAS_WRITTEN}`;
    case 'unknown-gate-phase':
      return `There is no phase ${detail.phase}: the phases are ${detail.phases.join(', ')}. ${NOTHING_WAS_WRITTEN}`;
    case 'phase-order-not-a-reorder':
      return `The ${detail.phase} phase was not reordered: `
        + `${detail.phaseGateNames.length === 0 ? 'it runs no gate' : `name each of ${detail.phaseGateNames.join(', ')} once, and no other gate`}. `
        + adviceFor(channel, `Nothing was written; \`${PRODUCT_NAMES.PROGRAM} gate add <name> --phases\` changes the phases a gate runs in.`, NOTHING_WAS_WRITTEN);
    case 'approval-without-pipeline':
      return `No gate pipeline is stored, so approval ${detail.approval} was not set: set the gates first`
        + adviceFor(channel, ` with \`${PRODUCT_NAMES.PROGRAM} gate add\` or \`${PRODUCT_NAMES.PROGRAM} gate none\``, ', or state that there are none')
        + `. ${NOTHING_WAS_WRITTEN}`;
    case 'reach-without-pipeline':
      return 'No gate pipeline is stored, so the reach was not set: set the gates first'
        + adviceFor(channel, ` with \`${PRODUCT_NAMES.PROGRAM} gate add\` or \`${PRODUCT_NAMES.PROGRAM} gate none\``, ', or state that there are none')
        + `. ${NOTHING_WAS_WRITTEN}`;
    case 'pipeline-set-per-entity':
      return `The pipeline holds the entities ${detail.entityKeys.join(', ')}, and each entity has its own prepare steps, gates and reach, so the `
        + 'top-level ones stay empty. Set them for each entity on the Pipeline tab of the Bridge'
        + `${adviceFor(channel, `, or with \`${PRODUCT_NAMES.PROGRAM} pipeline update\``, '')}. ${NOTHING_WAS_WRITTEN}`;
    case 'gate-profiles-unreadable':
      return `The gate profile runs cannot be read: ${detail.problem}. ${NOTHING_WAS_WRITTEN} Repair or remove gate-profiles.json in the data folder.`;
    case 'gate-profile-running':
      return `The gate ${detail.gateName} has profile ${detail.profileRunId} in the ${detail.phase} phase not ended yet: wait for it, or stop it. `
        + NOTHING_WAS_WRITTEN;
    case 'unknown-profile-run':
      return `There is no gate profile ${detail.profileRunId}. ${NOTHING_WAS_WRITTEN}`;
    case 'setup-in-progress':
      return `Pipeline setup ${detail.setupId} is open, and only one setup is open at a time. ${NOTHING_WAS_WRITTEN} Resume it, or start it over.`;
    case 'no-setup-open':
      return `Pipeline setup ${detail.setupId} is not open. ${NOTHING_WAS_WRITTEN}`;
    case 'pipeline-setup-unreadable':
      return `The pipeline setup record cannot be read: ${detail.problem}. ${NOTHING_WAS_WRITTEN} Repair or remove pipeline-setup.json in the data folder.`;
    case 'no-pipeline-to-update':
      return `No pipeline is stored, so there is nothing to ${detail.mode === 'advise' ? 'advise on' : 'update'}: set the pipeline up first. ${NOTHING_WAS_WRITTEN}`;
    case 'pipeline-apply-pending':
      return `Pipeline setup ${detail.setupId} waits for its Apply to land, so it cannot change now: cancel the Apply first. ${NOTHING_WAS_WRITTEN}`;
    case 'pipeline-check-running':
      return `Pipeline setup ${detail.setupId} has a check not ended yet: wait for its result. ${NOTHING_WAS_WRITTEN}`;
    case 'no-gate-to-check':
      return `The draft of pipeline setup ${detail.setupId} changes or adds no gate, so there is nothing to check. ${NOTHING_WAS_WRITTEN}`;
    case 'setup-entity-unknown':
      return detail.entityKeys.length === 0
        ? `The pipeline names no entity, so it has no level ${detail.entity}. ${NOTHING_WAS_WRITTEN}`
        : `The pipeline names no entity ${detail.entity}, only ${detail.entityKeys.join(', ')}. ${NOTHING_WAS_WRITTEN}`;
    case 'no-apply-pending':
      return `Pipeline setup ${detail.setupId} has no Apply to cancel or settle. ${NOTHING_WAS_WRITTEN}`;
    case 'setup-question-open':
      return `Pipeline setup ${detail.setupId} still asks ${detail.questionIds.join(', ')}: answer every question before the Apply. ${NOTHING_WAS_WRITTEN}`;
    case 'setup-step-needs-recheck':
      return `Pipeline setup ${detail.setupId} needs a recheck of ${detail.steps.join(', ')}: continue each before the Apply. ${NOTHING_WAS_WRITTEN}`;
    case 'entity-refusals-stand':
      return `Pipeline setup ${detail.setupId}'s draft still holds ${detail.reasons.length === 1 ? '1 entity refusal' : `${detail.reasons.length} entity refusals`} `
        + `(${[...new Set(detail.reasons)].join(', ')}): resolve every one before a step continues or the draft is applied. ${NOTHING_WAS_WRITTEN}`;
    case 'setup-snapshot-touched':
      return `The pipeline agent of pipeline setup ${detail.setupId} changed its snapshot, so its findings cannot be trusted: resume the setup `
        + `to check the snapshot out again, then apply. ${NOTHING_WAS_WRITTEN}`;
    case 'pipeline-moved':
      return `The stored pipeline changed since pipeline setup ${detail.setupId} opened (content hash ${detail.contentHash ?? 'none'}, not `
        + `${detail.baseContentHash ?? 'none'}), so the Apply would overwrite that change. ${NOTHING_WAS_WRITTEN} Start the update again.`;
    case 'constitution-moved':
      if (detail.entity !== undefined) {
        return `The constitution of entity ${detail.entity} on the main line changed since the Apply of pipeline setup ${detail.setupId} `
          + `read it (blob ${detail.mainBlob ?? 'none'}, not ${detail.baseBlob ?? 'none'}), so the Apply would overwrite that change. `
          + `${NOTHING_WAS_WRITTEN} Apply again.`;
      }
      return `CONSTITUTION.md on the main line changed since pipeline setup ${detail.setupId} opened (blob ${detail.mainBlob ?? 'none'}, not `
        + `${detail.baseBlob ?? 'none'}), so the Apply would overwrite that change. ${NOTHING_WAS_WRITTEN} Start the update again.`;
    case 'entity-named-by-tickets': {
      const single  = detail.ticketIds.length === 1;
      const tickets = `${single ? 'ticket' : 'tickets'} ${TicketPhraseUtil.ticketReferencesText(detail.ticketIds)}`;
      return `The Apply would remove or rename entity ${detail.entity}, and ${tickets} ${single ? 'names' : 'name'} it. ${NOTHING_WAS_WRITTEN} `
        + adviceFor(
          channel,
          `Give ${single ? 'it' : 'each'} another entity with \`${PRODUCT_NAMES.PROGRAM} ticket entity <id> <key> --reason <text>\`, `
            + `or let ${single ? 'it' : 'them'} land, then apply again.`,
          `The product owner gives ${single ? 'it' : 'each'} another entity, or ${single ? 'it lands' : 'they land'}; then apply again.`
        );
    }
    case 'entities-while-tickets-in-flight': {
      const single  = detail.ticketIds.length === 1;
      const tickets = `${single ? 'ticket' : 'tickets'} ${TicketPhraseUtil.ticketReferencesText(detail.ticketIds)}`;
      return `This pipeline cannot turn into entities yet: ${tickets} ${single ? 'is' : 'are'} in progress, in review `
        + `or reviewed under the pipeline without entities. ${NOTHING_WAS_WRITTEN} Apply once ${single ? 'it lands' : 'they land'}.`;
    }
    case 'billing-cap-not-positive':
      return `A budget cap of ${detail.maxBudgetUsd} USD is not above 0: give a positive cap, or none. ${NOTHING_WAS_WRITTEN}`;
    case 'setup-step-not-current':
      return `Pipeline setup ${detail.setupId} is at the ${detail.currentStep} step, not ${detail.step}, so ${detail.step} was not continued. ${NOTHING_WAS_WRITTEN}`;
    case 'setup-step-not-reached':
      return `Pipeline setup ${detail.setupId} has not reached the ${detail.step} step, so it cannot go back to it. ${NOTHING_WAS_WRITTEN}`;
    case 'setup-step-not-continued':
      return `The ${detail.step} step of pipeline setup ${detail.setupId} ends with an Apply, not a Continue. ${NOTHING_WAS_WRITTEN}`;
    case 'unknown-setup-question':
      return `Pipeline setup ${detail.setupId} has no question ${detail.questionId}. ${NOTHING_WAS_WRITTEN}`;
    case 'empty-setup-answer':
      return `The answer to ${detail.questionId} of pipeline setup ${detail.setupId} names no option and holds no text. ${NOTHING_WAS_WRITTEN}`;
    case 'setup-question-option-count':
      return `A setup question takes ${detail.minimum} to ${detail.maximum} options, and ${detail.optionCount} ${detail.optionCount === 1 ? 'was' : 'were'} given. `
        + NOTHING_WAS_WRITTEN;
    case 'setup-question-without-recommendation':
      return `A setup question needs the option the agent recommends. ${NOTHING_WAS_WRITTEN}`;
    case 'unknown-setup-option-letters':
      return `There is no option ${detail.unknownLetters.join(', ')}: the options are ${detail.optionLetters.join(', ')}. ${NOTHING_WAS_WRITTEN}`;
    case 'several-letters-on-single-select-setup-question':
      return `${detail.letters.join(', ')} names several options, and the setup question takes one. ${NOTHING_WAS_WRITTEN}`;
    case 'constitution-empty':
      return `The constitution has no text. ${NOTHING_WAS_WRITTEN}`;
    case 'constitution-too-long':
      return `The constitution holds ${detail.characterCount} characters, and it may hold at most ${detail.limit}. ${NOTHING_WAS_WRITTEN}`;
    case 'constitution-source-unanchored':
      return `A source names the line ${JSON.stringify(detail.lineText)} (occurrence ${detail.occurrence}), and the constitution does not hold `
        + `that line that many times. ${NOTHING_WAS_WRITTEN}`;
    case 'constitution-source-repeated':
      return `Two sources name the line ${JSON.stringify(detail.lineText)} (occurrence ${detail.occurrence}); a line takes one source. ${NOTHING_WAS_WRITTEN}`;
    case 'constitution-source-not-ticked':
      return `A source names the line ${JSON.stringify(detail.lineText)} (occurrence ${detail.occurrence}) as ${detail.kind}, and the SOURCES `
        + `ticks of the setup do not select ${detail.kind}. ${NOTHING_WAS_WRITTEN} Name only the sources the ticks select.`;
    case 'constitution-draft-stale':
      return `The constitution of pipeline setup ${detail.setupId} is at revision ${detail.currentRevision}, not ${detail.revision}: `
        + `it changed since it was read. ${NOTHING_WAS_WRITTEN} Read it again, then edit.`;
    case 'pipeline-draft-stale':
      return `The draft pipeline of pipeline setup ${detail.setupId} is at revision ${detail.currentRevision}, not ${detail.revision}: `
        + `it changed since it was read. ${NOTHING_WAS_WRITTEN} Read it again, then edit.`;
    case 'no-draft-edits':
      return `The edit of pipeline setup ${detail.setupId} names no change. ${NOTHING_WAS_WRITTEN}`;
    case 'draft-edit-name-mismatch':
      return `The edit of ${detail.field} names ${detail.name}: a gate or prepare step keeps the name its field gives it. ${NOTHING_WAS_WRITTEN}`;
    case 'prepare-order-not-a-reorder':
      return 'The prepare steps were not reordered: '
        + `${detail.prepareNames.length === 0 ? 'there is none' : `name each of ${detail.prepareNames.join(', ')} once, and no other step`}. `
        + NOTHING_WAS_WRITTEN;
    case 'unknown-setup-edit':
      return `Pipeline setup ${detail.setupId} has no edit ${detail.editId}. ${NOTHING_WAS_WRITTEN}`;
    case 'setup-edit-already-undone':
      return `Edit ${detail.editId} of pipeline setup ${detail.setupId} is already undone. ${NOTHING_WAS_WRITTEN}`;
    case 'dependency-loop':
      return `That would make tickets wait on each other in a circle: ${detail.loopTicketIds.map((ticketId) => `#${ticketId}`).join(' → ')}.`;
    case 'priority-unchanged':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, and its priority was not changed: `
        + `it is already ${detail.priority} priority. ${NOTHING_WAS_WRITTEN}`;
    case 'size-unchanged':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, and its size was not changed: `
        + `it is already ${detail.size}. ${NOTHING_WAS_WRITTEN}`;
    case 'lowering-a-ticket-that-is-not-committed':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, and its priority was not changed: `
        + 'only a draft or committed ticket can be lowered to low, '
        + `since a low ticket has no row until it is started. ${NOTHING_WAS_WRITTEN}`;
    case 'content-of-a-committed-ticket':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, and its title and body were not edited: `
        + `a committed ticket's content is fixed${detail.status === 'committed' ? ', since an agent may pick it up at any moment' : ''}. `
        + NOTHING_WAS_WRITTEN;
    case 'network-of-a-ticket-past-committed':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, and its network line was not changed: `
        + `it is set only while the ticket is draft or committed. ${NOTHING_WAS_WRITTEN}`;
    case 'network-domain-not-public':
      return `Ticket #${detail.ticketId}'s network line was not changed: ${detail.domains.join(', ')} `
        + `${detail.domains.length === 1 ? 'is not a public domain' : 'are not public domains'}, `
        + `and a loopback name, a .local name or a loopback or private IP address is never granted. ${NOTHING_WAS_WRITTEN}`;
    case 'network-unchanged':
      return `Ticket #${detail.ticketId}'s network line was not changed: it already reads `
        + `${detail.domains.length === 0 ? 'no domain' : detail.domains.join(', ')}. ${NOTHING_WAS_WRITTEN}`;
    case 'unknown-entity':
      return detail.entityKeys.length === 0
        ? `Ticket #${detail.ticketId} was not given the entity ${detail.entity}: the pipeline names no entity. ${NOTHING_WAS_WRITTEN}`
        : `Ticket #${detail.ticketId} was not given the entity ${detail.entity}: the pipeline names no such entity, only `
          + `${detail.entityKeys.join(', ')}. ${NOTHING_WAS_WRITTEN}`;
    case 'entity-of-a-ticket-past-committed':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, and its entity was not changed: `
        + `it is set only while the ticket is draft, ready for review or committed. ${NOTHING_WAS_WRITTEN}`;
    case 'entity-unchanged':
      return `Ticket #${detail.ticketId}'s entity was not changed: it already is ${detail.entity}. ${NOTHING_WAS_WRITTEN}`;
    case 'entity-without-reason':
      return `Ticket #${detail.ticketId}'s entity was not changed: ${adviceFor(channel, 'it needs --reason', 'it needs a reason')}. `
        + `Say why the ticket belongs to that entity. ${NOTHING_WAS_WRITTEN}`;
    case 'need-outside-an-entity-build':
      return `Job ${detail.jobId} declared no need: only a build job of an entity declares one. ${NOTHING_WAS_WRITTEN}`;
    case 'need-entity-unknown':
      return detail.entityKeys.length === 0
        ? `Job ${detail.jobId} declared no need for ${detail.entity}: the pipeline names no entity. ${NOTHING_WAS_WRITTEN}`
        : `Job ${detail.jobId} declared no need for ${detail.entity}: the pipeline names no such entity, only ${detail.entityKeys.join(', ')}. `
          + NOTHING_WAS_WRITTEN;
    case 'need-of-own-entity':
      return `Job ${detail.jobId} declared no need for ${detail.entity}: it builds in that entity, so it makes the change itself. ${NOTHING_WAS_WRITTEN}`;
    case 'need-incomplete':
      return `Job ${detail.jobId} declared no need: the need is incomplete: ${detail.gaps.map((gap) => NEED_GAP_TEXT[gap]).join(', and ')}. `
        + NOTHING_WAS_WRITTEN;
    case 'need-limit-reached':
      return `Job ${detail.jobId} declared no need: it has already declared ${detail.limit}, as many as one job may. ${NOTHING_WAS_WRITTEN}`;
    case 'agents-of-a-settled-ticket':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, `
        + `and its agents were not changed: no agent will work it again. ${NOTHING_WAS_WRITTEN}`;
    case 'agents-unchanged':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, and its agents were not changed: `
        + `they already run on ${TicketPhraseUtil.agentPairText(detail.agents)}. ${NOTHING_WAS_WRITTEN}`;
    case 'hold-of-a-settled-ticket':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, `
        + `and no agent will work it again, so there is nothing to ${detail.action}. ${NOTHING_WAS_WRITTEN}`;
    case 'ticket-already-held':
      return `Ticket #${detail.ticketId} is already held. ${NOTHING_WAS_WRITTEN}`;
    case 'ticket-not-held':
      return `Ticket #${detail.ticketId} is not held. ${NOTHING_WAS_WRITTEN}`;
    case 'ticket-not-interrupted':
      return `Ticket #${detail.ticketId} has no interrupted job and no hold an interruption put on, so there is nothing of it to resume. ${NOTHING_WAS_WRITTEN}`;
    case 'release-mark-of-a-settled-ticket':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, and its release mark was not ${detail.action === 'mark' ? 'set' : 'cleared'}: `
        + `no agent will work it again. ${NOTHING_WAS_WRITTEN}`;
    case 'release-mark-of-an-ungrouped-ticket':
      return `Ticket #${detail.ticketId} belongs to no group, so it cannot be a group's release ticket. ${NOTHING_WAS_WRITTEN}`;
    case 'group-already-has-a-release-ticket':
      return detail.releaseTicketId === detail.ticketId
        ? `Ticket #${detail.ticketId} is already the release ticket of group ${detail.group}. ${NOTHING_WAS_WRITTEN}`
        : `Group ${detail.group} already has its release ticket, #${detail.releaseTicketId}: `
          + `clear ${adviceFor(channel, `it with \`${PRODUCT_NAMES.PROGRAM} ticket release-of ${detail.releaseTicketId} --clear\``, 'its release mark')} `
          + `first. ${NOTHING_WAS_WRITTEN}`;
    case 'ticket-is-not-a-release-ticket':
      return `Ticket #${detail.ticketId} is not its group's release ticket. ${NOTHING_WAS_WRITTEN}`;
    case 'reopen-beside-an-open-release-ticket':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)} `
        + `and carries the release mark of group ${detail.group}, so it was not moved to ${detail.targetStatus}: `
        + `the group already has its open release ticket, #${detail.releaseTicketId}, and a group has one. `
        + `Clear that mark${adviceFor(channel, ` with \`${PRODUCT_NAMES.PROGRAM} ticket release-of ${detail.releaseTicketId} --clear\``, '')} first. ${NOTHING_WAS_WRITTEN}`;
    case 'unknown-job':
      return `There is no job ${detail.jobId}. ${NOTHING_WAS_WRITTEN}`;
    case 'job-finished':
      return `Job ${detail.jobId} is finished, and a finished job is never continued. ${NOTHING_WAS_WRITTEN}`;
    case 'job-not-interrupted':
      return `Job ${detail.jobId} is not interrupted, so there is nothing of it to resume. ${NOTHING_WAS_WRITTEN}`;
    case 'job-has-no-ticket':
      return `Job ${detail.jobId} works no ticket, so no fresh agent can take its work over. ${NOTHING_WAS_WRITTEN}`;
    case 'job-not-intake':
      return `Job ${detail.jobId} is a ${detail.kind} job, not a product-owner intake, so it has no intake to close or title. ${NOTHING_WAS_WRITTEN}`;
    case 'question-options-malformed':
      return `The option notes for job ${detail.jobId} are malformed: ${detail.field} ${OPTION_NOTES_PROBLEM_TEXT[detail.problem]}. ${NOTHING_WAS_WRITTEN}`;
    case 'intake-title-empty':
      return `The title for the intake of job ${detail.jobId} is blank: write a short title${adviceFor(channel, ' after --', '')}. ${NOTHING_WAS_WRITTEN}`;
    case 'intake-empty':
      return `The intake request is blank and carries no picture: write what the product owner should file. ${NOTHING_WAS_WRITTEN}`;
    case 'pictures-not-taken':
      return `Job ${detail.jobId} is a ${detail.kind} job, and only a product-owner intake takes pictures: send the message as text. ${NOTHING_WAS_WRITTEN}`;
    case 'job-move-illegal':
      return `Job ${detail.jobId} is ${detail.state}, so it cannot move to ${detail.targetState}: `
        + `only a job ${legalJobSourcesText(detail.targetState)} can. ${NOTHING_WAS_WRITTEN}`;
    case 'merge-queue-of-a-ticket-not-in-review':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)}, `
        + `so it was not queued to merge: only a ticket in review whose review passed is. ${NOTHING_WAS_WRITTEN}`;
    case 'merge-queue-without-a-current-green':
      return `Ticket #${detail.ticketId} was not queued to merge: the Overseer's last green gate run was not on its HEAD tree `
        + `${detail.headTree ?? '(unreadable)'} under the current pipeline. ${NOTHING_WAS_WRITTEN}`;
    case 'merge-approval-off':
      return `Merge approval is off, so ticket #${detail.ticketId} needs no accept: switch it on`
        + `${adviceFor(channel, ` with \`${PRODUCT_NAMES.PROGRAM} gate approval merge on\``, ' in the pipeline')}. ${NOTHING_WAS_WRITTEN}`;
    case 'merge-accept-of-a-ticket-not-waiting':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)} and does not wait for merge: only a ticket `
        + `in review whose review passed on a green tree, with no job on it, does. ${NOTHING_WAS_WRITTEN}`;
    case 'merge-accept-would-conflict':
      return `Ticket #${detail.ticketId} was not accepted: its branch conflicts with ${detail.target} in ${detail.conflictedFiles.join(', ')}. `
        + `Bring it up to date${adviceFor(channel, ` with \`${PRODUCT_NAMES.PROGRAM} merge update ${detail.ticketId}\``, '')} first. ${NOTHING_WAS_WRITTEN}`;
    case 'merge-accept-prediction-failed':
      return `Ticket #${detail.ticketId} was not accepted: git could not predict its merge into ${detail.target} (${detail.gitReason}). `
        + `${NOTHING_WAS_WRITTEN}`;
    case 'merge-update-of-a-ticket-not-waiting':
      return `Ticket #${detail.ticketId} is ${StatusWordingUtil.statusTextFor(detail.status)} and does not wait for merge, so its branch `
        + `was not updated. ${NOTHING_WAS_WRITTEN}`;
    case 'merge-update-failed':
      return `The merge of ${detail.target} into ticket #${detail.ticketId}'s worktree failed: ${detail.gitReason}. ${NOTHING_WAS_WRITTEN}`;
    case 'airlock-held':
      return `Job ${detail.jobId} holds the ${detail.target} Airlock, and a target merges one ticket at a time. ${NOTHING_WAS_WRITTEN}`;
    case 'merge-candidate-not-queued':
      return `Ticket #${detail.ticketId} is not queued to merge into ${detail.target}. ${NOTHING_WAS_WRITTEN}`;
    case 'higher-priority-queued':
      return `Ticket #${detail.ticketId} waits: ${TicketPhraseUtil.ticketReferencesText(detail.queuedTicketIds)} of a higher priority `
        + `queued to merge first. ${NOTHING_WAS_WRITTEN}`;
    case 'refresh-beside-a-queued-release':
      return `Group ${detail.group} is not refreshed: its release ticket #${detail.releaseTicketId} is queued to merge main itself. ${NOTHING_WAS_WRITTEN}`;
    case 'unknown-decision':
      return `There is no decision ${detail.decisionId}. ${NOTHING_WAS_WRITTEN}`;
    case 'decision-already-answered':
      return `Decision ${detail.decisionId} is already settled, and the first answer wins. ${NOTHING_WAS_WRITTEN}`;
    case 'decision-answer-count':
      return `Decision ${detail.decisionId} asks ${detail.questionCount} ${detail.questionCount === 1 ? 'question' : 'questions'}, `
        + `so it takes one answer for each, not ${detail.answerCount}. ${NOTHING_WAS_WRITTEN}`;
    case 'decision-without-questions':
      return `A decision asks at least one question, and this one asks none. ${NOTHING_WAS_WRITTEN}`;
    case 'decision-questions-repeat':
      return `A decision's answers are kept by question, so no two of its questions may read "${detail.question}". ${NOTHING_WAS_WRITTEN}`;
    case 'decision-has-several-questions':
      return `Decision ${detail.decisionId} asks ${detail.questionCount} questions, so it takes one choice of letters for each; `
        + `free text is given in the UI. ${NOTHING_WAS_WRITTEN}`;
    case 'decision-option-unknown':
      return `Question ${detail.questionNumber} of decision ${detail.decisionId} has ${detail.optionCount} `
        + `${detail.optionCount === 1 ? 'option' : 'options'}, and "${detail.choice}" does not name them by letter. ${NOTHING_WAS_WRITTEN}`;
    case 'decision-single-choice':
      return `Question ${detail.questionNumber} of decision ${detail.decisionId} takes one option, not "${detail.choice}". ${NOTHING_WAS_WRITTEN}`;
    case 'unknown-incident':
      return `There is no incident ${detail.incidentId}. ${NOTHING_WAS_WRITTEN}`;
    case 'incident-closed':
      return `Incident ${detail.incidentId} is already closed. ${NOTHING_WAS_WRITTEN}`;
    case 'incident-not-a-question':
      return `Incident ${detail.incidentId} is a ${detail.kind}, which carries no agent's question to answer or escalate. ${NOTHING_WAS_WRITTEN}`;
    case 'job-awaits-user-answer':
      return `Job ${detail.jobId} waits on a question for the user; a chat turn would answer it. ${NOTHING_WAS_WRITTEN}`;
    case 'job-is-product-owner':
      return `Job ${detail.jobId} is the user's product-owner session; only the user chats with it. ${NOTHING_WAS_WRITTEN}`;
    case 'no-open-incident':
      return `${detail.subject} has no open incident that allows ${detail.move}; it is legal only as an incident's move. ${NOTHING_WAS_WRITTEN}`;
    case 'several-open-incidents':
      return `${detail.subject} has several open incidents that allow ${detail.move} (${detail.incidentIds.join(', ')}); `
        + `name one${adviceFor(channel, ' with --incident', '')}. ${NOTHING_WAS_WRITTEN}`;
    case 'worktree-in-use':
      return `Job ${detail.jobIds.join(', ')} still runs on the worktree of #${detail.ticketId}; stop it first. ${NOTHING_WAS_WRITTEN}`;
    case 'worktree-has-uncommitted-work':
      return `The worktree ${detail.worktreePath} of #${detail.ticketId} holds uncommitted work that could not be saved to a patch, so it `
        + `was not recreated. ${NOTHING_WAS_WRITTEN}`;
    case 'worktree-repair-failed':
      return `Git refused the ${detail.step} repair of the worktree of #${detail.ticketId}: ${detail.gitReason} ${NOTHING_WAS_WRITTEN}`;
  }
}

function legalJobSourcesText(targetState: JobMoveTarget): string {
  const sourceStates = LEGAL_SOURCE_STATES_FOR_JOB_MOVE[targetState];
  return sourceStates.length === 0 ? 'being launched' : sourceStates.join(' or ');
}

function installVersionMismatchSentenceOf(detail: InstallVersionMismatchDetail, channel: RefusalChannel): string {
  const {
    rootDirectory,
    manifestFilePath,
    installVersion,
    mismatch,
  } = detail;
  const updateAction = adviceFor(channel, `run \`${PRODUCT_NAMES.PROGRAM} update\` in ${rootDirectory}`, 'update the board');
  const runUpdateSentence = adviceFor(channel, `Run \`${PRODUCT_NAMES.PROGRAM} update\` in ${rootDirectory}.`, 'Update the board.');
  switch (mismatch.reason) {
    case 'older':
      return `The files ${PRODUCT_NAMES.PROGRAM} installed in ${rootDirectory} are install version ${mismatch.installedVersion}, from an older ${PRODUCT_NAMES.PROGRAM}, `
        + `and this one needs install version ${installVersion}, so nothing was done. ${runUpdateSentence}`;
    case 'newer':
      return `The files ${PRODUCT_NAMES.PROGRAM} installed in ${rootDirectory} are install version ${mismatch.installedVersion}, from a newer ${PRODUCT_NAMES.PROGRAM} `
        + `than this one (install version ${installVersion}), so nothing was done. Update ${PRODUCT_NAMES.PROGRAM} itself, `
        + `then ${updateAction}.`;
    case 'unversioned':
      return `The files ${PRODUCT_NAMES.PROGRAM} installed in ${rootDirectory} carry no install version (${manifestFilePath} is missing), so they are from `
        + `an ${PRODUCT_NAMES.PROGRAM} older than this one, which needs install version ${installVersion}; nothing was done. ${runUpdateSentence}`;
    case 'unreadable':
      return `${manifestFilePath} gives no install version: ${mismatch.manifestProblem}. So the install version of the files ${PRODUCT_NAMES.PROGRAM} installed in `
        + `${rootDirectory} is unknown and nothing was done. ${runUpdateSentence}`;
    case 'manifest-is-a-directory':
      return `${manifestFilePath} is a directory where ${PRODUCT_NAMES.PROGRAM} keeps its install version file, so nothing was done. `
        + `Remove that directory, then ${updateAction}.`;
  }
}

/** The by-hand `task add` is never relayed or posted, so both channels carry the command line's sentence. */
function taskTicketMissingText(detail: Extract<OperationRefusalDetail, { kind: 'task-ticket-missing' }>): string {
  const listAdvice = `Run \`${PRODUCT_NAMES.PROGRAM} ticket list\` to see the tickets this tracker holds.`;
  if (detail.option === 'ticket') return `There is no ticket ${detail.reference}. ${listAdvice}`;
  return `--review-of names ticket ${detail.reference}, and there is none. ${listAdvice}`;
}

function namespaceRefusalText(refusal: BranchNamespaceRefusal, wantedNamespace: string): string {
  switch (refusal.reason) {
    case 'branch-blocks-namespace':
      return `The branch ${refusal.branch} leaves git no room for branches named ${branchNamesOf(wantedNamespace).ticketBranchOf(EXAMPLE_TICKET_ID)}; `
        + 'rename it, or choose another name.';
    case 'namespace-has-branches':
      return `The namespace ${wantedNamespace} already holds the branches ${refusal.branches.join(', ')}, so it is another board's; choose another name.`;
    case 'board-has-branches':
      return `The board's branches ${refusal.branches.join(', ')} are under its current names; land or remove them first.`;
  }
}

function noTrackerAtOverrideText(overrideDirectory: string, channel: RefusalChannel): string {
  return sentencesOf(
    `No ${PRODUCT_NAMES.PROGRAM} tracker was found in ${overrideDirectory}, which ${ROOT_OVERRIDE_VARIABLE} names.`,
    adviceFor(channel, `Run \`${PRODUCT_NAMES.PROGRAM} init\` there, or unset ${ROOT_OVERRIDE_VARIABLE} to search upwards from the current directory instead.`, '')
  );
}

/** Not `OLDER_FORMAT_ADVICE`: no release converts a pipeline, so running `update` with an earlier one would not help. */
function olderPipelineText(filePath: string, channel: RefusalChannel): string {
  return `${filePath} was written by an earlier ${PRODUCT_NAMES.PROGRAM}, in a pipeline format this one does not read, and no release `
    + 'converts it, so the board holds new work as if no pipeline were set and nothing was written. Set the pipeline up again on the '
    + `Pipeline tab of the Bridge${adviceFor(channel, `, or with \`${PRODUCT_NAMES.PROGRAM} pipeline setup\``, '')}.`;
}

function olderProgramPresentText({
  rootDirectory, olderDataFolderPath, program, olderProgram
}: OlderProgramPresentDetail, channel: RefusalChannel): string {
  return `${olderDataFolderPath} holds what ${olderProgram} keeps for ${rootDirectory}, and ${program} is built to run beside it only in a `
    + `repository ${olderProgram} does not track, so nothing was written. ${adviceFor(channel, `Run ${program} in`, 'Use')} a scratch repository instead.`;
}

function gitBelowFloorText({ foundVersion, floorVersion }: GitBelowFloorDetail, channel: RefusalChannel): string {
  const tryAgain = adviceFor(channel, 'run the command again', 'try again');
  return foundVersion === null
    ? `${PRODUCT_NAMES.PROGRAM} needs git ${floorVersion} or newer, and no git on the PATH answered `
      + `${adviceFor(channel, '`git version`', 'with its version')}. Install git ${floorVersion} or newer and ${tryAgain}.`
    : `${PRODUCT_NAMES.PROGRAM} needs git ${floorVersion} or newer, for ${adviceFor(channel, '`git merge-tree --write-tree`', 'its merge of trees')}; `
      + `the git on the PATH is ${foundVersion}. Upgrade git and ${tryAgain}.`;
}

function noTrackerFoundText(searchedFrom: string, channel: RefusalChannel): string {
  return sentencesOf(
    `No ${PRODUCT_NAMES.PROGRAM} tracker was found in ${searchedFrom} or any directory above it.`,
    adviceFor(channel, `Run \`${PRODUCT_NAMES.PROGRAM} init\` in the repository you want tracked.`, '')
  );
}

function trackerLockHeldText(lockDirectoryPath: string): string {
  return `Another ${PRODUCT_NAMES.PROGRAM} command is holding ${lockDirectoryPath} and did not release it. If nothing else is running, remove that path and try again.`;
}

function lockTakenOverText(lockDirectoryPath: string, channel: RefusalChannel): string {
  return `Another command read this ${PRODUCT_NAMES.PROGRAM} command's process as gone and took ${lockDirectoryPath} over, so this one stopped writing. `
    + `The next command finishes whatever this one had committed to write; ${adviceFor(channel, 'run this one again', 'try again')} to make its change.`;
}

function lockRecordUnreadableText(recordPath: string): string {
  return `The lock record ${recordPath} cannot be read, so no process can be judged from it and nothing was done. `
    + 'If nothing else is running, remove that file to free the lock, and try again.';
}

function malformedHoldJournalText(journalFilePath: string, reason: string): string {
  return `${journalFilePath} holds an unfinished write that cannot be read (${reason}), so nothing was done. `
    + 'Repair that file, or remove it to leave that write unfinished, and try again.';
}

function holdJournalUnremovableText(journalFilePath: string, reason: string): string {
  return `The write finished, but ${journalFilePath} could not be removed (${reason}), so a later command would replay it. `
    + 'Close whatever holds that file and try again; the next command finishes it.';
}

/** The reading carries only the file and the reason; the log's text names no path of its own, because the adapter's reason starts with it. */
function unreadableTrackerText(reading: UnreadableTracker): string {
  if (reading.verdict === 'absent') return `${reading.filePath} cannot be read: it is not there`;
  if (reading.unreadableFile === 'log-file') return `The log cannot be read: ${reading.reason}`;
  return `${reading.filePath} cannot be read: ${reading.reason}`;
}

function refusalSentenceOf(refusal: OperationRefusal, channel: RefusalChannel): string {
  const { detail } = refusal;
  if (detail === null) return refusal.message;
  switch (detail.kind) {
    case 'board-refusal':
      return boardRefusalSentenceOf(detail.boardRefusal, channel);
    case 'unreadable-tracker':
      return unreadableTrackerText(detail.reading);
    case 'no-tracker-at-override':
      return noTrackerAtOverrideText(detail.overrideDirectory, channel);
    case 'no-tracker-found':
      return noTrackerFoundText(detail.searchedFrom, channel);
    case 'tracker-lock-held':
      return trackerLockHeldText(detail.lockDirectoryPath);
    case 'lock-taken-over':
      return lockTakenOverText(detail.lockDirectoryPath, channel);
    case 'lock-record-unreadable':
      return lockRecordUnreadableText(detail.recordPath);
    case 'malformed-hold-journal':
      return malformedHoldJournalText(detail.journalFilePath, detail.reason);
    case 'hold-journal-unremovable':
      return holdJournalUnremovableText(detail.journalFilePath, detail.reason);
    case 'install-version-mismatch':
      return installVersionMismatchSentenceOf(detail, channel);
    case 'older-program-present':
      return olderProgramPresentText(detail, channel);
    case 'no-readable-ticket':
      return sentencesOf(
        `There is no readable ticket ${detail.reference}.`,
        adviceFor(channel, `Run \`${PRODUCT_NAMES.PROGRAM} ticket list\` to see what this tracker holds; a file that will not parse is reported there as malformed.`, '')
      );
    case 'malformed-ticket-file':
      return `Ticket file ignored: ${detail.filePath}${detail.line > 0 ? ` (line ${detail.line})` : ''}: ${detail.reason}`;
    case 'unreadable-file-in-the-way':
      return `${detail.filePath} already exists but cannot be read as ${detail.record === 'epic' ? 'an epic' : 'a draft'}, so it is not overwritten. `
        + 'Nothing was written; repair or delete it first.';
    case 'malformed-pipeline':
      return `${detail.filePath} cannot be read as a pipeline (${detail.reason}), so it is not overwritten. Nothing was written; repair `
        + 'or delete it first.';
    case 'older-pipeline':
      return olderPipelineText(detail.filePath, channel);
    case 'entities-in-a-folder':
      return `The pipeline ${detail.filePath} of the tracker in the folder ${detail.projectPrefix} cannot hold entities: only a tracker at the `
        + `repository's root holds them, since an entity's home is a folder of the repository. ${NOTHING_WAS_WRITTEN}`;
    case 'role-command-refused':
      return `The Overseer refused the relayed ${detail.commandKind}: ${ROLE_COMMAND_REFUSAL_TEXT[detail.reason]} (${detail.reason}). ${NOTHING_WAS_WRITTEN}`;
    case 'verb-not-relayable':
      return `\`${PRODUCT_NAMES.PROGRAM} ${detail.verb}\` cannot run under job ${detail.jobId}: it is neither read-only nor a command the Overseer `
        + `applies through the Hatch. ${NOTHING_WAS_WRITTEN}`;
    case 'malformed-hatch-reply':
      return `The Overseer's reply ${detail.replyFilePath} cannot be read, so whether the request was applied is unknown.`;
    case 'overseer-already-running':
      return `An Overseer already serves this board at ${detail.url} (${detail.batonFilePath}). `
        + `Stop it first${adviceFor(channel, ` with \`${PRODUCT_NAMES.PROGRAM} oversee stop\``, '')}.`;
    case 'overseer-down':
      return `No Overseer serves this board (${detail.overseerDirectory} holds no live Baton), so there is nothing to open. `
        + `${adviceFor(channel, `Run \`${PRODUCT_NAMES.PROGRAM} open\``, 'Open the board')} again to start one.`;
    case 'overseer-contended':
      return `Another Overseer started in ${detail.overseerDirectory} at the same moment and holds the newer Baton, so this one stopped without serving.`;
    case 'gate-confinement-unavailable':
      return `Gates and install lines cannot run confined here, so the Overseer did not start: ${detail.reason}.`;
    case 'malformed-overseer-poll-interval':
      return `${detail.variable} must be a positive whole number of milliseconds, not ${JSON.stringify(detail.value)}. Unset it or correct it.`;
    case 'malformed-versions-answer':
      return `${detail.variable} must be two versions, the current and the minimum supported, such as "1.3/1.0", not ${JSON.stringify(detail.value)}. `
        + 'Unset it or correct it.';
    case 'git-below-floor':
      return gitBelowFloorText(detail, channel);
    case 'baton-taken':
      return `A newer Overseer took this board over from the Baton ${detail.batonFilePath}, so this Overseer stopped without acting.`;
    case 'baton-not-created-whole':
      return `The Baton ${detail.batonFilePath} cannot be created whole (${detail.reason}), so the Overseer did not start. Its claim needs a `
        + 'hard link: move the data folder to a filesystem that allows one.';
    case 'overseer-port-in-use':
      return detail.firstPort === detail.lastPort
        ? `Port ${detail.firstPort} on 127.0.0.1 is in use, so the Overseer did not start.${adviceFor(channel, ' Pass another --port, or 0 for any free one.', '')}`
        : `Every port from ${detail.firstPort} to ${detail.lastPort} on 127.0.0.1 is in use, so the Overseer did not start.`
          + adviceFor(channel, ' Pass a free one with --port.', '');
    case 'overseer-identity-unreadable':
      return detail.identitySources.length === 0
        ? `The start and boot of process ${detail.processId} cannot be read on this platform, so it cannot hold an Overseer Baton.`
        : `The start and boot of process ${detail.processId} cannot be read from ${detail.identitySources.join(' and ')}, so it cannot hold an Overseer Baton.`;
    case 'overseer-did-not-start':
      return `The detached Overseer exited${detail.exitCode === null ? '' : ` with code ${detail.exitCode}`} before it answered. `
        + `Its log is ${detail.logFilePath}${adviceFor(channel, `; run \`${PRODUCT_NAMES.PROGRAM} oversee\` in the foreground to see why`, ', which may name the cause')}.`;
    case 'overseer-still-live':
      return `The Overseer at ${detail.url} (process ${detail.processId}) is still live after being asked to stop; its Baton was left as it is.`;
    case 'baton-pass-failed':
      return `The Baton pass to code ${detail.successorCodeVersion} failed at ${detail.step}: ${detail.error}. `
        + `The old Overseer keeps driving${detail.url === null ? '' : ` at ${detail.url}`} and shows this as a warning; `
        + `see ${adviceFor(channel, `\`${PRODUCT_NAMES.PROGRAM} oversee status\` and `, '')}the Overseer log.`;
    case 'overseer-control-is-runtime-only':
      return `${detail.commandKind} is sent to the live Overseer, never applied to the board. ${NOTHING_WAS_WRITTEN}`;
    case 'intake-close-without-job':
      return `Name the product-owner job whose intake to close, as J4. ${NOTHING_WAS_WRITTEN}`;
    case 'intake-title-without-job':
      return `Name the product-owner job whose intake to title, as J4. ${NOTHING_WAS_WRITTEN}`;
    case 'question-options-without-job':
      return `Name the job whose question the option notes are for, as J4. ${NOTHING_WAS_WRITTEN}`;
    case 'need-declare-without-job':
      return `Name the build job that declares the need, as J4. ${NOTHING_WAS_WRITTEN}`;
    case 'malformed-setup-command':
      return `The ${detail.commandKind} command's ${detail.field} is missing or is not of its shape. ${NOTHING_WAS_WRITTEN}`;
    case 'pipeline-draft-invalid':
      return `The edit would leave pipeline setup ${detail.setupId}'s draft a pipeline that cannot be stored: ${detail.reason}. ${NOTHING_WAS_WRITTEN}`;
    case 'draft-copy-outside-entities':
      return sentencesOf(
        detail.fields.length === 0
          ? `Pipeline setup ${detail.setupId}'s draft has no entities, so an edit of it is no copy to another entity.`
          : `A copy to another entity changes only the settings of an entity, and ${detail.fields.join(', ')} ${detail.fields.length === 1 ? 'is' : 'are'} not one.`,
        adviceFor(channel, 'Send the edits without isACopy.', 'Make the change as an ordinary edit.'),
        NOTHING_WAS_WRITTEN,
      );
    case 'main-constitution-unreadable':
      return `CONSTITUTION.md on the main line could not be read: ${detail.reason}. ${NOTHING_WAS_WRITTEN}`;
    case 'picture-unknown':
      return `No picture ${detail.pictureId} is stored on this board: upload it again before you send it. ${NOTHING_WAS_WRITTEN}`;
    case 'too-many-pictures':
      return `The message carries ${detail.pictureCount} pictures, and one message carries at most ${detail.limit}. ${NOTHING_WAS_WRITTEN}`;
    case 'login-item-unavailable':
      return `No login item can start the Overseer on this machine: ${detail.reason}.`;
    case 'login-item-not-changed':
      return `The login item ${detail.location} was not changed: ${detail.reason}.`;
    case 'overseer-not-answering':
      return `The Overseer at ${detail.url} is live, but its API did not answer, so nothing was started beside it. Stop it and start it again.`;
    case 'machine-agent-limit-above-cpus':
      return `A machine agent limit of ${detail.limit} is above the ${detail.ceiling} CPUs this machine has, so nothing was written.`;
    case 'machine-agent-limit-not-whole':
      return `A machine agent limit of ${detail.limit} is not a whole number of at least 1, so nothing was written.`;
    case 'concurrency-limit-out-of-range':
      return `A concurrency limit of ${detail.limit} is not a whole number of agents from 1 to ${detail.ceiling}, so nothing was written.`;
    case 'machine-limits-newer-version':
      return `${detail.filePath} holds version ${detail.version}, newer than this program knows, so it was not written over.`;
    case 'picture-too-large':
      return `The picture is ${detail.bytes} bytes, and a picture is at most ${detail.sizeLimitBytes} bytes, so it was not stored.`;
    case 'picture-type-unsupported':
      return `By its first bytes the picture is none of ${detail.mediaTypes.join(', ')}, so it was not stored.`;
    case 'overseer-owns-the-lifecycle':
      return `An Overseer drives this board at ${detail.url} (${detail.batonFilePath}), so only it delivers tickets. `
        + 'Record the work with Delivered by hand… on the ticket\'s form in the Bridge'
        + `${adviceFor(channel, `, or stop the Overseer with \`${PRODUCT_NAMES.PROGRAM} oversee stop\` first`, '')}. ${NOTHING_WAS_WRITTEN}`;
    case 'talos-protocol-differs':
      return `Talos, started from the program on disk, speaks protocol version ${detail.answeredProtocolVersion}, and this Overseer speaks `
        + `${detail.requiredProtocolVersion}, so the Overseer did not start. Update the program checkout, then start the Overseer again.`;
    case 'talos-unavailable':
      return `Talos ${detail.startNumber} ${TALOS_UNAVAILABLE_REASON_WORDING[detail.reason]}, so the Overseer did not start and no agent runs.`;
    case 'forge-crashed':
      return `The ${PRODUCT_NAMES.PROGRAM} crashed (${detail.component}) and stays off; `
        + `its crash log ${detail.crashLogPath === null ? 'could not be written' : `is ${detail.crashLogPath}`}.`;
    case 'forge-off-after-crash':
      return `The ${PRODUCT_NAMES.PROGRAM} is off after a crash ${detail.crashedGeneration === null ? 'of a Baton nothing names' : `of Baton ${detail.crashedGeneration}`}`
        + `${detail.suspected ? ', suspected before the machine restarted' : ''}; `
        + adviceFor(
          channel,
          `read why with \`${PRODUCT_NAMES.PROGRAM} crash-log\`, and start it yourself with \`${PRODUCT_NAMES.PROGRAM} start\`.`,
          'read why in its crash log, and start it yourself.',
        );
    case 'no-crash-log':
      if (detail.number === null) return 'This board has no crash log: no crash was logged since its crash logs were last removed.';
      return `This board has no crash log ${detail.number}; `
        + adviceFor(channel, `\`${PRODUCT_NAMES.PROGRAM} crash-log\` with no number prints the newest.`, 'ask for none to read the newest.');
    case 'ticket-has-live-job':
      return `Ticket #${detail.ticketId} has job ${detail.jobId} live (${detail.state}), so it cannot be recorded delivered by hand. ${NOTHING_WAS_WRITTEN}`;
    case 'chart-range-bound-unreadable':
      return `${adviceFor(channel, `--${detail.bound}`, CHART_RANGE_BOUND_TEXT[detail.bound])} "${detail.written}" could not be read as a time, so it is not a range bound. `
        + 'Write an ISO 8601 timestamp, `start`, `now`, or a signed offset from now such as `-2h` or `+30m`.';
    case 'chart-range-backwards':
      return `${adviceFor(channel, '--from', CHART_RANGE_BOUND_TEXT.from)} "${detail.from}" is not before ${adviceFor(channel, '--to', 'the end')} "${detail.to}", `
        + 'so the axis would have no width. Swap them, or widen the window.';
    case 'chart-range-tick-unreadable':
      return `A tick of ${detail.tickMinutes} minutes is not a whole number of minutes above zero. ${NOTHING_WAS_WRITTEN}`;
    case 'tracker-has-live-jobs':
      return `Job(s) ${detail.jobIds.join(', ')} are live, so the board cannot be cleared under them. Stop them first. ${NOTHING_WAS_WRITTEN}`;
    case 'malformed-hatch-request':
      return `The relayed request ${detail.requestId} is not a request the Overseer reads. ${NOTHING_WAS_WRITTEN}`;
    case 'hatch-identity-mismatch':
      return `The relayed request ${detail.requestId} names a job or role of its own; a request takes job ${detail.jobId}'s from its folder. `
        + NOTHING_WAS_WRITTEN;
    case 'task-ticket-missing':
      return taskTicketMissingText(detail);
    case 'namespace-board-has-jobs':
      return `The board has ${detail.jobCount} job(s) on it, which run under its current branch names; let them end first. ${NOTHING_WAS_WRITTEN}`;
    case 'namespace-branch-list-failed':
      return `git did not list the branches (${detail.reason}). ${NOTHING_WAS_WRITTEN}`;
    case 'namespace-not-free':
      return `${namespaceRefusalText(detail.refusal, detail.wantedNamespace)} ${NOTHING_WAS_WRITTEN}`;
  }
}

const ROLE_COMMAND_REFUSAL_TEXT: Readonly<Record<RoleCommandRefusalReason, string>> = {
  'hatch-identity-mismatch':           'a request may not name a job, a role or an admission; the Hatch folder says who sent it',
  'command-not-allowed-for-role':      'this job\'s role may not run it',
  'worker-filing-flag':                'a worker files only a low finding, with --priority low and the flags a finding takes, and no group or dependency',
  'worker-filing-limit':               'this job has already filed as many findings as one job may',
  'not-own-draft':                     'it changes only a draft ticket this job filed',
  'not-own-draft-or-unclaimed-ticket': 'it sets the entity only of a draft ticket this job filed, or of a ticket ready for review or committed',
  'incident-move-not-allowed':         'it is legal only as a move the named delivered incident allows',
  'incident-target-mismatch':          'the named incident is about another job or ticket',
  'job-serves-no-setup':               'this job is the agent of no open pipeline setup record',
  'need-outside-an-entity':            'only a build job of an entity declares a need',
  'need-incomplete':                   'a need names its entity and a title, and its body holds a numbered ## Acceptance and a ## Brief',
  'need-for-sealed-package':           'the change of this ticket in that package is sealed; end the stage with the outcome package-return',
};

/** What a relayed verb prints once the Overseer answered it, or once it gave up waiting; a refusal is worded by `messageOf`. */
function hatchAnsweredMessageOf(requestId: string, outcome: 'done' | 'nothing-to-do', ticketIds: readonly string[]): string {
  const ticketsText = ticketIds.length === 0 ? '' : ` (${ticketIds.map((ticketId) => `#${ticketId}`).join(', ')})`;
  return outcome === 'done'
    ? `done ${requestId}${ticketsText}: the Overseer applied the request.`
    : `nothing-to-do ${requestId}${ticketsText}: the Overseer found the change already made.`;
}

function hatchQueuedMessageOf(requestId: string): string {
  return `queued ${requestId}`;
}

/** `repair` is the agent adapter's sentence for the refusal, or `null` when it has none. */
function agentProgramRefusalTextOf(jobId: string, reason: string, repair: string | null): string {
  return `job ${jobId} is not launched: ${reason}${repair === null ? '' : `; ${repair}`}`;
}

function boardRefusalMessageOf(detail: BoardRefusalDetail): string {
  return boardRefusalSentenceOf(detail, 'command-line');
}

function installVersionMismatchMessageOf(detail: InstallVersionMismatchDetail): string {
  return installVersionMismatchSentenceOf(detail, 'command-line');
}

/**
 * Why a pipeline's entities cannot be stored, as the pipeline file reports the first refusal and a `pipeline-draft-invalid` refusal
 * carries it as its reason; the Bridge words each refusal of the entities step with it.
 */
function entityRefusalReasonOf(refusal: EntityRefusal): string {
  switch (refusal.reason) {
    case 'more-than-one-root':
      return `the entities ${refusal.entityKeys.join(', ')} are each of kind root, and one at most is`;
    case 'equal-homes':
      return `the entities ${refusal.entityKeys.join(', ')} share the home ${JSON.stringify(refusal.home)}`;
    case 'reach-inside-another-home':
      return `entities.${refusal.entityKey}.reach names ${JSON.stringify(refusal.reachPath)}, which reaches into the home of the entity ${refusal.ownerKey}; `
        + 'reach names only paths the root entity owns';
    case 'unknown-whitelist-key':
      return `entities.${refusal.entityKey}.whitelist names ${JSON.stringify(refusal.unknownKey)}, which is not an entity`;
    case 'unknown-dependency-key':
      return `entities.${refusal.entityKey}.dependsOn names ${JSON.stringify(refusal.unknownKey)}, which is not an entity`;
    case 'whitelisted-entity-not-package':
      return `entities.${refusal.entityKey}.whitelist names ${JSON.stringify(refusal.whitelistedKey)}, which is not a package`;
    case 'whitelisted-package-without-review':
      return `entities.${refusal.entityKey}.whitelist names ${JSON.stringify(refusal.whitelistedKey)}, a package without a review`;
    case 'dependency-circle':
      return `the entities ${[...refusal.entityKeys, refusal.entityKeys[0]].join(' -> ')} depend on each other in a circle`;
  }
}

/**
 * The sentence a refusal the draft's entities hold is served with: the edit that left it is written and kept, so it says what is wrong
 * and what waits for the fix, never that nothing was written.
 */
function standingEntityRefusalSentenceOf(setupId: string, refusal: EntityRefusal): string {
  return `Pipeline setup ${setupId}'s draft cannot be stored as it is: ${entityRefusalReasonOf(refusal)}. `
    + 'Continue and Apply wait until it is fixed.';
}

/** The sentence the command line prints. */
function messageOf(refusal: OperationRefusal): string {
  return refusalSentenceOf(refusal, 'command-line');
}

/** The sentence an API answer carries for the Bridge or a monitor to show as it is: the same facts, and no command line or flag. */
function apiMessageOf(refusal: OperationRefusal): string {
  return refusalSentenceOf(refusal, 'api');
}

export const OperationRefusalWordingUtil = {
  agentProgramRefusalTextOf,
  apiMessageOf,
  boardRefusalMessageOf,
  entityRefusalReasonOf,
  installVersionMismatchMessageOf,
  messageOf,
  standingEntityRefusalSentenceOf,
  hatchAnsweredMessageOf,
  hatchQueuedMessageOf,
} as const;
