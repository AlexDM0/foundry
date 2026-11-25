/**
 * The shared Markdown editor's model. What matters: the markdown splits into the lines the textarea shows, one mirror line per textarea
 * line, so both stand at the same heights; a line's key is its text and occurrence, so a mark keyed that way follows its line; `#` and `##`
 * lines are headings and quote and fence lines muted; a new version names only the lines it changed; the text follows newer facts only
 * while nothing is unsaved; and a selection reads as the lines it touches, a selection that ends at a line's very start leaving that line
 * out.
 */
import { describe, expect, test } from 'bun:test';

import { MarkdownEditorModel } from './MarkdownEditorModel.ts';

const MARKDOWN = ['# Example constitution', '', '## Code', '- Use strict mode.', '- Keep it short.', '### Detail', '- Keep it short.'].join('\n');

describe('the editor lines', () => {
  test('there is one line per textarea line, numbered from 1, the empty ones and Windows line endings included', () => {
    expect(MarkdownEditorModel.editorLinesOf(MARKDOWN).map((line) => line.text)).toEqual(MARKDOWN.split('\n'));
    expect(MarkdownEditorModel.editorLinesOf('a\r\nb\n').map((line) => [line.number, line.text])).toEqual([[1, 'a'], [2, 'b'], [3, '']]);
  });

  test('two equal lines have keys of their own, and a key follows its line when a line is added above it', () => {
    const keys = MarkdownEditorModel.editorLinesOf(MARKDOWN).map((line) => line.lineKey);
    expect(new Set(keys).size).toBe(keys.length);
    const moved = MarkdownEditorModel.editorLinesOf(`Intro\n${MARKDOWN}`);
    expect(moved.find((line) => line.lineKey === keys[3])?.text).toBe('- Use strict mode.');
  });

  test('only # and ## lines are headings', () => {
    const headings = MarkdownEditorModel.editorLinesOf(MARKDOWN).filter((line) => line.heading).map((line) => line.text);
    expect(headings).toEqual(['# Example constitution', '## Code']);
  });

  test('a quote line and a code fence are muted, and no other line is', () => {
    const lines = MarkdownEditorModel.editorLinesOf(['> Ticket #004', '```mermaid Theme flow', 'flowchart LR', '```', 'Text > more', '~~~'].join('\n'));
    expect(lines.filter((line) => line.muted).map((line) => line.number)).toEqual([1, 2, 4, 6]);
  });

  test('the marker list names each marked line with what its marker stands for', () => {
    const lines = MarkdownEditorModel.editorLinesOf(MARKDOWN);
    expect(MarkdownEditorModel.markerListItemsOf(lines, (line) => (line.number === 4 ? { text: 'research', title: 'tsconfig.json', tone: 'neutral' } : null)))
      .toEqual(['- Use strict mode. · research, tsconfig.json']);
  });
});

describe('a new version', () => {
  test('names only the lines it changed or added', () => {
    const next = `${MARKDOWN.replace('- Use strict mode.', '- Use the strictest mode.')}\n- New rule.`;
    const changed = MarkdownEditorModel.changedLineKeysBetween(MARKDOWN, next);
    const changedTexts = MarkdownEditorModel.editorLinesOf(next).filter((line) => changed.has(line.lineKey)).map((line) => line.text);
    expect(changedTexts).toEqual(['- Use the strictest mode.', '- New rule.']);
  });
});

describe('the text in the textarea', () => {
  const shown = MarkdownEditorModel.editorTextOf({ markdown: MARKDOWN, revision: 3 });

  test('follows newer facts while nothing is unsaved', () => {
    expect(MarkdownEditorModel.followedTextOf(shown, { markdown: 'Next', revision: 4 })).toEqual({ text: 'Next', baseMarkdown: 'Next', baseRevision: 4 });
  });

  test('keeps unsaved text and the revision User saw when the facts move', () => {
    const typed = { ...shown, text: 'Typed' };
    expect(MarkdownEditorModel.followedTextOf(typed, { markdown: 'Next', revision: 4 })).toBe(typed);
  });

  test('keeps a landed save while the facts before it are still shown, and takes its revision once read as the text sent', () => {
    const saved = MarkdownEditorModel.savedTextOf({ ...shown, text: 'Saved' }, { markdown: 'Saved', revision: 4 }, { markdown: MARKDOWN, revision: 3 });
    expect(MarkdownEditorModel.followedTextOf(saved, { markdown: MARKDOWN, revision: 3 })).toBe(saved);
    expect(MarkdownEditorModel.followedTextOf(saved, { markdown: 'Saved', revision: 4 })).toEqual({ text: 'Saved', baseMarkdown: 'Saved', baseRevision: 4 });
  });

  test('keeps a save the forge merged onto a newer head while that head is still shown, then shows the merged text', () => {
    const agentHead = { markdown: 'Agent', revision: 4 };
    const saved = MarkdownEditorModel.savedTextOf({ ...shown, text: 'Mine' }, { markdown: 'Mine', revision: 5 }, { markdown: MARKDOWN, revision: 3 });
    expect(MarkdownEditorModel.followedTextOf(saved, agentHead)).toBe(saved);
    expect(MarkdownEditorModel.followedTextOf(saved, { markdown: 'Mine and Agent', revision: 5 }))
      .toEqual({ text: 'Mine and Agent', baseMarkdown: 'Mine and Agent', baseRevision: 5 });
  });

  test('puts text typed while a save was on its way back on the facts that save was made on once the forge merged it', () => {
    const saved = MarkdownEditorModel.savedTextOf({ ...shown, text: 'Mine, typed on' }, { markdown: 'Mine', revision: 5 }, { markdown: MARKDOWN, revision: 3 });
    expect(MarkdownEditorModel.followedTextOf(saved, { markdown: 'Mine and Agent', revision: 5 }))
      .toEqual({ text: 'Mine, typed on', baseMarkdown: MARKDOWN, baseRevision: 3 });
    expect(MarkdownEditorModel.followedTextOf(saved, { markdown: 'Mine', revision: 5 }))
      .toEqual({ text: 'Mine, typed on', baseMarkdown: 'Mine', baseRevision: 5 });
  });

  test('after a refusal, saves on top of the facts as they are now and keeps the text', () => {
    const typed = { ...shown, text: 'Typed' };
    expect(MarkdownEditorModel.rebasedTextOf(typed, { markdown: 'Next', revision: 4 })).toEqual({ text: 'Typed', baseMarkdown: 'Next', baseRevision: 4 });
  });
});

describe('a selection', () => {
  const text = 'one\ntwo\nthree\nfour';

  test('reads as the lines it touches', () => {
    expect(MarkdownEditorModel.selectedLinesOf(text, 5, 10)).toEqual({ from: 2, to: 3 });
    expect(MarkdownEditorModel.selectedLinesOf(text, 10, 5)).toEqual({ from: 2, to: 3 });
  });

  test('a caret alone is its own line', () => {
    expect(MarkdownEditorModel.selectedLinesOf(text, 9, 9)).toEqual({ from: 3, to: 3 });
  });

  test('a selection that ends at the very start of a line leaves that line out', () => {
    expect(MarkdownEditorModel.selectedLinesOf(text, 4, 8)).toEqual({ from: 2, to: 2 });
  });

  test('an offset reads as the line it stands on', () => {
    expect([0, 3, 4, 18].map((offset) => MarkdownEditorModel.lineNumberAt(text, offset))).toEqual([1, 1, 2, 4]);
  });
});
