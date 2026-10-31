import type { PlatformHostFacts } from '../lib/platform-ports/PlatformPortsFor.ts';
import { userShell }              from './Environment.ts';
import { PRODUCT_NAMES }          from './constants/ProductNames.ts';

/** What the platform ports may not read for themselves: the environment reaches lib only through a getter, a product name only as a value. */
export const PLATFORM_HOST_FACTS: PlatformHostFacts = Object.freeze({ userShell, monitorFolderName: PRODUCT_NAMES.MONITOR_FOLDER });
