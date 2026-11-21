/**
 * The entities step's refusals, before Continue: one alert, "Continue is refused", over each refusal the forge serves for its stored
 * draft, in the forge's sentence, with Show, which opens the entity's row, and the one gesture the forge serves that resolves it.
 */
import { Button }                      from 'design-system/Button';
import { Text }                        from 'design-system/Text';
import type { BoardDraftEditDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { EntityRefusalView }      from './EntityRefusalsModel.ts';

export interface EntityRefusalsProps {
  readonly refusals:        readonly EntityRefusalView[];
  readonly gesturesAreOpen: boolean;
  readonly onShow:          (entityKey: string) => void;
  readonly onFix:           (edits: readonly BoardDraftEditDocument[]) => void;
}

export function EntityRefusals({
  refusals, gesturesAreOpen, onShow, onFix
}: EntityRefusalsProps) {
  if (refusals.length === 0) return null;
  return (
    <div className="board-entity-refusals" role="alert">
      <span className="board-entity-refusals-head">
        <Text bold>Continue is refused</Text>
      </span>
      <ul className="board-entity-refusals-list">
        {refusals.map((refusal) => (
          <li key={refusal.text} className="board-entity-refusals-item">
            <Text>{refusal.text}</Text>
            <span className="board-entity-refusals-actions">
              {refusal.fix === null
                ? null
                : <Button label={refusal.fix.label} dense disabled={!gesturesAreOpen} onPress={() => onFix(refusal.fix?.edits ?? [])} />}
              <Button label={`Show ${refusal.entityKey}`} dense emphasis="ghost" onPress={() => onShow(refusal.entityKey)} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
