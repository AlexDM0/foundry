/**
 * The constitution's Edit view: one textarea holds the whole markdown, so typing, selection, undo and paste are the browser's own. Its
 * text is transparent over a mirror that draws the same lines, `#` and `##` lines in the link colour and a source tag after each line an
 * annotation anchors; the mirror follows the textarea's scroll. A blur or Cmd/Ctrl+S saves the whole text with the revision User saw, only
 * when it changed. A refused save keeps User's text until User saves again or discards it.
 */

import { Tag }         from 'design-system/Tag';
import { TextButton }  from 'design-system/TextButton';
import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from 'react';

import type { SourceAnnotation }                                              from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { useChangedKeys }                                                     from '../../../shell/ChangeHighlight.ts';
import { useControlCommand }                                                  from '../../../shell/ControlCommandSender.ts';
import { ConstitutionEditorModel, type ConstitutionVersion, type EditorText } from './ConstitutionEditorModel.ts';

export interface ConstitutionEditorProps {
  readonly setupId:     string;
  readonly version:     ConstitutionVersion;
  readonly annotations: readonly SourceAnnotation[];
  /** The agent is writing a draft: a caret blinks after the last line. */
  readonly drafting:    boolean;
}

/** The facts' text, and whether User's own save brought it, so only a draft from elsewhere sweeps its changed lines. */
interface ShownVersion {
  readonly markdown:    string;
  readonly savedByUser: boolean;
}

const NO_CHANGED_LINES: ReadonlySet<string> = new Set();

function changedLineKeysBetween(previous: ShownVersion, current: ShownVersion): ReadonlySet<string> {
  return current.savedByUser ? NO_CHANGED_LINES : ConstitutionEditorModel.changedLineKeysBetween(previous.markdown, current.markdown);
}

function saveKeyIsPressed(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
}

export function ConstitutionEditor({
  setupId, version, annotations, drafting
}: ConstitutionEditorProps) {
  const sourcesListId = useId();
  const mirror = useRef<HTMLDivElement>(null);
  const [editorText, setEditorText] = useState<EditorText>(() => ConstitutionEditorModel.editorTextOf(version));
  const [lastSavedMarkdown, setLastSavedMarkdown] = useState<string | null>(null);
  const followedText = ConstitutionEditorModel.followedTextOf(editorText, version);
  if (followedText !== editorText) setEditorText(followedText);

  const shownVersion = useMemo(
    () => ({ markdown: version.markdown, savedByUser: version.markdown === lastSavedMarkdown }),
    [version.markdown, lastSavedMarkdown],
  );
  const [changedLineKeys, clearChange] = useChangedKeys(shownVersion, changedLineKeysBetween);

  const [refusalIsHeld, setRefusalIsHeld] = useState(false);
  // After a refusal, the next save goes on top of the facts as they are now.
  const savedOnText = refusalIsHeld ? ConstitutionEditorModel.rebasedTextOf(followedText, version) : followedText;
  const command = ConstitutionEditorModel.saveCommandOf(setupId, savedOnText);
  const sender = useControlCommand(command, {
    onApplied: () => {
      setLastSavedMarkdown(savedOnText.text);
      setRefusalIsHeld(false);
      setEditorText((current) => ConstitutionEditorModel.savedTextOf(current, { markdown: savedOnText.text, revision: savedOnText.baseRevision }));
    },
  });
  // Only a refusal that just arrived holds; one that Discard my edit let go stays let go.
  const [heldRefusal, setHeldRefusal] = useState<string | null>(null);
  if (sender.refusal !== heldRefusal) {
    setHeldRefusal(sender.refusal);
    if (sender.refusal !== null) setRefusalIsHeld(true);
  }
  const refusalIsShown = refusalIsHeld && sender.refusal !== null && ConstitutionEditorModel.textIsUnsaved(savedOnText);

  const save = (): void => {
    void sender.send();
  };
  const lines = ConstitutionEditorModel.mirrorLinesOf(followedText.text, annotations);
  const sourceItems = ConstitutionEditorModel.sourceListItemsOf(lines);

  return (
    <div className="bridge-pipeline-constitution-editor">
      <div ref={mirror} className="bridge-pipeline-constitution-mirror" aria-hidden="true">
        {lines.map((line, i) => (
          <div
            key={line.lineKey}
            className="bridge-pipeline-constitution-mirror-line"
            data-heading={line.heading ? '' : undefined}
            data-changed={changedLineKeys.has(line.lineKey) ? '' : undefined}
            onAnimationEnd={() => clearChange(line.lineKey)}
          >
            <span className="bridge-pipeline-constitution-mirror-text">{line.text}</span>
            {line.tag === null ? null : <Tag text={line.tag.text} tone="neutral" {...(line.tag.title === null ? {} : { title: line.tag.title })} />}
            {drafting && i === lines.length - 1 ? <span className="bridge-pipeline-constitution-caret" /> : null}
          </div>
        ))}
      </div>
      <textarea
        className="bridge-pipeline-constitution-input"
        aria-label="Constitution markdown"
        aria-describedby={sourcesListId}
        wrap="off"
        spellCheck={false}
        value={followedText.text}
        onChange={(event) => setEditorText({ ...followedText, text: event.currentTarget.value })}
        onBlur={save}
        onKeyDown={(event) => {
          if (!saveKeyIsPressed(event)) return;
          event.preventDefault();
          save();
        }}
        onScroll={(event) => {
          if (mirror.current === null) return;
          mirror.current.scrollTop = event.currentTarget.scrollTop;
          mirror.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
      />
      <ul id={sourcesListId} className="bridge-pipeline-constitution-sources-list bridge-visually-hidden" aria-label="Sources the pipeline agent named">
        {sourceItems.map((item) => <li key={item}>{item}</li>)}
      </ul>
      {refusalIsShown
        ? (
          <span className="bridge-pipeline-constitution-refusal">
            <span className="bridge-refusal" role="status">{sender.refusal}</span>
            <TextButton
              label="Discard my edit"
              onPress={() => {
                setRefusalIsHeld(false);
                setEditorText(ConstitutionEditorModel.editorTextOf(version));
              }}
            />
          </span>
        )
        : null}
    </div>
  );
}
