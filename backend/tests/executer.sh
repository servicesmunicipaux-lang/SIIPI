#!/bin/sh
# ---------------------------------------------------------------------------
# Lanceur des campagnes de tests.
#
# Pourquoi ce fichier existe : l'image de l'API est « node:22-alpine », et
# Alpine n'embarque ni bash ni les outils GNU. Les campagnes échouaient donc
# sur « sh: bash: not found » — c'est-à-dire qu'aucune d'entre elles n'avait
# jamais pu s'exécuter sur le poste, alors que l'en-tête de chaque script
# annonçait « docker compose run --rm api npm run test:... ».
#
# Ce lanceur est écrit en sh POSIX, le seul interpréteur dont on soit sûr. Il
# installe bash et coreutils au besoin — coreutils parce que « date -d
# '-10 days' » est une extension GNU que la date de BusyBox ne comprend pas, et
# que les tests de période en dépendent pour construire leurs dates.
#
#   sh tests/executer.sh module2
# ---------------------------------------------------------------------------
set -u

campagne="${1:-}"
if [ -z "$campagne" ]; then
  echo "Usage : sh tests/executer.sh <nom de campagne>" >&2
  exit 2
fi

fichier="$(dirname "$0")/${campagne}.sh"
if [ ! -f "$fichier" ]; then
  echo "Campagne introuvable : $fichier" >&2
  exit 2
fi

manquants=''
command -v bash   >/dev/null 2>&1 || manquants="$manquants bash"
command -v psql   >/dev/null 2>&1 || manquants="$manquants postgresql-client"
# curl : chaque campagne interroge l'API par son intermédiaire. Il manquait à
# la première liste, si bien que les campagnes échouaient sur « curl: command
# not found » APRÈS avoir installé bash — une correction à moitié faite vaut
# une correction ratée, puisque le résultat visible reste le même.
command -v curl   >/dev/null 2>&1 || manquants="$manquants curl"
command -v python3 >/dev/null 2>&1 || manquants="$manquants python3"
date -d '-1 day'  >/dev/null 2>&1 || manquants="$manquants coreutils"

if [ -n "$manquants" ]; then
  if command -v apk >/dev/null 2>&1; then
    echo "[tests] installation de :$manquants"
    # shellcheck disable=SC2086
    apk add --no-cache $manquants >/dev/null 2>&1 || {
      echo "[tests] l'installation a échoué. Les campagnes ont besoin de :$manquants" >&2
      exit 3
    }
  else
    echo "[tests] outils manquants, et apk est absent :$manquants" >&2
    exit 3
  fi
fi

# --- Connexion à la base -----------------------------------------------------
#
# Les campagnes interrogent la base directement avec psql, pour vérifier ce que
# l'API a réellement écrit plutôt que ce qu'elle prétend avoir écrit. Elles ont
# donc besoin des variables PG*. Dans le conteneur, la seule information
# disponible est DATABASE_URL : on en déduit le reste, au lieu d'obliger à
# répéter cinq variables sur la ligne de commande — et d'échouer sur un mot de
# passe manquant après avoir installé tous les outils.
if [ -n "${DATABASE_URL:-}" ]; then
  reste="${DATABASE_URL#*://}"          # siipi_admin:motdepasse@db:5432/base
  identifiants="${reste%%@*}"
  hote_base="${reste#*@}"               # db:5432/base
  [ -z "${PGUSER:-}" ]     && PGUSER="${identifiants%%:*}"           && export PGUSER
  case "$identifiants" in
    *:*) [ -z "${PGPASSWORD:-}" ] && PGPASSWORD="${identifiants#*:}" && export PGPASSWORD ;;
  esac
  hote_port="${hote_base%%/*}"
  [ -z "${PGDATABASE:-}" ] && PGDATABASE="${hote_base#*/}"           && export PGDATABASE
  PGDATABASE="${PGDATABASE%%\?*}"      && export PGDATABASE          # sans les paramètres éventuels
  [ -z "${PGHOST:-}" ]     && PGHOST="${hote_port%%:*}"              && export PGHOST
  case "$hote_port" in
    *:*) [ -z "${PGPORT:-}" ] && PGPORT="${hote_port#*:}"            && export PGPORT ;;
  esac
fi

# L'API répond sur le réseau Compose sous son propre nom de service.
[ -z "${API_URL:-}" ] && API_URL="http://localhost:4000" && export API_URL

echo "[tests] base ${PGUSER:-?}@${PGHOST:-?}:${PGPORT:-5432}/${PGDATABASE:-?} — API $API_URL"
exec bash "$fichier"
