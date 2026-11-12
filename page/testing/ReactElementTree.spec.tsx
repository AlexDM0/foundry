/**
 * The element tree that the design-system specs read in place of a document. What matters: nested components and fragments unfold to the
 * host elements React itself renders, empty children leave nothing, a handler is called through `dispatch`, and an element type the tree
 * cannot unfold fails rather than passing as empty.
 */
import { describe, expect, test } from 'bun:test';
import { forwardRef }             from 'react';
import { renderToStaticMarkup }   from 'react-dom/server';

import { ReactElementTree } from './ReactElementTree.ts';

function ExampleInner({ text }: { readonly text: string }) {
  return <b className="example-inner">{text}</b>;
}

function ExampleOuter({ onPress }: { readonly onPress: () => void }) {
  return (
    <p className="example-outer extra">
      <>
        <ExampleInner text="Alex Example" />
        {' '}
        {false}
        {null}
        {2}
      </>
      <button type="button" onClick={onPress}>Press</button>
    </p>
  );
}

describe('unfolding', () => {
  test('nested components and fragments unfold to the same host elements and text React renders', () => {
    const unfolded = ReactElementTree.unfolded(<ExampleOuter onPress={() => undefined} />);
    expect(ReactElementTree.hostElementsIn(unfolded).map((element) => element.tag)).toEqual(['p', 'b', 'button']);
    expect(ReactElementTree.textOf(unfolded)).toBe('Alex Example 2Press');
    expect(renderToStaticMarkup(<ExampleOuter onPress={() => undefined} />).replace(/<[^>]+>/g, '')).toBe('Alex Example 2Press');
  });

  test('an element type it cannot unfold fails instead of leaving nothing', () => {
    const ExampleForwarded = forwardRef<HTMLSpanElement>(function ExampleForwarded(_props, reference) {
      return <span ref={reference} />;
    });
    expect(() => ReactElementTree.unfolded(<ExampleForwarded />)).toThrow('cannot unfold');
  });
});

describe('reading and dispatching', () => {
  test('a class is found among several, and onlyHostElementIn fails on none', () => {
    const unfolded = ReactElementTree.unfolded(<ExampleOuter onPress={() => undefined} />);
    const outer = ReactElementTree.onlyHostElementIn(unfolded, (element) => element.tag === 'p');
    expect(ReactElementTree.hasClass(outer, 'extra')).toBe(true);
    expect(ReactElementTree.hasClass(outer, 'example')).toBe(false);
    expect(() => ReactElementTree.onlyHostElementIn(unfolded, (element) => element.tag === 'table')).toThrow('found 0');
  });

  test('dispatch calls the handler with the event, and fails where there is none', () => {
    const presses: string[] = [];
    const unfolded = ReactElementTree.unfolded(<ExampleOuter onPress={() => presses.push('pressed')} />);
    ReactElementTree.dispatch(ReactElementTree.onlyHostElementIn(unfolded, (element) => element.tag === 'button'), 'onClick');
    expect(presses).toEqual(['pressed']);
    expect(() => ReactElementTree.dispatch(ReactElementTree.onlyHostElementIn(unfolded, (element) => element.tag === 'b'), 'onClick')).toThrow('no onClick');
  });
});
