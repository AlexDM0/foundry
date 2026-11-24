/** The usage line of each `document` verb, which its refusals print and the command's own usage joins. */
import { PRODUCT_NAMES } from '../../../src/shared/constants/ProductNames.ts';

const { PROGRAM } = PRODUCT_NAMES;

export const DOCUMENT_USAGE = {
  propose: `${PROGRAM} document propose [-- <json>] [--json]`,
  ready:   `${PROGRAM} document ready [--json]`,
  effect:  `${PROGRAM} document effect <version> [--json]`,
} as const;
