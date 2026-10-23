#!/usr/bin/env bash
# =============================================================================
# v0.15.72 — chantier P, lot P4 : le frontal HTTPS.
# DECISIONS_2026-10-20.md § 4 et complément du 23/10/2026 (Caddy) ;
# exploitation/frontal/Caddyfile ; config.trustProxy (src/config.ts).
#
# La campagne éprouve LE Caddyfile du dépôt, avec un vrai Caddy, en HTTPS (son
# autorité locale), devant une API à part sur une base d'essai.
#
# Elle commence par ce qui est refusé : HTTP renvoie vers HTTPS ; un appelant
# qui forge X-Forwarded-For à travers Caddy n'échappe pas à la limite des
# tentatives de connexion ; sans proxy de confiance, l'API ignore cet en-tête ;
# TRUST_PROXY=true est refusé au démarrage. Puis ce qui doit marcher : l'API à
# /api, le front à /, une adresse inconnue qui rend l'index (application d'une
# page), les en-têtes de cache et de sécurité, et surtout DEUX appelants
# réels derrière le proxy qui ont chacun LEUR limite — sans quoi, derrière
# Caddy, la limite deviendrait celle de tout le pays.
#
#   docker compose exec -T api npm run test:proxy-https
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
pass=0; fail=0
T=$(mktemp -d)
BASE=siipi_essai_proxy
PORT_ESSAI=4011
API_ESSAI="http://localhost:$PORT_ESSAI"
HTTP=8081
HTTPS=8444
SITE="https://localhost:$HTTPS"
PID_CADDY=""
CA=""
. tests/outils/instance_essai.sh
arreter_caddy() { [ -n "$PID_CADDY" ] && { kill "$PID_CADDY" 2>/dev/null; wait "$PID_CADDY" 2>/dev/null; PID_CADDY=""; }; return 0; }
fin() { arreter_caddy; arreter_api_essai; retirer_bases_essai; rm -rf "$T"; }
trap fin EXIT

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

command -v caddy >/dev/null 2>&1 || apk add -q --no-cache caddy >/dev/null 2>&1 || { echo "Caddy introuvable." >&2; exit 1; }

# Un front construit, en miniature : l'index, le service worker, un fichier à empreinte.
mkdir -p "$T/racine/assets"
printf '<!doctype html><title>SIIPI</title><div id="racine">INDEX-SIIPI</div>\n' > "$T/racine/index.html"
printf 'self.addEventListener("fetch", () => {});\n' > "$T/racine/sw.js"
printf 'console.log("app");\n' > "$T/racine/assets/app-3f9a2c.js"

# Une connexion qui échoue (compte inconnu) : 401, puis 429 quand la limite est atteinte.
connexion() { # url [X-Forwarded-For]
  curl -s -o /dev/null -w '%{http_code}' ${CA:+--cacert "$CA"} -X POST "$1/auth/login" \
    -H 'Content-Type: application/json' ${2:+-H "X-Forwarded-For: $2"} \
    -d '{"email":"inconnu.proxy@siipi.tn","password":"pas-le-bon-1"}'
}
quatre() { # url [xff] — les codes des quatre tentatives
  local i r=''
  for i in 1 2 3 4; do r="$r$(connexion "$1" "${2:-}") "; done
  echo "${r% }"
}
entete() { curl -s -D - -o /dev/null --cacert "$T/ca.crt" "$SITE$1" | tr -d '\r' | grep -i "^$2:" | head -1 | cut -d' ' -f2-; }

base_essai "$BASE"

echo "1. Ce qui est refusé au démarrage"
api_essai "$PORT_ESSAI" "$BASE" TRUST_PROXY=true; CODE=$?
chk "TRUST_PROXY=true : l'API refuse de démarrer" 1 "$CODE"
chk "… et dit quoi mettre à la place" 1 "$(grep -c '1 derrière Caddy' "$T/api_$PORT_ESSAI.log")"

echo "2. Sans proxy de confiance, X-Forwarded-For est ignoré"
api_essai "$PORT_ESSAI" "$BASE" AUTH_RATE_LIMIT_MAX=3; CODE=$?
chk "l'API d'essai démarre, sans TRUST_PROXY" 0 "$CODE"
chk "quatre tentatives qui changent d'en-tête : la quatrième est refusée" "401 401 401 429" \
    "$(for x in 198.51.100.1 198.51.100.2 198.51.100.3 198.51.100.4; do printf '%s ' "$(connexion "$API_ESSAI" "$x")"; done | sed 's/ $//')"

