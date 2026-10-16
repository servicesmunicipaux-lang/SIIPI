#!/usr/bin/env bash
# =============================================================================
# La carte des communes (lot S0 : carte du conseiller SIG) — campagne.
#
# GET /observatoire/carte-communes rend les communes réelles, leur contour
# officiel simplifié et leur fiche. Elle commence par ce qui est refusé (sans
# compte) et ce qui ne doit pas paraître (la commune de démonstration, une
# commune retirée). Puis :
#   - la superficie est celle du contour, sur l'ellipsoïde — pas l'aire en
#     projection Web Mercator que donnait la carte du conseiller (39 à 58 % de
#     trop) : un témoin recalcule l'aire de chaque contour rendu, sur la sphère,
#     sans rien lire du code testé ;
#   - une valeur absente est null, jamais 0 (une population jamais saisie vaut
#     0 dans la colonne d'origine : elle sort null) ;
#   - chaque commune réelle porte son district (D-FNCT-2).
#
# Elle bâtit une commune d'essai et une commune de démonstration d'essai, avec
# un contour carré connu, et les efface en partant.
#
#   docker compose exec -T api npm run test:carte-communes
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
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
# py <expression> : évaluée sur la carte rendue (d), avec fiche(id) et aire(geometrie) en km².
py() {
  python3 - "$T/carte.json" "$1" <<'PYEOF' 2>/dev/null || echo erreur
import json, math, sys
d = json.load(open(sys.argv[1]))
fiches = {f['properties']['id']: f for f in d['features']}
fiche = lambda i: fiches.get(i, {}).get('properties')
R = 6371008.8
def anneau(r):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]):
        a += math.radians(x2 - x1) * (2 + math.sin(math.radians(y1)) + math.sin(math.radians(y2)))
    return abs(a) * R * R / 2
def aire(g):
    polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    return sum(anneau(p[0]) - sum(anneau(t) for t in p[1:]) for p in polys) / 1e6
print(eval(sys.argv[2]))
PYEOF
}

TC=test_carte_communes
TD=test_carte_demo
# Un carré de 0,1° de côté autour de 10,05° E / 36,05° N : un contour dont le
# témoin connaît l'aire sans rien demander à la base.
CARRE="POLYGON((10 36, 10.1 36, 10.1 36.1, 10 36.1, 10 36))"
nettoyer() {
  $PSQL -c "DELETE FROM audit_log WHERE commune_id IN ('$TC', '$TD');" \
        -c "DELETE FROM communes WHERE id IN ('$TC', '$TD');" >/dev/null 2>&1
}
fin() { nettoyer; rm -rf "$T"; }
nettoyer
trap fin EXIT
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, boundary_geom, boundary_source)
          VALUES ('$TC', 'TEST commune de la carte', 'TEST', 'TEST-CARTE', ST_Multi(ST_GeomFromText('$CARRE', 4326)), 'officiel');" \
      -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population, boundary_geom, boundary_source, est_demo)
          VALUES ('$TD', 'TEST commune de démonstration', 'TEST', 'TEST-CARTE', 1000, ST_Multi(ST_GeomFromText('$CARRE', 4326)), 'officiel', true);" >/dev/null
chk "les deux communes d'essai sont bâties, avec leur contour" 2 \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ('$TC', '$TD') AND boundary_geom IS NOT NULL")"
T_FNCT=$(tok admin.national@siipi.tn)
T_DIR=$(tok directeur.marsa@siipi.tn)
[ -n "$T_FNCT" ] && [ -n "$T_DIR" ] || { echo "API injoignable sur $API, ou compte d'essai absent" >&2; exit 1; }

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la carte refuse, et ce qu'elle ne montre pas"
chk "sans compte : 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$API/observatoire/carte-communes")"
chk "la FNCT et une commune la lisent (l'annuaire est lisible de tous) : 200" "200|200" \
    "$(curl -s -o "$T/carte.json" -w '%{http_code}' -H "Authorization: Bearer $T_DIR" "$API/observatoire/carte-communes")|$(curl -s -o "$T/carte.json" -w '%{http_code}' -H "Authorization: Bearer $T_FNCT" "$API/observatoire/carte-communes")"
