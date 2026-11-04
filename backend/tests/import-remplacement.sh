#!/usr/bin/env bash
# =============================================================================
# v0.15.89 — jalon F, lot F0 : un import ne remplace que ce qu'un import a posé
# (E3, docs/specs_metier/SPEC_F_releve_terrain.md).
#
# L'import d'un fichier sur un circuit, avec « remplacer » (le défaut), retirait
# TOUS les arrêts du circuit, quelle que soit leur provenance : un arrêt saisi à
# l'écran, un arrêt proposé par un habitant et adopté, et demain un arrêt relevé
# sur le terrain (jalon F) disparaissaient au premier fichier déposé. Et le
# retrait était imputé par `req.user!.sub`, l'écriture que CLAUDE.md § 5 proscrit.
#
# Elle commence par ce qui est refusé : un import qui remplace ne retire aucun
# arrêt saisi ni proposé, et ne change pas leur rang. Puis ce qui doit marcher :
# les arrêts d'un import précédent sont remplacés, retrait imputé au directeur ;
# les nouveaux prennent la suite ; le complément ajoute sans rien retirer ; le
# retrait explicite de tous les arrêts reste possible, imputé. Aucune ligne d'une
# commune réelle ne bouge.
#
#   docker compose exec -T api npm run test:import-remplacement
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_import_remplacement
ESSAI="'$A'"
. tests/outils/communes_essai.sh
. tests/outils/comptes_temporaires.sh
. tests/outils/base_reelle.sh

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
sql() { $PSQL -c "$1" 2>&1 | tr -d ' '; }
tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
appel() { # méthode chemin jeton [corps] — code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" ${3:+-H "Authorization: Bearer $3"} \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}
champ() { python3 -c "import json;print(json.load(open('$T/r.json')).get('$1'))" 2>/dev/null; }
# Les arrêts présents, « source:rang » dans l'ordre de passage.
presents() {
  sql "SELECT string_agg(source || ':' || ordre, ',' ORDER BY ordre) FROM points_collecte WHERE circuit_id = '$C' AND deleted_at IS NULL"
}

nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
  rm -rf "$T"
}
effacer_communes_essai "$ESSAI"
trap nettoyer EXIT
releve_base_reelle

# --- Le terrain : une commune de test, son directeur, un circuit qui porte deux
# arrêts saisis à l'écran, un arrêt proposé par un habitant, et deux arrêts d'un
# import précédent.
commune_essai "$A" "TEST commune de l'import qui remplace"
compte_temporaire admin_commune "$A" "Directeur"; T_D=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); DIR=$COMPTE_ID
[ -n "$T_D" ] || { echo "API injoignable sur $API, ou compte non connecté." >&2; exit 1; }
C=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage, actif, date_debut)
         VALUES ('$A', 'TEST circuit importé', ARRAY[1,3,5]::smallint[], true, app.jour_tunis() - 10) RETURNING id" | head -1)
[ -n "$C" ] || { echo "Impossible de poser le circuit de test." >&2; exit 1; }
$PSQL -c "INSERT INTO points_collecte (circuit_id, commune_id, ordre, nom, type, geom, source) VALUES
            ('$C', '$A', 1, 'TEST saisi 1', 'point_de_collecte', ST_SetSRID(ST_MakePoint(10.7465, 36.4683), 4326), 'saisie'),
            ('$C', '$A', 2, 'TEST saisi 2', 'point_de_collecte', ST_SetSRID(ST_MakePoint(10.7466, 36.4682), 4326), 'saisie'),
            ('$C', '$A', 3, 'TEST proposé', 'point_noir', ST_SetSRID(ST_MakePoint(10.7470, 36.4676), 4326), 'suggestion_citoyen'),
            ('$C', '$A', 4, 'TEST importé 1', 'porte_a_porte', ST_SetSRID(ST_MakePoint(10.7472, 36.4674), 4326), 'import_kml'),
            ('$C', '$A', 5, 'TEST importé 2', 'porte_a_porte', ST_SetSRID(ST_MakePoint(10.7474, 36.4672), 4326), 'import_kml');" >/dev/null
chk "le terrain est posé : deux arrêts saisis, un proposé, deux importés" \
    "saisie:1,saisie:2,suggestion_citoyen:3,import_kml:4,import_kml:5" "$(presents)"

