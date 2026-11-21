/** MonoApply's "Constitutions": how many drafted constitutions go to main in the one commit, each by its entity, and what the others keep. */
import type { BoardSetupRecordDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  MonoId,
  Tag,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { ConstitutionCommitListModel } from './ConstitutionCommitListModel.ts';

export function ConstitutionCommitList({ record }: { readonly record: Pick<BoardSetupRecordDocument, 'draft' | 'entities'> }) {
  const view = ConstitutionCommitListModel.viewOf(record);
  return (
    <View gap="eight">
      <Text typeRole="small" subtle>Constitutions</Text>
      <Text bold>{view.headline}</Text>
      {view.committedKeys.length === 0
        ? null
        : (
          <ul className="board-pipeline-apply-constitutions" aria-label="Constitutions in the commit">
            {view.committedKeys.map((entityKey) => (
              <li key={entityKey} className="board-pipeline-apply-constitution">
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
