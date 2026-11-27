/**
 * Sends one command to `POST /api/commands` and gives the view Gaia's answer. Per forge it keeps the command on its way, the last failed
 * send until dismissed or the next success, and a pending restart until dismissed or a command that ends the running Hephaestus succeeds.
 * It sends nothing while the controls may not act, and nothing for a forge that already has a command on its way.
 */
import { createContext, useContext, useSyncExternalStore } from 'react';

import { ApiPathUtil }            from '../../src/lib/api-paths/ApiPathUtil.ts';
import { GAIA_ENDPOINT_VERSIONS } from '../../src/shared/constants/GaiaSystemVersions.ts';
import { PAGE_CONTRACT_VERSIONS } from '../../src/shared/constants/PageContractVersions.ts';
import { ContractVersionUtil }    from '../../src/shared/utils/ContractVersionUtil.ts';
import type {
  CommandAnswerDocument,
  CommandBody,
  CommandDocument,
  CommandKind,
  CommandOutcome,
  FleetCommandKind,
} from '../@types/CommandDocument.ts';

/** A send that reached the server, or tried to. */
export type SentCommandResult =
  | { readonly verdict: 'answered'; readonly answer: CommandAnswerDocument }
  | { readonly verdict: 'server-unreachable' }
  | { readonly verdict: 'answer-not-understood' }
  | { readonly verdict: 'session-lost' };

/** `not-sent` when the controls may not act or the subject's last command is still on its way: nothing reached the server. */
export type CommandResult = SentCommandResult | { readonly verdict: 'not-sent'; readonly reason: 'controls-may-not-act' | 'already-on-its-way' };

/** A send that did not succeed: refused, not carried, or not answered. */
export interface CommandFailure {
  readonly kind:   CommandKind;
  readonly result: SentCommandResult;
}

export interface CommandState {
  readonly onItsWay:       CommandKind | null;
  readonly failure:        CommandFailure | null;
  /** An update was done, and the forge runs the old code until it restarts. */
  readonly restartPending: boolean;
}

/**
 * A forge's entry by its `trackerId`; an absent entry is idle with no failure. `fleetAnswers` keeps the last answer of a command that
 * names no forge and succeeded, until dismissed or until that command is sent again: the per-forge lines of `fleet-outage-resume`.
 */
export interface CommandStates {
  readonly forges:       ReadonlyMap<string, CommandState>;
  readonly fleet:        ReadonlyMap<FleetCommandKind, CommandState>;
  readonly fleetAnswers: ReadonlyMap<FleetCommandKind, CommandAnswerDocument>;
}

/** What a command is about: one forge, or, for a command that names none, its own kind. */
export type CommandSubject = { readonly trackerId: string } | { readonly fleetCommand: FleetCommandKind };

export type CommandRequestSender = (path: string, requestOptions: RequestInit) => Promise<Response>;

export interface CommandSenderSurroundings {
  readonly sendRequest:    CommandRequestSender;
  /** False while Gaia's event stream is lost: what the page shows may be stale, so no control acts on it. */
  readonly controlsMayAct: () => boolean;
  /** The server answered that it no longer knows this window's session. */
  readonly sessionWasLost: () => void;
}

export interface CommandSender {
  readonly send:                  (command: CommandBody) => Promise<CommandResult>;
  readonly dismissFailure:        (subject: CommandSubject) => void;
  readonly dismissRestartPending: (subject: CommandSubject) => void;
  readonly dismissAnswer:         (fleetCommand: FleetCommandKind) => void;
  readonly states:                () => CommandStates;
  readonly subscribe:             (listener: () => void) => () => void;
}

const COMMANDS_PATH = ApiPathUtil.versionedPathOf('commands', GAIA_ENDPOINT_VERSIONS.commands);

const NO_SESSION_STATUS = 401;

const SUCCESSFUL_OUTCOMES: ReadonlySet<CommandOutcome> = new Set(['done', 'nothing-to-do', 'restart-pending']);

const COMMAND_OUTCOMES: ReadonlySet<unknown> = new Set<CommandOutcome>(['done', 'nothing-to-do', 'restart-pending', 'refused', 'unreachable', 'not-supported']);

