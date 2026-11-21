/**
 * The constitution editor's model. What matters: the markdown splits into the lines the textarea shows, one mirror line per textarea
 * line, so both stand at the same heights; a tag sits exactly on the line an annotation anchors by text and occurrence, and on no other;
 * an edited anchored line loses its tag and every other keeps its own; `#` and `##` lines are headings; a new draft names only the lines
 * it changed; the text follows newer facts only while nothing is unsaved; a save carries the whole markdown with the revision User saw,
 * only when the text changed, and names the entity in monorepo mode.
 */
import { describe, expect, test }             from 'bun:test';
import type { BoardSourceAnnotationDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { ConstitutionEditorModel }            from './ConstitutionEditorModel.ts';

const MARKDOWN = ['# Example constitution', '', '## Code', '- Use strict mode.', '- Keep it short.', '### Detail', '- Keep it short.'].join('\n');

const ANNOTATIONS: readonly BoardSourceAnnotationDocument[] = [
  {
    lineText: '- Use strict mode.', occurrence: 1, kind: 'research', path: 'tsconfig.json',
  },
  {
    lineText: '- Keep it short.', occurrence: 2, kind: 'contributing', path: 'CONTRIBUTING.md',
  },
];

describe('the mirror lines', () => {
  test('there is one mirror line per textarea line, the empty ones and Windows line endings included', () => {
    expect(ConstitutionEditorModel.mirrorLinesOf(MARKDOWN, []).map((line) => line.text)).toEqual(MARKDOWN.split('\n'));
    expect(ConstitutionEditorModel.mirrorLinesOf('a\r\nb\n', []).map((line) => line.text)).toEqual(['a', 'b', '']);
  });

  test('a tag sits exactly on the line its annotation anchors, the second of two equal lines included, and on no other', () => {
    const tags = ConstitutionEditorModel.mirrorLinesOf(MARKDOWN, ANNOTATIONS).map((line) => line.tag);
    expect(tags).toEqual([null, null, null, { text: 'research', title: 'tsconfig.json' }, null, null, { text: 'CONTRIBUTING.md', title: 'CONTRIBUTING.md' }]);
  });

  test('editing an anchored line drops its tag and keeps every other tag, also where the lines above it moved', () => {
    const edited = `Intro line\n${MARKDOWN.replace('- Use strict mode.', '- Use the strictest mode.')}`;
    const tagged = ConstitutionEditorModel.mirrorLinesOf(edited, ANNOTATIONS).filter((line) => line.tag !== null);
    expect(tagged.map((line) => [line.text, line.tag?.text])).toEqual([['- Keep it short.', 'CONTRIBUTING.md']]);
  });

  test('the installed default reads as default, with no title when it has no file', () => {
    const lines = ConstitutionEditorModel.mirrorLinesOf('- Rule.', [{
      lineText: '- Rule.', occurrence: 1, kind: 'installed-default', path: null
    }]);
    expect(lines[0]?.tag).toEqual({ text: 'default', title: null });
  });

  test('only # and ## lines are headings', () => {
    const headings = ConstitutionEditorModel.mirrorLinesOf(MARKDOWN, []).filter((line) => line.heading).map((line) => line.text);
    expect(headings).toEqual(['# Example constitution', '## Code']);
  });

  test('the sources list names each tagged line with its source', () => {
    expect(ConstitutionEditorModel.sourceListItemsOf(ConstitutionEditorModel.mirrorLinesOf(MARKDOWN, ANNOTATIONS)))
      .toEqual(['- Use strict mode. · research, tsconfig.json', '- Keep it short. · CONTRIBUTING.md']);
  });
});

describe('a new draft', () => {
  test('names only the lines it changed or added', () => {
    const next = `${MARKDOWN.replace('- Use strict mode.', '- Use the strictest mode.')}\n- New rule.`;
    const changed = ConstitutionEditorModel.changedLineKeysBetween(MARKDOWN, next);
    const changedTexts = ConstitutionEditorModel.mirrorLinesOf(next, []).filter((line) => changed.has(line.lineKey)).map((line) => line.text);
    expect(changedTexts).toEqual(['- Use the strictest mode.', '- New rule.']);
  });
});

describe('the text in the textarea', () => {
  const shown = ConstitutionEditorModel.editorTextOf({ markdown: MARKDOWN, revision: 3 });

  test('follows newer facts while nothing is unsaved', () => {
    expect(ConstitutionEditorModel.followedTextOf(shown, { markdown: 'Next', revision: 4 }))
      .toEqual({ text: 'Next', baseMarkdown: 'Next', baseRevision: 4 });
  });

  test('keeps unsaved text and the revision User saw when the facts move', () => {
    const typed = { ...shown, text: 'Typed' };
    expect(ConstitutionEditorModel.followedTextOf(typed, { markdown: 'Next', revision: 4 })).toBe(typed);
  });

  test('keeps a landed save while the facts before it are still shown', () => {
    const saved = ConstitutionEditorModel.savedTextOf({ ...shown, text: 'Saved' }, { markdown: 'Saved', revision: 3 });
    expect(saved).toEqual({ text: 'Saved', baseMarkdown: 'Saved', baseRevision: 4 });
    expect(ConstitutionEditorModel.followedTextOf(saved, { markdown: MARKDOWN, revision: 3 })).toBe(saved);
  });

  test('after a refusal, saves on top of the facts as they are now and keeps the text', () => {
    const typed = { ...shown, text: 'Typed' };
    expect(ConstitutionEditorModel.rebasedTextOf(typed, { markdown: 'Next', revision: 4 })).toEqual({ text: 'Typed', baseMarkdown: 'Next', baseRevision: 4 });
  });
});

describe('the save', () => {
  test('sends the whole markdown with the revision User saw', () => {
    const typed = ConstitutionEditorModel.editorTextOf({ markdown: MARKDOWN, revision: 3 });
    expect(ConstitutionEditorModel.saveCommandOf('S1', { ...typed, text: `${MARKDOWN}\n- More.` })).toEqual({
      boardCommandVersion: 1, kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 3, markdown: `${MARKDOWN}\n- More.`, draftedFrom: null, entity: null,
    });
  });

  test('names the entity whose document it saves, and only then', () => {
    const typed = { ...ConstitutionEditorModel.editorTextOf({ markdown: MARKDOWN, revision: 0 }), text: `${MARKDOWN}\n- More.` };
    expect(ConstitutionEditorModel.saveCommandOf('S1', typed, 'web')).toEqual({
      boardCommandVersion: 1, kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 0, markdown: `${MARKDOWN}\n- More.`, draftedFrom: null, entity: 'web',
    });
  });

  test('sends nothing while the text is what the revision holds', () => {
    expect(ConstitutionEditorModel.saveCommandOf('S1', ConstitutionEditorModel.editorTextOf({ markdown: MARKDOWN, revision: 3 }))).toBeNull();
  });
});
