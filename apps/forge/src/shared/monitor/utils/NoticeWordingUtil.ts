/**
 * The sentences of the Overseer's open notices and of the header's warnings (owner answer Q34): a failed Baton pass with its step and error,
 * and an Assistant that cannot come up. The Bridge shows them and the monitor snapshot carries them, so both read the same words, which
 * name the Bridge control or a neutral action and never a command line: User runs no command.
 */
import type { MonitorWarning } from '../@types/MonitorSnapshot.ts';

/** A notice the Overseer derives each pass: its `kind` and the facts that kind carries. */
export interface NoticeFacts {
  readonly kind:           string;
  readonly [fact: string]: unknown;
}

/** The last Baton pass that failed while this Overseer kept driving. */
export interface BatonPassWarningFacts {
  readonly successorCodeVersion: string;
  readonly step:                 string;
  readonly error:                string;
}

const DEFAULT_CAUSE_TEXT: Readonly<Record<string, string>> = {
  'turn-closed':  'its delivery turn closed',
  'turn-budget':  'the turn budget ran out',
  'no-assistant': 'no Assistant was up',
};

const NO_ASSISTANT_CAUSE = 'no-assistant';

const INCIDENT_DEFAULTED = 'incident-defaulted';

function factOf(notice: NoticeFacts, fact: string): string {
  const value = notice[fact];
  if (Array.isArray(value)) return value.map(String).join(', ');
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** Why an incident took its default, `its delivery turn closed`; a cause the forge does not know reads as itself. */
function defaultCauseTextOf(cause: string): string {
  return Object.hasOwn(DEFAULT_CAUSE_TEXT, cause) ? DEFAULT_CAUSE_TEXT[cause] ?? cause : cause;
}

/** The notice line's sentence for every kind but an incident default; a kind this program does not know reads as itself. */
function noticeTextOf(notice: NoticeFacts): string {
  switch (notice.kind) {
    case 'install-version-changed':
      return 'the install version changed, so launches are held until the board is updated';
    case 'new-code':
      return 'new code is on disk: restart the Overseer to run it';
    case 'claude-md-block-committed':
      return `launches onto ${factOf(notice, 'target')} wait: commit the CLAUDE.md change the board's update made`;
    case 'attribution-found':
      return `ticket #${factOf(notice, 'ticketId')} carries an AI attribution`;
    case 'rounds-not-converging':
      return `ticket #${factOf(notice, 'ticketId')}'s review rounds are not converging`;
    case 'dirty-main-checkout':
      return factOf(notice, 'blockingFiles') === ''
        ? `landings on ${factOf(notice, 'target')} wait: the main checkout is not on ${factOf(notice, 'target')}`
        : `landings on ${factOf(notice, 'target')} wait: the main checkout's changes to ${factOf(notice, 'blockingFiles')} block the fast-forward`;
    case 'target-file-held':
      return `landings on ${factOf(notice, 'target')} wait: another process holds ${factOf(notice, 'heldFiles')} open, so git cannot replace what is held`;
    case 'cleanup-declined':
      return `git declined the ${factOf(notice, 'cleanup')} cleanup of ${factOf(notice, 'groupBranch')}: ${factOf(notice, 'reason')}`;
    case 'instructions-missing':
      return `job ${factOf(notice, 'jobId')} is not launched: the instruction file ${factOf(notice, 'path')} its pipeline names is missing`;
    case 'agent-program-refused':
      return `job ${factOf(notice, 'jobId')} is not launched: ${factOf(notice, 'reason')}`;
    default:
      return notice.kind;
  }
}

function incidentDefaultTextOf(notice: NoticeFacts): string {
  const cause = factOf(notice, 'cause');
  return `incident ${factOf(notice, 'incidentId')} took its default, ${factOf(notice, 'move')}: ${defaultCauseTextOf(cause)}`;
}

/** Any open notice as one sentence: an incident default as its warning words it, every other kind as the notice line does. */
function noticeSentenceOf(notice: NoticeFacts): string {
  return notice.kind === INCIDENT_DEFAULTED ? incidentDefaultTextOf(notice) : noticeTextOf(notice);
}

/** Derived from the notices and the Overseer's facts, never stored. */
function warningsOf(notices: readonly NoticeFacts[], batonPassWarning: BatonPassWarningFacts | null): MonitorWarning[] {
  const defaulted = notices.filter((notice) => notice.kind === INCIDENT_DEFAULTED);
  const batonPassFailed: MonitorWarning[] = batonPassWarning === null ? [] : [{
    kind: 'baton-pass-failed',
    text: `the Baton pass to code ${batonPassWarning.successorCodeVersion} failed at ${batonPassWarning.step}: ${batonPassWarning.error}`,
  }];
  const assistantDown: MonitorWarning[] = defaulted.some((notice) => notice['cause'] === NO_ASSISTANT_CAUSE)
    ? [{ kind: 'assistant-down', text: 'no Assistant can come up: open incidents take their defaults' }]
    : [];
  return [...batonPassFailed, ...assistantDown];
}

export const NoticeWordingUtil = Object.freeze({
  noticeTextOf, noticeSentenceOf, warningsOf, defaultCauseTextOf
});
