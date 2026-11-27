/**
 * User's gate profile kinds: a start queues one gate in one phase, from the open setup's draft or, with no setup named, the stored
 * pipeline; on a forge over entities, the gate of the entity it names, read through that entity's single pipeline, with its folders taken
 * from the entity's first home. A stop ends a queued run or asks Hephaestus to end a running one. Only User's press sends them: no
 * relayed role may, and nothing else queues a profile. A body is untrusted JSON, so each nested field is checked before the Board is touched.
 */
import type { GateProfileChanged }     from '../../domain/tracker-model/@types/BoardChanges.ts';
import { GATE_PHASES, type GatePhase } from '../../domain/tracker-model/@types/GatePhase.ts';
import type { ProfiledGate }           from '../../domain/tracker-model/@types/GateProfile.ts';
import type {
  EntityKey,
  Pipeline,
  PipelineGate,
  PipelineStep
} from '../../domain/tracker-model/@types/Pipeline.ts';
import { BoardRefusal }                             from '../../domain/tracker-model/BoardRefusal.ts';
import { PipelineUtil }                             from '../../domain/tracker-model/utils/PipelineUtil.ts';
import type { ControlCommandOf as CommandOf }       from '../../shared/@types/ControlCommand.ts';
import { EntityFoldersUtil }                        from '../../shared/utils/EntityFoldersUtil.ts';
import type { BoardTransaction }                    from '../tracker/BoardTransaction.ts';
import { refuseMalformedSetupCommand, textFieldOf } from './PipelineSetupControls.ts';
import { requireReadablePipeline }                  from './SettingControls.ts';

type GateProfileStartCommand = CommandOf<'gate-profile-start'>;

/** The pipeline a gate is read from, and the first home of its entity; `null` for a pipeline without entities. */
interface GateSource {
  pipeline:  Pipeline;
  firstHome: string | null;
}

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

/** The open setup's draft, refused `no-setup-open` for another record; with no setup named, the stored pipeline as it reads. */
function sourcePipelineOf(change: BoardTransaction, setupId: string | null): Pipeline | null {
  if (setupId === null) {
    requireReadablePipeline(change);
    return change.board.pipeline();
  }
  const setup = change.board.pipelineSetup();
  if (setup?.setupId !== setupId) throw new BoardRefusal({ reason: 'no-setup-open', setupId });
  return setup.draft;
}

/** The source pipeline itself without an entity named; else the entity's single pipeline, or null when the source has no such entity. */
function gateSourceOf(source: Readonly<Pipeline> | null, entityKey: EntityKey | null): GateSource | null {
  if (source === null) return null;
  if (entityKey === null) return { pipeline: source, firstHome: null };
  const pipeline = PipelineUtil.pipelineOfEntity(source, entityKey);
  if (pipeline === null) return null;
  return { pipeline, firstHome: source.entities?.[entityKey]?.home[0] ?? '/' };
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
  const source   = gateSourceOf(sourcePipelineOf(change, setupId), entity);
  const gate     = source?.pipeline.gates.find((candidate) => candidate.name === gateName);
  if (source === null || gate === undefined) {
    throw new BoardRefusal({ reason: 'unknown-gate', gateName, gateNames: source?.pipeline.gates.map((candidate) => candidate.name) ?? [] });
  }
  return change.board.queueGateProfile({
    setupId,
    ...(entity === null ? {} : { entity }),
    phase,
    gate:    profiledGateOf(gate, source.firstHome),
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
