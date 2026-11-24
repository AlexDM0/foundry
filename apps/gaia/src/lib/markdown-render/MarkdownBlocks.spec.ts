/**
 * What a page that draws Markdown as its own elements relies on: each block's source lines and each span's start, exact enough to map a
 * selection back to the source; a `mermaid` fence read as a diagram with its own source lines; raw HTML and images left as text; a link's
 * target kept only under the renderer's allowlist; and the section path of the headings above a block, the document's title left out.
 */
import { describe, expect, test } from 'bun:test';

import { MarkdownBlocks, type MarkdownBlock, type MarkdownSpan } from './MarkdownBlocks.ts';

const SPEC = [
  '# Account pages dark mode',
  '',
  '## 2 Outcome',
  '',
  'Every page under `/account` follows the system, with no white flash on load.',
  '',
  '## 3 Behaviour',
  '',
  '```mermaid Theme flow',
  'flowchart LR',
  '  System[System setting] --> Resolver[Theme resolver]',
  '  Stored[Saved choice] -.-> Resolver',
  '```',
  '',
  '### 3.1 Server',
  '',
  'Pages paint before the resolver runs.',
  '',
  '## 4 Acceptance',
  '',
  '- [ ] **A1** With the system set to dark, the page paints dark.',
  '- [x] **A3** Every account page passes 4.5:1 contrast',
  '  in both themes.',
].join('\n');

function blockAt(blocks: readonly MarkdownBlock[], line: number): MarkdownBlock | undefined {
  return blocks.find((block) => block.lines.from <= line && line <= block.lines.to);
}

function leafSpansOf(spans: readonly MarkdownSpan[]): MarkdownSpan[] {
  return spans.flatMap((span) => ('spans' in span ? leafSpansOf(span.spans) : [span]));
}

