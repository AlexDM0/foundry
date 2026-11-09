/**
 * `gate retry <J> [--incident <I>]` settles the job's `gate-cannot-run` or `sandbox-unavailable` incident, after which the gate runs again;
 * `gate prepare|add|none|remove|approval|list` write and read the board's gate pipeline.
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
  prepareStep,
  removeGate,
  setApproval,
  setNoGates
} from './GatePipelineVerbs.ts';

const RETRY_USAGE = `${PRODUCT_NAMES.PROGRAM} gate retry <J> [--incident <I>] [--json]`;

const USAGE = [RETRY_USAGE, ...Object.values(GATE_PIPELINE_USAGE)].join('  |  ');

export const GATE_SUBCOMMAND_NAMES = ['retry', 'prepare', 'add', 'none', 'remove', 'list', 'approval'] as const;

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
    default:
      refuseUsage(`Write gate ${GATE_SUBCOMMAND_NAMES.join(', gate ')}.`, USAGE);
  }
};
