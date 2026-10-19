#!/usr/bin/env bash
# =============================================================================
# Le vocabulaire des relevés de terrain — lecture des étiquettes des arrêts.
#
# Les agents n'écrivent pas tous la même chose. À Dar Chaabane ils nommaient le
# type (« porte à porte », « point de collecte ») ; à Djerba (mission FNCT de
# 2026) ils comptaient les contenants (« 3 conteneur metallique », « 2
# demi-fût », « 240 L Plastique x2 ») et notaient l'état à côté (« CASSÉ »,
# « Hors conteneur »). La campagne vérifie que les deux vocabulaires se lisent,
# et que le type le plus parlant l'emporte quel que soit l'ordre de saisie :
# un point noir équipé d'un conteneur reste un point noir.
#
# Aperçu seulement : rien n'est écrit, sinon le circuit d'essai, retiré à la fin.
#
# ELLE NE TOUCHE À AUCUNE COMMUNE RÉELLE (JC-011). Jusqu'à la v0.15.52, elle
# prenait « le premier directeur de la base » — sur la pile d'essai, le compte
# de démonstration de La Marsa ; sur une base portant de vrais directeurs, le
# plus ancien d'entre eux — et écrivait dans sa commune ; son cloisonnement
# empruntait de même le premier directeur d'une autre commune, ou le premier
# prestataire de la base. Elle travaille désormais dans deux communes de test,
# avec des comptes temporaires (tests/outils/comptes_temporaires.sh), efface
# en partant tout ce qu'elles portent (tests/outils/communes_essai.sh), et
# prouve, pendant qu'elle a ses lignes en base puis en partant, qu'aucune
# commune réelle n'a reçu de ligne (tests/outils/base_reelle.sh).
#
#   docker compose exec -T api npm run test:releves-terrain
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

COMMUNE=test_releves_terrain
AUTRE_COMMUNE=test_releves_terrain_b
ESSAI="'$COMMUNE','$AUTRE_COMMUNE'"
. "$(dirname "$0")/outils/comptes_temporaires.sh"
. "$(dirname "$0")/outils/communes_essai.sh"
. "$(dirname "$0")/outils/base_reelle.sh"

nettoyer() { $PSQL -c "DELETE FROM circuits WHERE code = 'TEST-RELEVES';" >/dev/null 2>&1; }
nettoyer
# Son nettoyage d'origine, puis tout ce que portent ses communes de test.
nettoyer_essai() {
  nettoyer
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
}
nettoyer_essai
trap 'nettoyer_essai; rm -rf "$T"' EXIT
releve_base_reelle
commune_essai "$COMMUNE" "TEST commune de la campagne releves-terrain"
commune_essai "$AUTRE_COMMUNE" "TEST autre commune de la campagne releves-terrain"
compte_temporaire admin_commune "$COMMUNE" "Directeur de la campagne"
DIR_EMAIL=$COMPTE_EMAIL; DIR_MDP=$COMPTE_MDP; DIR_ID=$COMPTE_ID
compte_temporaire admin_commune "$AUTRE_COMMUNE" "Directeur de l'autre commune"
AUTRE_EMAIL=$COMPTE_EMAIL; AUTRE_MDP=$COMPTE_MDP
compte_temporaire gestionnaire_prestataire "$COMMUNE" "Prestataire de la campagne"
PREST_EMAIL=$COMPTE_EMAIL; PREST_MDP=$COMPTE_MDP; PREST_USER=$COMPTE_ID
T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API, ou directeur de test non créé" >&2; exit 1; }
CIRCUIT=$(sql "INSERT INTO circuits (commune_id, nom, code) VALUES ('$COMMUNE', 'Essai relevés', 'TEST-RELEVES') RETURNING id")

