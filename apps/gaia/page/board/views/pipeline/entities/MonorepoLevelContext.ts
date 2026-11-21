/**
 * The level a monorepo flow screen draws, for the parts deep inside it: an entity's three phases, its draft edits scoped to the entity,
 * its gate profiles named by the entity, and its settings the forge sets linked there; the forge's page names the forge. Single mode
 * provides none, so every part reads exactly as it always did.
 */
import { createContext, useContext }            from 'react';
import type { BoardPipelineDefinitionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { PipelineLevel }                   from './PipelineLevelModel.ts';

export interface MonorepoLevelScope {
  readonly level:          PipelineLevel;
  /** The same screen at the forge level, where the settings every entity shares are set. */
  readonly forgeLevelHref: string;
  /** The whole draft, every entity in it, which a copy to another entity reads; null before the agent proposes one. */
  readonly wholeDraft:     BoardPipelineDefinitionDocument | null;
}

export const MonorepoLevelContext = createContext<MonorepoLevelScope | null>(null);

export function useMonorepoLevelScope(): MonorepoLevelScope | null {
  return useContext(MonorepoLevelContext);
}

/** The entity a scope draws, or null at the forge and in single mode. */
export function entityKeyOfScope(scope: MonorepoLevelScope | null): string | null {
  return scope?.level.kind === 'entity' ? scope.level.key : null;
}
