/**
 * `POST /api/commands` behind the token, control contract 1: a `ControlCommand` applied in a hold of its own, answered 200 `{controlVersion,
 * outcome, result}`, and 400 for a malformed body, 409 for a refused command or 423 while launches are held for an install change, each
 * `{controlVersion, refusal, text}`: the refusal's code and its API sentence, which names no command line. `overseer-stop` and
 * `overseer-restart` are runtime only and go to the Overseer itself, held or not; `machine-agent-limit-set` writes the machine's limit, in no hold.
 */
import { OperationRefusalWordingUtil }                              from '../../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import { CONTROL_COMMAND_KINDS, ControlService }                    from '../../../src/services/control/ControlService.ts';
import { MachineAgentLimit }                                        from '../../../src/services/overseer/MachineAgentLimit.ts';
import type { RouteAnswer }                                         from '../../../src/services/overseer/OverseerServer.ts';
import type { ControlCommand, ControlCommandOf, TrackerClearScope } from '../../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal, reasonCodeOf }                           from '../../../src/shared/OperationRefusal.ts';
import { SERVED_CONTRACT_VERSIONS }                                 from '../../../src/shared/constants/OverseerApiContracts.ts';
import type { CommandContext }                                      from '../../CommandContext.ts';
import { COMMAND_CONTROL_CONTEXT }                                  from '../../CommandControlContext.ts';
import { openTrackerForWriting }                                    from '../../OpenTrackerForWriting.ts';
import type { ArgumentParser }                                      from '../../arguments/ArgumentParser.ts';

export interface RuntimeOverseerCommand {
  kind: 'overseer-stop' | 'overseer-restart';
  now:  boolean;
}

export interface CommandRouteRequest {
  commandArguments:     ArgumentParser;
  context:              CommandContext;
  launchesHeld:         () => boolean;
  onRuntimeCommand:     (command: RuntimeOverseerCommand) => void;
  /** After a command was applied, so the pass acts on it at once. */
  wake:                 () => void;
  /** The CPU count the machine agent limit is capped at; the runtime's when not given. */
  machineAgentCeiling?: number;
}

const HTTP_STATUS = {
  OK:          200,
  BAD_REQUEST: 400,
  CONFLICT:    409,
  LOCKED:      423,
} as const;

const RUNTIME_COMMAND_KINDS: readonly string[] = ['overseer-stop', 'overseer-restart'];

const CONTROL_VERSION = SERVED_CONTRACT_VERSIONS.control;

export const MALFORMED_BODY_TEXT = 'The command body is not a control command this Overseer knows, or a field of it has the wrong type, so nothing was done.';

const INSTALL_HELD_REFUSAL = 'launches-held-by-install-change';

const INSTALL_HELD_TEXT = 'The install version changed, so launches are held until the board is updated.';

const MALFORMED: RouteAnswer = { status: HTTP_STATUS.BAD_REQUEST, body: { controlVersion: CONTROL_VERSION, refusal: 'malformed-body', text: MALFORMED_BODY_TEXT } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const JOB_STOP_ALL_MODES: readonly ControlCommandOf<'job-stop-all'>['mode'][] = ['stop', 'wind-down'];

const TRACKER_CLEAR_SCOPES: readonly TrackerClearScope[] = ['tasks-and-log', 'everything'];

function chartRangeIsWellTyped(range: unknown): boolean {
  if (!isRecord(range)) return false;
  if (range['kind'] === 'automatic') return true;
  return range['kind'] === 'window' && typeof range['from'] === 'string' && typeof range['to'] === 'string'
    && (range['tickMinutes'] === null || typeof range['tickMinutes'] === 'number');
}

function isAbsentOrText(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

/**
 * The fields checked before any hold, a field of the wrong type answering 400: the board kinds of control contract 1, and the kinds only
 * User's own surfaces send, where a wrong value would still act, such as a clear of an unknown scope. A value of the right type that a rule
 * refuses, such as a concurrency limit above the ceiling, answers 409 from the applier.
 */
const FIELDS_CHECK_OF_KIND: Readonly<Record<string, (body: Record<string, unknown>) => boolean>> = {
  'concurrency-set':        (body) => typeof body['limit'] === 'number',
  'job-stop-all':           (body) => (JOB_STOP_ALL_MODES as readonly unknown[]).includes(body['mode']),
  'chart-range-set':        (body) => chartRangeIsWellTyped(body['range']),
  'tracker-clear':          (body) => (TRACKER_CLEAR_SCOPES as readonly unknown[]).includes(body['scope']),
  'ticket-deliver-by-hand': (body) => typeof body['ticketReference'] === 'string' && isAbsentOrText(body['branch']) && isAbsentOrText(body['commit']),
};

function fieldsAreWellTyped(kind: string, body: Record<string, unknown>): boolean {
  return !Object.hasOwn(FIELDS_CHECK_OF_KIND, kind) || FIELDS_CHECK_OF_KIND[kind]?.(body) === true;
}

function appliedAnswerOf(applied: { outcome: string; result?: unknown }): RouteAnswer {
  return { status: HTTP_STATUS.OK, body: { controlVersion: CONTROL_VERSION, ...applied } };
}

function refusedAnswerOf(refusal: OperationRefusal): RouteAnswer {
  const refusalCode = refusal.detail === null ? 'refused' : reasonCodeOf(refusal.detail);
  return { status: HTTP_STATUS.CONFLICT, body: { controlVersion: CONTROL_VERSION, refusal: refusalCode, text: OperationRefusalWordingUtil.apiMessageOf(refusal) } };
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

export async function answerControlCommand(body: unknown, request: CommandRouteRequest): Promise<RouteAnswer> {
  if (!isRecord(body) || typeof body['kind'] !== 'string' || !(CONTROL_COMMAND_KINDS as readonly string[]).includes(body['kind'])) return MALFORMED;
  const { kind } = body;
  if (RUNTIME_COMMAND_KINDS.includes(kind)) {
    const { now } = body;
    if (now !== undefined && typeof now !== 'boolean') return MALFORMED;
    request.onRuntimeCommand({ kind: kind as RuntimeOverseerCommand['kind'], now: now === true });
    return appliedAnswerOf({ outcome: 'done', result: { kind } });
  }
  if (kind === 'machine-agent-limit-set') return machineAgentLimitAnswerOf(body, request);
  if (!fieldsAreWellTyped(kind, body)) return MALFORMED;
  if (request.launchesHeld()) {
    return {
      status: HTTP_STATUS.LOCKED,
      body:   { controlVersion: CONTROL_VERSION, refusal: INSTALL_HELD_REFUSAL, text: INSTALL_HELD_TEXT },
    };
  }
  try {
    const command = body as unknown as ControlCommand;
    const applied = await openTrackerForWriting(request.commandArguments, request.context, (change) => ControlService.apply(command, change, COMMAND_CONTROL_CONTEXT));
    request.wake();
    return appliedAnswerOf(applied);
  } catch (thrown) {
    if (thrown instanceof OperationRefusal) return refusedAnswerOf(thrown);
    // An applier reading a field the body lacks fails on its shape, before anything was written.
    if (thrown instanceof TypeError) return MALFORMED;
    throw thrown;
  }
}