# Un relevé « GPS Waypoints » : nom de l'arrêt → étiquettes saisies par l'agent.
KML=$(python3 - <<'PY'
import base64
arrets = [
  ('DEB',  'début collecte'),
  ('MET',  '3 conteneur metallique'),
  ('CAS',  '2 conteneur metallique,CASSÉ'),
  ('DFU',  'demi-fût'),
  ('DF4',  '4 demi-fût '),
  ('LPX',  '240 L Plastique x2'),
  ('BAC',  'bac 120 L'),
  ('MAN',  'hand picked,sot en plastique'),
  ('NOI',  '4 conteneur metallique,point noir,CASSÉ'),
  ('HOR',  'Hors conteneur'),
  ('DEB2', '2 conteneur metallique,Hors conteneur'),
  ('PAP',  'porte à porte'),
  ('PDC',  'point de collecte'),
  ('PAU',  'pause/appel/autre'),
  ('FIN',  'fin collecte,demi-fût'),
]
c = ['<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>Waypoints</name>']
for i, (nom, tags) in enumerate(arrets):
    c.append(f'<Placemark><name>{nom}</name><TimeStamp><when>2026-03-07T08:{i:02d}:00Z</when></TimeStamp>'
             f'<Point><coordinates>10.99{i:02d},33.79{i:02d},0</coordinates></Point>'
             f'<ExtendedData><Data name="tags"><value>{tags}</value></Data></ExtendedData></Placemark>')
c.append('</Folder></Document></kml>')
print(base64.b64encode(''.join(c).encode()).decode())
PY
)
CODE=$(curl -s -o "$T/r.json" -w '%{http_code}' -X POST "$API/circuits/$CIRCUIT/import-kml" \
  -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"nomFichier\":\"djerba.kml\",\"contenu\":\"$KML\"}")
type_de() { python3 -c "import json;d=json.load(open('$T/r.json'));print(next((p['type'] for p in d['points'] if p['nom']=='$1'),'absent'))" 2>/dev/null; }

echo
echo "1. L'aperçu"
chk "l'aperçu répond" 200 "$CODE"
chk "les 15 arrêts entre début et fin de collecte sont lus" 15 \
    "$(python3 -c "import json;print(json.load(open('$T/r.json'))['nbPoints'])" 2>/dev/null)"
chk "rien n'est écrit" 0 "$(sql "SELECT count(*) FROM points_collecte WHERE circuit_id='$CIRCUIT'")"

echo
echo "2. Les contenants comptés désignent un point de collecte"
chk "« 3 conteneur metallique »" point_de_collecte "$(type_de MET)"
chk "« demi-fût »" point_de_collecte "$(type_de DFU)"
chk "« 4 demi-fût » (espace final compris)" point_de_collecte "$(type_de DF4)"
chk "« 240 L Plastique x2 »" point_de_collecte "$(type_de LPX)"
chk "« bac 120 L »" point_de_collecte "$(type_de BAC)"
chk "un état à côté ne l'empêche pas (« CASSÉ »)" point_de_collecte "$(type_de CAS)"

echo
echo "3. Le ramassage à la main est du porte-à-porte"
chk "« hand picked, sot en plastique »" porte_a_porte "$(type_de MAN)"

echo
echo "4. Le type le plus parlant l'emporte, quel que soit l'ordre"
chk "un point noir équipé d'un conteneur reste un point noir" point_noir "$(type_de NOI)"
chk "« Hors conteneur » seul : un dépôt hors conteneur" hors_conteneur "$(type_de HOR)"
chk "un conteneur qui déborde reste un point de collecte" point_de_collecte "$(type_de DEB2)"
chk "« fin collecte » l'emporte sur le demi-fût qui l'accompagne" fin_collecte "$(type_de FIN)"

echo
echo "5. Le vocabulaire de Dar Chaabane se lit toujours"
chk "« porte à porte »" porte_a_porte "$(type_de PAP)"
chk "« point de collecte »" point_de_collecte "$(type_de PDC)"
chk "une étiquette inconnue reste « autre », sans être devinée" autre "$(type_de PAU)"

# -----------------------------------------------------------------------------
# Le fichier d'un circuit : il sort comme il est entré, et se réimporte à
# l'identique — type, voyage, rang, heure relevée, tracé.
# -----------------------------------------------------------------------------
importer() { # <circuit> <nom> <contenu base64> <cible> <valider>
  curl -s -o "$T/r.json" -w '%{http_code}' -X POST "$API/circuits/$1/import-kml" \
    -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
    -d "{\"nomFichier\":\"$2\",\"contenu\":\"$3\",\"cible\":\"$4\",\"valider\":$5}"
}
champ() { python3 -c "import json;print(json.load(open('$T/r.json'))$1)" 2>/dev/null; }
types_apercu() { python3 -c "import json;print(','.join(p['type'] for p in json.load(open('$T/r.json'))['points']))" 2>/dev/null; }

