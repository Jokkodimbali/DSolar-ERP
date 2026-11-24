import { frenchValidationErrors } from './french-validation';

describe('Validation en français', () => {
  it('identifie précisément le champ et sa contrainte sans divulguer la valeur', () => {
    expect(frenchValidationErrors([{ property: 'email', value: 'secret', constraints: { isEmail: 'email must be an email' } }]))
      .toEqual(['Le champ « adresse électronique » doit être une adresse électronique valide.']);
  });
  it('traduit les erreurs de lignes imbriquées', () => {
    expect(frenchValidationErrors([{ property: 'lines', children: [{ property: '0', children: [
      { property: 'quantity', constraints: { min: 'quantity must not be less than 1' } },
    ] }] }])).toEqual(['Le champ « lignes.0.quantité » doit être supérieur ou égal à 1.']);
  });
  it('traduit les champs non autorisés', () => {
    expect(frenchValidationErrors([{ property: 'extra', constraints: { whitelistValidation: 'property extra should not exist' } }]))
      .toEqual(['Le champ « extra » n’est pas un champ autorisé.']);
  });
});
