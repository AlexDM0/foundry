/**
 * The pipeline agent's kinds of the setup record: a finding, a question, the constitution, draft edits and a ready step, stamped by the Bouncer with
 * the setup and entity the agent serves. Every refusal is found before the Board changes, since a relayed command shares Hephaestus's hold, which a
 * refusal does not undo. None of them messages the agent: it made the move.
 */
import { type PayloadReading, SetupPayloadSchemas }                       from '../../adapters/pipeline-setup/SetupPayloadSchemas.ts';
import type { PipelineSetupChanged }                                      from '../../domain/tracker-model/@types/BoardChanges.ts';
import type { EntityKey }                                                 from '../../domain/tracker-model/@types/Pipeline.ts';
import type { ControlCommandKind, ControlCommandOf }                      from '../../shared/@types/ControlCommand.ts';
import { TreePortability }                                                from '../lifecycle/TreePortability.ts';
import type { BoardTransaction }                                          from '../tracker/BoardTransaction.ts';
import { projectLocationOf }                                              from '../tracker/ProjectLocation.ts';
import { refuseMalformedSetupCommand, requireStorableDraft, textFieldOf } from './PipelineSetupControls.ts';

/** Who sent the command, which record and which entity it serves are Hephaestus's stamps, not part of the payload. */
const STAMPED_KEYS: readonly string[] = ['kind', 'jobId', 'setupId', 'entity'];

function payloadOf(command: ControlCommandOf<PipelineAgentControlKind>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(command).filter(([key]) => !STAMPED_KEYS.includes(key)));
}

/** The entity the Bouncer stamped; `undefined` for the forge's session. */
function stampedEntityOf(command: ControlCommandOf<PipelineAgentControlKind>): EntityKey | undefined {
  return Object.hasOwn(command, 'entity') ? textFieldOf(command, 'entity') : undefined;
}

function readPayload<Value>(commandKind: ControlCommandKind, reading: PayloadReading<Value>): Value {
  if (reading.verdict === 'malformed') refuseMalformedSetupCommand(commandKind, reading.field);
  return reading.value;
}

/** Only a tracker at its repository's root holds entities; the place is read only for a layout finding of the forge's session. */
function findingMayProposeEntities(topic: string, entityKey: EntityKey | undefined, change: BoardTransaction): boolean {
  return topic === 'layout' && entityKey === undefined && projectLocationOf(change.workspace.rootDirectory).projectPrefix === '';
}

function recordFinding(command: ControlCommandOf<'pipeline-finding-record'>, change: BoardTransaction): PipelineSetupChanged {
  const setupId   = textFieldOf(command, 'setupId');
  const finding   = readPayload(command.kind, SetupPayloadSchemas.findingReadingOf(payloadOf(command)));
  const entityKey = stampedEntityOf(command);
  const recorded  = change.board.recordFinding(setupId, finding, change.at, entityKey);
  if (!findingMayProposeEntities(finding.topic, entityKey, change)) return recorded;
  const walking = change.board.walkEntitiesStepAfterLayout(setupId, change.at);
  return { setup: walking.setup, logged: [...recorded.logged, ...walking.logged] };
}

function askQuestion(command: ControlCommandOf<'pipeline-question-ask'>, change: BoardTransaction): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const asking  = readPayload(command.kind, SetupPayloadSchemas.questionReadingOf(payloadOf(command)));
  return change.board.askSetupQuestion(setupId, asking, change.at, stampedEntityOf(command));
}

function draftConstitution(command: ControlCommandOf<'pipeline-constitution-draft'>, change: BoardTransaction): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const setting = readPayload(command.kind, SetupPayloadSchemas.constitutionReadingOf(payloadOf(command)));
  return change.board.setConstitution(setupId, setting, change.at, stampedEntityOf(command));
}

/**
 * What the snapshot's tree cannot hold on every OS, read once from git's index at the agent's first proposal: each finding a note of the
 * record, its kind the label and its paths the sources. It runs no script.
 */
function withTreeFindings(changed: PipelineSetupChanged, change: BoardTransaction): PipelineSetupChanged {
  const { setupId, snapshotCommit } = changed.setup;
  if (snapshotCommit === null) return changed;
  let latest = changed;
  for (const finding of TreePortability.treeFindingsAt(change.workspace.rootDirectory, snapshotCommit)) {
    const recorded = change.board.recordFinding(setupId, {
      topic: 'note', label: finding.kind, value: null, sourcePaths: [...finding.paths], script: null
    }, change.at);
    latest = { setup: recorded.setup, logged: [...latest.logged, ...recorded.logged] };
  }
  return latest;
}

/**
 * The agent's edits never race a form, so they carry no revision; the draft they leave must still pass the validator, checked before the
 * Board is touched.
 */
function proposeDraftEdits(command: ControlCommandOf<'pipeline-draft-propose'>, change: BoardTransaction): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const edits   = readPayload(command.kind, SetupPayloadSchemas.proposalReadingOf(payloadOf(command)));
  const isFirstProposal = !(change.board.pipelineSetup()?.edits.some((edit) => edit.by === 'agent') ?? false);
  const request = { by: 'agent' as const, revision: null, edits };
  requireStorableDraft(setupId, change.board.draftAfterEdits(setupId, request));
  const changed = change.board.editDraft(setupId, request, change.at);
  return isFirstProposal ? withTreeFindings(changed, change) : changed;
}

function suggestStepReady(command: ControlCommandOf<'pipeline-step-ready'>, change: BoardTransaction): PipelineSetupChanged {
  const setupId = textFieldOf(command, 'setupId');
  const step    = readPayload(command.kind, SetupPayloadSchemas.readyStepReadingOf(payloadOf(command)));
  return change.board.suggestSetupStepReady(setupId, step, change.at);
}

export const PIPELINE_AGENT_CONTROLS = {
  'pipeline-finding-record':     recordFinding,
  'pipeline-question-ask':       askQuestion,
  'pipeline-constitution-draft': draftConstitution,
  'pipeline-draft-propose':      proposeDraftEdits,
  'pipeline-step-ready':         suggestStepReady,
} as const;

/** The kinds only the pipeline agent relays, each applied here. */
export type PipelineAgentControlKind = keyof typeof PIPELINE_AGENT_CONTROLS;
