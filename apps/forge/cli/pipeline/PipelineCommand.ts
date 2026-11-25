/**
 * `pipeline setup|billing|agent|continue|start-over|resume|answer|constitution|update|edit|undo|discard|check|apply|apply-cancel`: User's verbs of
 * the pipeline setup record; `pipeline profile|profile-stop`: User's gate profiles; `pipeline finding|ask|draft-constitution|propose|ready`:
 * the pipeline agent's, relayed under its job.
 */
import type { CommandHandler }                       from '../CommandHandler.ts';
import { refuseUsage }                               from '../RecordedIncidentMove.ts';
import { setPipelineAgent }                          from './PipelineAgent.ts';
import { answerPipelineQuestion }                    from './PipelineAnswer.ts';
import { applyPipelineSetup }                        from './PipelineApply.ts';
import { cancelPipelineApply }                       from './PipelineApplyCancel.ts';
import { askPipelineQuestion }                       from './PipelineAsk.ts';
import { setPipelineBilling }                        from './PipelineBilling.ts';
import { checkPipelineDraft }                        from './PipelineCheck.ts';
import { editPipelineConstitution }                  from './PipelineConstitution.ts';
import { continuePipelineStep }                      from './PipelineContinue.ts';
import { discardPipelineDraft }                      from './PipelineDiscard.ts';
import { draftPipelineConstitution }                 from './PipelineDraftConstitution.ts';
import { editPipelineDraft }                         from './PipelineEdit.ts';
import { recordPipelineFinding }                     from './PipelineFinding.ts';
import { profilePipelineGate }                       from './PipelineProfile.ts';
import { stopPipelineGateProfile }                   from './PipelineProfileStop.ts';
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
  'agent':              setPipelineAgent,
  'continue':           continuePipelineStep,
  'start-over':         startPipelineSetupOver,
  'resume':             resumePipelineSetup,
  'answer':             answerPipelineQuestion,
  'constitution':       editPipelineConstitution,
  'update':             startPipelineUpdate,
  'edit':               editPipelineDraft,
  'undo':               undoPipelineDraftEdit,
  'discard':            discardPipelineDraft,
  'check':              checkPipelineDraft,
  'profile':            profilePipelineGate,
  'profile-stop':       stopPipelineGateProfile,
  'apply':              applyPipelineSetup,
  'apply-cancel':       cancelPipelineApply,
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
