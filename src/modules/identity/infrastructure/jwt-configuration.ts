type JwtSecretName = 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET';

export function validatedJwtSecrets(env: NodeJS.ProcessEnv): Record<JwtSecretName, string> {
  const read = (name: JwtSecretName): string => {
    const secret = env[name];
    if (!secret || secret.length < 32 || secret !== secret.trim() || /^REMPLACER_PAR_/i.test(secret))
      throw new Error(
        `Configuration requise : ${name} (secret distinct de 32 caractères minimum, hors exemple).`,
      );
    return secret;
  };
  const access = read('JWT_ACCESS_SECRET');
  const refresh = read('JWT_REFRESH_SECRET');
  if (access === refresh) throw new Error('Les secrets JWT doivent être distincts.');
  return { JWT_ACCESS_SECRET: access, JWT_REFRESH_SECRET: refresh };
}
