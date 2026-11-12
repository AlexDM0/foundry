/**
 * `POST /api/commands` behind the token, control contract 1: a `ControlCommand` applied in a hold of its own, answered 200 `{controlVersion,
 * outcome, result}`, and 400 for a malformed body, 409 for a refused command or 423 while launches are held for an install change, each
 * `{controlVersion, refusal, text}`: the refusal's code and the sentence every printed refusal is worded with. `overseer-stop` and
 * `overseer-restart` are runtime only and go to the Overseer itself, held or not; `machine-agent-limit-set` writes the machine's limit, in no hold.
 */
import { OperationRefusalWordingUtil }           from '../../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import { CONTROL_COMMAND_KINDS, ControlService } from '../../../src/services/control/ControlService.ts';
import { MachineAgentLimit }                     from '../../../src/services/overseer/MachineAgentLimit.ts';
import type { RouteAnswer }                      from '../../../src/services/overseer/OverseerServer.ts';
import type { ControlCommand }                   from '../../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal, reasonCodeOf }        from '../../../src/shared/OperationRefusal.ts';
import { SERVED_CONTRACT_VERSIONS }              from '../../../src/shared/constants/OverseerApiContracts.ts';
import { PRODUCT_NAMES }                         from '../../../src/shared/constants/ProductNames.ts';
import type { CommandContext }                   from '../../CommandContext.ts';
import { openTrackerForWriting }                 from '../../OpenTrackerForWriting.ts';
import type { ArgumentParser }                   from '../../arguments/ArgumentParser.ts';

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

const MALFORMED: RouteAnswer = { status: HTTP_STATUS.BAD_REQUEST, body: { controlVersion: CONTROL_VERSION, refusal: 'malformed-body', text: MALFORMED_BODY_TEXT } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function appliedAnswerOf(applied: { outcome: string; result?: unknown }): RouteAnswer {
  return { status: HTTP_STATUS.OK, body: { controlVersion: CONTROL_VERSION, ...applied } };
}

function refusedAnswerOf(refusal: OperationRefusal): RouteAnswer {
  const refusalCode = refusal.detail === null ? 'refused' : reasonCodeOf(refusal.detail);
  return { status: HTTP_STATUS.CONFLICT, body: { controlVersion: CONTROL_VERSION, refusal: refusalCode, text: OperationRefusalWordingUtil.messageOf(refusal) } };
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
  if (request.launchesHeld()) {
    return {
      status: HTTP_STATUS.LOCKED,
      body:   { controlVersion: CONTROL_VERSION, refusal: INSTALL_HELD_REFUSAL, text: `The install version changed: run \`${PRODUCT_NAMES.PROGRAM} update\`.` },
    };
  }
  try {
    const applied = await openTrackerForWriting(request.commandArguments, request.context, (change) => ControlService.apply(body as unknown as ControlCommand, change));
    request.wake();
    return appliedAnswerOf(applied);
  } catch (thrown) {
    if (thrown instanceof OperationRefusal) return refusedAnswerOf(thrown);
    // An applier reading a field the body lacks fails on its shape, before anything was written.
    if (thrown instanceof TypeError) return MALFORMED;
    throw thrown;
  }
}
