/**
 * The board's Markdown editor: one textarea holds the whole text, so typing, selection, undo and paste are the browser's own. Its text is
 * transparent over a mirror that draws the same lines, `#` and `##` lines bold, quote and fence lines muted, the selected lines tinted, as
 * are the lines the caller holds, and the caller's markers after a line or in a gutter of line numbers; the mirror and the gutter follow
 * the textarea's scroll, and a line too long to show ends in an ellipsis until User scrolls sideways. A blur, Cmd/Ctrl+S or, where
 * the caller asks, a pause in typing saves the whole text with the revision User saw, only when it changed; a save asked for while the one
 * before it is on its way goes once that one is applied. A refused save keeps User's text until User saves again with Cmd/Ctrl+S or
 * discards it; a blur saves nothing then. With a gutter, its `+` or Cmd/Ctrl+Shift+M hands the caller the selected lines to comment on,
 * numbered as the caller's facts number them: while the text differs from those facts, it saves the text instead and asks User to comment
 * once it is saved.
 */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from 'react';

import { Tag, TextButton }                      from '../../lib/design-system/DesignSystemInterface.ts';
import { useBoardClock }                        from '../shell/BoardClock.ts';
import { useChangedKeys }                       from '../shell/ChangeHighlight.ts';
import { useControlCommand, type SentCommands } from '../shell/ControlCommandSender.ts';
import {
  MarkdownEditorModel,
  type EditorLine,
  type EditorLineMarker,
  type EditorLineRange,
  type EditorText,
  type EditorVersion
} from './MarkdownEditorModel.ts';

export interface MarkdownEditorGutter {
  /** Hands the caller the lines to comment on: the selection, or the line whose `+` was pressed outside it. */
  readonly onCommentLines: (lines: EditorLineRange) => void;
}

export interface MarkdownEditorProps {
  /** The textarea's accessible name. */
  readonly label:                 string;
  readonly version:               EditorVersion;
  /** The command that saves the text; `null` sends nothing. */
  readonly saveCommandOf:         (editorText: EditorText) => SentCommands | null;
  readonly markerOf:              (line: EditorLine) => EditorLineMarker | null;
  /** The name of the list a screen reader reads for the markers. */
  readonly markerListLabel:       string;
  /** The agent is writing: a caret blinks after the last line. */
  readonly drafting?:             boolean;
  /** Line numbers with the markers and a `+` beside each line; without it, a marker sits after its line's text. */
  readonly gutter?:               MarkdownEditorGutter | null;
  /** Also saves once User stopped typing this long. */
  readonly idleSaveMilliseconds?: number | null;
  readonly readOnly?:             boolean;
  /** Told the text the textarea shows, saved or not, each time it changes. */
  readonly onTextChange?:         (text: string) => void;
  /** Told the line the caret stands on each time it moves. */
  readonly onCaretLine?:          (lineNumber: number) => void;
  /** Lines drawn selected whatever User selects, such as the lines a comment being written points at. */
  readonly heldLines?:            EditorLineRange | null;
}

/** The facts' text, and whether User's own save brought it, so only a version from elsewhere sweeps its changed lines. */
interface ShownVersion {
  readonly markdown:    string;
  readonly savedByUser: boolean;
}

interface TextSelection {
  readonly start: number;
  readonly end:   number;
}

const NO_CHANGED_LINES: ReadonlySet<string> = new Set();

const COMMENT_KEY = 'm';

function changedLineKeysBetween(previous: ShownVersion, current: ShownVersion): ReadonlySet<string> {
  return current.savedByUser ? NO_CHANGED_LINES : MarkdownEditorModel.changedLineKeysBetween(previous.markdown, current.markdown);
}

function saveKeyIsPressed(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 's';
}

function commentKeyIsPressed(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === COMMENT_KEY;
}

function MarkerTag({ marker }: { readonly marker: EditorLineMarker }) {
  return <Tag text={marker.text} tone="neutral" {...(marker.title === null ? {} : { title: marker.title })} />;
}

function GutterMarker({ marker }: { readonly marker: EditorLineMarker }) {
  return <span className="board-markdown-editor-marker" data-tone={marker.tone} title={marker.title ?? undefined}>{marker.text}</span>;
}

