/** `pipeline setup|billing|continue|start-over|answer|constitution|update|edit|undo|discard`: User's verbs of the pipeline setup record. */
import type { CommandHandler }      from '../CommandHandler.ts';
import { refuseUsage }              from '../RecordedIncidentMove.ts';
import { answerPipelineQuestion }   from './PipelineAnswer.ts';
import { setPipelineBilling }       from './PipelineBilling.ts';
import { editPipelineConstitution } from './PipelineConstitution.ts';
import { continuePipelineStep }     from './PipelineContinue.ts';
import { discardPipelineDraft }     from './PipelineDiscard.ts';
import { editPipelineDraft }        from './PipelineEdit.ts';
import { startPipelineSetup }       from './PipelineSetupStart.ts';
import { startPipelineSetupOver }   from './PipelineStartOver.ts';
import { undoPipelineDraftEdit }    from './PipelineUndo.ts';
import { startPipelineUpdate }      from './PipelineUpdate.ts';
import { PIPELINE_USAGE }           from './constants/PipelineUsage.ts';

const SUBCOMMANDS: Readonly<Record<keyof typeof PIPELINE_USAGE, CommandHandler>> = {
  'setup':        startPipelineSetup,
  'billing':      setPipelineBilling,
  'continue':     continuePipelineStep,
  'start-over':   startPipelineSetupOver,
  'answer':       answerPipelineQuestion,
  'constitution': editPipelineConstitution,
  'update':       startPipelineUpdate,
  'edit':         editPipelineDraft,
  'undo':         undoPipelineDraftEdit,
  'discard':      discardPipelineDraft,
};

export const PIPELINE_SUBCOMMAND_NAMES = Object.freeze(Object.keys(SUBCOMMANDS)) as readonly (keyof typeof PIPELINE_USAGE)[];

export const pipelineCommand: CommandHandler = async (commandArguments, context) => {
  const subcommand = commandArguments.positionals()[0] ?? '';
  if (!Object.hasOwn(SUBCOMMANDS, subcommand)) {
    refuseUsage(`Write pipeline ${PIPELINE_SUBCOMMAND_NAMES.join(', pipeline ')}.`, Object.values(PIPELINE_USAGE).join('  |  '));
  }
  await SUBCOMMANDS[subcommand as keyof typeof PIPELINE_USAGE](commandArguments, context);
};
