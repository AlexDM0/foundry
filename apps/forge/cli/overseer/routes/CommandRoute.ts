/**
 * `POST /api/commands` behind the token, control contract 1: a `ControlCommand` applied in a hold of its own, answered 200
 * `{controlVersion, outcome, result}`, and 400 for a malformed body, 409 for a refused command or 423 while launches are held for an
 * install change, each `{controlVersion, refusal, fields, text}`: the refusal's code, its facts and the sentence the command line prints.
 * `overseer-stop`, `overseer-restart` and `talos-restart` are runtime only and go to the Overseer itself, held or not;
 * `machine-agent-limit-set` writes the machine's limit, in no hold; `flint-brain-start` and `flint-brain-stop` go to the Overseer's brain,
 * held or not, a start naming the Bridge as its starter when the request carries a Bridge session and the API otherwise, never from the
 * body.
 */
import type { ForgeRefusalDocument } from 'forge-contracts/ForgeRefusalDocument';

import { BoardCommandMappingUtil }                                  from '../../../src/adapters/board-commands/utils/BoardCommandMappingUtil.ts';
import { BoardCommandReadingUtil }                                  from '../../../src/adapters/board-commands/utils/BoardCommandReadingUtil.ts';
import { RefusalDocumentUtil }                                      from '../../../src/adapters/utils/RefusalDocumentUtil.ts';
import { CONTROL_COMMAND_KINDS, FLINT_BRAIN_COMMAND_KINDS }         from '../../../src/services/control/ControlService.ts';
import type { FlintBrain }                                          from '../../../src/services/overseer/FlintBrain.ts';
import { MachineAgentLimit }                                        from '../../../src/services/overseer/MachineAgentLimit.ts';
import type { CommandCaller, RouteAnswer }                          from '../../../src/services/overseer/OverseerServer.ts';
import type { BoardStore }                                          from '../../../src/services/store/BoardStore.ts';
import type { Workspace }                                           from '../../../src/services/tracker/Workspace.ts';
import type { ControlCommand, ControlCommandOf, FlintBrainCommand } from '../../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }                                         from '../../../src/shared/OperationRefusal.ts';
import { SERVED_CONTRACT_VERSIONS }                                 from '../../../src/shared/constants/OverseerApiContracts.ts';
import type { CommandContext }                                      from '../../CommandContext.ts';
import { INSIDE_THE_OVERSEER_CONTROL_CONTEXT }                      from '../../CommandControlContext.ts';
import { registerWrittenTracker }                                   from '../../RegisterWrittenTracker.ts';
import type { ArgumentParser }                                      from '../../arguments/ArgumentParser.ts';
import { BY_HAND_COMMAND_KINDS }                                    from '../../constants/JobVerbs.ts';
import { OptionValueUtil }                                          from '../../utils/OptionValueUtil.ts';
import { OutputUtil }                                               from '../../utils/OutputUtil.ts';

export type RuntimeOverseerCommand =
  | { kind: 'overseer-stop' | 'overseer-restart'; now: boolean }
  | { kind: 'talos-restart' };

/** `nothing-to-do` when the live Overseer had nothing to act on, as a `talos-restart` with no Talos that takes the quit. */
export type RuntimeCommandOutcome = 'done' | 'nothing-to-do';

export interface CommandRouteRequest {
  commandArguments:     ArgumentParser;
  context:              CommandContext;
  workspace:            Workspace;
  /** The Overseer's one store; a command goes through its command face, never inside a transaction of the pass. */
  boardStore:           BoardStore;
  launchesHeld:         () => boolean;
  onRuntimeCommand:     (command: RuntimeOverseerCommand) => Promise<RuntimeCommandOutcome>;
  /** After a command was applied, so the pass acts on it at once. */
  wake:                 () => void;
  /** The CPU count the machine agent limit is capped at; the runtime's when not given. */
  machineAgentCeiling?: number;
  /** The live Overseer's brain, which the route starts and stops. */
  flintBrain:           Pick<FlintBrain, 'start' | 'stop'>;
}

const HTTP_STATUS = {
  OK:          200,
  BAD_REQUEST: 400,
  CONFLICT:    409,
  LOCKED:      423,
} as const;