export function MarkdownEditor({
  label, version, saveCommandOf, markerOf, markerListLabel, drafting = false, gutter = null, idleSaveMilliseconds = null, readOnly = false,
  onTextChange, onCaretLine, heldLines = null
}: MarkdownEditorProps) {
  const markerListId = useId();
  const mirror = useRef<HTMLDivElement>(null);
  const gutterColumn = useRef<HTMLDivElement>(null);
  const clock = useBoardClock();
  const [editorText, setEditorText] = useState<EditorText>(() => MarkdownEditorModel.editorTextOf(version));
  const [lastSavedMarkdown, setLastSavedMarkdown] = useState<string | null>(null);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [scrolledSideways, setScrolledSideways] = useState(false);
  const followedText = MarkdownEditorModel.followedTextOf(editorText, version);
  if (followedText !== editorText) setEditorText(followedText);

  const shownVersion = useMemo(
    () => ({ markdown: version.markdown, savedByUser: version.markdown === lastSavedMarkdown }),
    [version.markdown, lastSavedMarkdown],
  );
  const [changedLineKeys, clearChange] = useChangedKeys(shownVersion, changedLineKeysBetween);

  const [refusalIsHeld, setRefusalIsHeld] = useState(false);
  // After a refusal, the next save goes on top of the facts as they are now.
  const savedOnText = refusalIsHeld ? MarkdownEditorModel.rebasedTextOf(followedText, version) : followedText;
  const command = readOnly ? null : saveCommandOf(savedOnText);
  const sender = useControlCommand(command, {
    onApplied: ({ writtenVersionNumber }) => {
      setLastSavedMarkdown(savedOnText.text);
      setRefusalIsHeld(false);
      // A forge that names no revision wrote the one after the base, as a save on an unmoved head does.
      const saved = { markdown: savedOnText.text, revision: writtenVersionNumber ?? savedOnText.baseRevision + 1 };
      const savedFrom = { markdown: savedOnText.baseMarkdown, revision: savedOnText.baseRevision };
      setEditorText((current) => MarkdownEditorModel.savedTextOf(current, saved, savedFrom));
    },
  });
  // Only a refusal that just arrived holds; one that Discard my edit let go stays let go.
  const [heldRefusal, setHeldRefusal] = useState<string | null>(null);
  // Saves asked for while one could not go, and how many of them a save that went has answered: one asked for while a save is on its way
  // is answered only by the save after it.
  const [askedSaveCount, setAskedSaveCount] = useState(0);
  const [answeredSaveCount, setAnsweredSaveCount] = useState(0);
  const saveIsQueued = askedSaveCount > answeredSaveCount;
  const queueSave = (): void => setAskedSaveCount((count) => count + 1);
  if (sender.refusal !== heldRefusal) {
    setHeldRefusal(sender.refusal);
    if (sender.refusal !== null) {
      setRefusalIsHeld(true);
      setAnsweredSaveCount(askedSaveCount);
    }
  }
  const refusalIsShown = refusalIsHeld && sender.refusal !== null && MarkdownEditorModel.textIsUnsaved(savedOnText);
  if (saveIsQueued && command === null) setAnsweredSaveCount(askedSaveCount);

  const save = (): void => {
    if (sender.enabled) void sender.send();
    else if (command !== null) queueSave();
  };
  const queuedSaveIsDue = saveIsQueued && sender.enabled;
  useEffect(() => {
    if (!queuedSaveIsDue) return;
    const answeredCount = askedSaveCount;
    void sender.send().then(() => setAnsweredSaveCount((count) => Math.max(count, answeredCount)));
  }, [queuedSaveIsDue, sender, askedSaveCount]);

  const shownText = followedText.text;
  const textIsUnsaved = MarkdownEditorModel.textIsUnsaved(followedText);
  // A pause queues the save, which goes once the sender may send, as a save asked for while another is on its way does.
  useEffect(() => {
    if (idleSaveMilliseconds === null || !textIsUnsaved || refusalIsHeld) return undefined;
    return clock.after(idleSaveMilliseconds, () => setAskedSaveCount((count) => count + 1));
  }, [clock, idleSaveMilliseconds, shownText, textIsUnsaved, refusalIsHeld]);

  useEffect(() => {
    onTextChange?.(shownText);
  }, [onTextChange, shownText]);

  const selectedLines = selection === null ? null : MarkdownEditorModel.selectedLinesOf(shownText, selection.start, selection.end);
  const caretLine = selection === null ? null : MarkdownEditorModel.lineNumberAt(shownText, selection.end);
  useEffect(() => {
    if (caretLine !== null) onCaretLine?.(caretLine);
  }, [onCaretLine, caretLine]);

  const lines = MarkdownEditorModel.editorLinesOf(shownText);
  const markerItems = MarkdownEditorModel.markerListItemsOf(lines, markerOf);
  const textIsTheFacts = shownText === version.markdown;
  const [commentWaitsOnSave, setCommentWaitsOnSave] = useState(false);
  if (commentWaitsOnSave && textIsTheFacts) setCommentWaitsOnSave(false);
  const commentOn = (lineNumber: number | null): void => {
    if (gutter === null) return;
    if (!textIsTheFacts) {
      setCommentWaitsOnSave(true);
      if (!refusalIsHeld) save();
      return;
    }
    const selected = selectedLines !== null && (lineNumber === null || MarkdownEditorModel.lineIsIn(lineNumber, selectedLines));
    if (selected) gutter.onCommentLines(selectedLines);
    else if (lineNumber !== null) gutter.onCommentLines({ from: lineNumber, to: lineNumber });
  };
  const selectionIsShown = gutter !== null && selection !== null && selection.start !== selection.end;
  const lineIsSelected = (lineNumber: number): boolean => (
    (selectionIsShown && MarkdownEditorModel.lineIsIn(lineNumber, selectedLines)) || (heldLines !== null && MarkdownEditorModel.lineIsIn(lineNumber, heldLines))
  );

  return (
    <div className="board-markdown-editor">
      <div className="board-markdown-editor-lines">
        {gutter === null
          ? null
          : (
            <div ref={gutterColumn} className="board-markdown-editor-gutter">
              {lines.map((line) => {
                const marker = markerOf(line);
                return (
                  <div key={line.number} className="board-markdown-editor-gutter-line">
                    <span className="board-markdown-editor-marker-place">{marker === null ? null : <GutterMarker marker={marker} />}</span>
                    <span className="board-markdown-editor-line-number">{line.number}</span>
                    <button
                      type="button"
                      className="board-markdown-editor-comment-button"
                      aria-label={`Comment on line ${line.number}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => commentOn(line.number)}
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        <div className="board-markdown-editor-body">
          <div ref={mirror} className="board-markdown-editor-mirror" data-scrolled-sideways={scrolledSideways ? '' : undefined} aria-hidden="true">
            {lines.map((line, i) => {
              const marker = gutter === null ? markerOf(line) : null;
              return (
                <div
                  key={line.lineKey}
                  className="board-markdown-editor-mirror-line"
                  data-heading={line.heading ? '' : undefined}
                  data-muted={line.muted ? '' : undefined}
                  data-changed={changedLineKeys.has(line.lineKey) ? '' : undefined}
                  data-selected={lineIsSelected(line.number) ? '' : undefined}
                  onAnimationEnd={() => clearChange(line.lineKey)}
                >
                  <span className="board-markdown-editor-mirror-text">{line.text}</span>
                  {marker === null ? null : <MarkerTag marker={marker} />}
                  {drafting && i === lines.length - 1 ? <span className="board-markdown-editor-caret" /> : null}
                </div>
              );
            })}
          </div>
          <textarea
            className="board-markdown-editor-input"
            aria-label={label}
            aria-describedby={markerListId}
            wrap="off"
            spellCheck={false}
            readOnly={readOnly}
            value={shownText}
            onChange={(event) => setEditorText({ ...followedText, text: event.currentTarget.value })}
            onSelect={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })}
            onBlur={() => {
              if (!refusalIsHeld) save();
            }}
            onKeyDown={(event) => {
              if (commentKeyIsPressed(event) && gutter !== null) {
                event.preventDefault();
                commentOn(null);
                return;
              }
              if (!saveKeyIsPressed(event)) return;
              event.preventDefault();
              save();
            }}
            onScroll={(event) => {
              const { scrollTop, scrollLeft } = event.currentTarget;
              setScrolledSideways(scrollLeft > 0);
              if (mirror.current !== null) {
                mirror.current.scrollTop = scrollTop;
                mirror.current.scrollLeft = scrollLeft;
              }
              if (gutterColumn.current !== null) gutterColumn.current.scrollTop = scrollTop;
            }}
          />
        </div>
      </div>
      <ul id={markerListId} className="board-markdown-editor-marker-list board-visually-hidden" aria-label={markerListLabel}>
        {markerItems.map((item) => <li key={item}>{item}</li>)}
      </ul>
      {commentWaitsOnSave && !refusalIsShown
        ? <span className="board-markdown-editor-note" role="status">Comment once your edit is saved: its lines are numbered as saved.</span>
        : null}
      {refusalIsShown
        ? (
          // Pressing Discard keeps the textarea's focus, so its blur saves nothing in between.
          <span className="board-markdown-editor-refusal" onMouseDown={(event) => event.preventDefault()}>
            <span className="board-refusal" role="status">{sender.refusal}</span>
            <TextButton
              label="Discard my edit"
              onPress={() => {
                setRefusalIsHeld(false);
                setEditorText(MarkdownEditorModel.editorTextOf(version));
              }}
            />
          </span>
        )
        : null}
    </div>
  );
}
