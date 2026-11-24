import { ValidationError } from 'class-validator';

const labels: Record<string, string> = {
  name: 'nom',
  legalName: 'raison sociale',
  tradeName: 'nom commercial',
  sku: 'référence produit',
  email: 'adresse électronique',
  password: 'mot de passe',
  phone: 'téléphone',
  quantity: 'quantité',
  amount: 'montant',
  unitPrice: 'prix unitaire',
  discount: 'remise',
  taxRate: 'taux de TVA',
  productId: 'produit',
  storeId: 'magasin',
  customerId: 'client',
  supplierId: 'fournisseur',
  orderId: 'commande',
  id: 'identifiant',
  lines: 'lignes',
  page: 'page',
  limit: 'taille de page',
  search: 'recherche',
  status: 'statut',
  action: 'type de notification',
  read: 'état de lecture',
  expectedRevision: 'version attendue',
  lowStockThreshold: 'seuil de stock',
};

const messages: Record<string, string> = {
  isString: 'doit être un texte.',
  isNotEmpty: 'est obligatoire.',
  isDefined: 'est obligatoire.',
  isEmail: 'doit être une adresse électronique valide.',
  isUUID: 'doit être un identifiant UUID valide.',
  isBoolean: 'doit être un booléen (true ou false).',
  isInt: 'doit être un nombre entier.',
  isNumber: 'doit être un nombre valide avec la précision autorisée.',
  isNumberString: 'doit être un nombre décimal valide.',
  isDecimal: 'doit être un nombre décimal valide.',
  isArray: 'doit être une liste.',
  arrayUnique: 'ne doit pas contenir de doublons.',
  isPositive: 'doit être strictement positif.',
  isNegative: 'doit être strictement négatif.',
  isObject: 'doit être un objet valide.',
  isDate: 'doit être une date valide.',
  isISO8601: 'doit respecter le format de date ISO 8601.',
  isNotEmptyObject: 'ne doit pas être vide.',
  isMilitaryTime: 'doit respecter le format horaire HH:mm.',
  arrayNotEmpty: 'doit contenir au moins un élément.',
  isDateString: 'doit être une date ISO valide.',
  isEnum: 'contient une valeur non autorisée.',
  isIn: 'contient une valeur non autorisée.',
  matches: 'ne respecte pas le format attendu.',
  whitelistValidation: 'n’est pas un champ autorisé.',
  nestedValidation: 'doit contenir un objet ou une liste valide.',
  isUrl: 'doit être une URL valide.',
};

function constraintMessage(key: string, raw: string): string {
  const number = raw.match(
    /(?:at most|at least|less than|greater than|equal to|than|to)\s+(-?\d+(?:\.\d+)?)/i,
  )?.[1];
  switch (key) {
    case 'maxLength':
      return number ? 'ne doit pas dépasser ' + number + ' caractères.' : 'est trop long.';
    case 'minLength':
      return number ? 'doit contenir au moins ' + number + ' caractères.' : 'est trop court.';
    case 'min':
      return number ? 'doit être supérieur ou égal à ' + number + '.' : 'est inférieur au minimum autorisé.';
    case 'max':
      return number ? 'doit être inférieur ou égal à ' + number + '.' : 'dépasse le maximum autorisé.';
    case 'arrayMinSize':
      return number ? 'doit contenir au moins ' + number + ' éléments.' : 'contient trop peu d’éléments.';
    case 'arrayMaxSize':
      return number ? 'ne doit pas dépasser ' + number + ' éléments.' : 'contient trop d’éléments.';
    default:
      return messages[key] ?? 'ne respecte pas les règles de validation.';
  }
}

export function frenchValidationErrors(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((error) => {
    const field = parent
      ? parent + '.' + (labels[error.property] ?? error.property)
      : (labels[error.property] ?? error.property);
    const own = Object.entries(error.constraints ?? {}).map(
      ([key, raw]) => 'Le champ « ' + field + ' » ' + constraintMessage(key, raw),
    );
    return [...own, ...frenchValidationErrors(error.children ?? [], field)];
  });
}
