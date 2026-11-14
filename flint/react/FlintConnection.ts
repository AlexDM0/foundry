/**
 * What `<Flint>` gives the habitats below it: their registrations are kept here and passed on to the Flint once it exists, so a habitat
 * that mounts before Flint, or stays while Flint is made again, is never lost.
 */
import type { FlintHandle }              from '../CreateFlint.ts';
import type { SpriteCue, SpriteHabitat } from '../SpriteHabitat.ts';

export interface FlintConnection {
  readonly registerHabitat: (element: HTMLElement, habitat: SpriteHabitat) => () => void;
  readonly cue:             (element: HTMLElement, cueName: SpriteCue) => void;
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
    cue:    (element, cueName) => attachedHandle?.cue(element, cueName),
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