/** A success of these ends the Hephaestus that runs the old code, so no restart is pending after it; a pause, say, leaves it running. */
const COMMANDS_THAT_END_THE_RUNNING_HEPHAESTUS: ReadonlySet<CommandKind> = new Set(['forge-restart', 'forge-stop', 'forge-update']);

const IDLE: CommandState = { onItsWay: null, failure: null, restartPending: false };

const NO_COMMAND_STATES: CommandStates = { forges: new Map(), fleet: new Map(), fleetAnswers: new Map() };

function subjectOf(command: CommandBody): CommandSubject {
  return 'trackerId' in command ? { trackerId: command.trackerId } : { fleetCommand: command.kind };
}

function stateOf(states: CommandStates, subject: CommandSubject): CommandState {
  return ('trackerId' in subject ? states.forges.get(subject.trackerId) : states.fleet.get(subject.fleetCommand)) ?? IDLE;
}

function statesWith(states: CommandStates, subject: CommandSubject, state: CommandState): CommandStates {
  const isIdle = state.onItsWay === null && state.failure === null && !state.restartPending;
  if ('trackerId' in subject) {
    const forges = new Map(states.forges);
    if (isIdle) forges.delete(subject.trackerId);
    else forges.set(subject.trackerId, state);
    return { ...states, forges };
  }
  const fleet = new Map(states.fleet);
  if (isIdle) fleet.delete(subject.fleetCommand);
  else fleet.set(subject.fleetCommand, state);
  return { ...states, fleet };
}

function statesWithFleetAnswer(states: CommandStates, fleetCommand: FleetCommandKind, answer: CommandAnswerDocument | null): CommandStates {
  const fleetAnswers = new Map(states.fleetAnswers);
  if (answer === null) fleetAnswers.delete(fleetCommand);
  else fleetAnswers.set(fleetCommand, answer);
  return { ...states, fleetAnswers };
}

function forgeAnswersAreIn(answer: object): boolean {
  const forges: unknown = Object.hasOwn(answer, 'forges') ? (answer as Readonly<Record<string, unknown>>)['forges'] : undefined;
  return Array.isArray(forges);
}

function nullableStringIsIn(answer: object, key: string): boolean {
  const value: unknown = Object.hasOwn(answer, key) ? (answer as Readonly<Record<string, unknown>>)[key] : undefined;
  return value === null || typeof value === 'string';
}

const ANSWER_VERSION_KEYS = { majorKey: 'answerVersion' } as const;

/** Gaia's answer at the known `answerVersion`, or `null` for anything else. */
function answerDocumentOf(body: unknown): CommandAnswerDocument | null {
  if (typeof body !== 'object' || body === null || !Object.hasOwn(body, 'outcome')) return null;
  const { outcome } = body as { readonly outcome: unknown };
  if (ContractVersionUtil.readMajorOf(body, ANSWER_VERSION_KEYS, PAGE_CONTRACT_VERSIONS.gaiaCommandAnswer) === null || !COMMAND_OUTCOMES.has(outcome)) return null;
  if (!nullableStringIsIn(body, 'refusal') || !nullableStringIsIn(body, 'text') || !forgeAnswersAreIn(body)) return null;
  return body as CommandAnswerDocument;
}

/** The answer is read whatever the HTTP status: the server maps its verdict to a status and still answers the whole document. */
async function resultOf(response: Response): Promise<SentCommandResult> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { verdict: 'answer-not-understood' };
  }
  const answer = answerDocumentOf(body);
  return answer === null ? { verdict: 'answer-not-understood' } : { verdict: 'answered', answer };
}

function resultSucceeded(result: CommandResult): boolean {
  return result.verdict === 'answered' && SUCCESSFUL_OUTCOMES.has(result.answer.outcome);
}

/** A restart is pending from the answer that says so until a command that ends the running Hephaestus succeeds. */
function restartPendingAfter(kind: CommandKind, result: CommandResult, restartWasPending: boolean): boolean {
  if (result.verdict === 'answered' && result.answer.outcome === 'restart-pending') return true;
  return resultSucceeded(result) && COMMANDS_THAT_END_THE_RUNNING_HEPHAESTUS.has(kind) ? false : restartWasPending;
}

