/**
 * When motion starts on the page. The package's motion tokens stay 0ms until the root carries `data-motion="ready"`, so it is set only
 * once the first fleet document has painted: whatever that document mounts takes its first style with motion off and shows at once, and
 * only what appears or changes after it moves.
 */
import type { FleetDocument } from '../@types/FleetDocument.ts';

/** The browser's frames and the document's root, so a spec can step through the frames by hand. */
export interface MotionSurroundings {
  readonly requestFrame:     (callback: () => void) => void;
  readonly setRootAttribute: (name: string, value: string) => void;
}

function motionMayStartWith(fleetDocument: FleetDocument | null): boolean {
  return fleetDocument !== null;
}

/** The first frame's callback runs before that frame paints what was just mounted; the second runs once it has painted. */
function markReadyAfterNextPaint(surroundings: MotionSurroundings): void {
  surroundings.requestFrame(() => surroundings.requestFrame(() => surroundings.setRootAttribute('data-motion', 'ready')));
}

function browserMotionSurroundings(): MotionSurroundings {
  return {
    requestFrame: (callback) => {
      window.requestAnimationFrame(callback);
    },
    setRootAttribute: (name, value) => document.documentElement.setAttribute(name, value),
  };
}

export const MotionReadiness = {
  motionMayStartWith,
  markReadyAfterNextPaint,
  browserMotionSurroundings,
} as const;
