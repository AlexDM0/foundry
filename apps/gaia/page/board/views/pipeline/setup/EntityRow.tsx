/**
 * One entity of the entities step, as a row of MonoEntities: its key (renamed on Enter or when the field is left), its kind, its home
 * folders, its summary and any refusal of the row, whether a constitution is in its folder, what it depends on, Fold for a package and
 * Remove. Expanded, the row adds a home folder; an app sets its whitelist and its reach, and a package names the apps that whitelist it.
 * Every change is a gesture of draft edits that the step sends or holds.
 */
import { useId, useState }                                          from 'react';
import type { BoardDraftEditDocument, BoardPipelineEntityDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  Button,
  Icon,
  IconButton,
  Text,
  TextField
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { CompactSelect }                                             from './CompactSelect.tsx';
import { EntitiesStepModel, type EntityRowView, type RowEntityKind } from './EntitiesStepModel.ts';
import { RemovableChip }                                             from './RemovableChip.tsx';
import { WhitelistEditor }                                           from './WhitelistEditor.tsx';

export interface EntityRowProps {
  readonly row:             EntityRowView;
  readonly entities:        Readonly<Record<string, BoardPipelineEntityDocument>>;
  readonly isExpanded:      boolean;
  readonly onToggle:        () => void;
  /** Whether a gesture may go now: the shell lets controls act and no earlier gesture is on its way. */
  readonly gesturesAreOpen: boolean;
  readonly onGesture:       (edits: readonly BoardDraftEditDocument[]) => void;
  readonly onFold:          () => void;
  readonly onShowCrossing:  (() => void) | null;
}

const KIND_OPTIONS = [{ value: 'app', label: 'App' }, { value: 'package', label: 'Package' }] as const;

const LAST_HOME_REASON = 'An entity keeps one home folder at least';

function rowKindOf(value: string): RowEntityKind | null {
  return value === 'app' || value === 'package' ? value : null;
}

interface AddTextFieldProps {
  readonly label:       string;
  readonly placeholder: string;
  readonly addLabel:    string;
  readonly disabled:    boolean;
  /** Called with the typed text; the field empties when the gesture made an edit. */
  readonly onAdd:       (text: string) => boolean;
}

function AddTextField({
  label, placeholder, addLabel, disabled, onAdd
}: AddTextFieldProps) {
  const [text, setText] = useState('');
  return (
    <span className="board-entity-row-add">
      <TextField label={label} value={text} mono placeholder={placeholder} disabled={disabled} onChange={setText} />
      <Button
        label={addLabel}
        compact
        disabled={disabled || text.trim() === ''}
        onPress={() => {
          if (onAdd(text)) setText('');
        }}
      />
    </span>
  );
}

/** The key as User types it, and why it cannot name the entity; a rename the facts carried replaces what the field holds. */
function useTypedKey(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, key: string) {
  const [typedKey, setTypedKey] = useState(key);
  const [shownKey, setShownKey] = useState(key);
  // React's adjusting-state-on-new-props pattern.
  if (shownKey !== key) {
    setShownKey(key);
    setTypedKey(key);
  }
  return { typedKey, setTypedKey, refusal: EntitiesStepModel.keyRefusalOf(entities, typedKey, key) };
}

interface KeyFieldProps {
  readonly row:      EntityRowView;
  readonly typedKey: string;
  readonly refusal:  string | null;
  readonly disabled: boolean;
  readonly onType:   (typedKey: string) => void;
  readonly onRename: (key: string) => void;
}

/** A refused key stays in the field, with its reason beside the summary, until User corrects it or presses Escape. */
function KeyField({
  row, typedKey, refusal, disabled, onType, onRename
}: KeyFieldProps) {
  const commit = (): void => {
    if (refusal !== null) return;
    if (typedKey.trim() !== row.key) onRename(typedKey);
    onType(row.key);
  };
  return (
    <input
      className="board-entity-row-key"
      type="text"
      aria-label={`Key of ${row.key}`}
      aria-invalid={refusal !== null}
      title={refusal ?? undefined}
      value={typedKey}
      disabled={disabled}
      spellCheck={false}
      onChange={(event) => onType(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') onType(row.key);
      }}
    />
  );
}

function ReachEditor({
  row, entities, gesturesAreOpen, onGesture
}: Pick<EntityRowProps, 'row' | 'entities' | 'gesturesAreOpen' | 'onGesture'>) {
  return (
    <div className="board-entity-row-reach" role="group" aria-label={`Reach of ${row.key}`}>
      <span className="board-whitelist-editor-head">
        <Text bold>Reach</Text>
        <Text typeRole="small" muted>Root files its builder may change directly</Text>
      </span>
      <span className="board-whitelist-editor-entries">
        {row.reach.map((path) => (
          <RemovableChip
            key={path}
            text={path}
            removeLabel={`Take ${path} out of the reach of ${row.key}`}
            disabled={!gesturesAreOpen}
            onRemove={() => onGesture([EntitiesStepModel.reachRemovedEditOf(entities, row.key, path)])}
          />
        ))}
        {row.reach.length === 0 ? <Text typeRole="small" muted>No root file</Text> : null}
      </span>
      <AddTextField
        label="Add a root file"
        placeholder="/turbo.json"
        addLabel="Add"
        disabled={!gesturesAreOpen}
        onAdd={(text) => {
          const edit = EntitiesStepModel.reachAddedEditOf(entities, row.key, text);
          if (edit !== null) onGesture([edit]);
          return edit !== null;
        }}
      />
    </div>
  );
}

function RowPanel({
  row, entities, gesturesAreOpen, onGesture, onShowCrossing, panelId
}: Pick<EntityRowProps, 'row' | 'entities' | 'gesturesAreOpen' | 'onGesture' | 'onShowCrossing'> & { readonly panelId: string }) {
  return (
    <div id={panelId} className="board-entity-row-panel">
      <AddTextField
        label={`Add a home folder to ${row.key}`}
        placeholder="packages/example"
        addLabel="Add folder"
        disabled={!gesturesAreOpen}
        onAdd={(text) => {
          const edit = EntitiesStepModel.homeAddedEditOf(entities, row.key, text);
          if (edit !== null) onGesture([edit]);
          return edit !== null;
        }}
      />
      {row.kind === 'app'
        ? (
          <>
            <WhitelistEditor row={row} entities={entities} gesturesAreOpen={gesturesAreOpen} onGesture={onGesture} onShowCrossing={onShowCrossing} />
            <ReachEditor row={row} entities={entities} gesturesAreOpen={gesturesAreOpen} onGesture={onGesture} />
          </>
        )
        : (
          <span className="board-whitelist-editor-head">
            <Text bold>Whitelisted by</Text>
            <Text typeRole="small" muted>{row.whitelistedBy.length === 0 ? 'no app yet' : row.whitelistedBy.join(', ')}</Text>
            <Text typeRole="small" muted>
              {row.whitelistedBy.length === 0
                ? `No app may cross into it. A need becomes a ticket of ${row.key}.`
                : `Their tickets may change ${row.key} in stages, reviewed by ${row.key}'s reviewer.`}
            </Text>
          </span>
        )}
    </div>
  );
}

export function EntityRow({
  row, entities, isExpanded, onToggle, gesturesAreOpen, onGesture, onFold, onShowCrossing
}: EntityRowProps) {
  const panelId = useId();
  const typed = useTypedKey(entities, row.key);
  const refusalNote = typed.refusal ?? row.refusalNote;
  const gesture = (edits: readonly BoardDraftEditDocument[] | BoardDraftEditDocument | null): void => {
    if (edits === null) return;
    onGesture(Array.isArray(edits) ? edits : [edits]);
  };
  return (
    <li className="board-entity-row" aria-label={row.key}>
      <div className="board-entity-row-line">
        <button
          type="button"
          className="board-entity-row-toggle"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${row.key}`}
          onClick={onToggle}
        >
          <Icon name="chevron-down" label={null} />
        </button>
        <KeyField
          row={row}
          typedKey={typed.typedKey}
          refusal={typed.refusal}
          disabled={!gesturesAreOpen}
          onType={typed.setTypedKey}
          onRename={(key) => gesture(EntitiesStepModel.renameEditsOf(entities, row.key, key))}
        />
        <CompactSelect
          accessibleName={`Kind of ${row.key}`}
          value={row.kind}
          options={KIND_OPTIONS}
          disabled={!gesturesAreOpen}
          onChange={(value) => {
            const kind = rowKindOf(value);
            if (kind !== null) gesture(EntitiesStepModel.kindEditOf(entities, row.key, kind));
          }}
        />
        <span className="board-entity-row-homes">
          {row.homes.map((home) => (
            <RemovableChip
              key={home}
              text={home}
              removeLabel={`Remove ${home} from ${row.key}`}
              keepReason={row.homes.length <= 1 ? LAST_HOME_REASON : null}
              disabled={!gesturesAreOpen}
              onRemove={() => gesture(EntitiesStepModel.homeRemovedEditOf(entities, row.key, home))}
            />
          ))}
        </span>
        <span className="board-entity-row-summary">
          <Text typeRole="small" muted>{row.summary ?? 'No summary'}</Text>
          {refusalNote === null ? null : <span className="board-entity-row-refusal">{refusalNote}</span>}
        </span>
        <span className="board-entity-row-constitution" title={row.constitutionPath === null ? undefined : `Found: ${row.constitutionPath}. Adopted as it is unless you edit it.`}>
          <Text typeRole="small" muted={row.constitutionPath === null}>{row.constitutionPath === null ? 'Not in its folder' : 'In its folder'}</Text>
        </span>
        <Text typeRole="small" mono>{row.dependsOnText}</Text>
        <span className="board-entity-row-actions">
          {row.kind === 'package' ? <Button label="Fold" accessibleName={`Fold ${row.key} into another entity`} dense disabled={!gesturesAreOpen} onPress={onFold} /> : null}
          <IconButton
            glyph="close"
            accessibleName={`Remove the entity ${row.key}`}
            title="Remove the entity"
            disabled={!gesturesAreOpen}
            onPress={() => gesture(EntitiesStepModel.entityRemovedEditsOf(entities, row.key))}
          />
        </span>
      </div>
      {isExpanded
        ? <RowPanel row={row} entities={entities} gesturesAreOpen={gesturesAreOpen} onGesture={onGesture} onShowCrossing={onShowCrossing} panelId={panelId} />
        : null}
    </li>
  );
}
