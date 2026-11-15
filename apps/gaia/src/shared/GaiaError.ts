/**
 * The one app-level error. `refused`: the caller can act on it. `unrepaired`: Gaia will not repair it. Only `src/Main.ts` maps it to an
 * exit code and only the page server maps it to a status.
 */
export type GaiaErrorKind = 'refused' | 'unrepaired';

export class GaiaError extends Error {
  public readonly kind:   GaiaErrorKind;
  public readonly reason: string;

  public constructor(kind: GaiaErrorKind, reason: string, message: string) {
    super(message);
    this.name   = 'GaiaError';
    this.kind   = kind;
    this.reason = reason;
  }
}
