/** Runs one contract, a list of claims, against every adapter of a port, each claim against a subject built afresh. */
import { describe, test } from 'bun:test';

export interface PortSubject<Subject> {
  readonly name:  string;
  readonly build: () => Subject;
}

export interface PortClause<Subject> {
  readonly claim: string;
  readonly check: (subject: Subject) => Promise<void> | void;
}

export function runPortContract<Subject>(
  portName: string,
  subjects: readonly PortSubject<Subject>[],
  clauses: readonly PortClause<Subject>[],
  caseTimeoutMilliseconds?: number,
): void {
  describe(`the ${portName} contract`, () => {
    for (const { name, build } of subjects) {
      describe(name, () => {
        for (const { claim, check } of clauses) {
          test(claim, async () => {
            await check(build());
          }, ...(caseTimeoutMilliseconds === undefined ? [] : [caseTimeoutMilliseconds] as const));
        }
      });
    }
  });
}
