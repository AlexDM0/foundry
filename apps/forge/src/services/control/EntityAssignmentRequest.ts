/** The request the product owner gets after the first Apply over entities, filled from `resources/prompts/EntityAssignmentRequest.md`. */
import { readFileSync } from 'node:fs';

import { filledTemplateOf }   from '../../shared/FilledTemplate.ts';
import { resourceFilePathOf } from '../../shared/ResourceFilePath.ts';
import { PRODUCT_NAMES }      from '../../shared/constants/ProductNames.ts';

/** The pending tickets without an entity, as the request names them: `#004, #007`. */
export function entityAssignmentRequestOf(ticketIds: readonly string[]): string {
  const template = readFileSync(resourceFilePathOf('prompts', 'EntityAssignmentRequest.md'), 'utf8');
  const ticketList = ticketIds.map((ticketId) => `#${ticketId}`).join(', ');
  return filledTemplateOf(template, { ticketList, program: PRODUCT_NAMES.PROGRAM }).trim();
}
