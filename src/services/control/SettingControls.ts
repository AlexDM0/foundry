/** The board settings kinds of the control contract: the concurrency limit and the gate pipeline the `gate` verbs write. */
import { CONCURRENCY_LIMIT_CEILING_AGENTS }   from '../../lib/tracker-model/constants/ConcurrencyLimits.ts';
import { BoardSettingsUtil }                  from '../../lib/tracker-model/utils/BoardSettingsUtil.ts';
import type { ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                   from '../../shared/OperationRefusal.ts';
import type { TrackerChange }                 from '../tracker/TrackerPipeline.ts';

/** A malformed or older `pipeline.json` is never written over: a hand edit gone wrong is repaired, not lost, and an older one set up again. */
export function requireReadablePipeline(change: TrackerChange): void {
  const { unreadablePipeline } = change;
  const filePath = change.workspace.pipelineFilePath;
  if (unreadablePipeline === null) return;
  if (unreadablePipeline.verdict === 'older') throw new OperationRefusal('refused', { kind: 'older-pipeline', filePath });
  throw new OperationRefusal('refused', { kind: 'malformed-pipeline', filePath, reason: unreadablePipeline.reason });
}

/** The `concurrency` verb checks its argument itself; a command posted to the API reaches the board only through this check. */
function setConcurrencyLimit(command: CommandOf<'concurrency-set'>, change: TrackerChange): ReturnType<TrackerChange['board']['setConcurrencyLimit']> {
  const { limit } = command;
  if (!BoardSettingsUtil.concurrencyLimitIsWellFormed(limit) || limit > CONCURRENCY_LIMIT_CEILING_AGENTS) {
    throw new OperationRefusal('refused', { kind: 'concurrency-limit-out-of-range', limit, ceiling: CONCURRENCY_LIMIT_CEILING_AGENTS });
  }
  return change.board.setConcurrencyLimit(limit, change.at);
}

function inReadablePipeline<Result>(change: TrackerChange, apply: () => Result): Result {
  requireReadablePipeline(change);
  return apply();
}

export const SETTING_CONTROLS = {
  'concurrency-set':           setConcurrencyLimit,
  'pipeline-prepare-step-set': (command: CommandOf<'pipeline-prepare-step-set'>, change: TrackerChange) => inReadablePipeline(
    change,
    () => change.board.setPrepareStep(command.step, change.at),
  ),
  'pipeline-gate-add': (command: CommandOf<'pipeline-gate-add'>, change: TrackerChange) => inReadablePipeline(
    change,
    () => change.board.addGate(command.gate, change.at, command.phases ?? null),
  ),
  'pipeline-gate-order': (command: CommandOf<'pipeline-gate-order'>, change: TrackerChange) => inReadablePipeline(
    change,
    () => change.board.orderPhaseGates(command.phase, command.names, change.at),
  ),
  'pipeline-gates-none':  (_command: CommandOf<'pipeline-gates-none'>, change: TrackerChange) => inReadablePipeline(change, () => change.board.setNoGates(change.at)),
  'pipeline-gate-remove': (command: CommandOf<'pipeline-gate-remove'>, change: TrackerChange) => inReadablePipeline(
    change,
    () => change.board.removeGate(command.name, change.at),
  ),
  'pipeline-approval-set': (command: CommandOf<'pipeline-approval-set'>, change: TrackerChange) => inReadablePipeline(
    change,
    () => change.board.setApproval(command.approval, command.on, change.at),
  ),
} as const;
