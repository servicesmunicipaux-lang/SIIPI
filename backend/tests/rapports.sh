#!/usr/bin/env bash
# =============================================================================
# Rapports et études — TDR §3.2.9.
#
# CE QUE CETTE CAMPAGNE VÉRIFIE D'ABORD. Que le stockage général reste fermé
# aux documents Office pour tout usage sauf « rapport_etude » — une preuve de
# traitement de réclamation en .pptx n'a aucun sens — et qu'un rapport, lui,
# les accepte au-delà du plafond de 8 Mo qui s'applique partout ailleurs.
#
#   docker compose exec -T api npm run test:rapports
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
code() { curl -s -o "$T/r.json" -w '%{http_code}' "$@"; }
val()  { python3 -c "import json;print(json.load(open('$T/r.json'))$1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")

nettoyer() {
  $PSQL -c "DELETE FROM rapports_etudes WHERE titre LIKE 'TEST-R%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM fichiers WHERE nom_original LIKE 'TEST-R%';" >/dev/null 2>&1
}
nettoyer

# --- Une fausse présentation PowerPoint, un ZIP quelconque, un PDF -----------
python3 - "$T" <<'PY'
import base64, struct, sys, zipfile

d = sys.argv[1]

def zip_avec(nom_interne, poids_supplementaire=0):
    chemin = f'{d}/{nom_interne.replace("/", "_")}.zip'
    with zipfile.ZipFile(chemin, 'w', zipfile.ZIP_STORED) as z:
        z.writestr(nom_interne, b'<xml/>')
        if poids_supplementaire:
            z.writestr('media/gros.bin', b'\x00' * poids_supplementaire)
    return open(chemin, 'rb').read()

pptx = zip_avec('ppt/presentation.xml')
zip_quelconque = zip_avec('rien/de/reconnu.txt')
# Une « présentation » de 9 Mo décodés : au-dessus du plafond général (8 Mo),
# en dessous de celui d'un rapport (50 Mo).
pptx_9mo = zip_avec('ppt/presentation.xml', 9 * 1024 * 1024)

open(f'{d}/doc.pdf', 'wb').write(b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

for nom, contenu in [('presentation.pptx', pptx), ('archive.zip', zip_quelconque),
                     ('grosse.pptx', pptx_9mo)]:
    open(f'{d}/{nom}', 'wb').write(contenu)

for nom in ['presentation.pptx', 'archive.zip', 'grosse.pptx', 'doc.pdf']:
    b = open(f'{d}/{nom}', 'rb').read()
    open(f'{d}/{nom}.b64', 'w').write(base64.b64encode(b).decode())
PY

depot() {  # $1 = fichier b64, $2 = nom, $3 = usage
  python3 -c "
import json,sys
print(json.dumps({'nomFichier': sys.argv[2], 'contenu': open(sys.argv[1]).read(), 'usage': sys.argv[3]}))" \
    "$T/$1.b64" "$2" "$3" > "$T/corps.json"
  code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       --data-binary "@$T/corps.json" "$API/fichiers?communeId=$COMMUNE"
}

# -----------------------------------------------------------------------------
echo
echo "1. Le stockage général reste fermé aux documents Office"
chk "un .pptx déposé comme preuve de traitement est refusé" 415 \
    "$(depot presentation.pptx 'TEST-R-preuve.pptx' preuve_traitement)"
chk "le même .pptx déposé comme constat de terrain est refusé" 415 \
    "$(depot presentation.pptx 'TEST-R-constat.pptx' constat_terrain)"

echo
echo "2. Un rapport ou une étude, en revanche"
chk "le .pptx est accepté pour un rapport" 201 \
    "$(depot presentation.pptx 'TEST-R-etude.pptx' rapport_etude)"
FICHIER=$(val "['id']")
chk "le type retenu est le bon" \
    "application/vnd.openxmlformats-officedocument.presentationml.presentation" \
    "$(val "['type_mime']")"
chk "une archive ZIP quelconque reste refusée, même en rapport_etude" 415 \
    "$(depot archive.zip 'TEST-R-archive.zip' rapport_etude)"
chk "un PDF est toujours accepté en rapport_etude" 201 \
    "$(depot doc.pdf 'TEST-R-doc.pdf' rapport_etude)"

echo
echo "3. Le plafond de taille dépend de l'usage"
chk "9 Mo dépasse le plafond général (8 Mo)" 413 \
    "$(depot grosse.pptx 'TEST-R-grosse-preuve.pptx' preuve_traitement)"
chk "9 Mo passe pour un rapport (plafond 50 Mo)" 201 \
    "$(depot grosse.pptx 'TEST-R-grosse.pptx' rapport_etude)"
GROS=$(val "['id']")

echo
echo "4. La fiche de métadonnées"
CODE=$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"titre\":\"TEST-R étude de faisabilité\",\"categorie\":\"etude_technique\",\"auteur\":\"Bureau Test\",\"fichierUrl\":\"/fichiers/$FICHIER\",\"nomFichier\":\"etude.pptx\"}" \
  "$API/rapports-etudes?communeId=$COMMUNE")