# Le relevé d'un fichier, tel que les communes l'exportent (le même que module2) :
# quatre arrêts entre le début et la fin de collecte.
KML=$(python3 - <<'PY'
import base64
pts = [("WPT 01","début collecte","07:31:39","10.74653362,36.46831195","3.79"),
       ("WPT 02","porte à porte","07:32:07","10.74656485,36.46827219","3.79"),
       ("WPT 03","point de collecte","07:35:00","10.74709618,36.46755591","6.72"),
       ("WPT 04","fin collecte","08:39:29","10.74800000,36.46700000","4.10"),
       ("WPT 05","centre de transfert","08:59:05","10.75000000,36.45900000","3.90")]
c = ['<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Essai</name><Folder><name>Waypoints</name>']
for n,t,h,xy,a in pts:
    c.append(f'<Placemark><name>{n}</name><TimeStamp><when>2024-05-21T{h}Z</when></TimeStamp>'
             f'<Point><coordinates>{xy}</coordinates></Point><ExtendedData>'
             f'<Data name="accuracy"><value>{a}</value></Data>'
             f'<Data name="provider"><value>gps</value></Data>'
             f'<Data name="tags"><value>{t}</value></Data></ExtendedData></Placemark>')
c.append('</Folder></Document></kml>')
print(base64.b64encode(''.join(c).encode()).decode())
PY
)
IMPORTER="{\"nomFichier\":\"TEST-releve.kml\",\"contenu\":\"$KML\",\"valider\":true,\"cible\":\"points\""

echo "1. Ce qu'un import qui remplace ne touche pas"
chk "l'import qui remplace (le défaut) est accepté" 201 "$(appel POST "/circuits/$C/import-kml" "$T_D" "$IMPORTER}")"
chk "il ne retire que les deux arrêts d'un import précédent, en garde trois, en crée quatre" "2|3|4" \
    "$(champ remplaces)|$(champ gardes)|$(champ crees)"
chk "les arrêts saisis et proposé sont toujours là, à leur rang ; les importés prennent la suite" \
    "saisie:1,saisie:2,suggestion_citoyen:3,import_kml:4,import_kml:5,import_kml:6,import_kml:7" "$(presents)"
chk "aucun arrêt saisi ni proposé n'a été retiré" 0 \
    "$(sql "SELECT count(*) FROM points_collecte WHERE circuit_id = '$C' AND source <> 'import_kml' AND deleted_at IS NOT NULL")"
chk "les arrêts nouveaux sont ceux du fichier (heure relevée gardée)" "07:31:39" \
    "$(sql "SELECT heure_observee FROM points_collecte WHERE circuit_id = '$C' AND ordre = 4 AND deleted_at IS NULL")"

echo
echo "2. Ce qui est remplacé l'est au nom du directeur"
chk "les deux anciens arrêts importés sont retirés, pas effacés, et le retrait est imputé au directeur" "2|2" \
    "$(sql "SELECT count(*) FROM points_collecte WHERE circuit_id = '$C' AND nom LIKE 'TEST importé%' AND deleted_at IS NOT NULL")|$(sql "SELECT count(*) FROM points_collecte WHERE circuit_id = '$C' AND nom LIKE 'TEST importé%' AND deleted_by = '$DIR'")"
appel POST "/circuits/$C/import-kml" "$T_D" "$IMPORTER}" >/dev/null
chk "un second import remplace les quatre du premier, sans empiler" \
    "4|3|saisie:1,saisie:2,suggestion_citoyen:3,import_kml:4,import_kml:5,import_kml:6,import_kml:7" \
    "$(champ remplaces)|$(champ gardes)|$(presents)"

echo
echo "3. Le complément ajoute sans rien retirer"
chk "l'import en complément est accepté" 201 "$(appel POST "/circuits/$C/import-kml" "$T_D" "$IMPORTER,\"remplacer\":false}")"
chk "rien n'est retiré, les sept arrêts sont gardés, quatre s'ajoutent à la suite" "0|7|4|11|11" \
    "$(champ remplaces)|$(champ gardes)|$(champ crees)|$(sql "SELECT count(*) FROM points_collecte WHERE circuit_id = '$C' AND deleted_at IS NULL")|$(sql "SELECT max(ordre) FROM points_collecte WHERE circuit_id = '$C' AND deleted_at IS NULL")"

echo
echo "4. Retirer tous les arrêts reste un geste explicite, imputé"
chk "le retrait de tous les arrêts répond" "200|11" "$(appel DELETE "/circuits/$C/points" "$T_D")|$(champ retires)"
chk "… aucun retrait sans auteur sur ce circuit" 0 \
    "$(sql "SELECT count(*) FROM points_collecte WHERE circuit_id = '$C' AND deleted_at IS NOT NULL AND deleted_by IS NULL")"

echo
base_reelle_intacte "pendant la campagne"

nettoyer
T=$(mktemp -d)
chk "en partant : la commune de test et le compte temporaire sont effacés" "0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
