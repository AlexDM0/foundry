/**
 * The Bridge's stylesheets close every brace they open: in `bridge/styles/board.css` and `tokens.css` each `{` has its `}` and no `}`
 * comes before its `{`. A lost brace nests every rule after it in the block above, such as a `@media` query, and the browser reports
 * nothing. Braces inside comments and quoted strings are text and are left out. The scan first proves it found a floor of blocks in each
 * stylesheet, and each form is planted in memory.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

const STYLES_FOLDER = join(import.meta.dir, 'styles');
const SCANNED_STYLESHEETS: readonly string[] = ['board.css', 'tokens.css'];
const SMALLEST_BLOCK_COUNT = 3;

interface BraceScan {
  readonly blockCount: number;
  readonly sentences:  readonly string[];
}

/** The stylesheet with its comments and quoted strings blanked, every other character, line breaks included, in its place. */
function codeTextOf(stylesheetText: string): string {
  return stylesheetText.replace(/\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (text) => text.replace(/[^\n]/g, ' '));
}

function braceScanOf(path: string, stylesheetText: string): BraceScan {
  const openLines: number[] = [];
  const sentences: string[] = [];
  let blockCount = 0;
  codeTextOf(stylesheetText).split('\n').forEach((lineText, lineIndex) => {
    for (const character of lineText) {
      if (character === '{') {
        openLines.push(lineIndex + 1);
        blockCount += 1;
      } else if (character === '}' && openLines.pop() === undefined) {
        sentences.push(`${path}:${lineIndex + 1} closes a brace that no brace opened`);
      }
    }
  });
  return { blockCount, sentences: [...sentences, ...openLines.map((line) => `${path}:${line} opens a brace that no brace closes`)] };
}

describe('the stylesheets close every brace they open', () => {
  test.each([...SCANNED_STYLESHEETS])('%s', (stylesheet: string) => {
    const scan = braceScanOf(stylesheet, readFileSync(join(STYLES_FOLDER, stylesheet), 'utf8'));
    expect(scan.blockCount).toBeGreaterThanOrEqual(SMALLEST_BLOCK_COUNT);
    expect(scan.sentences).toEqual([]);
  });
});

describe('the scan, on planted stylesheets', () => {
  const sentencesOfPlanted = (stylesheetText: string): readonly string[] => braceScanOf('planted.css', stylesheetText).sentences;

  test('a balanced stylesheet with a nested block passes, and its blocks are counted', () => {
    const planted = '@media (prefers-reduced-motion: no-preference) {\n  .bridge-planted { color: red; }\n}\n';
    expect([braceScanOf('planted.css', planted).blockCount, sentencesOfPlanted(planted)]).toEqual([2, []]);
  });

  test('a block left open names the line that opened it', () => {
    expect(sentencesOfPlanted('@media (prefers-reduced-motion: no-preference) {\n  .bridge-planted { color: red; }\n.bridge-after { color: blue; }\n'))
      .toEqual(['planted.css:1 opens a brace that no brace closes']);
  });

  test('a closing brace with no block open names its own line', () => {
    expect(sentencesOfPlanted('.bridge-planted { color: red; }\n}\n')).toEqual(['planted.css:2 closes a brace that no brace opened']);
  });

  test('braces in comments and quoted strings are text', () => {
    expect(sentencesOfPlanted('/* a { in prose */\n.bridge-planted::before { content: "}"; }\n.bridge-quoted::after { content: \'{\'; }\n')).toEqual([]);
  });
});
