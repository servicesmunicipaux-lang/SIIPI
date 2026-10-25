import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}. Copiez backend/.env.example vers backend/.env et complétez-le.`);
  }
  return value;
}

/**
 * TRUST_PROXY : vide → aucun proxy ; un nombre → autant de proxys de confiance ;
 * sinon, des adresses ou des réseaux (« loopback », « 10.0.0.0/8 »), comme Express
 * les lit. « true » est refusé : il ferait confiance à n'importe quel appelant, qui
 * choisirait alors son adresse — et sa limite de tentatives de connexion.
 */
function lireTrustProxy(valeur: string | undefined): false | number | string {
  const v = (valeur ?? '').trim();
  if (!v || ['false', '0', 'non', 'no'].includes(v.toLowerCase())) return false;
  if (/^\d+$/.test(v)) return Number(v);
  if (['true', 'oui', 'yes'].includes(v.toLowerCase())) {
    throw new Error(
      'TRUST_PROXY=true ferait confiance à tout appelant, qui choisirait son adresse. ' +
        'Indiquez le nombre de proxys devant l’API (1 derrière Caddy), ou leurs adresses.'
    );
  }
  return v;
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
  // Le proxy HTTPS de production (Caddy, chantier P, lot P4) : derrière lui,
  // toutes les requêtes viennent de SON adresse, et la limite ci-dessus
  // deviendrait 20 tentatives pour tout le pays. TRUST_PROXY dit combien de
  // proxys de confiance précèdent l'API (1 derrière Caddy) : l'adresse réelle
  // se lit alors dans X-Forwarded-For, que Caddy réécrit. Vide (le poste de
  // développement, l'API servie directement) : l'en-tête est ignoré, et un
  // appelant ne peut pas se faire passer pour une autre adresse.
  trustProxy: lireTrustProxy(process.env.TRUST_PROXY),
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
  // La clé des secrets GPS (lot 17.4a) : le jeton d'un fournisseur et le secret de
  // son webhook sont chiffrés avec elle avant d'entrer en base. Hors de la base,
  // jamais dans le dépôt : une sauvegarde volée ne livre aucun jeton.
  secretGps: process.env.SIIPI_SECRET_GPS ?? 'dev_only_secret_gps_a_remplacer',
  gps: {
    /** Le planificateur des interrogations (pull) : actif en production, éteint par défaut ailleurs. */
    planificateur: process.env.SIIPI_GPS_PLANIFICATEUR === 'active',
    /** Secondes entre deux tours du planificateur ; chaque fournisseur garde sa propre cadence. */
    ticSecondes: Number(process.env.SIIPI_GPS_TIC_S ?? 60),
    /** Envois de webhook acceptés par fournisseur et par minute. */
    webhookParMinute: Number(process.env.SIIPI_GPS_WEBHOOK_MAX ?? 120),
  },
  // Le courriel (décision du 16/10/2026 : « courriel d'abord »). Un serveur
  // SMTP que l'exploitant désigne ; sans SMTP_HOST, rien ne part et la
  // plateforme le dit (« non configuré ») — jamais un envoi supposé réussi.
  courriel: {
    hote: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    /** starttls (587), tls (465) ou aucune (un relais local, ou le banc d'essai). */
    securite: (process.env.SMTP_SECURITE ?? 'starttls') as 'starttls' | 'tls' | 'aucune',
    utilisateur: process.env.SMTP_UTILISATEUR ?? '',
    motDePasse: process.env.SMTP_MOT_DE_PASSE ?? '',
    expediteur: process.env.COURRIEL_EXPEDITEUR ?? 'SIIPI <ne-pas-repondre@siipi.tn>',
    /** L'adresse du portail, citée dans les courriels (« connectez-vous sur … »). */
    portail: process.env.COURRIEL_URL_PORTAIL ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  },
};

if (config.isProduction && config.jwtSecret.startsWith('dev_only')) {
  throw new Error('JWT_SECRET par défaut détecté en production. Définissez un secret fort avant tout déploiement réel.');
}
if (config.isProduction && config.secretGps.startsWith('dev_only')) {
  throw new Error('SIIPI_SECRET_GPS par défaut détecté en production. Définissez un secret fort (openssl rand -hex 32) avant tout déploiement réel.');
}
if (config.isProduction && config.secretIdentites.startsWith('dev_only')) {
  throw new Error('SIIPI_SECRET_IDENTITES par défaut détecté en production. Définissez un secret fort (openssl rand -hex 32) avant tout déploiement réel.');
}
