/** The concurrency limit as a number field with Set, offered once the number typed differs and may be sent; the limit is the board's. */
import { useState } from 'react';

import { CONCURRENCY_LIMIT_CEILING_AGENTS, LOWEST_CONCURRENCY_LIMIT_AGENTS } from '../../../src/lib/tracker-model/constants/ConcurrencyLimits.ts';
import { CommandButton }                                                     from '../../shell/CommandButton.tsx';
import { AgentsModel }                                                       from './AgentsModel.ts';

export function ConcurrencyLimitControl({ limit }: { readonly limit: number }) {
  const [wanted, setWanted] = useState(limit);
  return (
    <span className="bridge-field">
      <label className="bridge-field-label">
        agents at most
        <input
          className="bridge-field-input"
          type="number"
          min={LOWEST_CONCURRENCY_LIMIT_AGENTS}
          max={CONCURRENCY_LIMIT_CEILING_AGENTS}
          value={wanted}
          aria-label="Concurrency limit"
          onChange={(event) => setWanted(Number(event.currentTarget.value))}
        />
      </label>
      {AgentsModel.concurrencyLimitIsSendable(wanted, limit) ? <CommandButton label="Set" command={{ kind: 'concurrency-set', limit: wanted }} /> : null}
    </span>
  );
}
