/**
 * An app's whitelist on the entities step, as MonoEntities draws it: the packages its tickets may cross into, each with its remove button
 * and, when the forge refuses it, why; a select that adds another package; and the link to how a crossing runs, with its cost on
 * hover.
 */
import type { BoardDraftEditDocument, BoardPipelineEntityDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { Button, Text }                                             from '../../../../lib/design-system/DesignSystemInterface.ts';
import { CompactSelect }                                            from './CompactSelect.tsx';
import { EntitiesStepModel, type EntityRowView }                    from './EntitiesStepModel.ts';
import { RemovableChip }                                            from './RemovableChip.tsx';

export interface WhitelistEditorProps {
  readonly row:             EntityRowView;
  readonly entities:        Readonly<Record<string, BoardPipelineEntityDocument>>;
  readonly gesturesAreOpen: boolean;
  readonly onGesture:       (edits: readonly BoardDraftEditDocument[]) => void;
  /** Opens how a crossing of this app runs; `null` while its whitelist names no package a crossing can go into. */
  readonly onShowCrossing:  (() => void) | null;
}

const CROSSING_COST_TEXT = 'Each crossing adds 3 stages and a package review';

const NO_CROSSING_TEXT = 'No crossings: its tickets stay in its own folders';

export function WhitelistEditor({
  row, entities, gesturesAreOpen, onGesture, onShowCrossing
}: WhitelistEditorProps) {
  const addPackage = (packageKey: string): void => {
    const edit = EntitiesStepModel.whitelistAddedEditOf(entities, row.key, packageKey);
    if (edit !== null) onGesture([edit]);
  };
  return (
    <div className="board-whitelist-editor" role="group" aria-label={`Whitelist of ${row.key}`}>
      <span className="board-whitelist-editor-head">
        <Text bold>Whitelist</Text>
        <Text typeRole="small" muted>Packages its tickets may cross into</Text>
        <span className="board-whitelist-editor-crossing" title={onShowCrossing === null ? NO_CROSSING_TEXT : CROSSING_COST_TEXT}>
          <Button label="See how a crossing runs" emphasis="ghost" tint="link" dense disabled={onShowCrossing === null} onPress={() => onShowCrossing?.()} />
        </span>
      </span>
      <span className="board-whitelist-editor-entries">
        {row.whitelist.map((entry) => (
          <RemovableChip
            key={entry.key}
            text={entry.key}
            refused={entry.refused}
            removeLabel={`Take ${entry.key} off the whitelist of ${row.key}`}
            disabled={!gesturesAreOpen}
            onRemove={() => onGesture([EntitiesStepModel.whitelistRemovedEditOf(entities, row.key, entry.key)])}
          />
        ))}
        {row.whitelist.length === 0 ? <Text typeRole="small" muted>No package yet</Text> : null}
        {row.addablePackages.length === 0
          ? null
          : (
            <CompactSelect
              accessibleName={`Add a package to the whitelist of ${row.key}`}
              value=""
              prompt="Add a package"
              options={row.addablePackages.map((packageKey) => ({ value: packageKey, label: packageKey }))}
              disabled={!gesturesAreOpen}
              onChange={addPackage}
            />
          )}
      </span>
    </div>
  );
}
