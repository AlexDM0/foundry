/** Why the repository's tracker list did not take this tracker's entry, as `init` and `namespace` print it inside their own sentence. */
import type { TrackerListingFailure } from '../src/services/tracker/RepositoryTrackerList.ts';
import { PRODUCT_NAMES }              from '../src/shared/constants/ProductNames.ts';

function failureTextOf(cause: TrackerListingFailure): string {
  switch (cause.failure) {
    case 'newer-version': return `it is of version ${cause.version}, newer than this ${PRODUCT_NAMES.PROGRAM} writes`;
    case 'malformed':     return cause.problems.join('; ');
    case 'unwritable':    return cause.systemError;
  }
}

export const TrackerListWording = Object.freeze({ failureTextOf });
