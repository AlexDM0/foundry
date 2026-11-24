/**
 * What the constitution step hands the Markdown editor. What matters: a tag sits exactly on the line an annotation anchors by text and
 * occurrence, and on no other; an edited anchored line loses its tag and every other keeps its own; a save carries the whole markdown with
 * the revision User saw, only when the text changed, and names the entity in monorepo mode.
 */
import { describe, expect, test }             from 'bun:test';
import type { BoardSourceAnnotationDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { MarkdownEditorModel }                from '../../../markdown-editor/MarkdownEditorModel.ts';
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

function tagsOf(markdown: string, annotations: readonly BoardSourceAnnotationDocument[]) {
  return MarkdownEditorModel.editorLinesOf(markdown).map(ConstitutionEditorModel.sourceTagsOf(annotations));
}

describe('the source tags', () => {
  test('a tag sits exactly on the line its annotation anchors, the second of two equal lines included, and on no other', () => {
    expect(tagsOf(MARKDOWN, ANNOTATIONS)).toEqual([
      null,
      null,
      null,
      { text: 'research', title: 'tsconfig.json', tone: 'neutral' },
      null,
      null,
      { text: 'CONTRIBUTING.md', title: 'CONTRIBUTING.md', tone: 'neutral' },
    ]);
  });

  test('editing an anchored line drops its tag and keeps every other tag, also where the lines above it moved', () => {
    const edited = `Intro line\n${MARKDOWN.replace('- Use strict mode.', '- Use the strictest mode.')}`;
    expect(tagsOf(edited, ANNOTATIONS).filter((tag) => tag !== null).map((tag) => tag?.text)).toEqual(['CONTRIBUTING.md']);
  });

  test('the installed default reads as default, with no title when it has no file', () => {
    expect(tagsOf('- Rule.', [{
      lineText: '- Rule.', occurrence: 1, kind: 'installed-default', path: null
    }])).toEqual([{ text: 'default', title: null, tone: 'neutral' }]);
  });
});

describe('the save', () => {
  test('sends the whole markdown with the revision User saw', () => {
    const typed = MarkdownEditorModel.editorTextOf({ markdown: MARKDOWN, revision: 3 });
    expect(ConstitutionEditorModel.saveCommandOf('S1', { ...typed, text: `${MARKDOWN}\n- More.` })).toEqual({
      boardCommandVersion: 2, kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 3, markdown: `${MARKDOWN}\n- More.`, draftedFrom: null, entity: null,
    });
  });

  test('names the entity whose document it saves, and only then', () => {
    const typed = { ...MarkdownEditorModel.editorTextOf({ markdown: MARKDOWN, revision: 0 }), text: `${MARKDOWN}\n- More.` };
    expect(ConstitutionEditorModel.saveCommandOf('S1', typed, 'web')).toEqual({
      boardCommandVersion: 2, kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 0, markdown: `${MARKDOWN}\n- More.`, draftedFrom: null, entity: 'web',
    });
  });

  test('sends nothing while the text is what the revision holds', () => {
    expect(ConstitutionEditorModel.saveCommandOf('S1', MarkdownEditorModel.editorTextOf({ markdown: MARKDOWN, revision: 3 }))).toBeNull();
  });
});
