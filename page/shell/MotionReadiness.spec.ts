/**
 * When motion starts. What matters: motion may start only once a fleet document is held, and the root is marked ready only after the frame
 * that paints what the document mounted, never in it: an element whose first style is taken with motion ready fades in from its
 * `@starting-style`, so marking it any sooner would fade the whole first document in. The frames are stepped by hand.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_FIVE_FORGES }                        from '../testing/fixtures/fleet-five-forges.ts';
import { MotionReadiness, type MotionSurroundings } from './MotionReadiness.ts';

interface SteppedSurroundings extends MotionSurroundings {
  readonly rootAttributes: Map<string, string>;
  /** Runs the callbacks the last frame was asked for, as the browser does before it paints that frame. */
  readonly runFrame:       () => void;
}

function steppedSurroundings(): SteppedSurroundings {
  const rootAttributes = new Map<string, string>();
  let waitingCallbacks: (() => void)[] = [];
  return {
    rootAttributes,
    requestFrame:     (callback) => waitingCallbacks.push(callback),
    setRootAttribute: (name, value) => rootAttributes.set(name, value),
    runFrame:         () => {
      const frameCallbacks = waitingCallbacks;
      waitingCallbacks = [];
      for (const callback of frameCallbacks) callback();
    },
  };
}

describe('when motion may start', () => {
  test('not before a fleet document is held, and from the first one on', () => {
    expect(MotionReadiness.motionMayStartWith(null)).toBe(false);
    expect(MotionReadiness.motionMayStartWith(FLEET_FIVE_FORGES)).toBe(true);
  });
});

describe('marking the root ready', () => {
  test('waits out the frame that paints what was just mounted, and marks the root in the frame after it', () => {
    const surroundings = steppedSurroundings();
    MotionReadiness.markReadyAfterNextPaint(surroundings);
    expect(surroundings.rootAttributes.has('data-motion')).toBe(false);
    surroundings.runFrame();
    expect(surroundings.rootAttributes.has('data-motion')).toBe(false);
    surroundings.runFrame();
    expect(surroundings.rootAttributes.get('data-motion')).toBe('ready');
  });
});
