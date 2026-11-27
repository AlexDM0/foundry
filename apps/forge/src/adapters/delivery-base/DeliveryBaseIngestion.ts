/** `document-agent-launch.json` in a document agent's job folder, the document's newest delivery when the job launched: read, validate, map. */
import { StoredJsonDocumentUtil }   from '../utils/StoredJsonDocumentUtil.ts';
import { StoredValueUtil }          from '../utils/StoredValueUtil.ts';
import type { DeliveryBaseProblem } from './@types/DeliveryBaseProblem.ts';

export const DELIVERY_BASE_FORMAT_VERSION = 1;

export type DeliveryBaseReading =
  | { verdict: 'readable'; deliveryBase: number }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: DeliveryBaseProblem };

export class DeliveryBaseIngestion {
  constructor(private readonly launchFilePath: string) {}

  /** Never throws: a file that exists but cannot be read, parsed or trusted whole is `unreadable`, never `absent`. */
  read(): DeliveryBaseReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.launchFilePath, DELIVERY_BASE_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { deliveryBase } = stored.document;
    if (!StoredValueUtil.wholeNumberIsAtLeast(deliveryBase, 0)) return { verdict: 'unreadable', problem: { code: 'not-a-delivery-number', field: 'deliveryBase' } };
    return { verdict: 'readable', deliveryBase };
  }
}
