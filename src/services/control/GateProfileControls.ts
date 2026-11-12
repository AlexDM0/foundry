/**
 * User's gate profile kinds: a start queues one gate in one phase, from the open setup's draft or, with no setup named, the stored
 * pipeline; a stop ends a queued run or asks the Overseer to end a running one. Only User's press sends them: no relayed role may, and
 * nothing else queues a profile. A body is untrusted JSON, so each nested field is checked before the Board is touched.
 */
import type { GateProfileChanged }                  from '../../lib/tracker-model/@types/BoardChanges.ts';
import { GATE_PHASES, type GatePhase }              from '../../lib/tracker-model/@types/GatePhase.ts';
import type { ProfiledGate }                        from '../../lib/tracker-model/@types/GateProfile.ts';
import type { Pipeline, PipelineGate }              from '../../lib/tracker-model/@types/Pipeline.ts';
import { BoardRefusal }                             from '../../lib/tracker-model/BoardRefusal.ts';
import type { ControlCommandOf as CommandOf }       from '../../shared/@types/ControlCommand.ts';
import type { TrackerChange }                       from '../tracker/TrackerPipeline.ts';
import { refuseMalformedSetupCommand, textFieldOf } from './PipelineSetupControls.ts';
import { requireReadablePipeline }                  from './SettingControls.ts';

function phaseFieldOf(command: CommandOf<'gate-profile-start'>): GatePhase {
  const phase = GATE_PHASES.find((candidate) => candidate === command.phase);
  if (phase === undefined) refuseMalformedSetupCommand(command.kind, 'phase');
  return phase;
}

function setupIdFieldOf(command: CommandOf<'gate-profile-start'>): string | null {
  return Object.hasOwn(command, 'setupId') && command.setupId === null ? null : textFieldOf(command, 'setupId');
}

/** The open setup's draft, refused `no-setup-open` for another record; with no setup named, the stored pipeline as it reads. */
function sourcePipelineOf(change: TrackerChange, setupId: string | null): Pipeline | null {
  if (setupId === null) {
    requireReadablePipeline(change);
    return change.board.pipeline();
  }
  const setup = change.board.pipelineSetup();
  if (setup?.setupId !== setupId) throw new BoardRefusal({ reason: 'no-setup-open', setupId });
  return setup.draft;
}

/** What a profile runs of the gate: never its `writes`, which a profile is not granted, nor its fix. */
function profiledGateOf(gate: Readonly<PipelineGate>): ProfiledGate {
  return {
    name: gate.name,
    run:  gate.run,
    ...(gate.in === undefined ? {} : { in: gate.in }),
    ...(gate.network === undefined ? {} : { network: [...gate.network] }),
  };
}

function startGateProfile(command: CommandOf<'gate-profile-start'>, change: TrackerChange): GateProfileChanged {
  const setupId  = setupIdFieldOf(command);
  const gateName = textFieldOf(command, 'gateName');
  const phase    = phaseFieldOf(command);
  const pipeline = sourcePipelineOf(change, setupId);
  const gate     = pipeline?.gates.find((candidate) => candidate.name === gateName);
  if (pipeline === null || gate === undefined) {
    throw new BoardRefusal({ reason: 'unknown-gate', gateName, gateNames: pipeline?.gates.map((candidate) => candidate.name) ?? [] });
  }
  return change.board.queueGateProfile({
    setupId, phase, gate: profiledGateOf(gate), prepare: pipeline.prepare
  }, change.at);
}

function stopGateProfile(command: CommandOf<'gate-profile-stop'>, change: TrackerChange): GateProfileChanged & { changed?: false } {
  return change.board.stopGateProfile(textFieldOf(command, 'profileRunId'), change.at);
}

export const GATE_PROFILE_CONTROLS = {
  'gate-profile-start': startGateProfile,
  'gate-profile-stop':  stopGateProfile,
} as const;

/** The kinds User sends about the gate profiles, each applied here. */
export type GateProfileCommandKind = keyof typeof GATE_PROFILE_CONTROLS;