const RUNTIME_COMMAND_KINDS: readonly RuntimeOverseerCommand['kind'][] = ['overseer-stop', 'overseer-restart', 'talos-restart'];

/** Every kind the route takes: the control service's but the by-hand kinds, and Flint's brain's. */
export const COMMAND_ROUTE_KINDS: readonly string[] = Object.freeze([
  ...CONTROL_COMMAND_KINDS.filter((kind) => !(BY_HAND_COMMAND_KINDS as readonly string[]).includes(kind)),
  ...FLINT_BRAIN_COMMAND_KINDS,
]);

const CONTROL_VERSION = SERVED_CONTRACT_VERSIONS.control;

export const MALFORMED_BODY_TEXT = 'The command body is not a control command this Overseer knows, or a field of it has the wrong type, so nothing was done.';

const INSTALL_HELD_REFUSAL = 'launches-held-by-install-change';

const INSTALL_HELD_TEXT = 'The install version changed, so launches are held until the board is updated.';

/** A refusal as control contract 1 answers it: the refusal document's code, fields and sentence. */
function refusalBodyOf({ code, fields, sentence }: ForgeRefusalDocument): Record<string, unknown> {
  return {
    controlVersion: CONTROL_VERSION, refusal: code, fields, text: sentence
  };
}

const MALFORMED: RouteAnswer = { status: HTTP_STATUS.BAD_REQUEST, body: refusalBodyOf({ code: 'malformed-body', fields: {}, sentence: MALFORMED_BODY_TEXT }) };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const JOB_STOP_ALL_MODES: readonly ControlCommandOf<'job-stop-all'>['mode'][] = ['stop', 'wind-down'];

function resumeTargetIsWellTyped(target: unknown): boolean {
  if (target === 'all' || target === 'network-outage') return true;
  if (!isRecord(target)) return false;
  return typeof target['jobId'] === 'string' || typeof target['ticketReference'] === 'string';
}

/**
 * The fields checked before any hold, a field of the wrong type answering 400: the board kinds of control contract 1. A board command kind
 * of the contract is read whole by `BoardCommandReadingUtil` instead. A value of the right type that a rule refuses, such as a concurrency
 * limit above the ceiling, answers 409 from the applier.
 */
const FIELDS_CHECK_OF_KIND: Readonly<Record<string, (body: Record<string, unknown>) => boolean>> = {
  'concurrency-set':         (body) => typeof body['limit'] === 'number',
  'job-stop-all':            (body) => (JOB_STOP_ALL_MODES as readonly unknown[]).includes(body['mode']),
  'interrupted-work-resume': (body) => resumeTargetIsWellTyped(body['target']),
};

function fieldsAreWellTyped(kind: string, body: Record<string, unknown>): boolean {
  return !Object.hasOwn(FIELDS_CHECK_OF_KIND, kind) || FIELDS_CHECK_OF_KIND[kind]?.(body) === true;
}

/** A board command kind is read into the contract's command and mapped into forge's; `null` when it does not read. */
function controlCommandOfBody(kind: string, body: Record<string, unknown>): ControlCommand | null {
  if (!BoardCommandReadingUtil.isBoardCommandKind(kind)) return body as unknown as ControlCommand;
  const boardCommand = BoardCommandReadingUtil.boardCommandOf(body);
  return boardCommand === null ? null : BoardCommandMappingUtil.controlCommandOf(boardCommand);
}

function appliedAnswerOf(applied: { outcome: string; result?: unknown }): RouteAnswer {
  return { status: HTTP_STATUS.OK, body: { controlVersion: CONTROL_VERSION, ...applied } };
}

function refusedAnswerOf(refusal: OperationRefusal): RouteAnswer {
  return { status: HTTP_STATUS.CONFLICT, body: refusalBodyOf(RefusalDocumentUtil.refusalDocumentOf(refusal)) };
}

