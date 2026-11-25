/**
 * `gate retry <J> [--incident <I>]` settles the job's `gate-cannot-run` or `sandbox-unavailable` incident, after which the gate runs again;
 * `gate prepare|add|order|none|remove|approval|assistant|reach|agent|tools|look-again|list` write and read the board's gate pipeline, its
 * agent and its tools.
 */
import { PRODUCT_NAMES }       from '../../src/shared/constants/ProductNames.ts';
import type { CommandHandler } from '../CommandHandler.ts';
import {
  incidentOf,
  jobIdOf,
  recordIncidentMove,
  refuseUsage
} from '../RecordedIncidentMove.ts';
import {
  GATE_PIPELINE_USAGE,
  addGate,
  listPipeline,
  orderPhaseGates,
  prepareStep,
  removeGate,
  lookAgain,
  setAgent,
  setApproval,
  setAssistant,
  setNoGates,
  setReach,
  setTools
} from './GatePipelineVerbs.ts';

const RETRY_USAGE = `${PRODUCT_NAMES.PROGRAM} gate retry <J> [--incident <I>] [--json]`;

const USAGE = [RETRY_USAGE, ...Object.values(GATE_PIPELINE_USAGE)].join('  |  ');

export const GATE_SUBCOMMAND_NAMES = [
  'retry', 'prepare', 'add', 'order', 'none', 'remove', 'list', 'approval', 'assistant', 'reach', 'agent', 'tools', 'look-again'
] as const;

export const gateCommand: CommandHandler = async (commandArguments, context) => {
  switch (commandArguments.positionals()[0]) {
    case 'retry':
      commandArguments.rejectUnknownOptions(['json', 'incident'], RETRY_USAGE);
      commandArguments.rejectExtraPositionals(2, RETRY_USAGE);
      await recordIncidentMove(commandArguments, context, {
        kind:  'gate-retry',
        jobId: jobIdOf(commandArguments.positionals()[1], RETRY_USAGE),
        ...incidentOf(commandArguments, RETRY_USAGE),
      });
      return;
    case 'prepare':
      await prepareStep(commandArguments, context);
      return;
    case 'add':
      await addGate(commandArguments, context);
      return;
    case 'order':
      await orderPhaseGates(commandArguments, context);
      return;
    case 'none':
      await setNoGates(commandArguments, context);
      return;
    case 'remove':
      await removeGate(commandArguments, context);
      return;
    case 'list':
      listPipeline(commandArguments, context);
      return;
    case 'approval':
      await setApproval(commandArguments, context);
      return;
    case 'assistant':
      await setAssistant(commandArguments, context);
      return;
    case 'reach':
      await setReach(commandArguments, context);
      return;
    case 'agent':
      await setAgent(commandArguments, context);
      return;
    case 'tools':
      await setTools(commandArguments, context);
      return;
    case 'look-again':
      await lookAgain(commandArguments, context);
      return;
    default:
      refuseUsage(`Write gate ${GATE_SUBCOMMAND_NAMES.join(', gate ')}.`, USAGE);
  }
};
