import { UnauthorizedException } from '@nestjs/common';
import { AuthUseCases } from './auth.use-cases';
import { PasswordService, SessionRepository, TokenService, UserRepository } from './ports';

describe('AuthUseCases', () => {
  const users = { findByEmail: jest.fn(), findById: jest.fn() } as jest.Mocked<UserRepository>;
  const sessions = {
    create: jest.fn(),
    findById: jest.fn(),
    rotate: jest.fn(),
    revoke: jest.fn(),
    revokeIfHash: jest.fn(),
    revokeAllForUser: jest.fn(),
  } as jest.Mocked<SessionRepository>;
  const passwords = { verify: jest.fn(), hash: jest.fn() } as jest.Mocked<PasswordService>;
  const tokens = {
    signAccess: jest.fn(),
    signRefresh: jest.fn(),
    verifyAccess: jest.fn(),
    verifyRefresh: jest.fn(),
  } as jest.Mocked<TokenService>;
  const useCases = new AuthUseCases(users, sessions, passwords, tokens);
  beforeEach(() => jest.resetAllMocks());
  it('refuse un utilisateur inconnu', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(useCases.login('inconnu@exemple.sn', 'motdepasse')).rejects.toThrow(UnauthorizedException);
    expect(passwords.verify).toHaveBeenCalledWith(expect.stringMatching(/^\$argon2id\$/), 'motdepasse');
    expect(sessions.create).not.toHaveBeenCalled();
  });
  it('refuse un compte désactivé', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'u',
      email: 'a@b.sn',
      fullName: 'Test',
      passwordHash: 'hash',
      status: 'DISABLED',
      tokenVersion: 0,
      permissions: [],
      storeIds: [],
    });
    await expect(useCases.login('a@b.sn', 'secret')).rejects.toThrow(UnauthorizedException);
    expect(passwords.verify).toHaveBeenCalledWith(expect.stringMatching(/^\$argon2id\$/), 'secret');
    expect(sessions.create).not.toHaveBeenCalled();
  });
  it('ne crée jamais de session si le hash factice correspond', async () => {
    users.findByEmail.mockResolvedValue(null);
    passwords.verify.mockResolvedValue(true);
    await expect(useCases.login('inconnu@exemple.sn', 'secret')).rejects.toThrow(UnauthorizedException);
    expect(sessions.create).not.toHaveBeenCalled();
  });
  it('ne confirme pas une déconnexion lorsque la révocation en base échoue', async () => {
    tokens.verifyRefresh.mockResolvedValue({ sub: 'user-1', sid: 'session-1', typ: 'refresh' });
    sessions.revokeIfHash.mockRejectedValue(new Error('Database unavailable'));
    await expect(useCases.logout('token-valide')).rejects.toThrow('Database unavailable');
  });
  it('reste idempotent avec un jeton invalide', async () => {
    tokens.verifyRefresh.mockRejectedValue(new Error('Invalid token'));
    await expect(useCases.logout('invalid')).resolves.toEqual({ message: 'Déconnexion effectuée.' });
    expect(sessions.revokeIfHash).not.toHaveBeenCalled();
  });
  it('révoque uniquement le refresh token correspondant lors de la déconnexion', async () => {
    tokens.verifyRefresh.mockResolvedValue({ sub: 'user-1', sid: 'session-1', typ: 'refresh' });
    sessions.revokeIfHash.mockResolvedValue(undefined);
    await expect(useCases.logout('ancien-token')).resolves.toEqual({ message: 'Déconnexion effectuée.' });
    expect(sessions.revokeIfHash).toHaveBeenCalledWith('session-1', expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(sessions.revoke).not.toHaveBeenCalled();
  });
});
