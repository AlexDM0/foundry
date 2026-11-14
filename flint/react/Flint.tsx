/**
 * The React entry of the package: `<Flint>` creates the one Flint of the page once its home element is mounted, destroys it on unmount,
 * and connects the habitats below it. It holds no behaviour; the core does.
 */
import type { ReactNode, RefObject } from 'react';
import { useEffect, useState }       from 'react';

import type { FlintHandle, FlintOptions } from '../CreateFlint.ts';
import { createFlint }                    from '../CreateFlint.ts';
import { createFlintConnection }          from './FlintConnection.ts';
import { FlintContext }                   from './FlintContext.ts';

export interface FlintProperties extends Omit<FlintOptions, 'root' | 'home'> {
  /** The corner where Flint lives and sleeps. */
  readonly home:      RefObject<HTMLElement | null>;
  /** Where the overlay goes; the default is the body of the home's document. */
  readonly root?:     RefObject<HTMLElement | null>;
  /** Called with the handle once Flint exists, and with null once it is gone: for `perform` and the brain. */
  readonly onHandle?: (handle: FlintHandle | null) => void;
  readonly children?: ReactNode;
}

/**
 * Flint reads its options once, when it is made. A new home, root or storage makes it again, so a host whose storage arrives later (once
 * it knows whose page this is) gives it then; keep the storage memoised. The habitats below stay registered across a remake.
 */
export function Flint(properties: FlintProperties): ReactNode {
  const [connection] = useState(createFlintConnection);
  const {
    home, root, storage, onHandle, children, ...options
  } = properties;
  const [initialOptions] = useState(options);
  const [initialOnHandle] = useState(() => onHandle);
  useEffect(() => {
    const homeElement = home.current;
    const rootElement = root?.current ?? homeElement?.ownerDocument.body ?? null;
    if (homeElement === null || rootElement === null) return undefined;
    const handle = createFlint({
      ...initialOptions, ...(storage === undefined ? {} : { storage }), home: homeElement, root: rootElement,
    });
    connection.attach(handle);
    initialOnHandle?.(handle);
    return () => {
      connection.detach();
      handle.destroy();
      initialOnHandle?.(null);
    };
  }, [home, root, storage, connection, initialOptions, initialOnHandle]);
  return <FlintContext.Provider value={connection}>{children}</FlintContext.Provider>;
}
