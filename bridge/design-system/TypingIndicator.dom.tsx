/**
 * The typing indicator, in a happy-dom document. What matters: it is a polite live region with its activity line as text; the three dots
 * are one image named by `accessibleName`; and `board.css` stops the dots' blink under reduced motion, read from the stylesheet since
 * happy-dom runs no CSS.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { TypingIndicator } from './TypingIndicator.tsx';

const BOARD_STYLESHEET_PATH = join(import.meta.dir, '..', 'styles', 'board.css');
const REDUCED_MOTION_BLOCK_START = '@media (prefers-reduced-motion: reduce) {';

/** The text of each reduced-motion block, its braces matched. */
function reducedMotionBlocksOf(stylesheet: string): string[] {
  const blocks: string[] = [];
  let start = stylesheet.indexOf(REDUCED_MOTION_BLOCK_START);
  while (start !== -1) {
    let depth = 0;
    let position = start + REDUCED_MOTION_BLOCK_START.length - 1;
    do {
      if (stylesheet[position] === '{') depth += 1;
      if (stylesheet[position] === '}') depth -= 1;
      position += 1;
    } while (depth > 0 && position < stylesheet.length);
    blocks.push(stylesheet.slice(start, position));
    start = stylesheet.indexOf(REDUCED_MOTION_BLOCK_START, position);
  }
  return blocks;
}

afterEach(() => {
  cleanup();
});

describe('the typing indicator', () => {
  test('a polite live region with its activity line, the dots one named image', () => {
    const { container } = render(<TypingIndicator text="Sorting the scripts into build and merge…" accessibleName="The pipeline agent is working" />);
    const indicator = container.querySelector('.bridge-typing');
    expect([indicator?.getAttribute('aria-live'), container.querySelector('.bridge-typing-text')?.textContent])
      .toEqual(['polite', 'Sorting the scripts into build and merge…']);
    const dots = screen.getByRole('img', { name: 'The pipeline agent is working' });
    expect([dots.getAttribute('class'), dots.querySelectorAll('.bridge-typing-dot').length]).toEqual(['bridge-typing-dots', 3]);
  });

  test('under reduced motion the dots stand still', () => {
    const blocks = reducedMotionBlocksOf(readFileSync(BOARD_STYLESHEET_PATH, 'utf8'));
    expect(blocks.length).toBeGreaterThan(0);
    const stillDotRules = blocks.flatMap((block) => [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)])
      .filter((rule) => (rule[1] ?? '').split(',').some((selector) => selector.trim() === '.bridge-typing-dot') && /animation:\s*none/.test(rule[2] ?? ''));
    expect(stillDotRules.length).toBe(1);
  });
});
