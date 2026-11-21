/**
 * The copy of one entity's settings to other entities, pure: the ordinary draft edits it makes in each target, the preview line of each
 * target, the entities offered as targets, and the one `pipeline-draft-edit` that sends the whole set as a copy, so the draft keeps it as
 * one batch. A gate goes with its definition and its place at the end of each copied phase's order; a prepare step goes at the end of the
 * target's steps; agent settings carry the model and effort of the entity's own roles and keep the target's briefs. A thing the target
 * already holds as the source does makes no edit, so a copy that changes nothing has nothing to send.
 */
import { PAGE_CONTRACT_VERSIONS }    from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument } from '../../../../@types/board/BoardCommandDocument.ts';
import type {
  BoardAgentStepSettingsDocument,
  BoardDraftEditDocument,
  BoardEntityDraftEditDocument,
  BoardPipelineDefinitionDocument,
  BoardPipelineEntityDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  BOARD_ENTITY_AGENT_ROLES,
  BOARD_GATE_PHASES,
  type BoardEntityKind,
  type BoardGatePhase
} from '../../../../@types/board/BoardVocabulary.ts';
import type { DraftEditTarget } from '../flow/PipelineFlowModel.ts';

/** What one copy carries: an entity's gates with their phases, its prepare steps, or its agents' model and effort. */
export type CopiedPart = 'gates' | 'prepare-steps' | 'agent-settings';

export const COPIED_PARTS: readonly CopiedPart[] = Object.freeze(['gates', 'prepare-steps', 'agent-settings']);

export interface CopyRequest {
  readonly fromEntityKey: string;
  readonly toEntityKeys:  readonly string[];
  readonly parts:         readonly CopiedPart[];
  /** The phases whose gates go; absent sends the gates of every phase. */
  readonly gatePhases?:   readonly BoardGatePhase[];
}

/** "Makes 4 edits in admin" and what else the reader must know, "; 1 gate replaces admin's own typecheck." */
export interface CopyPreviewLine {
  readonly entityKey: string;
  readonly lead:      string;
  readonly rest:      string;
}

export interface CopyTargetOption {
  readonly entityKey:   string;
  /** "app · 2 gates", "package · no gates", "root · kept for a person". */
  readonly explanation: string;
}

interface TargetEdits {
  readonly edits:         readonly BoardDraftEditDocument[];
  /** The target's own gates that a copied gate of the same name replaces. */
  readonly replacedGates: readonly string[];
}

const KIND_WORDS: Readonly<Record<BoardEntityKind, string>> = Object.freeze({ app: 'app', package: 'package', root: 'root' });

const KEPT_FOR_A_PERSON_TEXT = 'kept for a person';

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function entityOf(draft: BoardPipelineDefinitionDocument, entityKey: string): BoardPipelineEntityDocument | null {
  const entities = draft.entities ?? {};
  return Object.hasOwn(entities, entityKey) ? entities[entityKey] ?? null : null;
}

function withinEntityOf(entityKey: string, edit: BoardEntityDraftEditDocument): BoardDraftEditDocument {
  return { target: 'within-entity', entityKey, edit };
}

function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

/** The source's gate names in the copied phases, each once, in the order the phases first run them. */
function copiedGateNamesOf(source: BoardPipelineEntityDocument, phases: readonly BoardGatePhase[]): string[] {
  return [...new Set(phases.flatMap((phase) => source.phases[phase]))];
}

function gateEditsOf(source: BoardPipelineEntityDocument, target: BoardPipelineEntityDocument, targetKey: string, phases: readonly BoardGatePhase[]): TargetEdits {
  const edits: BoardDraftEditDocument[] = [];
  const replacedGates: string[] = [];
  for (const name of copiedGateNamesOf(source, phases)) {
    const gate = source.gates.find((candidate) => candidate.name === name);
    const own = target.gates.find((candidate) => candidate.name === name);
    if (gate === undefined || sameValue(gate, own)) continue;
    if (own !== undefined) replacedGates.push(name);
    edits.push(withinEntityOf(targetKey, { target: 'gate', name, value: gate }));
  }
  for (const phase of phases) {
    const order = [...target.phases[phase], ...source.phases[phase].filter((name) => !target.phases[phase].includes(name))];
    if (!sameValue(order, target.phases[phase])) edits.push(withinEntityOf(targetKey, { target: 'phase-order', phase, names: order }));
  }
  return { edits, replacedGates };
}

