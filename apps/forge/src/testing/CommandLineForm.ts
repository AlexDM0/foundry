/** A command line or a flag in a sentence: what an API sentence never names, since User runs no command. */
import { ORIGINAL_PRODUCT_NAMES, PRODUCT_NAMES } from '../shared/constants/ProductNames.ts';

export const COMMAND_LINE_FORM = new RegExp(`\`(?:${PRODUCT_NAMES.PROGRAM}|${ORIGINAL_PRODUCT_NAMES.PROGRAM}) |(?:^|[\\s(])--[a-z]|[Rr]un \``, 'u');
