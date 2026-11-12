/**
 * `pipeline setup|billing|continue|start-over|resume|answer|constitution|update|edit|undo|discard`: User's verbs of the pipeline setup record;
 * `pipeline finding|ask|draft-constitution|propose|ready`: the pipeline agent's, relayed under its job.
 */
import type { CommandHandler }                       from '../CommandHandler.ts';
import { refuseUsage }                               from '../RecordedIncidentMove.ts';
import { answerPipelineQuestion }                    from './PipelineAnswer.ts';
import { askPipelineQuestion }                       from './PipelineAsk.ts';
import { setPipelineBilling }                        from './PipelineBilling.ts';
import { editPipelineConstitution }                  from './PipelineConstitution.ts';
import { continuePipelineStep }                      from './PipelineContinue.ts';
import { discardPipelineDraft }                      from './PipelineDiscard.ts';
import { draftPipelineConstitution }                 from './PipelineDraftConstitution.ts';
import { editPipelineDraft }                         from './PipelineEdit.ts';
import { recordPipelineFinding }                     from './PipelineFinding.ts';
import { proposePipelineEdits }                      from './PipelinePropose.ts';
import { suggestPipelineStepReady }                  from './PipelineReady.ts';
import { resumePipelineSetup }                       from './PipelineResume.ts';
import { startPipelineSetup }                        from './PipelineSetupStart.ts';
import { startPipelineSetupOver }                    from './PipelineStartOver.ts';
import { undoPipelineDraftEdit }                     from './PipelineUndo.ts';
import { startPipelineUpdate }                       from './PipelineUpdate.ts';
import { type PIPELINE_AGENT_USAGE, PIPELINE_USAGE } from './constants/PipelineUsage.ts';

type PipelineSubcommand = keyof typeof PIPELINE_USAGE | keyof typeof PIPELINE_AGENT_USAGE;

const SUBCOMMANDS: Readonly<Record<PipelineSubcommand, CommandHandler>> = {
  'setup':              startPipelineSetup,
  'billing':            setPipelineBilling,
  'continue':           continuePipelineStep,
  'start-over':         startPipelineSetupOver,
  'resume':             resumePipelineSetup,
  'answer':             answerPipelineQuestion,
  'constitution':       editPipelineConstitution,
  'update':             startPipelineUpdate,
  'edit':               editPipelineDraft,
  'undo':               undoPipelineDraftEdit,
  'discard':            discardPipelineDraft,
  'finding':            recordPipelineFinding,
  'ask':                askPipelineQuestion,
  'draft-constitution': draftPipelineConstitution,
  'propose':            proposePipelineEdits,
  'ready':              suggestPipelineStepReady,
};

export const PIPELINE_SUBCOMMAND_NAMES = Object.freeze(Object.keys(SUBCOMMANDS)) as readonly PipelineSubcommand[];

export const pipelineCommand: CommandHandler = async (commandArguments, context) => {
  const subcommand = commandArguments.positionals()[0] ?? '';
  if (!Object.hasOwn(SUBCOMMANDS, subcommand)) {
    refuseUsage(`Write pipeline ${PIPELINE_SUBCOMMAND_NAMES.join(', pipeline ')}.`, Object.values(PIPELINE_USAGE).join('  |  '));
  }
  await SUBCOMMANDS[subcommand as PipelineSubcommand](commandArguments, context);
};
