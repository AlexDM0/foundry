/**
 * What `<Flint>` gives the components below it: the habitats' registrations are kept here and passed on to the Flint once it exists, so a
 * habitat that mounts before Flint, or stays while Flint is made again, is never lost; and a component's `perform` reaches the Flint there
 * is now.
 */
import type { FlintHandle, PerformVerdict } from '../CreateFlint.ts';
import type { SpriteCue, SpriteHabitat }    from '../SpriteHabitat.ts';

/** What `perform` answered, or `no-flint` while no Flint is made: an intent then is not kept for a later Flint. */
export type ConnectedPerformVerdict = PerformVerdict | 'no-flint';

export interface FlintConnection {
  readonly registerHabitat: (element: HTMLElement, habitat: SpriteHabitat) => () => void;
  readonly cue:             (element: HTMLElement, cueName: SpriteCue) => void;
  readonly perform:         (intent: string, toward?: Element) => ConnectedPerformVerdict;
  readonly attach:          (handle: FlintHandle) => void;
  readonly detach:          () => void;
}

interface Registration {
  readonly element: HTMLElement;
  readonly habitat: SpriteHabitat;
  removeFromFlint:  (() => void) | null;
}

export function createFlintConnection(): FlintConnection {
  const registrations = new Set<Registration>();
  let attachedHandle: FlintHandle | null = null;
  return {
    registerHabitat: (element, habitat) => {
      const registration: Registration = { element, habitat, removeFromFlint: attachedHandle?.registerHabitat(element, habitat) ?? null };
      registrations.add(registration);
      return () => {
        registration.removeFromFlint?.();
        registrations.delete(registration);
      };
    },
    cue:     (element, cueName) => attachedHandle?.cue(element, cueName),
    perform: (intent, toward) => {
      if (attachedHandle === null) return 'no-flint';
      return toward === undefined ? attachedHandle.perform(intent) : attachedHandle.perform(intent, toward);
    },
    attach: (handle) => {
      attachedHandle = handle;
      for (const registration of registrations) registration.removeFromFlint = handle.registerHabitat(registration.element, registration.habitat);
    },
    detach: () => {
      for (const registration of registrations) {
        registration.removeFromFlint?.();
        registration.removeFromFlint = null;
      }
      attachedHandle = null;
    },
  };
}