chk "la fiche s'enregistre" 201 "$CODE"
RAPPORT=$(val "['id']")
chk "elle porte la bonne catégorie" "etude_technique" "$(val "['categorie']")"
chk "une catégorie inconnue est rejetée" 400 \
    "$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"titre\":\"TEST-R mauvaise categorie\",\"categorie\":\"n_importe_quoi\",\"fichierUrl\":\"/fichiers/$FICHIER\",\"nomFichier\":\"x.pptx\"}" \
       "$API/rapports-etudes?communeId=$COMMUNE")"
chk "un titre trop court est rejeté" 400 \
    "$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"titre\":\"Hi\",\"fichierUrl\":\"/fichiers/$FICHIER\",\"nomFichier\":\"x.pptx\"}" \
       "$API/rapports-etudes?communeId=$COMMUNE")"

echo
echo "5. La liste, le filtre, le retrait"
chk "la commune retrouve sa fiche" 200 "$(code -H "Authorization: Bearer $T_DIR" "$API/rapports-etudes?communeId=$COMMUNE")"
chk "elle y figure" 1 \
    "$(python3 -c "
import json
print(sum(1 for x in json.load(open('$T/r.json')) if x['id']=='$RAPPORT'))" 2>/dev/null || echo erreur)"
chk "le filtre par catégorie fonctionne" 1 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/rapports-etudes?communeId=$COMMUNE&categorie=etude_technique" >/dev/null; python3 -c "
import json
print(sum(1 for x in json.load(open('$T/r.json')) if x['id']=='$RAPPORT'))" 2>/dev/null || echo erreur)"
chk "la commune retire la fiche" 204 "$(code -X DELETE -H "Authorization: Bearer $T_DIR" "$API/rapports-etudes/$RAPPORT")"
chk "elle a disparu de la liste" 0 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/rapports-etudes?communeId=$COMMUNE" >/dev/null; python3 -c "
import json
print(sum(1 for x in json.load(open('$T/r.json')) if x['id']=='$RAPPORT'))" 2>/dev/null || echo erreur)"

echo
echo "6. Cloisonnement"
# Une nouvelle fiche, pour vérifier qu'elle reste invisible d'ailleurs — celle
# de l'étape 4 a déjà été retirée.
AUTRE_FICHE=$(sql "INSERT INTO rapports_etudes (commune_id, titre, categorie, fichier_url, nom_fichier)
                   VALUES ('$COMMUNE','TEST-R cloisonnement','autre','/fichiers/$GROS','x.pptx') RETURNING id")
AUTRE_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id <> '$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
if [ -n "$AUTRE_EMAIL" ]; then
  T_AUTRE=$(tok "$AUTRE_EMAIL")
  AUTRE_COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$AUTRE_EMAIL'")
  # RLS filtre en silence : la requête réussit, la liste est simplement vide —
  # un refus explicite renseignerait sur l'existence de la fiche.
  chk "le directeur d'une autre commune interroge sans erreur" 200 \
      "$(code -H "Authorization: Bearer $T_AUTRE" "$API/rapports-etudes?communeId=$AUTRE_COMMUNE")"
  chk "mais ne voit pas la fiche d'une commune qui n'est pas la sienne" 0 \
      "$(python3 -c "
import json
print(sum(1 for x in json.load(open('$T/r.json')) if x['id']=='$AUTRE_FICHE'))" 2>/dev/null || echo erreur)"
fi
chk "sans jeton, rien" 401 "$(code "$API/rapports-etudes?communeId=$COMMUNE")"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
