import { describe, expect, it } from 'vitest';
import { apiPath, isInternalApi, parseErrorMessage, decodeSuccessMessage } from './api-contract';
import { parseAuthResult, hasPermissions } from '../../features/auth/domain/auth.contract';
import { formatMoney, parseOverview } from '../../features/dashboard/domain/dashboard.contract';
describe('Contrats backend',()=>{
it('limite les jetons aux routes internes',()=>{expect(apiPath('/auth/login')).toBe('/api/v1/auth/login');expect(isInternalApi('https://exemple.test/api/v1/auth/me')).toBe(false);expect(isInternalApi('/api/v1/../externe')).toBe(false);expect(()=>apiPath('//exemple.test')).toThrow();});
it('préserve les erreurs françaises et masque les erreurs serveur',()=>{expect(parseErrorMessage({message:['Champ invalide.','Date obligatoire.']},400)).toBe('Champ invalide. Date obligatoire.');expect(parseErrorMessage({message:'secret'},500)).not.toContain('secret');expect(decodeSuccessMessage('Cr%C3%A9%C3%A9')).toBe('Créé');expect(decodeSuccessMessage('%')).toBeNull();});
it('respecte les clés exactes de l’identité et les permissions',()=>{const session=parseAuthResult({jetonAcces:'a',jetonRenouvellement:'r',utilisateur:{id:'id',email:'a@example.test',nomComplet:'Test',permissions:['inventory.read'],magasinsAutorises:[]}});expect(hasPermissions(session.utilisateur,['inventory.read'])).toBe(true);expect(hasPermissions(session.utilisateur,['sales.read'])).toBe(false);expect(()=>parseAuthResult({accessToken:'a'})).toThrow();});
it('affiche les montants sans conversion flottante',()=>{expect(formatMoney('9007199254740993.01')).toBe('9\u202f007\u202f199\u202f254\u202f740\u202f993,01 FCFA');expect(()=>parseOverview({stores:0})).toThrow();});
});
