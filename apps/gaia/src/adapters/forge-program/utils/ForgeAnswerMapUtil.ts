/**
 * Maps one run of the forge program to a verdict: what process-run answered, then the JSON document on standard output at the known
 * `answerVersion`, as a done answer at exit 0 or a refusal at any other exit; and a detached start to the process it started. Every key is
 * read as the document's own.
 */
import { JsonValueUtil, type JsonObject }                             from '../../../lib/json-value/JsonValueUtil.ts';
import type { DetachedStartAnswer, NotFoundAnswer, ProgramRunAnswer } from '../../../lib/process-run/ProcessRun.ts';
import type { ForgeContracts }                                        from '../../../shared/@types/ForgeReading.ts';
import { CONTRACT_VERSIONS }                                          from '../../../shared/constants/ContractVersions.ts';
import { ContractVersionUtil }                                        from '../../../shared/utils/ContractVersionUtil.ts';
import type {
  ForgeAnswerNotUnderstoodReason,
  ForgeBatonPass,
  ForgeInitAnswer,
  ForgeInitOutcome,
  ForgeLoginItemAnswer,
  ForgeMachineLimitAnswer,
  ForgeOpenAnswer,
  ForgeProgramOutcome,
  ForgeProgramVerdict,
  ForgeStartAnswer,
  ForgeStopAnswer,
  ForgeUpdateAnswer,
  ForgeVersionAnswer,
} from '../@types/ForgeProgramAnswer.ts';

/** Maps a done document to its answer, or `null` when the document lacks a key the answer needs. */
export type DoneAnswerMapper<Answer> = (document: JsonObject) => Answer | null;

/** The program that ran and the forge root it ran in. */
export interface ForgeProgramRunPlace {
  readonly program: string;
  readonly root:    string;
}

const ANSWER_VERSION_KEYS = { majorKey: 'answerVersion' } as const;
const OUTCOMES: ReadonlySet<unknown> = new Set<ForgeProgramOutcome>(['done', 'nothing-to-do']);
const INIT_OUTCOMES: ReadonlySet<unknown> = new Set<ForgeInitOutcome>(['created', 'refreshed']);
const LOGIN_ITEM_STATES: ReadonlySet<unknown> = new Set<ForgeLoginItemAnswer['loginItem']>(['present', 'absent']);
const CONTRACT_KEYS = ['summary', 'monitor', 'control', 'embed'] as const;

function documentIn(standardOutput: string): JsonObject | null {
  try {
    return JsonValueUtil.jsonObjectOf(JSON.parse(standardOutput));
  } catch {
    return null;
  }
}

function textOf(record: JsonObject, key: string): string | null {
  const value = JsonValueUtil.ownValueOf(record, key);
  return typeof value === 'string' && value !== '' ? value : null;
}

