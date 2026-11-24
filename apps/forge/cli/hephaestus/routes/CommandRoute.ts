/**
 * `POST /api/commands` behind the token, the control contract: a `ControlCommand` applied in a hold of its own, answered 200
 * `{controlVersion, outcome, result}`, and 400 for a malformed body, 409 for a refused command or 423 while launches are held for an
 * install change, each `{controlVersion, refusal, fields, text}`: the refusal's code, its facts and the sentence the command line prints.
 * `hephaestus-stop`, `hephaestus-restart` and `talos-restart` are runtime only and go to Hephaestus itself, held or not;
 * `machine-agent-limit-set` writes the machine's limit, in no hold.
 */
import type { ForgeRefusalDocument } from 'forge-contracts/ForgeRefusalDocument';

import { BoardCommandMappingUtil }               from '../../../src/adapters/board-commands/utils/BoardCommandMappingUtil.ts';
import { BoardCommandReadingUtil }               from '../../../src/adapters/board-commands/utils/BoardCommandReadingUtil.ts';
import { RefusalDocumentUtil }                   from '../../../src/adapters/utils/RefusalDocumentUtil.ts';
import { CONTROL_COMMAND_KINDS }                 from '../../../src/services/control/ControlService.ts';
import type { RouteAnswer }                      from '../../../src/services/hephaestus/HephaestusServer.ts';
import { MachineAgentLimit }                     from '../../../src/services/hephaestus/MachineAgentLimit.ts';
import type { BoardStore }                       from '../../../src/services/store/BoardStore.ts';
import type { Workspace }                        from '../../../src/services/tracker/Workspace.ts';
import type { ControlCommand, ControlCommandOf } from '../../../src/shared/@types/ControlCommand.ts';
import type { ControlContext }                   from '../../../src/shared/@types/ControlContext.ts';
import type { EffectReadingSource }              from '../../../src/shared/@types/EffectReading.ts';
import { OperationRefusal }                      from '../../../src/shared/OperationRefusal.ts';
import { SERVED_CONTRACT_VERSIONS }              from '../../../src/shared/constants/HephaestusApiContracts.ts';
import type { CommandContext }                   from '../../CommandContext.ts';
import { INSIDE_HEPHAESTUS_CONTROL_CONTEXT }     from '../../CommandControlContext.ts';
import { registerWrittenTracker }                from '../../RegisterWrittenTracker.ts';
import type { ArgumentParser }                   from '../../arguments/ArgumentParser.ts';
import { BY_HAND_COMMAND_KINDS }                 from '../../constants/JobVerbs.ts';
import { OptionValueUtil }                       from '../../utils/OptionValueUtil.ts';
import { OutputUtil }                            from '../../utils/OutputUtil.ts';

export type RuntimeHephaestusCommand =
  | { kind: 'hephaestus-stop' | 'hephaestus-restart'; now: boolean }
  | { kind: 'talos-restart' };

/** `nothing-to-do` when the live Hephaestus had nothing to act on, as a `talos-restart` with no Talos that takes the quit. */
export type RuntimeCommandOutcome = 'done' | 'nothing-to-do';

export interface CommandRouteRequest {
  commandArguments:     ArgumentParser;
  context:              CommandContext;
  workspace:            Workspace;
  /** Hephaestus's one store; a command goes through its command face, never inside a transaction of the pass. */
  boardStore:           BoardStore;
  launchesHeld:         () => boolean;
  onRuntimeCommand:     (command: RuntimeHephaestusCommand) => Promise<RuntimeCommandOutcome>;
  /** After a command was applied, so the pass acts on it at once. */
  wake:                 () => void;
  /** The CPU count the machine agent limit is capped at; the runtime's when not given. */
  machineAgentCeiling?: number;
  /** The serving pass's effect readings, `null` before it runs; absent, an effect read is refused and a ticket's documents carry none. */
  effectReadings?:      () => EffectReadingSource | null;
}

const HTTP_STATUS = {
  OK:          200,
  BAD_REQUEST: 400,
  CONFLICT:    409,
  LOCKED:      423,
} as const;

function controlContextOf(request: CommandRouteRequest): ControlContext {
  const effectReadings = request.effectReadings?.() ?? null;
  return effectReadings === null ? INSIDE_HEPHAESTUS_CONTROL_CONTEXT : { ...INSIDE_HEPHAESTUS_CONTROL_CONTEXT, effectReadings };
}

const RUNTIME_COMMAND_KINDS: readonly RuntimeHephaestusCommand['kind'][] = ['hephaestus-stop', 'hephaestus-restart', 'talos-restart'];

/** Every kind the route takes: the control service's but the by-hand kinds. */
export const COMMAND_ROUTE_KINDS: readonly string[] = Object.freeze(
  CONTROL_COMMAND_KINDS.filter((kind) => !(BY_HAND_COMMAND_KINDS as readonly string[]).includes(kind))
);

const CONTROL_VERSION = SERVED_CONTRACT_VERSIONS.control;

export const MALFORMED_BODY_TEXT = 'The command body is not a control command this Hephaestus knows, or a field of it has the wrong type, so nothing was done.';

const INSTALL_HELD_REFUSAL = 'launches-held-by-install-change';

const INSTALL_HELD_TEXT = 'The install version changed, so launches are held until the board is updated.';

/** A refusal as the control contract answers it: the refusal document's code, fields and sentence. */
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
 * The fields checked before any hold, a field of the wrong type answering 400: the board kinds of the control contract. A board command kind
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

function isRuntimeKind(kind: string): kind is RuntimeHephaestusCommand['kind'] {
  return (RUNTIME_COMMAND_KINDS as readonly string[]).includes(kind);
}

/** `talos-restart` carries no field; a stop or a restart of Hephaestus reads `now`, absent being `false`. `null` for a `now` of the wrong type. */
function runtimeCommandOf(kind: RuntimeHephaestusCommand['kind'], body: Record<string, unknown>): RuntimeHephaestusCommand | null {
  if (kind === 'talos-restart') return { kind };
  const { now } = body;
  if (now !== undefined && typeof now !== 'boolean') return null;
  return { kind, now: now === true };
}

export async function answerControlCommand(body: unknown, request: CommandRouteRequest): Promise<RouteAnswer> {
  if (!isRecord(body) || typeof body['kind'] !== 'string' || !COMMAND_ROUTE_KINDS.includes(body['kind'])) return MALFORMED;
  const { kind } = body;
  if (isRuntimeKind(kind)) {
    const runtimeCommand = runtimeCommandOf(kind, body);
    if (runtimeCommand === null) return MALFORMED;
    try {
      return appliedAnswerOf({ outcome: await request.onRuntimeCommand(runtimeCommand), result: { kind } });
    } catch (thrown) {
      // A restart whose preflight failed is refused, with the serving Hephaestus still driving.
      if (thrown instanceof OperationRefusal) return refusedAnswerOf(thrown);
      throw thrown;
    }
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
    const written = await boardStore.commands.apply({ command, at, context: controlContextOf(request) });
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
