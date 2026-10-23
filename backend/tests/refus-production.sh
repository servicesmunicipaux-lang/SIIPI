#!/usr/bin/env bash
# =============================================================================
# v0.15.69 — chantier P, lot P1 : les campagnes refusent une base de production.
# DECISIONS_2026-10-20.md § 4 (« Refus ») et ses recommandations du 23/10/2026.
#
# Une campagne bâtit des communes et des comptes de test, et rend les tables
# nationales qu'elle a modifiées : sur une base de production, même en effaçant
# ses lignes, elle laisserait son passage au journal d'audit, et une table
# nationale rendue « ligne entière » porterait la date des campagnes. Sur une
# base de formation, elle poserait ses communes de test au milieu d'agents en
# formation. Le lanceur (tests/executer.sh) lit donc, avant toute campagne, la
# nature de la base (app.nature_instance(), migration 067) ET celle de l'API
# (GET /instance) : il ne laisse partir une campagne que si les deux disent
# « développement ». Une nature illisible, une API injoignable : refus aussi —
# un lanceur qui ne sait pas où il est ne part pas. Code de sortie 5.
#
# La campagne commence par ce que le lanceur REFUSE, sur des bases d'essai à
# part (tests/outils/instance_essai.sh), rendues production et formation par
# leur propre API, comme sur un serveur réel. Chaque refus est éprouvé par une
# fausse campagne (tests/outils/sonde_lanceur.sh) qui écrirait dans sa base :
# après un refus, la base n'a pas bougé. Puis ce qu'il laisse partir : la même
# sonde, sur une base de développement, y écrit.
#
#   docker compose exec -T api npm run test:refus-production
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PORT_ESSAI=4008
API_ESSAI="http://localhost:$PORT_ESSAI"
pass=0; fail=0
T=$(mktemp -d)
DEV=siipi_essai_refus_dev
PROD=siipi_essai_refus_prod
FORM=siipi_essai_refus_form
. tests/outils/instance_essai.sh
fin() {
  arreter_api_essai
  retirer_bases_essai
  rm -rf "$T"
}
trap fin EXIT

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
# Le lanceur, sur une base et une API données ; code de sortie, messages dans $T/lanceur.log.
lancer() {
  PGDATABASE="$1" API_URL="$2" sh tests/executer.sh outils/sonde_lanceur >"$T/lanceur.log" 2>&1
  echo $?
}
# La sonde a-t-elle écrit dans cette base ? (« f » : la table n'existe pas)
sonde() { psql_essai "$1" "SELECT to_regclass('sonde_lanceur') IS NOT NULL"; }
journal() { psql_essai "$1" "SELECT count(*) FROM audit_log"; }
dit() { grep -c "$1" "$T/lanceur.log"; }

[ "$(curl -s -o /dev/null -w '%{http_code}' "$API/instance")" = 200 ] || { echo "API injoignable sur $API." >&2; exit 1; }
base_essai "$DEV"
base_essai "$PROD"
base_essai "$FORM"

echo "1. Une base de production : refusée"
api_essai "$PORT_ESSAI" "$PROD" PRODUCTION=true; CODE=$?
chk "l'API de production d'essai a démarré" 0 "$CODE"
chk "… et sa base est devenue une base de production" production "$(psql_essai "$PROD" "SELECT app.nature_instance()")"
AVANT=$(journal "$PROD")
chk "le lanceur refuse la base de production (code 5)" 5 "$(lancer "$PROD" "$API")"
chk "… en nommant ce qu'elle est" 1 "$(dit "base de production")"
chk "… et en disant où lancer les campagnes" 1 "$(dit "pile d'essai")"
chk "la fausse campagne n'est pas partie : rien n'est écrit dans la base de production" "f|0" \
    "$(sonde "$PROD")|$(dit 'SONDE')"
chk "… pas une ligne de plus au journal d'audit" "$AVANT" "$(journal "$PROD")"

echo "2. Une API de production devant une base de développement : refusée"
chk "le lanceur refuse l'API de production (code 5)" 5 "$(lancer "$DEV" "$API_ESSAI")"
chk "… en nommant l'API" 1 "$(dit "l'API $API_ESSAI sert une instance de production")"
chk "rien n'est écrit dans la base de développement" f "$(sonde "$DEV")"

echo "3. Une base de formation : refusée"
api_essai "$PORT_ESSAI" "$FORM" FORMATION=true; CODE=$?
chk "l'API de formation d'essai a démarré" 0 "$CODE"
chk "… et sa base est devenue une base de formation" formation "$(psql_essai "$FORM" "SELECT app.nature_instance()")"
AVANT=$(journal "$FORM")
chk "le lanceur refuse la base de formation (code 5)" 5 "$(lancer "$FORM" "$API")"
chk "… en nommant ce qu'elle est" 1 "$(dit "base de formation")"
chk "rien n'est écrit dans la base de formation" "f|$AVANT" "$(sonde "$FORM")|$(journal "$FORM")"
chk "le lanceur refuse l'API de formation devant une base de développement (code 5)" 5 "$(lancer "$DEV" "$API_ESSAI")"
chk "rien n'est écrit dans la base de développement" f "$(sonde "$DEV")"

echo "4. Un lanceur qui ne sait pas où il est ne part pas"
arreter_api_essai
chk "API injoignable : refus (code 5)" 5 "$(lancer "$DEV" "$API_ESSAI")"
chk "… et il le dit" 1 "$(dit "injoignable")"
chk "base introuvable : refus (code 5)" 5 "$(lancer siipi_essai_refus_absente "$API")"
chk "… et il le dit" 1 "$(dit "illisible")"
chk "rien n'est écrit dans la base de développement" f "$(sonde "$DEV")"

echo "5. Une base et une API de développement : la campagne part"
chk "le lanceur laisse partir la fausse campagne (code 0)" 0 "$(lancer "$DEV" "$API")"
chk "… qui a écrit dans sa base" "t|1" "$(sonde "$DEV")|$(psql_essai "$DEV" "SELECT count(*) FROM sonde_lanceur")"
chk "la base de développement l'est restée" developpement "$(psql_essai "$DEV" "SELECT app.nature_instance()")"

echo "6. En partant"
arreter_api_essai
retirer_bases_essai
chk "les bases d'essai sont retirées, l'API d'essai arrêtée" "0|000" \
    "$(psql_essai postgres "SELECT count(*) FROM pg_database WHERE datname LIKE 'siipi_essai_refus_%'")|$(curl -s -o /dev/null -w '%{http_code}' "$API_ESSAI/instance")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
