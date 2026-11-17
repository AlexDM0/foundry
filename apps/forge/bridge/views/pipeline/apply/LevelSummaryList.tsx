/** MonoApply's "What is stored, per level": one line for the forge, then one per entity, each key in mono beside what Apply stores for it. */
import { MonoId } from 'design-system/MonoId';
import { Text }   from 'design-system/Text';
import { View }   from 'design-system/View';

import type { Pipeline }         from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import { LevelSummaryListModel } from './LevelSummaryListModel.ts';

export function LevelSummaryList({ draft }: { readonly draft: Pipeline | null }) {
  const levels = LevelSummaryListModel.levelsOf(draft);
  if (levels.length === 0) return null;
  return (
    <View gap="eight">
      <Text typeRole="small" subtle>What is stored, per level</Text>
      <ul className="bridge-pipeline-apply-levels" aria-label="What is stored, per level">
        {levels.map((level) => (
          <li key={level.key} className="bridge-pipeline-apply-level">
            {level.nameIsKey ? <MonoId text={level.name} tone="strong" weight="medium" /> : <Text bold>{level.name}</Text>}
            <Text muted>{level.text}</Text>
          </li>
        ))}
      </ul>
    </View>
  );
}
