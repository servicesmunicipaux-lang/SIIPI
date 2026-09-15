import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}. Copiez backend/.env.example vers backend/.env et complétez-le.`);
  }
  return value;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  // Tentatives de connexion autorisées par adresse IP et par quart d'heure.
  // Valeur par défaut volontairement basse (anti-bruteforce). À relever
  // temporairement pour rejouer plusieurs campagnes de tests d'affilée, jamais
  // en production.
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 20),
  isProduction: process.env.NODE_ENV === 'production',
};

if (config.isProduction && config.jwtSecret.startsWith('dev_only')) {
  throw new Error('JWT_SECRET par défaut détecté en production. Définissez un secret fort avant tout déploiement réel.');
}
