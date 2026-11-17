/** MonoApply's "Constitutions": how many drafted constitutions go to main in the one commit, each by its entity, and what the others keep. */
import { MonoId } from 'design-system/MonoId';
import { Tag }    from 'design-system/Tag';
import { Text }   from 'design-system/Text';
import { View }   from 'design-system/View';

import type { PipelineSetup }          from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { ConstitutionCommitListModel } from './ConstitutionCommitListModel.ts';

export function ConstitutionCommitList({ record }: { readonly record: Pick<PipelineSetup, 'draft' | 'entities'> }) {
  const view = ConstitutionCommitListModel.viewOf(record);
  return (
    <View gap="eight">
      <Text typeRole="small" subtle>Constitutions</Text>
      <Text bold>{view.headline}</Text>
      {view.committedKeys.length === 0
        ? null
        : (
          <ul className="bridge-pipeline-apply-constitutions" aria-label="Constitutions in the commit">
            {view.committedKeys.map((entityKey) => (
              <li key={entityKey} className="bridge-pipeline-apply-constitution">
                <MonoId text={entityKey} tone="strong" weight="medium" />
                <Tag text="Drafted" tone="neutral" />
              </li>
            ))}
          </ul>
        )}
      {view.notes.map((note) => <Text key={note} muted element="p">{note}</Text>)}
    </View>
  );
}
