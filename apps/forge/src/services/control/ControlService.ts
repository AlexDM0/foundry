/**
 * Applies one control command to the Board a `writeTracker` hold carries: the one path a CLI verb, a relayed request and an API command
 * share. It records only, never spawning, signalling or reconciling; a refusal leaves as an `OperationRefusal` with a wordless detail.
 */
import type { ControlCommand, ControlCommandKind, ControlCommandOf } from '../../shared/@types/ControlCommand.ts';
import type { ControlContext }                                       from '../../shared/@types/ControlContext.ts';
import type { BoardTransaction }                                     from '../tracker/BoardTransaction.ts';
import { AGENT_CONTROLS }                                            from './AgentControls.ts';
import { AIRLOCK_CONTROLS }                                          from './AirlockControls.ts';
import { BOARD_LIFETIME_CONTROLS }                                   from './BoardLifetimeControls.ts';
import { BY_HAND_BOARD_CONTROLS }                                    from './ByHandBoardControls.ts';
import { DECISION_CONTROLS }                                         from './DecisionControls.ts';
import { DOCUMENT_AGENT_CONTROLS }                                   from './DocumentAgentControls.ts';
import { EPIC_BY_HAND_CONTROLS }                                     from './EpicByHandControls.ts';
import { FILING_CONTROLS }                                           from './FilingControls.ts';
import { GATE_PROFILE_CONTROLS }                                     from './GateProfileControls.ts';
import { HEPHAESTUS_CONTROLS }                                       from './HephaestusControls.ts';
import { INCIDENT_CONTROLS }                                         from './IncidentControls.ts';
import { JOB_CONTROLS }                                              from './JobControls.ts';
import { PIPELINE_AGENT_CONTROLS }                                   from './PipelineAgentControls.ts';
import { PIPELINE_SETUP_CONTROLS }                                   from './PipelineSetupControls.ts';
import { REPAIR_CONTROLS }                                           from './RepairControls.ts';
import { RESUME_CONTROLS }                                           from './ResumeControls.ts';
import { SETTING_CONTROLS }                                          from './SettingControls.ts';
import { TASK_CONTROLS }                                             from './TaskControls.ts';
import { TICKET_BY_HAND_CONTROLS }                                   from './TicketByHandControls.ts';
import { TICKET_CONTROLS }                                           from './TicketControls.ts';
import { TICKET_DOCUMENT_CONTROLS }                                  from './TicketDocumentControls.ts';

const CONTROL_APPLIERS = {
  ...TICKET_CONTROLS,
  ...FILING_CONTROLS,
  ...INCIDENT_CONTROLS,
  ...DECISION_CONTROLS,
  ...JOB_CONTROLS,
  ...REPAIR_CONTROLS,
  ...HEPHAESTUS_CONTROLS,
  ...RESUME_CONTROLS,
  ...SETTING_CONTROLS,
  ...AGENT_CONTROLS,
  ...AIRLOCK_CONTROLS,
  ...PIPELINE_SETUP_CONTROLS,
  ...GATE_PROFILE_CONTROLS,
  ...PIPELINE_AGENT_CONTROLS,
  ...BOARD_LIFETIME_CONTROLS,
  ...TASK_CONTROLS,
  ...TICKET_DOCUMENT_CONTROLS,
  ...DOCUMENT_AGENT_CONTROLS,
  ...BY_HAND_BOARD_CONTROLS,
  ...TICKET_BY_HAND_CONTROLS,
  ...EPIC_BY_HAND_CONTROLS,
} as const satisfies {
  [Kind in ControlCommandKind]: (command: ControlCommandOf<Kind>, change: BoardTransaction, context: ControlContext) => unknown
};

type ControlAppliers = typeof CONTROL_APPLIERS;

export type ControlResultOf<Kind extends ControlCommandKind> = ReturnType<ControlAppliers[Kind]>;

export interface ControlApplied<Result> {
  /** `nothing-to-do` when the Board found the change already made, as an edit to the same text. */
  outcome: 'done' | 'nothing-to-do';
  result:  Result;
}

/** Every kind the service applies, in the order of the contract's groups. */
export const CONTROL_COMMAND_KINDS = Object.freeze(Object.keys(CONTROL_APPLIERS)) as readonly ControlCommandKind[];

function outcomeOf(result: unknown): ControlApplied<unknown>['outcome'] {
  const reportsNoChange = typeof result === 'object' && result !== null && 'changed' in result && result.changed === false;
  return reportsNoChange ? 'nothing-to-do' : 'done';
}

/** `context` words what a move sends to a session, since only `cli/` holds words. */
function apply<Command extends ControlCommand>(command: Command, change: BoardTransaction, context: ControlContext): ControlApplied<ControlResultOf<Command['kind']>> {
  // The table pairs each kind with its applier, a correlation TypeScript cannot follow through an indexed union.
  const applier = CONTROL_APPLIERS[command.kind] as unknown as (command: Command, change: BoardTransaction, context: ControlContext) => ControlResultOf<Command['kind']>;
  const result  = applier(command, change, context);
  return { outcome: outcomeOf(result), result };
}

export const ControlService = Object.freeze({ apply });
