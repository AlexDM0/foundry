/**
 * The variable that names the tracker root, from the product's environment prefix. `Environment.ts` reads it; it imports only the product
 * names, so the refusal wording that names it stays free of Node.
 */
import { PRODUCT_NAMES, type ProductNames } from './ProductNames.ts';

export function rootOverrideVariableOf({ ENVIRONMENT_PREFIX }: Pick<ProductNames, 'ENVIRONMENT_PREFIX'>): string {
  return `${ENVIRONMENT_PREFIX}ROOT`;
}

export const ROOT_OVERRIDE_VARIABLE = rootOverrideVariableOf(PRODUCT_NAMES);