describe('MarkdownBlocks.blocksOf', () => {
  const blocks = MarkdownBlocks.blocksOf(SPEC);

  test('gives each block the source lines it spans and the section path of the headings above it, the title left out', () => {
    expect(blocks.map((block) => [block.kind, block.lines.from, block.lines.to, block.sectionPath.join(' › ')])).toEqual([
      ['heading', 1, 1, ''],
      ['heading', 3, 3, ''],
      ['paragraph', 5, 5, '2 Outcome'],
      ['heading', 7, 7, '2 Outcome'],
      ['diagram', 9, 13, '3 Behaviour'],
      ['heading', 15, 15, '3 Behaviour'],
      ['paragraph', 17, 17, '3 Behaviour › 3.1 Server'],
      ['heading', 19, 19, '3 Behaviour › 3.1 Server'],
      ['list', 21, 23, '4 Acceptance'],
    ]);
  });

  test('starts each span at the line and column of its own text, a code span after its backtick', () => {
    const paragraph = blockAt(blocks, 5);
    expect(paragraph?.kind).toBe('paragraph');
    if (paragraph?.kind !== 'paragraph') return;
    expect(paragraph.spans).toEqual([
      { kind: 'text', text: 'Every page under ', start: { line: 5, column: 1 } },
      { kind: 'code', text: '/account', start: { line: 5, column: 19 } },
      { kind: 'text', text: ' follows the system, with no white flash on load.', start: { line: 5, column: 28 } },
    ]);
  });

  test('reads a mermaid fence as a diagram with its kind, the title the fence names and the lines of its source', () => {
    const diagram = blockAt(blocks, 10);
    expect(diagram).toMatchObject({
      kind: 'diagram', diagramKind: 'flowchart', title: 'Theme flow', sourceLines: { from: 10, to: 12 }
    });
    if (diagram?.kind === 'diagram') expect(diagram.source.split('\n')[0]).toBe('flowchart LR');
  });

  test('takes a diagram\'s title from its own title line when the fence names none', () => {
    const [diagram] = MarkdownBlocks.blocksOf('```mermaid\n---\ntitle: Order flow\n---\nsequenceDiagram\n  A->>B: hello\n```');
    expect(diagram).toMatchObject({ kind: 'diagram', diagramKind: 'sequenceDiagram', title: 'Order flow' });
  });

  test('keeps another fence as code with its language', () => {
    const [code] = MarkdownBlocks.blocksOf('```ts\nconst example = 1;\n```');
    expect(code).toMatchObject({ kind: 'code', language: 'ts', text: 'const example = 1;' });
  });

  test('gives a list item its lines, its checkbox and the label its leading strong text names', () => {
    const list = blockAt(blocks, 21);
    expect(list?.kind).toBe('list');
    if (list?.kind !== 'list') return;
    expect(list.items.map((item) => [item.lines.from, item.lines.to, item.checkbox, item.label])).toEqual([
      [21, 21, 'unchecked', 'A1'],
      [22, 23, 'checked', 'A3'],
    ]);
  });

  test('starts the second line of a list item\'s text after its indentation', () => {
    const list = blockAt(blocks, 22);
    if (list?.kind !== 'list') throw new Error('no list');
    const [, secondItem] = list.items;
    const [paragraph] = secondItem?.blocks ?? [];
    if (paragraph?.kind !== 'paragraph') throw new Error('no paragraph');
    expect(leafSpansOf(paragraph.spans).map((span) => ('start' in span ? [span.text, span.start.line, span.start.column] : null))).toEqual([
      ['A3', 22, 9],
      [' Every account page passes 4.5:1 contrast\n', 22, 13],
      ['in both themes.', 23, 3],
    ]);
  });

  test('leaves raw HTML as its own text, in a paragraph and as a block', () => {
    const read = MarkdownBlocks.blocksOf('A <b>bold</b> word\n\n<script>alert(1)</script>\n');
    expect(read.map((block) => (block.kind === 'paragraph' ? MarkdownBlocks.plainTextOf(block.spans) : block.kind))).toEqual([
      'A <b>bold</b> word',
      '<script>alert(1)</script>',
    ]);
  });

  test('leaves an image as its alternative text', () => {
    const [paragraph] = MarkdownBlocks.blocksOf('See ![the logo](logo.png) here');
    expect(paragraph?.kind === 'paragraph' ? MarkdownBlocks.plainTextOf(paragraph.spans) : null).toBe('See the logo here');
  });

  test('keeps a link\'s target only for an allowed or relative href, and its text either way', () => {
    const [paragraph] = MarkdownBlocks.blocksOf('[a](https://example.com) [b](./notes.md) [c](javascript:alert(1)) [d](&#106;avascript:x)');
    if (paragraph?.kind !== 'paragraph') throw new Error('no paragraph');
    const links = paragraph.spans.filter((span) => span.kind === 'link');
    expect(links.map((link) => [link.href, MarkdownBlocks.plainTextOf(link.spans)])).toEqual([
      ['https://example.com', 'a'],
      ['./notes.md', 'b'],
      [null, 'c'],
      [null, 'd'],
    ]);
  });

  test('keeps every heading in the path when a document has two titles', () => {
    const read = MarkdownBlocks.blocksOf('# One\n\ntext\n\n# Two\n\nmore');
    expect(read.map((block) => block.sectionPath.join(' › '))).toEqual(['', 'One', 'One', 'Two']);
  });

  test('counts lines alike after a Windows line break', () => {
    const read = MarkdownBlocks.blocksOf('## A\r\n\r\ntext');
    expect(read.map((block) => block.lines.from)).toEqual([1, 3]);
  });

  test('reads a table\'s header and rows as spans', () => {
    const [table] = MarkdownBlocks.blocksOf('| owner | state |\n| --- | --- |\n| Alex Example | `running` |');
    if (table?.kind !== 'table') throw new Error('no table');
    expect(table.rows.map((row) => row.map((cell) => MarkdownBlocks.plainTextOf(cell)))).toEqual([['Alex Example', 'running']]);
    expect(table.header.map((cell) => MarkdownBlocks.plainTextOf(cell))).toEqual(['owner', 'state']);
  });
});
