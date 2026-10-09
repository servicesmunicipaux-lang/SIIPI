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
  // L'image de production, ou PRODUCTION=true (D-FNCT-5) : les secrets de
  // développement y sont refusés. Ce que la base EST — production, formation,
  // développement — se lit dans src/instance.ts, qui a le dernier mot.
  isProduction:
    process.env.NODE_ENV === 'production' ||
    ['true', '1', 'oui', 'yes'].includes((process.env.PRODUCTION ?? '').trim().toLowerCase()),
  // Notifications push (Jalon 2, lot 1) : une paire de clés VAPID identifie
  // le serveur auprès des navigateurs, comme un certificat auto-signé — ce
  // n'est pas un secret d'authentification, et son absence ne doit pas
  // empêcher le reste de l'API de démarrer. Sans elle, le service d'émission
  // consigne un échec au lieu d'envoyer, plutôt que de faire échouer
  // l'application entière pour une fonctionnalité qui reste best-effort.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:contact@fnct.tn',
  // Le secret maître des empreintes de CIN (lot 16.1, SPEC_v0.16 R1). Un CIN
  // compte 8 chiffres : un hachage simple s'énumère en secondes. L'empreinte
  // n'a de valeur que si sa clé est hors de la base — ici, dans
  // l'environnement, jamais en base ni dans le dépôt.
  secretIdentites: process.env.SIIPI_SECRET_IDENTITES ?? 'dev_only_secret_identites_a_remplacer',
};

if (config.isProduction && config.jwtSecret.startsWith('dev_only')) {
  throw new Error('JWT_SECRET par défaut détecté en production. Définissez un secret fort avant tout déploiement réel.');
}
if (config.isProduction && config.secretIdentites.startsWith('dev_only')) {
  throw new Error('SIIPI_SECRET_IDENTITES par défaut détecté en production. Définissez un secret fort (openssl rand -hex 32) avant tout déploiement réel.');
}