echo "3. Derrière Caddy"
api_essai "$PORT_ESSAI" "$BASE" AUTH_RATE_LIMIT_MAX=3 TRUST_PROXY=1; CODE=$?
chk "l'API d'essai démarre, TRUST_PROXY=1" 0 "$CODE"
SIIPI_DOMAINE=localhost SIIPI_TLS=internal SIIPI_API="localhost:$PORT_ESSAI" SIIPI_RACINE="$T/racine" \
  SIIPI_PORT_HTTP=$HTTP SIIPI_PORT_HTTPS=$HTTPS XDG_DATA_HOME="$T/donnees" XDG_CONFIG_HOME="$T/config" \
  caddy run --config exploitation/frontal/Caddyfile --adapter caddyfile >"$T/caddy.log" 2>&1 &
PID_CADDY=$!
for _ in $(seq 1 30); do
  [ -f "$T/donnees/caddy/pki/authorities/local/root.crt" ] && curl -s -o /dev/null --cacert "$T/donnees/caddy/pki/authorities/local/root.crt" "$SITE/" && break
  sleep 1
done
cp "$T/donnees/caddy/pki/authorities/local/root.crt" "$T/ca.crt" 2>/dev/null
CA="$T/ca.crt"
chk "Caddy sert en HTTPS, avec un certificat vérifié (son autorité locale)" 200 \
    "$(curl -s -o /dev/null -w '%{http_code}' --cacert "$T/ca.crt" "$SITE/")"
# Caddy renvoie vers le port HTTPS standard (443), celui de la production ; l'essai, lui, écoute ailleurs.
chk "HTTP renvoie vers HTTPS (308), même chemin" "308|https://localhost/communes" \
    "$(curl -s -o /dev/null -w '%{http_code}|%{redirect_url}' "http://localhost:$HTTP/communes")"
chk "l'API répond à /api, préfixe retiré" ok "$(curl -s --cacert "$T/ca.crt" "$SITE/api/health" | jq -r .status)"
chk "le front est servi à /" 1 "$(curl -s --cacert "$T/ca.crt" "$SITE/" | grep -c INDEX-SIIPI)"
chk "une adresse inconnue rend l'index (application d'une seule page)" 1 \
    "$(curl -s --cacert "$T/ca.crt" "$SITE/observatoire/bibliotheque" | grep -c INDEX-SIIPI)"
chk "le service worker n'est jamais mis en cache" no-cache "$(entete /sw.js cache-control)"
chk "un fichier construit se garde longtemps" "public, max-age=31536000, immutable" "$(entete /assets/app-3f9a2c.js cache-control)"
chk "HSTS est posé" "max-age=31536000" "$(entete / strict-transport-security)"
chk "Caddy ne dit pas ce qu'il est" "" "$(entete / server)"
chk "les en-têtes de sécurité de l'API passent (helmet)" 1 \
    "$(curl -s -D - -o /dev/null --cacert "$T/ca.crt" "$SITE/api/health" | grep -ci '^content-security-policy:')"

echo "4. La limite des tentatives de connexion, appelant par appelant"
chk "à travers Caddy, un en-tête forgé n'échappe pas à la limite" "401 401 401 429" \
    "$(for x in 198.51.100.11 198.51.100.12 198.51.100.13 198.51.100.14; do printf '%s ' "$(connexion "$SITE/api" "$x")"; done | sed 's/ $//')"
# Ce que Caddy transmet pour deux appelants réels : chacun son adresse dans X-Forwarded-For.
chk "un premier appelant réel épuise SA limite" "401 401 401 429" "$(quatre "$API_ESSAI" 203.0.113.7)"
chk "… un second appelant garde la sienne" "401 401 401 429" "$(quatre "$API_ESSAI" 203.0.113.8)"

echo "5. En partant"
arreter_caddy
arreter_api_essai
retirer_bases_essai
chk "Caddy et l'API d'essai sont arrêtés, la base retirée" "000|0" \
    "$(curl -s -o /dev/null -w '%{http_code}' --cacert "$T/ca.crt" "$SITE/")|$(psql_essai postgres "SELECT count(*) FROM pg_database WHERE datname = '$BASE'")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
