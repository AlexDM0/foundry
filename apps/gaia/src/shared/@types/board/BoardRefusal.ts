import type { JsonValue } from '../../../lib/json-value/JsonValueUtil.ts';

/** A forge's refusal as it served it: its reason code, the facts it names and the sentence its command line prints, shown unchanged. */
export interface BoardRefusal {
  readonly code:     string;
  readonly fields:   Readonly<Record<string, JsonValue>>;
  readonly sentence: string;
}
