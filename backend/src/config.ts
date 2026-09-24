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
  // Notifications push (Jalon 2, lot 1) : une paire de clés VAPID identifie
  // le serveur auprès des navigateurs, comme un certificat auto-signé — ce
  // n'est pas un secret d'authentification, et son absence ne doit pas
  // empêcher le reste de l'API de démarrer. Sans elle, le service d'émission
  // consigne un échec au lieu d'envoyer, plutôt que de faire échouer
  // l'application entière pour une fonctionnalité qui reste best-effort.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:contact@fnct.tn',
};

if (config.isProduction && config.jwtSecret.startsWith('dev_only')) {
  throw new Error('JWT_SECRET par défaut détecté en production. Définissez un secret fort avant tout déploiement réel.');
}
