/**
 * What the first Apply over entities stores, per level, pure: the forge's approvals and merge train, then each entity's kind, prepare
 * steps, gates per phase, review and cap in jobs. A root without gates is kept for a person. The board's limit is not stored by Apply,
 * so no line names it.
 */
import type { BoardPipelineDefinitionDocument, BoardPipelineEntityDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { ForgeLevelPageModel, type ApprovalDefaults }                        from '../entities/ForgeLevelPageModel.ts';

export interface LevelSummaryView {
  /** `forge-level` for the Forge level, else `entity-<key>`. */
  readonly key:       string;
  readonly name:      string;
  /** Whether the name is an entity key, shown in mono. */
  readonly nameIsKey: boolean;
  readonly text:      string;
}

const PHASE_ORDER = ['build', 'review', 'merge'] as const;

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function listedText(items: readonly string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

/** "Human ticket review on, human code review off, conflict re-review over 750 lines". */
function forgeTextOf(draft: BoardPipelineDefinitionDocument, defaults: ApprovalDefaults): string {
  const approvalViews = [...ForgeLevelPageModel.ticketPhaseApprovalViewsOf(draft, defaults), ForgeLevelPageModel.mergeApprovalViewOf(draft, defaults)];
  const approvals = approvalViews.map((approval, index) => {
    const title = index === 0 ? approval.title : approval.title.toLowerCase();
    return `${title} ${approval.isOn ? 'on' : 'off'}`;
  });
  const conflictReReview = ForgeLevelPageModel.conflictReReviewTextOf(draft);
  return [...approvals, `conflict re-review ${conflictReReview === 'Off' ? 'off' : conflictReReview.toLowerCase()}`].join(', ');
}

/** "3 build, 3 review and 3 merge gates", or "No gates". */
function gatesTextOf(entity: BoardPipelineEntityDocument): string {
  if (entity.gates.length === 0) return 'No gates';
  const phaseParts = PHASE_ORDER.filter((phase) => entity.phases[phase].length > 0).map((phase) => `${entity.phases[phase].length} ${phase}`);
  const largestPhaseCount = Math.max(...PHASE_ORDER.map((phase) => entity.phases[phase].length));
  return `${listedText(phaseParts)} ${largestPhaseCount === 1 && phaseParts.length === 1 ? 'gate' : 'gates'}`;
}

function entityTextOf(entity: BoardPipelineEntityDocument): string {
  if (entity.kind === 'root' && entity.gates.length === 0) return 'root · Kept for a person: no gates, no constitution';
  const parts: string[] = [entity.kind];
  if (entity.prepare.length > 0) parts.push(countText(entity.prepare.length, 'prepare step', 'prepare steps'));
  parts.push(gatesTextOf(entity), entity.review === null ? 'review off' : 'review on');
  if (entity.concurrency !== null) parts.push(`a cap of ${countText(entity.concurrency, 'job', 'jobs')}`);
  return parts.join(' · ');
}

function levelsOf(draft: BoardPipelineDefinitionDocument | null, defaults: ApprovalDefaults): LevelSummaryView[] {
  if (draft === null || draft.entities === null) return [];
  const forge: LevelSummaryView = {
    key: 'forge-level', name: 'Forge', nameIsKey: false, text: forgeTextOf(draft, defaults)
  };
  const entities = Object.entries(draft.entities).map(([entityKey, entity]: [string, BoardPipelineEntityDocument]) => ({
    key: `entity-${entityKey}`, name: entityKey, nameIsKey: true, text: entityTextOf(entity)
  }));
  return [forge, ...entities];
}

export const LevelSummaryListModel = Object.freeze({ levelsOf });
