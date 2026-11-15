/**
 * Reads a stylesheet's text into its style rules, in source order: each rule with its full selector (a nested rule joined to its
 * parent), the `@media` and `@container` preludes around it and its own declarations. A `@keyframes` block holds no rule. Test-only.
 */
export interface Declaration {
  readonly property: string;
  readonly value:    string;
}

export interface StyleRule {
  readonly stylesheet:   string;
  readonly selector:     string;
  /** The preludes of the `@media` and `@container` blocks around the rule, outermost first. */
  readonly conditions:   readonly string[];
  readonly declarations: readonly Declaration[];
}

function endOfStringAt(text: string, openingQuotePosition: number): number {
  const quote = text[openingQuotePosition];
  let position = openingQuotePosition + 1;
  while (position < text.length && text[position] !== quote) position += text[position] === '\\' ? 2 : 1;
  return position + 1;
}

function matchingBraceOf(text: string, openingBracePosition: number): number {
  let depth = 0;
  let position = openingBracePosition;
  while (position < text.length) {
    const character = text[position];
    if (character === '"' || character === '\'') {
      position = endOfStringAt(text, position);
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return position;
    }
    position += 1;
  }
  return text.length;
}

/** The declarations written directly in a block, leaving out those of any rule nested in it. */
function declarationsBetween(text: string, start: number, end: number): Declaration[] {
  const declarations: Declaration[] = [];
  let segmentStart = start;
  let position = start;
  const takeSegment = (segmentEnd: number): void => {
    const segment = text.slice(segmentStart, segmentEnd);
    const colonPosition = segment.indexOf(':');
    if (colonPosition > 0) declarations.push({ property: segment.slice(0, colonPosition).trim().toLowerCase(), value: segment.slice(colonPosition + 1).trim() });
  };
  while (position < end) {
    const character = text[position];
    if (character === '"' || character === '\'') {
      position = endOfStringAt(text, position);
      continue;
    }
    if (character === '{') {
      position = matchingBraceOf(text, position) + 1;
      segmentStart = position;
      continue;
    }
    if (character === ';') {
      takeSegment(position);
      segmentStart = position + 1;
    }
    position += 1;
  }
  takeSegment(end);
  return declarations;
}

/** Walks the blocks between `start` and `end`: a grouping at-rule is entered, a `@keyframes` skipped, a style rule kept with its nesting. */
function collectRules(text: string, start: number, end: number, enclosingSelector: string, conditions: readonly string[], stylesheet: string, rules: StyleRule[]): void {
  let preludeStart = start;
  let position = start;
  while (position < end) {
    const character = text[position];
    if (character === '"' || character === '\'') {
      position = endOfStringAt(text, position);
      continue;
    }
    if (character === ';' || character === '}') preludeStart = position + 1;
    if (character === '{') {
      const prelude = text.slice(preludeStart, position).trim();
      const closingBracePosition = matchingBraceOf(text, position);
      if (prelude.startsWith('@')) {
        if (!/^@(?:-webkit-)?keyframes\b/.test(prelude)) collectRules(text, position + 1, closingBracePosition, enclosingSelector, [...conditions, prelude], stylesheet, rules);
      } else {
        const selector = enclosingSelector === '' ? prelude : `${enclosingSelector} ${prelude}`;
        const declarations = declarationsBetween(text, position + 1, closingBracePosition);
        rules.push({
          stylesheet, selector, conditions, declarations
        });
        collectRules(text, position + 1, closingBracePosition, selector, conditions, stylesheet, rules);
      }
      position = closingBracePosition + 1;
      preludeStart = position;
      continue;
    }
    position += 1;
  }
}

export function rulesOf(stylesheet: string, stylesheetText: string): StyleRule[] {
  const withoutComments = stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: StyleRule[] = [];
  collectRules(withoutComments, 0, withoutComments.length, '', [], stylesheet, rules);
  return rules;
}

/** A selector on one line, its whitespace runs folded to one space. */
export function selectorLineOf(selector: string): string {
  return selector.replace(/\s+/g, ' ');
}
