/** One contract for the `Opener` port: a program name that takes the page's path as its last argument, and outlives this process. */
import { expect } from 'bun:test';

import { type PortClause, runPortContract } from '../src/testing/PortContract.ts';
import type { Opener }                      from './Opener.ts';
import { openerFor }                        from './OpenerFor.ts';

const CLAUSES: readonly PortClause<Opener>[] = [{
  claim: 'answers a program to run and detaches it',
  check: (opener) => {
    expect(opener.argv.length).toBeGreaterThan(0);
    expect(opener.detach).toBe(true);
  },
}];

runPortContract('Opener', [
  { name: 'macOS', build: () => openerFor('darwin') },
  { name: 'Linux', build: () => openerFor('linux') },
], CLAUSES);
