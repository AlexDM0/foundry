/**
 * The level in a monorepo page's head: `Pipeline › web` or `Pipeline › Forge`. "Pipeline" links to the forge level of the same screen,
 * and the level's own name is the current location, an entity's key set in mono.
 */
import { MonoId, Text } from '../../../../lib/design-system/DesignSystemInterface.ts';

import { PipelineLevelModel, type PipelineLevel } from './PipelineLevelModel.ts';

export interface EntityLevelBreadcrumbProps {
  readonly level:          PipelineLevel;
  /** The same screen at the forge level. */
  readonly forgeLevelHref: string;
}

export function EntityLevelBreadcrumb({ level, forgeLevelHref }: EntityLevelBreadcrumbProps) {
  const name = PipelineLevelModel.levelNameOf(level);
  return (
    <nav className="board-entity-breadcrumb" aria-label="Level">
      <a className="board-entity-breadcrumb-link" href={forgeLevelHref}>Pipeline</a>
      <span className="board-entity-breadcrumb-separator" aria-hidden="true">›</span>
      <span className="board-entity-breadcrumb-current" aria-current="location">
        {PipelineLevelModel.isForgeLevel(level) ? <Text typeRole="tab" bold>{name}</Text> : <MonoId text={name} tone="strong" weight="bold" />}
      </span>
    </nav>
  );
}
