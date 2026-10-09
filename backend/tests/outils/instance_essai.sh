# shellcheck shell=bash
# ---------------------------------------------------------------------------
# Une base et une API d'essai, à part, le temps d'une campagne (D-FNCT-5).
#
# POURQUOI À PART. Une base servie une fois en production le reste pour
# toujours (migration 067) : une campagne qui démarrerait une API de production
# sur la base des tests la rendrait définitivement « production », et toutes
# les campagnes suivantes verraient leurs comptes de démonstration refusés.
# Chaque essai de production ou de formation se fait donc sur une base neuve,
# migrée ici, et effacée en partant.
#
# Ce fichier n'est pas une campagne : il est rangé sous tests/outils/ pour que
# le recomptage de CLAUDE.md § 7 (tests/*.sh) ne le compte pas.
#
# Usage, depuis backend/ (la campagne fait « cd "$(dirname "$0")/.." ») et
# après avoir défini T (dossier temporaire) :
#   . tests/outils/instance_essai.sh
#   base_essai siipi_essai_x                  # base neuve, migrée
#   psql_essai siipi_essai_x "SQL"            # une requête sur elle
#   api_essai 4002 siipi_essai_x VAR=val ...  # 0 : elle sert ; 1 : elle a refusé de démarrer
#   arreter_api_essai                         # dans le trap EXIT de la campagne
#   retirer_bases_essai                       # idem
# ---------------------------------------------------------------------------

BASES_ESSAI=""
PID_ESSAI=""
SECRET_ESSAI="essai_jwt_$$_$(date +%s)"

url_essai() { echo "${DATABASE_URL%/*}/$1"; }

psql_essai() {
  psql -q -tA -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${PGUSER:-siipi_admin}" -d "$1" -c "$2" 2>&1
}

base_essai() {
  psql_essai postgres "DROP DATABASE IF EXISTS $1 WITH (FORCE);" >/dev/null
  psql_essai postgres "CREATE DATABASE $1;" >/dev/null
  BASES_ESSAI="$BASES_ESSAI $1"
  if ! DATABASE_URL="$(url_essai "$1")" npm run -s migrate >"$T/migrate_$1.log" 2>&1; then
    echo "La base d'essai $1 n'a pas pu être migrée (voir $T/migrate_$1.log)." >&2
    exit 1
  fi
}

# Démarre une seconde API sur la base donnée, avec les variables passées. Les
# secrets sont propres à l'essai : la configuration refuse ceux du
# développement dès que PRODUCTION ou NODE_ENV=production est posé. Le journal
# est dans $T/api_<port>.log.
api_essai() {
  local port=$1 base=$2
  shift 2
  arreter_api_essai
  env -u PRODUCTION -u FORMATION "$@" \
    DATABASE_URL="$(url_essai "$base")" PORT="$port" \
    JWT_SECRET="$SECRET_ESSAI" SIIPI_SECRET_IDENTITES="essai_identites_$$" \
    npx tsx src/index.ts >"$T/api_$port.log" 2>&1 &
  PID_ESSAI=$!
  for _ in $(seq 1 90); do
    if ! kill -0 "$PID_ESSAI" 2>/dev/null; then
      wait "$PID_ESSAI" 2>/dev/null
      PID_ESSAI=""
      return 1
    fi
    [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$port/instance" 2>/dev/null)" = 200 ] && return 0
    sleep 1
  done
  echo "L'API d'essai n'a ni démarré ni refusé en 90 secondes (voir $T/api_$port.log)." >&2
  return 2
}

arreter_api_essai() {
  if [ -n "$PID_ESSAI" ]; then
    kill "$PID_ESSAI" 2>/dev/null
    wait "$PID_ESSAI" 2>/dev/null
    PID_ESSAI=""
  fi
  return 0
}

retirer_bases_essai() {
  local b
  for b in $BASES_ESSAI; do psql_essai postgres "DROP DATABASE IF EXISTS $b WITH (FORCE);" >/dev/null; done
  BASES_ESSAI=""
  return 0
}
