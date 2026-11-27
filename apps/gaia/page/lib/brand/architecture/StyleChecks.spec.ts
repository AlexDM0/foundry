/**
 * The brand's stylesheets close every brace they open, since a lost brace silently nests every later rule, and the mark is still: no `:hover`,
 * `:active`, animation, transition or keyframe. Text inside comments and quoted strings is left out. The scan first proves it read the
 * stylesheets, and each form is planted in memory.
 */
import { describe, expect, test } from 'bun:test';

import { PackageFiles } from '../testing/PackageFiles.ts';

const STYLESHEETS = PackageFiles.matching(/\.css$/);
const SMALLEST_BLOCK_COUNT_OF_ALL = 10;

interface MotionForm {
  readonly pattern: RegExp;
  readonly name:    string;
}

const MOTION_FORMS: readonly MotionForm[] = [
  { pattern: /:(?:hover|active)\b/, name: 'a :hover or :active state' },
  { pattern: /\banimation(?:-[a-z-]+)?\s*:/, name: 'an animation' },
  { pattern: /\btransition(?:-[a-z-]+)?\s*:/, name: 'a transition' },
  { pattern: /@(?:-webkit-)?keyframes\b/, name: 'a keyframe' },
];

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

function motionSentencesOf(path: string, stylesheetText: string): string[] {
  return codeTextOf(stylesheetText).split('\n').flatMap((lineText, lineIndex) => MOTION_FORMS
    .filter(({ pattern }) => pattern.test(lineText))
    .map(({ name }) => `${path}:${lineIndex + 1} holds ${name}, and the mark is still`));
}

describe('the brand\'s stylesheets', () => {
  test('the scan reads the entry, the tokens and the mark\'s stylesheet, and finds a floor of blocks', () => {
    expect(STYLESHEETS.map(({ path }) => path)).toEqual(['marks/ForgeMark.css', 'styles/brand.css', 'styles/tokens.css']);
    expect(STYLESHEETS.reduce((count, stylesheet) => count + braceScanOf(stylesheet.path, stylesheet.text).blockCount, 0))
      .toBeGreaterThanOrEqual(SMALLEST_BLOCK_COUNT_OF_ALL);
  });

  test('each closes every brace it opens', () => {
    expect(STYLESHEETS.flatMap((stylesheet) => braceScanOf(stylesheet.path, stylesheet.text).sentences)).toEqual([]);
  });

  test('none names a hover or press state, an animation, a transition or a keyframe', () => {
    expect(STYLESHEETS.flatMap((stylesheet) => motionSentencesOf(stylesheet.path, stylesheet.text))).toEqual([]);
  });
});

describe('the checks, on planted stylesheets', () => {
  test('a block left open and a closing brace with no block open are each named by their line', () => {
    expect(braceScanOf('planted.css', ':root {\n  --brand-planted: 1px;\n.brand-planted { color: red; }\n').sentences)
      .toEqual(['planted.css:1 opens a brace that no brace closes']);
    expect(braceScanOf('planted.css', '.brand-planted { color: red; }\n}\n').sentences).toEqual(['planted.css:2 closes a brace that no brace opened']);
  });

  test('a balanced stylesheet passes with its blocks counted, and braces in comments and quoted strings are text', () => {
    const planted = '/* a { in prose */\n@media (min-width: 10px) {\n  .brand-planted::before { content: "}"; }\n}\n';
    expect(braceScanOf('planted.css', planted)).toEqual({ blockCount: 2, sentences: [] });
  });

  test('a hover, a press, an animation, a transition and a keyframe are each named, and a comment that names one is not', () => {
    expect(motionSentencesOf('planted.css', [
      '/* the ring does not answer :hover and has no animation: none */',
      '.brand-planted:hover { stroke: red; }',
      '.brand-planted:active { fill: red; }',
      '.brand-planted-ring { animation: brand-planted-spin 1s infinite; }',
      '.brand-planted-core { animation-name: brand-planted-pulse; transition: fill 1s; }',
      '@keyframes brand-planted-spin { to { transform: rotate(360deg); } }',
      '.brand-planted-still { fill: var(--brand-planted); }',
    ].join('\n'))).toEqual([
      'planted.css:2 holds a :hover or :active state, and the mark is still',
      'planted.css:3 holds a :hover or :active state, and the mark is still',
      'planted.css:4 holds an animation, and the mark is still',
      'planted.css:5 holds an animation, and the mark is still',
      'planted.css:5 holds a transition, and the mark is still',
      'planted.css:6 holds a keyframe, and the mark is still',
    ]);
  });
});
