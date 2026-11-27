/**
 * The sentences of Hephaestus's open notices and of the header's warnings: a failed restart with its step and error,
 * an Assistant that cannot come up, and a board file of forge's own that cannot be read. The board document and the monitor snapshot carry
 * them, so both read the same words, which name a neutral action and never a command line: User runs no command.
 */
import type { MonitorWarning } from '../@types/MonitorSnapshot.ts';

/** A notice Hephaestus derives each pass: its `kind` and the facts that kind carries. */
export interface NoticeFacts {
  readonly kind:           string;
  readonly [fact: string]: unknown;
}

/** The last restart that failed while this Hephaestus kept driving. */
export interface RestartWarningFacts {
  readonly successorCodeVersion: string;
  readonly step:                 string;
  readonly error:                string;
}

/** A board-wide file forge stored for itself that its ingestion could not read, kept by Hephaestus until it restarts. */
export interface UnreadableFileFacts {
  readonly file:   string;
  readonly reason: string;
}

/** What Hephaestus knows of itself that the header warns about. */
export interface HeaderWarningFacts {
  readonly restartWarning:  RestartWarningFacts | null;
  readonly unreadableFiles: readonly UnreadableFileFacts[];
}

const DEFAULT_CAUSE_TEXT: Readonly<Record<string, string>> = {
  'turn-closed':   'its delivery turn closed',
  'turn-budget':   'the turn budget ran out',
  'no-assistant':  'no Assistant was up',
  'assistant-off': 'the Assistant is off',
};

const ABANDONED_PASS_REASON_TEXT: Readonly<Record<string, string>> = {
  'tracker-lock-held': 'another process held the board\'s lock past its wait',
  'lock-taken-over':   'another process took the board\'s lock over',
};

const NO_ASSISTANT_CAUSE = 'no-assistant';

const INCIDENT_DEFAULTED = 'incident-defaulted';

function factOf(notice: NoticeFacts, fact: string): string {
  const value = notice[fact];
  if (Array.isArray(value)) return value.map(String).join(', ');
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** The agent adapter's repair sentence for a refused program as a trailing clause, or nothing when the notice carries none. */
function repairClauseOf(notice: NoticeFacts): string {
  const { repair } = notice;
  return typeof repair === 'string' && repair !== '' ? `; ${repair}` : '';
}

/** Why the last pass was abandoned, `another process took the board's lock over`; a reason the forge does not know reads as itself. */
function abandonedPassReasonTextOf(reason: string): string {
  return Object.hasOwn(ABANDONED_PASS_REASON_TEXT, reason) ? ABANDONED_PASS_REASON_TEXT[reason] ?? reason : reason;
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
      return 'new code is on disk: restart Hephaestus to run it';
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
      return `job ${factOf(notice, 'jobId')} is not launched: ${factOf(notice, 'reason')}${repairClauseOf(notice)}`;
    case 'passes-abandoned':
      return `${factOf(notice, 'inARow')} drive passes in a row were abandoned, the last as ${abandonedPassReasonTextOf(factOf(notice, 'reason'))}; `
        + 'Hephaestus keeps running and tries again at each wake-up';
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

/** A header warning with the facts its sentence names: the failed pass's code version, step and error, or the unreadable file and why. */
export interface WordedWarning {
  readonly kind:  MonitorWarning['kind'];
  readonly facts: Readonly<Record<string, string>>;
  readonly text:  string;
}

/** Derived from the notices and Hephaestus's facts, never stored. */
function wordedWarningsOf(notices: readonly NoticeFacts[], header: HeaderWarningFacts): WordedWarning[] {
  const { restartWarning } = header;
  const defaulted = notices.filter((notice) => notice.kind === INCIDENT_DEFAULTED);
  const restartFailed: WordedWarning[] = restartWarning === null ? [] : [{
    kind:  'restart-failed',
    facts: { successorCodeVersion: restartWarning.successorCodeVersion, step: restartWarning.step, error: restartWarning.error },
    text:  `the restart to code ${restartWarning.successorCodeVersion} failed at ${restartWarning.step}: ${restartWarning.error}`,
  }];
  const assistantDown: WordedWarning[] = defaulted.some((notice) => notice['cause'] === NO_ASSISTANT_CAUSE)
    ? [{ kind: 'assistant-down', facts: {}, text: 'no Assistant can come up: open incidents take their defaults' }]
    : [];
  const unreadableFiles: WordedWarning[] = header.unreadableFiles.map(({ file, reason }) => ({
    kind:  'system-file-unreadable',
    facts: { file, reason },
    text:  `Hephaestus cannot read the board file ${file}: restart Hephaestus, and report a bug if this warning stays`,
  }));
  return [...restartFailed, ...assistantDown, ...unreadableFiles];
}

function warningsOf(notices: readonly NoticeFacts[], header: HeaderWarningFacts): MonitorWarning[] {
  return wordedWarningsOf(notices, header).map(({ kind, text }) => ({ kind, text }));
}

/** The state carries the notices as the pass derived them; one that names no kind is no notice. */
function noticeFactsIn(notices: readonly unknown[]): NoticeFacts[] {
  return notices.filter((notice): notice is NoticeFacts => typeof notice === 'object' && notice !== null && typeof (notice as { kind?: unknown }).kind === 'string');
}

/** Hephaestus keeps the warning as it was written; one that does not read as a warning is none. */
function restartWarningIn(warning: unknown): RestartWarningFacts | null {
  if (typeof warning !== 'object' || warning === null) return null;
  const { successorCodeVersion, step, error } = warning as Partial<Record<keyof RestartWarningFacts, unknown>>;
  return typeof successorCodeVersion === 'string' && typeof step === 'string' && typeof error === 'string' ? { successorCodeVersion, step, error } : null;
}

/** The unreadable files as Hephaestus keeps them; an entry that names no file and reason is none. */
function unreadableFilesIn(files: unknown): UnreadableFileFacts[] {
  if (!Array.isArray(files)) return [];
  return files.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { file, reason } = entry as Partial<Record<keyof UnreadableFileFacts, unknown>>;
    return typeof file === 'string' && typeof reason === 'string' ? [{ file, reason }] : [];
  });
}

/** The header's facts of Hephaestus as its state carries them. */
function headerWarningFactsOf(hephaestus: { readonly restartWarning: unknown; readonly unreadableFiles: unknown }): HeaderWarningFacts {
  return { restartWarning: restartWarningIn(hephaestus.restartWarning), unreadableFiles: unreadableFilesIn(hephaestus.unreadableFiles) };
}

/** Why an incident that took its default did, worded; `null` for any other notice. */
function causeSentenceOf(notice: NoticeFacts): string | null {
  return notice.kind === INCIDENT_DEFAULTED ? defaultCauseTextOf(factOf(notice, 'cause')) : null;
}

export const NoticeWordingUtil = Object.freeze({
  noticeFactsIn, restartWarningIn, headerWarningFactsOf, noticeTextOf, noticeSentenceOf, warningsOf, wordedWarningsOf, defaultCauseTextOf, causeSentenceOf
});
