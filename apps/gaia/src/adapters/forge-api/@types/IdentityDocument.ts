/**
 * The open `GET /api/identity` of an Overseer, as the forge sends it: the keys Gaia reads, after their check. A forge from before F1 sends
 * neither `identityVersion` nor `contracts`.
 */

/** A contract the forge does not serve is absent from the object (F1). */
export interface IdentityContractsDocument {
  readonly summary?: number;
  readonly monitor?: number;
  readonly control?: number;
  readonly embed?:   number;
}

export interface IdentityDocument {
  readonly identityVersion?: number;
  readonly application:      'forge';
  readonly trackerId:        string;
  readonly project:          string;
  readonly codeVersion:      string;
  readonly installVersion:   number;
  readonly processId:        number;
  readonly contracts?:       IdentityContractsDocument;
}