function machineAgentLimitAnswerOf(body: Record<string, unknown>, request: CommandRouteRequest): RouteAnswer {
  const { limit } = body;
  if (typeof limit !== 'number') return MALFORMED;
  const monitorFolder = request.context.platformPorts.dataFolders.monitorFolderOf(request.context.homeDirectory);
  try {
    const outcome = MachineAgentLimit.setIn(monitorFolder, limit, request.machineAgentCeiling ?? MachineAgentLimit.cpuCeiling());
    request.wake();
    return appliedAnswerOf({ outcome, result: { kind: 'machine-agent-limit-set', limit } });
  } catch (thrown) {
    if (thrown instanceof OperationRefusal) return refusedAnswerOf(thrown);
    throw thrown;
  }
}

async function flintBrainAnswerOf(kind: FlintBrainCommand['kind'], request: CommandRouteRequest, caller: CommandCaller): Promise<RouteAnswer> {
  const verdict = kind === 'flint-brain-start'
    ? await request.flintBrain.start(caller.carriesBridgeSession ? 'bridge' : 'api')
    : await request.flintBrain.stop();
  if (verdict.verdict === 'refused') {
    const { refusal, sentence } = verdict;
    return { status: HTTP_STATUS.CONFLICT, body: refusalBodyOf({ code: refusal.code, fields: RefusalDocumentUtil.jsonFieldsOf(refusal, 'code'), sentence }) };
  }
  return appliedAnswerOf({ outcome: 'done', result: { kind } });
}

function isFlintBrainKind(kind: string): kind is FlintBrainCommand['kind'] {
  return (FLINT_BRAIN_COMMAND_KINDS as readonly string[]).includes(kind);
}

function isRuntimeKind(kind: string): kind is RuntimeOverseerCommand['kind'] {
  return (RUNTIME_COMMAND_KINDS as readonly string[]).includes(kind);
}

/** `talos-restart` carries no field; a stop or a restart of the Overseer reads `now`, absent being `false`. `null` for a `now` of the wrong type. */
function runtimeCommandOf(kind: RuntimeOverseerCommand['kind'], body: Record<string, unknown>): RuntimeOverseerCommand | null {
  if (kind === 'talos-restart') return { kind };
  const { now } = body;
  if (now !== undefined && typeof now !== 'boolean') return null;
  return { kind, now: now === true };
}

/** `caller` is what the request itself proves, never what its body says. */
export async function answerControlCommand(body: unknown, request: CommandRouteRequest, caller: CommandCaller): Promise<RouteAnswer> {
  if (!isRecord(body) || typeof body['kind'] !== 'string' || !COMMAND_ROUTE_KINDS.includes(body['kind'])) return MALFORMED;
  const { kind } = body;
  if (isFlintBrainKind(kind)) return await flintBrainAnswerOf(kind, request, caller);
  if (isRuntimeKind(kind)) {
    const runtimeCommand = runtimeCommandOf(kind, body);
    if (runtimeCommand === null) return MALFORMED;
    return appliedAnswerOf({ outcome: await request.onRuntimeCommand(runtimeCommand), result: { kind } });
  }
  if (kind === 'machine-agent-limit-set') return machineAgentLimitAnswerOf(body, request);
  if (!fieldsAreWellTyped(kind, body)) return MALFORMED;
  const command = controlCommandOfBody(kind, body);
  if (command === null) return MALFORMED;
  if (request.launchesHeld()) {
    return {
      status: HTTP_STATUS.LOCKED,
      body:   refusalBodyOf({ code: INSTALL_HELD_REFUSAL, fields: {}, sentence: INSTALL_HELD_TEXT }),
    };
  }
  const { context, workspace, boardStore } = request;
  try {
    const at      = OptionValueUtil.atStampFrom(request.commandArguments, context.now());
    const written = await boardStore.commands.apply({ command, at, context: INSIDE_THE_OVERSEER_CONTROL_CONTEXT });
    OutputUtil.reportIgnoredTicketFiles(context, written.unreadableRecords.tickets);
    OutputUtil.reportIgnoredEpicFiles(context, written.unreadableRecords.epics);
    await registerWrittenTracker(context, workspace);
    request.wake();
    return appliedAnswerOf({ outcome: written.outcome, result: written.result });
  } catch (thrown) {
    if (thrown instanceof OperationRefusal) return refusedAnswerOf(thrown);
    // An applier reading a field the body lacks fails on its shape, before anything was written.
    if (thrown instanceof TypeError) return MALFORMED;
    throw thrown;
  }
}
