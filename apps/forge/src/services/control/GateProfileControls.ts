/**
 * User's gate profile kinds: a start queues one gate in one phase from the open setup's draft or the stored pipeline, on a forge over entities the
 * gate of the entity it names; a stop ends a queued run or asks Hephaestus to end a running one. Only User's press sends them, and each field of the
 * untrusted body is checked before the Board is touched.
 */
import type { GateProfileChanged }                    from '../../domain/tracker-model/@types/BoardChanges.ts';
import { GATE_PHASES, type GatePhase }                from '../../domain/tracker-model/@types/GatePhase.ts';
import type { ProfiledGate }                          from '../../domain/tracker-model/@types/GateProfile.ts';
import type { EntityKey, PipelineGate, PipelineStep } from '../../domain/tracker-model/@types/Pipeline.ts';
import type { ControlCommandOf as CommandOf }         from '../../shared/@types/ControlCommand.ts';
import { EntityFoldersUtil }                          from '../../shared/utils/EntityFoldersUtil.ts';
import type { BoardTransaction }                      from '../tracker/BoardTransaction.ts';
import { refuseMalformedSetupCommand, textFieldOf }   from './PipelineSetupControls.ts';
import { requireReadablePipeline }                    from './SettingControls.ts';

type GateProfileStartCommand = CommandOf<'gate-profile-start'>;

function phaseFieldOf(command: GateProfileStartCommand): GatePhase {
  const phase = GATE_PHASES.find((candidate) => candidate === command.phase);
  if (phase === undefined) refuseMalformedSetupCommand(command.kind, 'phase');
  return phase;
}

function setupIdFieldOf(command: GateProfileStartCommand): string | null {
  return Object.hasOwn(command, 'setupId') && command.setupId === null ? null : textFieldOf(command, 'setupId');
}

function entityFieldOf(command: GateProfileStartCommand): EntityKey | null {
  return Object.hasOwn(command, 'entity') ? textFieldOf(command, 'entity') : null;
}

/** Without an entity the folder stays as the pipeline names it; an entity's is read from the repository's root. */
function folderOf(firstHome: string | null, folder: string | undefined): string | undefined {
  return firstHome === null ? folder : EntityFoldersUtil.rootedFolderOf(firstHome, folder);
}

/** What a profile runs of the gate: never its `writes`, which a profile is not granted, nor its fix. */
function profiledGateOf(gate: Readonly<PipelineGate>, firstHome: string | null): ProfiledGate {
  const folder = folderOf(firstHome, gate.in);
  return {
    name: gate.name,
    run:  gate.run,
    ...(folder === undefined ? {} : { in: folder }),
    ...(gate.network === undefined ? {} : { network: [...gate.network] }),
  };
}

function preparedStepsOf(steps: readonly PipelineStep[], firstHome: string | null): readonly PipelineStep[] {
  return firstHome === null ? steps : EntityFoldersUtil.rootedStepsOf(steps, firstHome);
}

function startGateProfile(command: GateProfileStartCommand, change: BoardTransaction): GateProfileChanged {
  const setupId  = setupIdFieldOf(command);
  const gateName = textFieldOf(command, 'gateName');
  const phase    = phaseFieldOf(command);
  const entity   = entityFieldOf(command);
  if (setupId === null) requireReadablePipeline(change);
  const source   = change.board.gateToProfileOf(setupId, entity, gateName);
  return change.board.queueGateProfile({
    setupId,
    ...(entity === null ? {} : { entity }),
    phase,
    gate:    profiledGateOf(source.gate, source.firstHome),
    prepare: preparedStepsOf(source.pipeline.prepare, source.firstHome),
  }, change.at);
}

function stopGateProfile(command: CommandOf<'gate-profile-stop'>, change: BoardTransaction): GateProfileChanged & { changed?: false } {
  return change.board.stopGateProfile(textFieldOf(command, 'profileRunId'), change.at);
}

export const GATE_PROFILE_CONTROLS = {
  'gate-profile-start': startGateProfile,
  'gate-profile-stop':  stopGateProfile,
} as const;

/** The kinds User sends about the gate profiles, each applied here. */
export type GateProfileCommandKind = keyof typeof GATE_PROFILE_CONTROLS;
