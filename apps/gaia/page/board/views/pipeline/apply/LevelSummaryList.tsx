/** MonoApply's "What is stored, per level": one line for the forge, then one per entity, each key in mono beside what Apply stores for it. */
import type { BoardPipelineDefinitionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { MonoId, Text, View }                   from '../../../../lib/design-system/DesignSystemInterface.ts';
import { LevelSummaryListModel }                from './LevelSummaryListModel.ts';

export function LevelSummaryList({ draft }: { readonly draft: BoardPipelineDefinitionDocument | null }) {
  const levels = LevelSummaryListModel.levelsOf(draft);
  if (levels.length === 0) return null;
  return (
    <View gap="eight">
      <Text typeRole="small" subtle>What is stored, per level</Text>
      <ul className="board-pipeline-apply-levels" aria-label="What is stored, per level">
        {levels.map((level) => (
          <li key={level.key} className="board-pipeline-apply-level">
            {level.nameIsKey ? <MonoId text={level.name} tone="strong" weight="medium" /> : <Text bold>{level.name}</Text>}
            <Text muted>{level.text}</Text>
          </li>
        ))}
      </ul>
    </View>
  );
}
