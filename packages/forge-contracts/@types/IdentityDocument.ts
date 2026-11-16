/** An Overseer's open `GET /api/identity`: the keys a reader checks. */

/** The contracts an identity names beside its own. */
export type ServedContractName = 'summary' | 'monitor' | 'control' | 'embed';

/** The major of each contract the forge serves; a contract it does not serve is absent from the object (F1). */
export type IdentityContractsDocument = { readonly [Contract in ServedContractName]?: number };

export interface IdentityDocument {
  readonly identityVersion: number;
  readonly application:     'forge';
  readonly trackerId:       string;
  readonly project:         string;
  readonly codeVersion:     string;
  readonly installVersion:  number;
  readonly processId:       number;
  readonly contracts:       IdentityContractsDocument;
}