echo
echo "6. Le fichier d'un circuit, en trois formats"
importer "$CIRCUIT" djerba.kml "$KML" points true >/dev/null
TRACE=$(python3 -c "
import base64
pts = ''.join(f'<trkpt lat=\"33.79{i}\" lon=\"10.99{i}\"><time>2026-03-07T07:0{i}:00Z</time></trkpt>' for i in range(5))
print(base64.b64encode(f'<?xml version=\"1.0\"?><gpx version=\"1.1\"><trk><trkseg>{pts}</trkseg></trk></gpx>'.encode()).decode())")
importer "$CIRCUIT" trace.gpx "$TRACE" trace true >/dev/null
ORIGINE=$(sql "SELECT string_agg(type, ',' ORDER BY voyage, ordre) FROM points_collecte WHERE circuit_id='$CIRCUIT' AND deleted_at IS NULL")
chk "le circuit d'essai porte ses 15 arrêts et son tracé" "15|5" \
    "$(sql "SELECT (SELECT count(*) FROM points_collecte WHERE circuit_id='$CIRCUIT' AND deleted_at IS NULL)||'|'||ST_NPoints(trace) FROM circuits WHERE id='$CIRCUIT'")"
for f in gpx kml geojson; do
  CODE=$(curl -s -D "$T/h.txt" -o "$T/c.$f" -w '%{http_code}' -H "Authorization: Bearer $T_DIR" "$API/circuits/$CIRCUIT/fichier?format=$f")
  chk "$f : le fichier se télécharge" 200 "$CODE"
  chk "$f : en pièce jointe, nommé d'après le code du circuit" 1 \
      "$(grep -ci "content-disposition: attachment; filename=\"TEST-RELEVES.$f\"" "$T/h.txt")"
done
chk "gpx : 15 arrêts et 5 sommets de tracé" "15|5" "$(grep -c '<wpt' "$T/c.gpx")|$(grep -c '<trkpt' "$T/c.gpx")"
chk "gpx : l'heure relevée (locale) est écrite en UTC" 1 "$(grep -c '<time>2026-01-01T07:00:00Z</time>\|<time>[0-9-]*T07:00:00Z</time>' "$T/c.gpx")"
chk "geojson : une entité par arrêt, plus le tracé" 16 \
    "$(python3 -c "import json;print(len(json.load(open('$T/c.geojson'))['features']))" 2>/dev/null)"

nettoyer_bis() { $PSQL -c "DELETE FROM circuits WHERE code = 'TEST-RELEVES-2';" >/dev/null 2>&1; }
nettoyer_bis
CIRCUIT2=$(sql "INSERT INTO circuits (commune_id, nom, code) VALUES ('$COMMUNE', 'Essai réimport', 'TEST-RELEVES-2') RETURNING id")

echo
echo "7. Réimportés, les trois fichiers redonnent le même circuit"
for f in gpx kml geojson; do
  B64=$(base64 -w0 "$T/c.$f")
  importer "$CIRCUIT2" "c.$f" "$B64" points false >/dev/null
  chk "$f : les 15 arrêts, avec leurs types, dans le même ordre" "$ORIGINE" "$(types_apercu)"
  importer "$CIRCUIT2" "c.$f" "$B64" trace false >/dev/null
  chk "$f : le tracé, ses 5 sommets" "True|5" "$(champ "['poseraTrace']")|$(champ "['nbSommetsTrace']")"
done
importer "$CIRCUIT2" c.kml "$(base64 -w0 "$T/c.kml")" auto false >/dev/null
chk "kml en « auto » : les arrêts sont posés, l'itinéraire n'est pas remplacé d'office" "True|False" \
    "$(champ "['poseraPoints']")|$(champ "['poseraTrace']")"
importer "$CIRCUIT2" c.geojson "$(base64 -w0 "$T/c.geojson")" points false >/dev/null
chk "geojson : l'heure relevée revient avec l'arrêt" "08:00:00" \
    "$(python3 -c "import json;print(json.load(open('$T/r.json'))['points'][0]['heureObservee'])" 2>/dev/null)"

echo
echo "8. Cloisonnement du fichier"
# L'autre commune est la commune de test B, avec son directeur temporaire.
T_AUTRE=$(tok "$AUTRE_EMAIL" "$AUTRE_MDP")
chk "une autre commune ne télécharge pas ce circuit (404)" 404 \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T_AUTRE" "$API/circuits/$CIRCUIT/fichier?format=gpx")"
chk "un format inconnu est refusé (400)" 400 \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T_DIR" "$API/circuits/$CIRCUIT/fichier?format=shp")"

nettoyer_bis
echo
echo "Aucune commune réelle n'a reçu de ligne (JC-011)"
base_reelle_intacte "pendant la campagne"
nettoyer_essai
chk "ses communes de test et ses comptes temporaires sont effacés" "0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"
echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
