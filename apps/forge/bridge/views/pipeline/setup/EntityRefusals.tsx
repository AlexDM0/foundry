/**
 * The entities step's refusals, before Continue: one alert, "Continue is refused", over each refusal the shared validator gives the shown
 * entities, in User's words, with Show, which opens the entity's row, and the one gesture that resolves it where there is one. While
 * changes are held because they would leave a refusal, the alert says they are not saved and offers to discard them.
 */
import { Button } from 'design-system/Button';
import { Text }   from 'design-system/Text';

import type { EntityKey }         from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineDraftEdit } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { EntityRefusalView } from './EntityRefusalsModel.ts';

export interface EntityRefusalsProps {
  readonly refusals:        readonly EntityRefusalView[];
  /** How many draft edits wait unsent until the refusals are resolved. */
  readonly heldChangeCount: number;
  readonly gesturesAreOpen: boolean;
  readonly onShow:          (entityKey: EntityKey) => void;
  readonly onFix:           (edits: readonly PipelineDraftEdit[]) => void;
  readonly onDiscardHeld:   () => void;
}

export function EntityRefusals({
  refusals, heldChangeCount, gesturesAreOpen, onShow, onFix, onDiscardHeld
}: EntityRefusalsProps) {
  if (refusals.length === 0) return null;
  return (
    <div className="bridge-entity-refusals" role="alert">
      <span className="bridge-entity-refusals-head">
        <Text bold>Continue is refused</Text>
        {heldChangeCount === 0
          ? null
          : (
            <>
              <Text typeRole="small" muted>
                {heldChangeCount === 1 ? 'Your last change is not saved until this is resolved.' : 'Your last changes are not saved until this is resolved.'}
              </Text>
              <Button label="Discard the change" dense onPress={onDiscardHeld} />
            </>
          )}
      </span>
      <ul className="bridge-entity-refusals-list">
        {refusals.map((refusal) => (
          <li key={refusal.text} className="bridge-entity-refusals-item">
            <Text>{refusal.text}</Text>
            <span className="bridge-entity-refusals-actions">
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