function wholeNumberOf(record: JsonObject, key: string): number | null {
  const value = JsonValueUtil.ownValueOf(record, key);
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function outcomeOf(record: JsonObject): ForgeProgramOutcome | null {
  const value = JsonValueUtil.ownValueOf(record, 'outcome');
  return OUTCOMES.has(value) ? value as ForgeProgramOutcome : null;
}

/** A contract the forge does not serve is absent from the object; one that is present must be a whole number. */
function contractsOf(record: JsonObject): ForgeContracts | null {
  const contracts = JsonValueUtil.jsonObjectOf(JsonValueUtil.ownValueOf(record, 'contracts'));
  if (contracts === null) return null;
  const presentContractsAreWholeNumbers = CONTRACT_KEYS.every((key) => JsonValueUtil.ownValueOf(contracts, key) === undefined || wholeNumberOf(contracts, key) !== null);
  if (!presentContractsAreWholeNumbers) return null;
  return {
    summary: wholeNumberOf(contracts, 'summary'),
    monitor: wholeNumberOf(contracts, 'monitor'),
    control: wholeNumberOf(contracts, 'control'),
    embed:   wholeNumberOf(contracts, 'embed'),
  };
}

function startAnswerOf(document: JsonObject): ForgeStartAnswer | null {
  const started        = JsonValueUtil.ownValueOf(document, 'started');
  const url            = textOf(document, 'url');
  const generation     = wholeNumberOf(document, 'generation');
  const trackerId      = textOf(document, 'trackerId');
  const codeVersion    = textOf(document, 'codeVersion');
  const installVersion = wholeNumberOf(document, 'installVersion');
  const contracts      = contractsOf(document);
  if (typeof started !== 'boolean' || url === null || generation === null || trackerId === null) return null;
  if (codeVersion === null || installVersion === null || contracts === null) return null;
  return {
    started,
    url,
    generation,
    trackerId,
    codeVersion,
    installVersion,
    contracts,
  };
}

function stopAnswerOf(document: JsonObject): ForgeStopAnswer | null {
  const outcome = outcomeOf(document);
  return outcome === null ? null : { outcome };
}

function initAnswerOf(document: JsonObject): ForgeInitAnswer | null {
  const initOutcome = JsonValueUtil.ownValueOf(document, 'outcome');
  const outcome     = INIT_OUTCOMES.has(initOutcome) ? initOutcome as ForgeInitOutcome : null;
  const trackerId   = textOf(document, 'trackerId');
  const project     = textOf(document, 'project');
  const root        = textOf(document, 'root');
  if (outcome === null || trackerId === null || project === null || root === null) return null;
  return {
    outcome,
    trackerId,
    project,
    root,
  };
}

/** `batonPass` is `done`, `not-needed`, or `failed` with the step that failed in `batonPassStep`, which is `null` otherwise. */
function batonPassOf(document: JsonObject): ForgeBatonPass | null {
  const batonPass = JsonValueUtil.ownValueOf(document, 'batonPass');
  if (batonPass === 'done' || batonPass === 'not-needed') return { outcome: batonPass };
  if (batonPass !== 'failed') return null;
  const failedStep = textOf(document, 'batonPassStep');
  return failedStep === null ? null : { outcome: 'failed', failedStep };
}

function updateAnswerOf(document: JsonObject): ForgeUpdateAnswer | null {
  const outcome        = outcomeOf(document);
  const installVersion = wholeNumberOf(document, 'installVersion');
  const batonPass      = batonPassOf(document);
  if (outcome === null || installVersion === null || batonPass === null) return null;
  return { outcome, installVersion, batonPass };
}

function versionAnswerOf(document: JsonObject): ForgeVersionAnswer | null {
  const codeVersion    = textOf(document, 'codeVersion');
  const installVersion = wholeNumberOf(document, 'installVersion');
  const contracts      = contractsOf(document);
  const monitorFolder  = textOf(document, 'monitorFolder');
  if (codeVersion === null || installVersion === null || contracts === null || monitorFolder === null) return null;
  return {
    codeVersion,
    installVersion,
    contracts,
    monitorFolder,
  };
}

/** The item's `state` after the step; its label, location and repository are the forge's to show and are not read. */
function loginItemAnswerOf(document: JsonObject): ForgeLoginItemAnswer | null {
  const loginItem = JsonValueUtil.ownValueOf(document, 'state');
  return LOGIN_ITEM_STATES.has(loginItem) ? { loginItem: loginItem as ForgeLoginItemAnswer['loginItem'] } : null;
}

function machineLimitAnswerOf(document: JsonObject): ForgeMachineLimitAnswer | null {
  const outcome    = outcomeOf(document);
  const agentLimit = wholeNumberOf(document, 'limit');
  if (outcome === null || agentLimit === null) return null;
  return { outcome, agentLimit };
}

function notUnderstood<Answer>(reason: ForgeAnswerNotUnderstoodReason, exitCode: number): ForgeProgramVerdict<Answer> {
  return { verdict: 'answer-not-understood', reason, exitCode };
}

/** The forge's refusal code and sentence pass through unchanged. */
function refusalVerdictOf<Answer>(document: JsonObject, exitCode: number): ForgeProgramVerdict<Answer> {
  const refusal = textOf(document, 'refusal');
  const text    = textOf(document, 'text');
  if (refusal === null || text === null) return notUnderstood('malformed', exitCode);
  return { verdict: 'refused', refusal, text };
}

function verdictOfFinishedRun<Answer>(exitCode: number, standardOutput: string, doneAnswerOf: DoneAnswerMapper<Answer>): ForgeProgramVerdict<Answer> {
  const document = documentIn(standardOutput);
  if (document === null) return notUnderstood('no-json', exitCode);
  if (ContractVersionUtil.readMajorOf(document, ANSWER_VERSION_KEYS, CONTRACT_VERSIONS.forgeProgramAnswer) === null) return notUnderstood('other-answer-version', exitCode);
  if (exitCode !== 0) return refusalVerdictOf(document, exitCode);
  const answer = doneAnswerOf(document);
  return answer === null ? notUnderstood('malformed', exitCode) : { verdict: 'done', answer };
}

function notFoundVerdictOf<Answer>(notFound: NotFoundAnswer, place: ForgeProgramRunPlace): ForgeProgramVerdict<Answer> {
  return notFound.missing === 'program' ? { verdict: 'program-not-found', program: place.program } : { verdict: 'root-missing', root: place.root };
}

function verdictOfDetachedStart(start: DetachedStartAnswer, place: ForgeProgramRunPlace): ForgeProgramVerdict<ForgeOpenAnswer> {
  return start.verdict === 'started' ? { verdict: 'done', answer: { processId: start.processId } } : notFoundVerdictOf(start, place);
}

function verdictOfRun<Answer>(run: ProgramRunAnswer, place: ForgeProgramRunPlace, doneAnswerOf: DoneAnswerMapper<Answer>): ForgeProgramVerdict<Answer> {
  switch (run.verdict) {
    case 'not-found':
      return notFoundVerdictOf(run, place);
    case 'timed-out':
      return { verdict: 'timed-out' };
    case 'finished':
      return verdictOfFinishedRun(run.exitCode, run.standardOutput, doneAnswerOf);
  }
}

export const ForgeAnswerMapUtil = {
  verdictOfRun,
  verdictOfDetachedStart,
  startAnswerOf,
  stopAnswerOf,
  initAnswerOf,
  updateAnswerOf,
  versionAnswerOf,
  loginItemAnswerOf,
  machineLimitAnswerOf,
} as const;
