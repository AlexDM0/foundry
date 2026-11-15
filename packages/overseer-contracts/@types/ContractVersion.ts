/**
 * A contract's version as it travels on the wire: the integer key each document has always carried names the major, and an optional
 * sibling key names the minor, which reads as 0 when absent. A minor bump only adds fields; anything else is a major bump.
 */
export interface ContractVersion {
  readonly major: number;
  readonly minor: number;
}
