#!/usr/bin/env bash
# =============================================================================
# v0.15.71 — chantier P, lot P3 : la restauration testée.
# DECISIONS_2026-10-20.md § 4 : « une campagne restaure la dernière sauvegarde
# sur une base neuve et vérifie que les recomptages sont identiques ».
# exploitation/sauvegarde/restaurer.sh.
#
# Elle commence par ce que la restauration REFUSE : une base cible qui existe
# (elle n'écrase jamais rien), un dossier de fichiers non vide, une autre clé,
# une archive abîmée d'un octet, un fichier qui n'est pas une archive — et,
# chaque fois, ni base ni fichier laissés derrière. Puis un manifeste qui ne
# correspond pas à ce qui est restauré : l'écart est nommé, la base retirée.
# Puis elle restaure : une base d'essai bâtie exprès (lignes connues, fichiers,
# chacune des deux clés, une API qui démarre dessus), une sauvegarde de
# production qui reste une base de production (et que le lanceur des campagnes
# refuse), et la base des campagnes elle-même — sauvegardée en lecture seule,
# restaurée à part, comparée table par table.
#
#   docker compose exec -T api npm run test:restauration
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
pass=0; fail=0
T=$(mktemp -d)
SOURCE=siipi_essai_restau_source
CIBLE=siipi_essai_restau_cible
SAUVER=exploitation/sauvegarde/sauvegarder.sh
RESTAURER=exploitation/sauvegarde/restaurer.sh
PSQL_BANC="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
BANC_BASE="${PGDATABASE:-siipi_national}"
PORT_ESSAI=4009
. tests/outils/instance_essai.sh
fin() { arreter_api_essai; retirer_bases_essai; rm -rf "$T"; }
trap fin EXIT

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

manquants=''
for outil in age rclone jq; do command -v "$outil" >/dev/null 2>&1 || manquants="$manquants $outil"; done
tar --version 2>/dev/null | grep -q GNU || manquants="$manquants tar"
[ -x /usr/libexec/postgresql16/pg_dump ] || manquants="$manquants postgresql16-client"
if [ -n "$manquants" ]; then
  # shellcheck disable=SC2086
  apk add -q --no-cache $manquants >/dev/null 2>&1 || { echo "Outils introuvables :$manquants" >&2; exit 1; }
fi
# Les outils PostgreSQL de la version du serveur, comme dans l'image de sauvegarde : le
# pg_dump du conteneur des campagnes (plus récent) écrit des réglages qu'un serveur 16
# refuse à la restauration (« transaction_timeout »).
export PATH="/usr/libexec/postgresql16:$PATH"
[ "$(pg_dump --version | grep -o ' 16\.')" = ' 16.' ] || { echo "pg_dump 16 introuvable." >&2; exit 1; }

age-keygen -o "$T/cle1" 2>/dev/null; age-keygen -o "$T/cle2" 2>/dev/null; age-keygen -o "$T/cle3" 2>/dev/null
PUB1=$(age-keygen -y "$T/cle1"); PUB2=$(age-keygen -y "$T/cle2")

