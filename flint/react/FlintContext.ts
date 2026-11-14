/** The connection to the one Flint on the page, which `<Flint>` provides to the habitats below it; null without a `<Flint>` above. */
import { createContext } from 'react';

import type { FlintConnection } from './FlintConnection.ts';

export const FlintContext = createContext<FlintConnection | null>(null);
