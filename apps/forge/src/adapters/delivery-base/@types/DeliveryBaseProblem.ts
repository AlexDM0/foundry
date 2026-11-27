import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why `document-agent-launch.json` could not be read. */
export type DeliveryBaseProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'not-a-delivery-number'> & { readonly field: 'deliveryBase' };