function prepareEditsOf(source: BoardPipelineEntityDocument, target: BoardPipelineEntityDocument, targetKey: string): BoardDraftEditDocument[] {
  return source.prepare.flatMap((step) => {
    const own = target.prepare.find((candidate) => candidate.name === step.name);
    return sameValue(step, own) ? [] : [withinEntityOf(targetKey, { target: 'prepare', name: step.name, value: step })];
  });
}

/** Each role the source sets a model or effort for, with the target's own briefs kept. */
function agentEditsOf(source: BoardPipelineEntityDocument, target: BoardPipelineEntityDocument, targetKey: string): BoardDraftEditDocument[] {
  return BOARD_ENTITY_AGENT_ROLES.flatMap((role) => {
    const settings = source.agents[role];
    if (settings === undefined || (settings.model === null && settings.effort === null)) return [];
    const own = target.agents[role];
    const value: BoardAgentStepSettingsDocument = {
      model:        settings.model ?? own?.model ?? null,
      effort:       settings.effort ?? own?.effort ?? null,
      instructions: own?.instructions ?? null,
    };
    return sameValue(value, own) ? [] : [withinEntityOf(targetKey, { target: 'role', role, value })];
  });
}

function targetEditsOf(draft: BoardPipelineDefinitionDocument, request: CopyRequest, targetKey: string): TargetEdits {
  const source = entityOf(draft, request.fromEntityKey);
  const target = entityOf(draft, targetKey);
  if (source === null || target === null || targetKey === request.fromEntityKey) return { edits: [], replacedGates: [] };
  const gates = request.parts.includes('gates')
    ? gateEditsOf(source, target, targetKey, request.gatePhases ?? BOARD_GATE_PHASES)
    : { edits: [], replacedGates: [] };
  return {
    edits: [
      ...gates.edits,
      ...(request.parts.includes('prepare-steps') ? prepareEditsOf(source, target, targetKey) : []),
      ...(request.parts.includes('agent-settings') ? agentEditsOf(source, target, targetKey) : []),
    ],
    replacedGates: gates.replacedGates,
  };
}

function copyEditsOf(draft: BoardPipelineDefinitionDocument, request: CopyRequest): BoardDraftEditDocument[] {
  return request.toEntityKeys.flatMap((targetKey) => targetEditsOf(draft, request, targetKey).edits);
}

/** One line for each target the copy changes. */
function previewLinesOf(draft: BoardPipelineDefinitionDocument, request: CopyRequest): CopyPreviewLine[] {
  return request.toEntityKeys.flatMap((targetKey) => {
    const { edits, replacedGates } = targetEditsOf(draft, request, targetKey);
    if (edits.length === 0) return [];
    const replaces = replacedGates.length === 1 ? 'replaces' : 'replace';
    const rest = replacedGates.length === 0
      ? '.'
      : `; ${countText(replacedGates.length, 'gate', 'gates')} ${replaces} ${targetKey}’s own ${replacedGates.join(', ')}.`;
    return [{ entityKey: targetKey, lead: `Makes ${countText(edits.length, 'edit', 'edits')} in ${targetKey}`, rest }];
  });
}

function gateCountTextOf(entity: BoardPipelineEntityDocument): string {
  return entity.gates.length === 0 ? 'no gates' : countText(entity.gates.length, 'gate', 'gates');
}

/** Every entity but the source, in the draft's order, with its kind and gates; the root says it is kept for a person. */
function targetOptionsOf(draft: BoardPipelineDefinitionDocument, fromEntityKey: string): CopyTargetOption[] {
  return Object.entries(draft.entities ?? {}).flatMap(([entityKey, entity]) => {
    if (entityKey === fromEntityKey) return [];
    const kept = entity.kind === 'root' && entity.gates.length === 0;
    return [{ entityKey, explanation: `${KIND_WORDS[entity.kind]} · ${kept ? KEPT_FOR_A_PERSON_TEXT : gateCountTextOf(entity)}` }];
  });
}

/** "Copy 4 edits". */
function copyLabelOf(editCount: number): string {
  return `Copy ${countText(editCount, 'edit', 'edits')}`;
}

/** The set as one move, marked as a copy so the draft stores it as one batch; null with nothing to send. */
function copyCommandOf(target: DraftEditTarget, edits: readonly BoardDraftEditDocument[]): BoardCommandDocument | null {
  if (edits.length === 0) return null;
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-draft-edit', setupId: target.setupId, draftRevision: target.draftRevision, edits, isACopy: true
  };
}

export const CopyBetweenEntitiesDialogModel = Object.freeze({
  copyEditsOf,
  previewLinesOf,
  targetOptionsOf,
  copyLabelOf,
  copyCommandOf,
});
