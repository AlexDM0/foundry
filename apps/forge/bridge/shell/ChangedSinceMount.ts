/**
 * Whether a shown value has changed since its part mounted, for a figure or a state word keyed by its value: the part marks itself
 * `data-value-changed` once this holds, so each later value plays its change and the value it mounts with plays nothing.
 */
import { useState } from 'react';

export function useChangedSinceMount<Value>(value: Value): boolean {
  const [mountedValue] = useState(value);
  const [hasChanged, setHasChanged] = useState(false);
  if (!hasChanged && !Object.is(value, mountedValue)) setHasChanged(true);
  return hasChanged;
}
