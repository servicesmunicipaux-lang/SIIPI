#!/usr/bin/env bash
# =============================================================================
# La lecture des fichiers de limites (C2.2) : Shapefile, KML, KMZ, GeoJSON.
#
# Elle commence par ce que la plateforme REFUSE : sans compte, un citoyen, un
# prestataire ; une archive sans .dbf, sans Shapefile ni KML, un .shp seul, un
# fichier qui n'est rien de tout cela ; une « bombe » zip ; un système de
# coordonnées inconnu (il est nommé, jamais deviné) ; des mètres sans .prj ;
# un GeoJSON dans un système inconnu, ou en mètres sans le dire.
#
# Puis chaque format est lu et confronté à ce qu'en attend un témoin
# (tests/donnees/fichiers_geo.py) qui écrit lui-même les fichiers, octet par
# octet, et calcule les coordonnées projetées par les formules du manuel :
# WGS 84, UTM 32N, Web Mercator, Carthage / UTM 32N ; un trou, deux parties ;
# des attributs arabes en UTF-8 et en Windows-1256 ; un zip écrit en flux.
# Rien n'est enregistré : la route lit, elle ne propose rien.
#
#   docker compose exec -T api npm run test:import-geo
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
# lire <cas> [jeton] : poste le fichier du cas, rend le code HTTP ; la réponse est dans $T/r.json.
lire() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X POST -H "Authorization: Bearer ${2:-$T_DIR}" -H 'Content-Type: application/json' \
       --data-binary "@$T/$1.json" "$API/decoupage/lire-fichier"
}
# py <expression> : sur la réponse (d), les attendus (A), avec proche(anneaux_lus, anneaux_attendus, tolérance).
py() {
  python3 - "$T" "$1" <<'PYEOF' 2>/dev/null || echo erreur
import json, sys
t, expr = sys.argv[1], sys.argv[2]
d = json.load(open(f'{t}/r.json'))
A = json.load(open(f'{t}/attendus.json', encoding='utf-8'))
f0 = lambda: d['geojson']['features'][0]
def proche(lus, attendus, tol):
    return len(lus) == len(attendus) and all(
        len(a) == len(b) and all(abs(x - u) <= tol and abs(y - v) <= tol for (x, y), (u, v) in zip(a, b))
        for a, b in zip(lus, attendus))
def ecart(lus, attendus):
    return max(max(abs(x - u), abs(y - v)) for a, b in zip(lus, attendus) for (x, y), (u, v) in zip(a, b))
print(eval(expr))
PYEOF
}
message() { python3 -c "import json;print(json.load(open('$T/r.json')).get('error',''))" 2>/dev/null; }

python3 tests/donnees/fichiers_geo.py "$T" >/dev/null || { echo "Les fichiers d'essai n'ont pas pu être écrits." >&2; exit 1; }
T_DIR=$(tok directeur.marsa@siipi.tn)
T_FNCT=$(tok admin.national@siipi.tn)
T_PREST=$(tok prestataire.marsa@siipi.tn)
T_CIT=$(tok citoyen.demo@siipi.tn)
[ -n "$T_DIR" ] && [ -n "$T_FNCT" ] && [ -n "$T_PREST" ] && [ -n "$T_CIT" ] || { echo "API injoignable sur $API, ou compte d'essai absent" >&2; exit 1; }
VERSIONS_AVANT=$($PSQL -c "SELECT count(*) FROM versions_decoupage" 2>/dev/null)

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "sans compte : 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data-binary "@$T/wgs84.json" "$API/decoupage/lire-fichier")"
chk "un citoyen, un prestataire : 403" "403|403" "$(lire wgs84 "$T_CIT")|$(lire wgs84 "$T_PREST")"
chk "une archive sans .dbf : 400, et la réponse dit quoi joindre" "400|True" "$(lire sans_dbf)|$(message | grep -q '.dbf' && echo True || echo False)"
chk "une archive sans Shapefile ni KML : 400" 400 "$(lire zip_vide)"
chk "un .shp seul : 400, et la réponse dit de zipper ses fichiers" "400|True" "$(lire shp_seul)|$(message | grep -qi 'zip' && echo True || echo False)"
chk "un fichier qui n'est pas un fichier de limites : 400" 400 "$(lire charabia)"
chk "une « bombe » zip (100 octets annoncés, un million dépliés) : 400, l'API tient" "400|200" \
    "$(lire bombe)|$(curl -s -o /dev/null -w '%{http_code}' "$API/health")"
