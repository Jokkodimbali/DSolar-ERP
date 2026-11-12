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
    expect(passwords.verify).not.toHaveBeenCalled();
  });
  it('révoque uniquement le refresh token correspondant lors de la déconnexion', async () => {
    tokens.verifyRefresh.mockResolvedValue({ sub: 'user-1', sid: 'session-1', typ: 'refresh' });
    sessions.revokeIfHash.mockResolvedValue(undefined);
    await expect(useCases.logout('ancien-token')).resolves.toEqual({ message: 'Déconnexion effectuée.' });
    expect(sessions.revokeIfHash).toHaveBeenCalledWith('session-1', expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(sessions.revoke).not.toHaveBeenCalled();
  });
});
