import { writeFileAtomically }          from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                 from '../../shared/utils/JsonTextUtil.ts';
import { DELIVERY_BASE_FORMAT_VERSION } from './DeliveryBaseIngestion.ts';

export function createDeliveryBaseWriter(launchFilePath: string): { write(deliveryBase: number): void } {
  function write(deliveryBase: number): void {
    writeFileAtomically(launchFilePath, JsonTextUtil.storedFileTextOf({ version: DELIVERY_BASE_FORMAT_VERSION, deliveryBase }));
  }
  return { write };
}