chk "la commune de démonstration n'y est pas" None "$(py "fiche('$TD')")"
chk "une commune retirée du référentiel non plus" 0 \
    "$(py "sum(1 for i in fiches if i in set('''$(sql "SELECT string_agg(id, ' ') FROM communes WHERE deleted_at IS NOT NULL")'''.split()))")"
chk "toutes les communes réelles qui ont un contour y sont" \
    "$(sql "SELECT count(*) FROM communes WHERE NOT est_demo AND deleted_at IS NULL AND boundary_geom IS NOT NULL")" "$(py "len(d['features'])")"

# -----------------------------------------------------------------------------
echo
echo "2. La superficie est celle du contour, sur l'ellipsoïde"
chk "la commune d'essai : l'aire du carré, à 0,5 % près (témoin sphérique)" True \
    "$(py "abs(fiche('$TC')['superficie_km2'] - aire({'type': 'Polygon', 'coordinates': [[[10, 36], [10.1, 36], [10.1, 36.1], [10, 36.1], [10, 36]]]})) < 0.005 * fiche('$TC')['superficie_km2']")"
# Le contour rendu est simplifié (0,001°) : sur les plus petites communes, son aire
# s'écarte de quelques pour cent de celle du tracé exact (3,8 % pour Messadine).
chk "chaque commune réelle : la superficie rendue et l'aire de son contour simplifié s'accordent à 5 % près" 0 \
    "$(py "sum(1 for f in d['features'] if f['properties']['id'] != '$TC' and abs(f['properties']['superficie_km2'] / aire(f['geometry']) - 1) > 0.05)")"
chk "… ce qui écarte l'aire en Web Mercator (au moins 39 % de trop en Tunisie)" True \
    "$(py "max(abs(f['properties']['superficie_km2'] / aire(f['geometry']) - 1) for f in d['features']) < 0.39")"
chk "et la superficie rendue est celle que tient le référentiel (area_km2), à 0,1 km² près" 0 \
    "$(py "sum(1 for f in d['features'] if f['properties']['id'] != '$TC' and abs(f['properties']['superficie_km2'] - {$(sql "SELECT string_agg(quote_literal(id) || ':' || area_km2, ',') FROM communes WHERE NOT est_demo AND deleted_at IS NULL AND boundary_geom IS NOT NULL AND area_km2 IS NOT NULL")}.get(f['properties']['id'], -999)) > 0.1)")"

# -----------------------------------------------------------------------------
echo
echo "3. Une valeur absente est null, jamais 0"
chk "la population jamais saisie (0 dans la colonne) sort null, et sans provenance" "None|None" \
    "$(py "str(fiche('$TC')['population']) + '|' + str(fiche('$TC')['provenance'])")"
chk "type, secteurs, code et district absents : null" "None|None|None|None" \
    "$(py "'|'.join(str(fiche('$TC')[k]) for k in ('type', 'secteurs', 'code', 'district'))")"
chk "aucune commune réelle n'a une population de 0" 0 "$(py "sum(1 for f in d['features'] if f['properties']['population'] == 0)")"
chk "chaque commune réelle porte son district (D-FNCT-2)" 0 \
    "$(py "sum(1 for f in d['features'] if f['properties']['id'] != '$TC' and f['properties']['district'] is None)")"

# -----------------------------------------------------------------------------
echo
echo "4. La carte suit le référentiel"
$PSQL -c "UPDATE communes SET population = 4321, donnees_source = 'declare', updated_at = now() WHERE id = '$TC';" >/dev/null
curl -s -o "$T/carte.json" -H "Authorization: Bearer $T_FNCT" "$API/observatoire/carte-communes"
chk "une population saisie paraît, avec sa provenance (le cache suit)" "4321|declare" \
    "$(py "str(fiche('$TC')['population']) + '|' + str(fiche('$TC')['provenance'])")"
nettoyer
curl -s -o "$T/carte.json" -H "Authorization: Bearer $T_FNCT" "$API/observatoire/carte-communes"
chk "une commune effacée disparaît de la carte" None "$(py "fiche('$TC')")"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