# Une sauvegarde de la base et du dossier donnés ; l'archive dans $T/s/<dossier>.
sauver() { # base dossier_fichiers nom_du_dossier_de_sauvegarde
  env PGDATABASE="$1" SAUVEGARDE_DESTINATAIRES="$PUB1,$PUB2" SAUVEGARDE_INSTANCE=campagne \
      SAUVEGARDE_DOSSIER="$T/s/$3" SIIPI_FICHIERS_DIR="$2" SIIPI_ARCHIVE_DIR="$T/aucune" SAUVEGARDE_DESTINATION= \
      bash "$SAUVER" >"$T/sauver.log" 2>&1 || { echo "La sauvegarde de $1 a échoué :" >&2; cat "$T/sauver.log" >&2; exit 1; }
  ls -1 "$T/s/$3"/*.tar | tail -1
}
# Une restauration : code de sortie ; le rapport dans $T/rapport.json, les messages dans $T/restaurer.log.
restaurer() {
  rm -f "$T/rapport.json"
  RESTAURATION_RAPPORT="$T/rapport.json" bash "$RESTAURER" "$@" >"$T/restaurer.log" 2>&1
  echo $?
}
existe() { psql_essai postgres "SELECT count(*) FROM pg_database WHERE datname = '$1'"; }
vide() { [ -z "$(ls -A "$1" 2>/dev/null)" ] && echo vide || echo plein; }
dit() { grep -c "$1" "$T/restaurer.log"; }

base_essai "$SOURCE"
# Les bases que les restaurations peuvent créer, retirées en partant quoi qu'il arrive. Inscrites
# ici : restaurer() tourne dans une sous-commande, qui ne rendrait pas la liste.
BASES_ESSAI="$BASES_ESSAI ${CIBLE}_x ${CIBLE}_faux $CIBLE ${CIBLE}_2 ${CIBLE}_prod ${CIBLE}_banc"
psql_essai "$SOURCE" "CREATE TABLE temoin_restauration (n int, lieu geometry(Point, 4326));
  INSERT INTO temoin_restauration SELECT g, ST_SetSRID(ST_MakePoint(10 + g / 100.0, 36), 4326) FROM generate_series(1, 41) g;" >/dev/null
mkdir -p "$T/fichiers/2026/10" "$T/plein"
printf 'photo témoin\n' > "$T/fichiers/2026/10/photo-temoin.jpg"
printf 'document\n' > "$T/fichiers/2026/10/rapport final.pdf"
head -c 300000 /dev/urandom > "$T/fichiers/gros.bin"
printf 'x\n' > "$T/fichiers/racine.txt"
printf 'déjà là\n' > "$T/plein/existant.txt"
ARCHIVE=$(sauver "$SOURCE" "$T/fichiers" source)

echo "1. Ce que la restauration refuse"
chk "sans arguments : refus" 1 "$(restaurer)"
chk "une base cible qui existe déjà : refus" 1 "$(restaurer "$ARCHIVE" "$T/cle1" "$SOURCE" "$T/r0")"
chk "… elle le dit, et la base existante n'est pas touchée" "1|41" \
    "$(dit 'existe déjà')|$(psql_essai "$SOURCE" 'SELECT count(*) FROM temoin_restauration')"
chk "un dossier de fichiers non vide : refus" 1 "$(restaurer "$ARCHIVE" "$T/cle1" ${CIBLE}_x "$T/plein")"
chk "… aucune base créée, le fichier présent est intact" "0|déjà là" "$(existe ${CIBLE}_x)|$(cat "$T/plein/existant.txt")"
chk "une autre clé que celles de la sauvegarde : refus" 1 "$(restaurer "$ARCHIVE" "$T/cle3" ${CIBLE}_x "$T/r1")"
chk "… aucune base créée, aucun fichier écrit" "0|vide" "$(existe ${CIBLE}_x)|$(vide "$T/r1")"
cp "$ARCHIVE" "$T/abimee.tar"
# Un octet changé au milieu du dump chiffré (premier membre de l'archive).
python3 -c "
import sys
f = open('$T/abimee.tar', 'r+b'); f.seek(20000); o = f.read(1); f.seek(20000); f.write(bytes([o[0] ^ 0x5A])); f.close()"
chk "une archive abîmée d'un seul octet : refus" 1 "$(restaurer "$T/abimee.tar" "$T/cle1" ${CIBLE}_x "$T/r2")"
chk "… la base commencée est retirée, aucun fichier n'est laissé" "0|vide" "$(existe ${CIBLE}_x)|$(vide "$T/r2")"
head -c 5000 /dev/urandom > "$T/pas-une-archive.tar"
chk "un fichier qui n'est pas une archive de SIIPI : refus" "1|1" \
    "$(restaurer "$T/pas-une-archive.tar" "$T/cle1" ${CIBLE}_x "$T/r3")|$(dit "n'est pas une archive")"

echo "2. Un manifeste qui ne correspond pas : l'écart est nommé, rien ne reste"
# L'archive refaite avec un manifeste faux (la FNCT a la clé) : 40 lignes annoncées au lieu de 41, un fichier en moins.
mkdir -p "$T/faux"; tar -C "$T/faux" -xf "$ARCHIVE"
age -d -i "$T/cle1" "$T/faux/manifeste.json.age" \
  | jq -c '.tables["public.temoin_restauration"] = 40 | .fichiers |= map(select(.chemin != "./racine.txt"))' \
  | age -r "$PUB1" > "$T/faux/m.age"
mv "$T/faux/m.age" "$T/faux/manifeste.json.age"
tar -C "$T/faux" -cf "$T/faux.tar" base.dump.age fichiers.tar.age manifeste.json.age
chk "la restauration échoue à la vérification" 1 "$(restaurer "$T/faux.tar" "$T/cle1" ${CIBLE}_faux "$T/r4")"
chk "… le rapport compte deux écarts" 2 "$(jq .ecarts "$T/rapport.json" 2>/dev/null)"
chk "… et les nomme : la table (40 attendues, 41 obtenues) et le fichier en trop" "40|41|./racine.txt|en trop" \
    "$(jq -r '.tables[0] | "\(.attendu)|\(.obtenu)"' "$T/rapport.json")|$(jq -r '.fichiers[0] | "\(.chemin)|\(.ecart)"' "$T/rapport.json")"
chk "… la base restaurée est retirée, le dossier vidé" "0|vide" "$(existe ${CIBLE}_faux)|$(vide "$T/r4")"

echo "3. Une base d'essai, restaurée"
chk "la restauration réussit" 0 "$(restaurer "$ARCHIVE" "$T/cle1" "$CIBLE" "$T/restaures")"
chk "… aucun écart avec le manifeste" 0 "$(jq .ecarts "$T/rapport.json")"
chk "… autant de tables et de lignes que la source" \
    "$(psql_essai "$SOURCE" "SELECT count(*) FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema <> 'information_schema' AND table_schema NOT LIKE 'pg\_%'")|4" \
    "$(jq -r '"\(.comptes.tables)|\(.comptes.fichiers)"' "$T/rapport.json")"
chk "la table témoin est là, géométries comprises" "41|10.41" \
    "$(psql_essai "$CIBLE" 'SELECT count(*) FROM temoin_restauration')|$(psql_essai "$CIBLE" 'SELECT round(max(ST_X(lieu))::numeric, 2) FROM temoin_restauration')"
chk "les fichiers repris sont identiques aux fichiers déposés" 0 "$(diff -r "$T/fichiers" "$T/restaures" >/dev/null 2>&1; echo $?)"
chk "le compte de l'API peut endosser le rôle de l'application (hors du dump, recréé)" t \
    "$(psql_essai "$CIBLE" "SELECT pg_has_role(current_user, 'siipi_app', 'MEMBER')")"
api_essai "$PORT_ESSAI" "$CIBLE"; CODE=$?
chk "une API démarre sur la base restaurée" "0|developpement" \
    "$CODE|$(curl -s "http://localhost:$PORT_ESSAI/instance" | jq -r .nature)"
chk "… et la dit en bonne santé" ok "$(curl -s "http://localhost:$PORT_ESSAI/health" | jq -r .status)"
arreter_api_essai
chk "la seconde clé restaure aussi, seule" "0|0" \
    "$(restaurer "$ARCHIVE" "$T/cle2" ${CIBLE}_2 "$T/restaures2")|$(jq .ecarts "$T/rapport.json")"

echo "4. Une sauvegarde de production reste une base de production"
psql_essai "$SOURCE" "SELECT app.fixer_nature_instance('production')" >/dev/null
ARCHIVE_PROD=$(sauver "$SOURCE" "$T/fichiers" production)
chk "la restauration réussit, sans écart" "0|0" \
    "$(restaurer "$ARCHIVE_PROD" "$T/cle1" ${CIBLE}_prod "$T/restaures_prod")|$(jq .ecarts "$T/rapport.json")"
chk "la base restaurée est une base de production" production "$(psql_essai ${CIBLE}_prod 'SELECT app.nature_instance()')"
chk "… et le lanceur des campagnes la refuse (P1)" 5 \
    "$(PGDATABASE=${CIBLE}_prod sh tests/executer.sh outils/sonde_lanceur >/dev/null 2>&1; echo $?)"

echo "5. La base des campagnes, sauvegardée en lecture seule et restaurée à part"
AUDIT_AVANT=$($PSQL_BANC -c "SELECT count(*) FROM audit_log")
ARCHIVE_BANC=$(sauver "$BANC_BASE" "${SIIPI_FICHIERS_DIR:-/var/siipi/fichiers}" banc)
chk "la restauration réussit, sans aucun écart table par table" "0|0" \
    "$(restaurer "$ARCHIVE_BANC" "$T/cle2" ${CIBLE}_banc "$T/restaures_banc")|$(jq .ecarts "$T/rapport.json")"
chk "… sur des données réelles : plus de cent tables, Dar Chaâbane comprise" "t|1" \
    "$([ "$(jq .comptes.tables "$T/rapport.json")" -gt 100 ] && echo t || echo f)|$(psql_essai ${CIBLE}_banc "SELECT count(*) FROM communes WHERE id = 'nabeul_dar_chaabane_el_fehri'")"
chk "… et les fichiers de la base des campagnes, tous" \
    "$(find "${SIIPI_FICHIERS_DIR:-/var/siipi/fichiers}" -type f | wc -l)" "$(jq .comptes.fichiers "$T/rapport.json")"
chk "la base des campagnes n'a rien reçu : son journal d'audit n'a pas bougé" "$AUDIT_AVANT" "$($PSQL_BANC -c "SELECT count(*) FROM audit_log")"

echo "6. En partant"
retirer_bases_essai
chk "les bases d'essai et restaurées sont retirées" 0 \
    "$(psql_essai postgres "SELECT count(*) FROM pg_database WHERE datname LIKE 'siipi_essai_restau%'")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