chk "un système inconnu (Lambert 93) : 400, nommé dans la réponse" "400|True" "$(lire lambert93)|$(message | grep -q 'RGF93_Lambert_93' && echo True || echo False)"
chk "des mètres sans .prj : 400, et la réponse demande le .prj" "400|True" "$(lire sans_prj_metres)|$(message | grep -q '.prj' && echo True || echo False)"
chk "un GeoJSON dans un système inconnu (EPSG:2154) : 400" 400 "$(lire geojson_2154)"
chk "un GeoJSON en mètres qui ne dit pas son système : 400" 400 "$(lire geojson_metres)"

# -----------------------------------------------------------------------------
echo
echo "2. Shapefile : chaque système est lu et ramené en WGS 84"
chk "WGS 84, zip écrit en flux (descripteurs de données) : 200" 200 "$(lire wgs84)"
chk "… le contour et son trou, aux sommets près (1e-9 °)" True "$(py "f0()['geometry']['type'] == 'Polygon' and proche(f0()['geometry']['coordinates'], A['wgs84']['anneaux'], 1e-9)")"
chk "… les attributs : nom arabe (UTF-8), code numérique, date" True \
    "$(py "f0()['properties'] == {'NOM': A['wgs84']['nom'], 'CODE': A['wgs84']['code'], 'RELEVE': A['wgs84']['releve']}")"
chk "… le format et le système d'origine sont dits" "shapefile|4326" "$(py "d['format'] + '|' + str(d['srid_source'])")"
chk "UTM 32N : 200, ramené en degrés à 1e-6 ° près (une dizaine de centimètres)" "200|True" \
    "$(lire utm)|$(py "d['srid_source'] == 32632 and proche(f0()['geometry']['coordinates'], A['utm']['anneaux'], 1e-6)")"
chk "Web Mercator : 200, ramené à 1e-6 ° près" "200|True" \
    "$(lire mercator)|$(py "d['srid_source'] == 3857 and proche(f0()['geometry']['coordinates'], A['mercator']['anneaux'], 1e-6)")"
chk "Carthage / UTM 32N : reconnu, et son changement de datum appliqué (écart de 0,0001 à 0,01 ° avec le même relevé lu en WGS 84)" "200|22332|True" \
    "$(lire carthage)|$(py "d['srid_source']")|$(py "1e-4 < ecart(f0()['geometry']['coordinates'], A['carthage']['anneaux']) < 1e-2")"
chk "deux contours extérieurs dans un enregistrement : un MultiPolygon de deux parties" "200|MultiPolygon|2" \
    "$(lire multi)|$(py "f0()['geometry']['type']")|$(py "len(f0()['geometry']['coordinates'])")"
chk "arabe en Windows-1256 avec son .cpg : lu juste" "200|True" "$(lire cp1256)|$(py "f0()['properties']['NOM'] == A['cp1256']['nom']")"
chk "le même sans .cpg : lu, et l'avertissement demande le .cpg" "200|True" "$(lire sans_cpg)|$(py "any('.cpg' in a for a in d['avertissements'])")"
chk "sans .prj, des degrés en Tunisie : acceptés, et c'est dit" "200|True" "$(lire sans_prj_degres)|$(py "any('.prj' in a for a in d['avertissements'])")"

# -----------------------------------------------------------------------------
echo
echo "3. KML, KMZ et GeoJSON"
chk "KML : un polygone et son trou, le nom (arabe) et l'attribut" "200|True|True" \
    "$(lire kml)|$(py "proche(f0()['geometry']['coordinates'], A['kml']['anneaux'], 1e-9)")|$(py "f0()['properties'] == {'name': A['kml']['nom'], 'code': A['kml']['code']}")"
chk "KMZ : le même, dans son archive" "200|kmz|True" \
    "$(lire kmz)|$(py "d['format']")|$(py "proche(f0()['geometry']['coordinates'], A['kml']['anneaux'], 1e-9)")"
chk "GeoJSON qui déclare UTM 32N (membre « crs ») : ramené en degrés" "200|True" \
    "$(lire geojson_utm)|$(py "d['srid_source'] == 32632 and proche(f0()['geometry']['coordinates'], A['geojson_utm']['anneaux'], 1e-6)")"
chk "la FNCT lit aussi les fichiers" 200 "$(lire wgs84 "$T_FNCT")"

echo
echo "4. Rien n'est enregistré"
chk "aucune version de découpage n'a été créée par ces lectures" "$VERSIONS_AVANT" "$($PSQL -c "SELECT count(*) FROM versions_decoupage" 2>/dev/null)"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
