/**
 * The concurrency limit as a number field with Set, offered once the number typed differs and lies within the bounds the forge serves;
 * the limit is the board's.
 */
import { useState } from 'react';

import { PAGE_CONTRACT_VERSIONS }              from '../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardConcurrencyBoundsDocument } from '../../../@types/board/BoardFactDocuments.ts';
import { CommandButton }                       from '../../shell/CommandButton.tsx';
import { AgentsModel }                         from './AgentsModel.ts';

export interface ConcurrencyLimitControlProps {
  readonly limit:  number;
  readonly bounds: BoardConcurrencyBoundsDocument;
}

export function ConcurrencyLimitControl({ limit, bounds }: ConcurrencyLimitControlProps) {
  const [wanted, setWanted] = useState(limit);
  return (
    <span className="board-field">
      <label className="board-field-label">
        <input
          className="board-field-input"
          type="number"
          min={bounds.lowest}
          max={bounds.ceiling}
          value={wanted}
          aria-label="Concurrency limit"
          onChange={(event) => setWanted(Number(event.currentTarget.value))}
        />
        agents at most
      </label>
      {AgentsModel.concurrencyLimitIsSendable(wanted, limit, bounds)
        ? <CommandButton label="Set" command={{ boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'concurrency-set', limit: wanted }} />
        : null}
    </span>
  );
}
