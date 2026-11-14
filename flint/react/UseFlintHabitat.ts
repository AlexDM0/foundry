/**
 * The React entry for a host component: it registers the component's element as a habitat of the Flint above it, and gives back the
 * function that sends the component's cues. Without a `<Flint>` above, it does nothing.
 */
import type { RefObject }                     from 'react';
import { useCallback, useContext, useEffect } from 'react';

import type { SpriteCue, SpriteHabitat } from '../SpriteHabitat.ts';
import type { FlintConnection }          from './FlintConnection.ts';
import { FlintContext }                  from './FlintContext.ts';

function cueThrough(connection: FlintConnection | null, elementReference: RefObject<HTMLElement | null>, cueName: SpriteCue): void {
  const element = elementReference.current;
  if (connection !== null && element !== null) connection.cue(element, cueName);
}

/**
 * Keep `habitat` stable (a module constant, or memoised), or the habitat is registered again on each render. The cue sender stays the same
 * function while the Flint above and the element reference stay, so an effect may depend on it.
 */
export function useFlintHabitat(elementReference: RefObject<HTMLElement | null>, habitat: SpriteHabitat): (cueName: SpriteCue) => void {
  const connection = useContext(FlintContext);
  useEffect(() => {
    const element = elementReference.current;
    if (connection === null || element === null) return undefined;
    return connection.registerHabitat(element, habitat);
  }, [connection, elementReference, habitat]);
  return useCallback((cueName: SpriteCue) => cueThrough(connection, elementReference, cueName), [connection, elementReference]);
}