function create({ sendRequest, controlsMayAct, sessionWasLost }: CommandSenderSurroundings): CommandSender {
  const listeners = new Set<() => void>();
  let states = NO_COMMAND_STATES;

  const notifyListeners = (): void => [...listeners].forEach((listener) => listener());

  const changeState = (subject: CommandSubject, state: CommandState): void => {
    states = statesWith(states, subject, state);
    notifyListeners();
  };

  const changeFleetAnswer = (fleetCommand: FleetCommandKind, answer: CommandAnswerDocument | null): void => {
    states = statesWithFleetAnswer(states, fleetCommand, answer);
    notifyListeners();
  };

  const post = async (command: CommandBody): Promise<SentCommandResult> => {
    const commandDocument: CommandDocument = { ...command, commandVersion: PAGE_CONTRACT_VERSIONS.gaiaCommand };
    let response: Response;
    try {
      response = await sendRequest(COMMANDS_PATH, {
        method:      'POST',
        credentials: 'same-origin',
        headers:     { 'content-type': 'application/json' },
        body:        JSON.stringify(commandDocument),
      });
    } catch {
      return { verdict: 'server-unreachable' };
    }
    if (response.status === NO_SESSION_STATUS) {
      sessionWasLost();
      return { verdict: 'session-lost' };
    }
    return resultOf(response);
  };

  const send = async (command: CommandBody): Promise<CommandResult> => {
    if (!controlsMayAct()) return { verdict: 'not-sent', reason: 'controls-may-not-act' };
    const subject = subjectOf(command);
    const before = stateOf(states, subject);
    if (before.onItsWay !== null) return { verdict: 'not-sent', reason: 'already-on-its-way' };
    if ('fleetCommand' in subject && states.fleetAnswers.has(subject.fleetCommand)) changeFleetAnswer(subject.fleetCommand, null);
    changeState(subject, { ...before, onItsWay: command.kind });
    const result = await post(command);
    const after = stateOf(states, subject);
    changeState(subject, {
      onItsWay:       null,
      failure:        resultSucceeded(result) ? null : { kind: command.kind, result },
      restartPending: restartPendingAfter(command.kind, result, after.restartPending),
    });
    if ('fleetCommand' in subject && result.verdict === 'answered' && resultSucceeded(result)) changeFleetAnswer(subject.fleetCommand, result.answer);
    return result;
  };

  return {
    send,
    dismissFailure: (subject) => {
      const state = stateOf(states, subject);
      if (state.failure !== null) changeState(subject, { ...state, failure: null });
    },
    dismissRestartPending: (subject) => {
      const state = stateOf(states, subject);
      if (state.restartPending) changeState(subject, { ...state, restartPending: false });
    },
    dismissAnswer: (fleetCommand) => {
      if (states.fleetAnswers.has(fleetCommand)) changeFleetAnswer(fleetCommand, null);
    },
    states:    () => states,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function senderOutsideGaiaApp(): never {
  throw new Error('A view asked for the command sender outside GaiaApp, which provides it.');
}

/** Provided by `GaiaApp`; a view reads it through `useCommandSender`. */
export const CommandSenderContext = createContext<CommandSender | null>(null);

export interface CommandSenderInView {
  readonly send:                  CommandSender['send'];
  readonly dismissFailure:        CommandSender['dismissFailure'];
  readonly dismissRestartPending: CommandSender['dismissRestartPending'];
  readonly dismissAnswer:         CommandSender['dismissAnswer'];
  /** The states as of this render; a change renders the view again. */
  readonly states:                CommandStates;
}

export function useCommandSender(): CommandSenderInView {
  const sender = useContext(CommandSenderContext) ?? senderOutsideGaiaApp();
  const states = useSyncExternalStore(sender.subscribe, sender.states, sender.states);
  return {
    send: sender.send, dismissFailure: sender.dismissFailure, dismissRestartPending: sender.dismissRestartPending, dismissAnswer: sender.dismissAnswer, states,
  };
}

export const CommandSender = {
  COMMANDS_PATH,
  create,
  subjectOf,
  stateOf,
} as const;
