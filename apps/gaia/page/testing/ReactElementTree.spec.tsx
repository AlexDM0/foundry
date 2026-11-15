/**
 * The element tree that the design-system specs read in place of a document. What matters: nested components and fragments unfold to the
 * host elements React itself renders, empty children leave nothing, a handler is called through `dispatch`, and an element type the tree
 * cannot unfold fails rather than passing as empty; a component that holds hooks fails, unless the spec keeps it folded under its name with
 * its props.
 */
import {
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';
import { forwardRef, useRef }   from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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

  test('a component that holds hooks fails, and a kept one stands folded under its name with its props, its siblings unfolded', () => {
    function ExampleHooked({ text }: { readonly text: string }) {
      const reference = useRef<HTMLElement>(null);
      return <i ref={reference}>{text}</i>;
    }
    // React reports the misplaced hook on the console before it throws; the report is the expected failure, so it is held, not printed.
    const hookReport = spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => ReactElementTree.unfolded(<p><ExampleHooked text="Alex Example" /></p>)).toThrow();
    expect(hookReport).toHaveBeenCalled();
    hookReport.mockRestore();
    const unfolded = ReactElementTree.unfoldedKeeping(<p><ExampleHooked text="Alex Example" /><ExampleInner text="Example Agency" /></p>, [ExampleHooked]);
    expect(ReactElementTree.hostElementsIn(unfolded).map((element) => [element.tag, element.props['text']])).toEqual([
      ['p', undefined], ['ExampleHooked', 'Alex Example'], ['b', undefined],
    ]);
    expect(ReactElementTree.textOf(unfolded)).toBe('Example Agency');
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
