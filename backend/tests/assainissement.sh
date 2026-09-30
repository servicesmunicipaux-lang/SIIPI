#!/usr/bin/env bash
# =============================================================================
# Étape S0 — assainissement (v0.15.2).
#
# Trois choses, qui commencent chacune par ce que la plateforme REFUSE :
#   1. une migration déjà appliquée ne se modifie pas en silence : le
#      migrateur en garde l'empreinte, et s'arrête si le fichier ne lui
#      correspond plus ;
#   2. la référence légale est la loi organique n° 2004-63 : l'ancienne ne
#      subsiste ni dans les commentaires de la base, ni dans le contrat d'API ;
#   3. un KMZ exporté d'ArcGIS (toute une base d'étude, une couche par
#      dossier, attributs en tableau HTML) ne s'importe pas d'un bloc : on
#      choisit la couche, et au besoin les éléments d'un seul circuit.
#
# Le KMZ d'essai reproduit la structure de celui des circuits existants de
# M'hamdia (PCGD 2026) — tableaux imbriqués compris — avec des valeurs TEST.
#
#   docker compose exec -T api npm run test:assainissement
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
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")
RACINE="$(cd "$(dirname "$0")/.." && pwd)"

nettoyer() { $PSQL -c "DELETE FROM circuits WHERE code = 'TEST-S0-ARCGIS';" >/dev/null 2>&1; }
nettoyer

# -----------------------------------------------------------------------------
echo
echo "1. Le migrateur refuse une migration modifiée après application"
chk "chaque migration appliquée porte son empreinte" \
    "$(sql "SELECT count(*) FROM schema_migrations")" "$(sql "SELECT count(empreinte) FROM schema_migrations")"
ORIGINE=$(sql "SELECT empreinte FROM schema_migrations WHERE filename='014_journal_audit.sql'")
chk "l'empreinte est un SHA-256 (64 caractères hexadécimaux)" 1 \
    "$(printf '%s' "$ORIGINE" | grep -cE '^[0-9a-f]{64}$')"
# On simule un fichier modifié en faussant l'empreinte connue : le fichier
# lui-même n'est pas touché, et l'empreinte d'origine est rétablie ensuite.
$PSQL -c "UPDATE schema_migrations SET empreinte = repeat('0', 64) WHERE filename = '014_journal_audit.sql';" >/dev/null
(cd "$RACINE" && npm run -s migrate >"$T/migrate.txt" 2>&1); CODE=$?
$PSQL -c "UPDATE schema_migrations SET empreinte = '$ORIGINE' WHERE filename = '014_journal_audit.sql';" >/dev/null
chk "le migrateur s'arrête (code de sortie non nul)" 1 "$([ "$CODE" -ne 0 ] && echo 1 || echo 0)"
chk "et nomme la migration en cause" 1 "$(grep -c '014_journal_audit.sql' "$T/migrate.txt")"
chk "et dit quoi faire : une NOUVELLE migration" 1 "$(grep -c 'NOUVELLE migration' "$T/migrate.txt")"
(cd "$RACINE" && npm run -s migrate >"$T/migrate.txt" 2>&1); CODE=$?
chk "l'empreinte rétablie, le migrateur repart" "0|1" "$CODE|$(grep -c 'Base déjà à jour' "$T/migrate.txt")"

# -----------------------------------------------------------------------------
echo
echo "2. La référence légale : loi organique n° 2004-63"
chk "aucun commentaire de la base ne cite le décret-loi 2022-54" 0 \
    "$(sql "SELECT count(*) FROM pg_description WHERE description LIKE '%2022-54%'")"
chk "les commentaires corrigés citent la loi organique 2004-63" 5 \
    "$(sql "SELECT count(*) FROM pg_description WHERE description LIKE '%loi organique 2004-63%'")"
curl -s "$API/openapi.json" -o "$T/openapi.json"
chk "le contrat d'API servi ne cite plus le décret-loi 2022-54" 0 "$(grep -c '2022-54' "$T/openapi.json")"
chk "il cite la loi organique n° 2004-63" 1 "$([ "$(grep -o 'loi organique n° 2004-63' "$T/openapi.json" | wc -l)" -gt 0 ] && echo 1 || echo 0)"

# -----------------------------------------------------------------------------
# Le KMZ d'essai, à la manière d'ArcGIS : une couche par dossier, les
# attributs dans un tableau HTML imbriqué dans la description.
python3 - "$T/arcgis.kmz" <<'PY'
import sys, zipfile
def attributs(nom, paires):
    lignes = ''.join(f'<tr><td>{k}</td><td>{v}</td></tr>' for k, v in paires)
    return ('<![CDATA[<html><body><table><tr style="text-align:center"><td>' + nom + '</td></tr>'
            '<tr><td><table style="font-family:Arial">' + lignes + '</table></td></tr></table></body></html>]]>')
def point(nom, lng, lat, paires):
    return (f'<Placemark><name>{nom}</name><description>{attributs(nom, paires)}</description>'
            f'<Point><coordinates>{lng},{lat},0</coordinates></Point></Placemark>')
def dossier(nom, contenu):
    return f'<Folder><name>{nom}</name>{contenu}</Folder>'
pc = ''.join(point(f'TEST_PT{i}', 10.15 + i / 1000, 36.67, [('FID', i), ('Circuit', 'Circuit TEST 01' if i < 2 else 'Circuit TEST 02')])
             for i in range(4))
pn = ''.join(point(f'TEST_PN{i}', 10.13 + i / 1000, 36.70, [('FID', i), ('Lieu', 'Cité TEST'), ('Type_déch', 'Déchets ménagers')])
             for i in range(2))
ligne = ('<Placemark><name>0</name><description>' + attributs('', [('Nom', 'Circuit TEST 01')]) + '</description>'
         '<MultiGeometry><LineString><coordinates>10.15,36.67,0 10.151,36.671,0 10.152,36.672,0</coordinates></LineString>'
         '<LineString><coordinates>10.152,36.672,0 10.153,36.673,0</coordinates></LineString></MultiGeometry></Placemark>')
surface = ('<Placemark><name>C_TEST_PA</name><description>' + attributs('C_TEST_PA', [('NOM_CIRCUITS', 'C_TEST_PA')]) + '</description>'
           '<MultiGeometry><Polygon><outerBoundaryIs><LinearRing><coordinates>10.1,36.6,0 10.2,36.6,0 10.2,36.7,0 10.1,36.6,0'
           '</coordinates></LinearRing></outerBoundaryIs></Polygon></MultiGeometry></Placemark>')
kml = ('<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>TEST_ARCGIS</name>'
       + dossier('POINT_COLLECT', pc) + dossier('DEPOTOIR_SAUVAGE_PN', pn) + dossier('CIRCUIT_COLLECT_TEST01', ligne)
       + dossier('CIRCUITS_COLLECT_TRACTEURS', surface) + '</Document></kml>')
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('doc.kml', kml)
    z.writestr('Layer0_Symbol_TEST_0.png', b'\x89PNG')
PY
KMZ=$(base64 -w0 "$T/arcgis.kmz")
CIRCUIT=$(sql "INSERT INTO circuits (commune_id, nom, code) VALUES ('$COMMUNE', 'Essai S0 ArcGIS', 'TEST-S0-ARCGIS') RETURNING id")
importer() { # <cible> <valider> <options JSON sans accolades>
  curl -s -o "$T/r.json" -w '%{http_code}' -X POST "$API/circuits/$CIRCUIT/import-kml" \
    -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
    -d "{\"nomFichier\":\"arcgis.kmz\",\"contenu\":\"$KMZ\",\"cible\":\"$1\",\"valider\":$2${3:+,$3}}"
}
chemin() { python3 -c "import json;d=json.load(open('$T/couches.json'));print(next(c['chemin'] for c in d['couches'] if c['nom']=='$1'))"; }

echo
echo "3. Un export ArcGIS ne s'importe pas d'un bloc"
CODE=$(importer points true)
chk "valider sans choisir de couche est refusé (400)" 400 "$CODE"
chk "le refus dit quoi faire" 1 "$(val "int('choisissez celle à importer' in d['error'])")"
chk "rien n'a été écrit" 0 "$(sql "SELECT count(*) FROM points_collecte WHERE circuit_id='$CIRCUIT'")"
CODE=$(importer points false); cp "$T/r.json" "$T/couches.json"
chk "l'aperçu répond, et reconnaît un fichier à plusieurs couches" "200|multicouche" "$CODE|$(val "d['famille']")"
chk "il n'invente aucun arrêt tant qu'aucune couche n'est choisie" 0 "$(val "d['nbPoints']")"
chk "il décrit les quatre couches, dans l'ordre du fichier" "POINT_COLLECT,DEPOTOIR_SAUVAGE_PN,CIRCUIT_COLLECT_TEST01,CIRCUITS_COLLECT_TRACTEURS" \
    "$(val "','.join(c['nom'] for c in d['couches'])")"
chk "avec ce que chacune contient (points, lignes, surfaces)" "4-0-0|2-0-0|0-1-0|0-0-1" \
    "$(val "'|'.join(f\"{c['points']}-{c['lignes']}-{c['surfaces']}\" for c in d['couches'])")"
chk "les attributs sont lus dans le tableau HTML imbriqué, sans le nom de l'entité collé à la clé" "Circuit" \
    "$(val "','.join(a['nom'] for a in d['couches'][0]['attributs'])")"
chk "les champs techniques d'ArcGIS (FID…) sont écartés" 0 \
    "$(val "sum(1 for c in d['couches'] for a in c['attributs'] if a['nom'].upper() in ('FID','OID_','SHAPE'))")"
chk "les valeurs distinctes d'un attribut sont proposées" "Circuit TEST 01|Circuit TEST 02" \
    "$(val "'|'.join(d['couches'][0]['attributs'][0]['valeurs'])")"

echo
echo "4. On choisit la couche, et les éléments d'un seul circuit"
C_PC=$(chemin POINT_COLLECT); C_PN=$(chemin DEPOTOIR_SAUVAGE_PN)
C_L=$(chemin CIRCUIT_COLLECT_TEST01); C_S=$(chemin CIRCUITS_COLLECT_TRACTEURS)
importer points false "\"couche\":\"$C_PC\"" >/dev/null
chk "la couche des points de collecte : ses 4 points, et eux seuls" 4 "$(val "d['nbPoints']")"
importer points false "\"couche\":\"$C_PC\",\"filtre\":{\"attribut\":\"Circuit\",\"valeur\":\"Circuit TEST 01\"}" >/dev/null
chk "filtrée sur « Circuit = Circuit TEST 01 » : 2 points" 2 "$(val "d['nbPoints']")"
chk "l'observation reprend l'attribut, lisible, sans HTML" "Circuit : Circuit TEST 01" "$(val "d['points'][0]['observation']")"
chk "l'aperçu dit que l'ordre n'est pas celui de la tournée (aucune heure)" 1 \
    "$(val "int(any('aucune heure' in a for a in d['avertissements']))")"
importer points false "\"couche\":\"$C_PC\",\"filtre\":{\"attribut\":\"Nom\",\"valeur\":\"TEST_PT\",\"operateur\":\"commence_par\"}" >/dev/null
chk "un filtre sur le nom, par préfixe : les 4 points" 4 "$(val "d['nbPoints']")"
importer points false "\"couche\":\"$C_PN\",\"typePoints\":\"point_noir\"" >/dev/null
chk "une couche de dépotoirs, typée « point noir » : 2 points noirs" "2|point_noir" \
    "$(val "d['nbPoints']")|$(val "','.join(sorted(set(p['type'] for p in d['points'])))")"
importer trace false "\"couche\":\"$C_L\"" >/dev/null
chk "la couche d'un circuit : son tracé (deux segments, 5 sommets)" "True|5" "$(val "d['poseraTrace']")|$(val "d['nbSommetsTrace']")"
importer points false "\"couche\":\"$C_S\"" >/dev/null
chk "une couche de surfaces : rien à importer, et on dit pourquoi" "0|False|1" \
    "$(val "d['nbPoints']")|$(val "d['poseraTrace']")|$(val "int(any('surface' in a for a in d['avertissements']))")"
importer points false "\"couche\":\"inexistante\"" >/dev/null
chk "une couche inconnue est signalée, rien n'est retenu" "0|1" \
    "$(val "d['nbPoints']")|$(val "int(any('existe pas' in a for a in d['avertissements']))")"

echo
echo "5. La validation pose ce qu'on a choisi"
CODE=$(importer points true "\"couche\":\"$C_PC\",\"filtre\":{\"attribut\":\"Circuit\",\"valeur\":\"Circuit TEST 01\"}")
chk "la validation répond" 201 "$CODE"
chk "les 2 arrêts du circuit TEST 01 sont créés, et eux seuls" "2|TEST_PT0,TEST_PT1" \
    "$(sql "SELECT count(*)||'|'||string_agg(nom, ',' ORDER BY ordre) FROM points_collecte WHERE circuit_id='$CIRCUIT' AND deleted_at IS NULL")"
CODE=$(importer trace true "\"couche\":\"$C_L\"")
chk "le tracé de la couche du circuit est posé" "201|5" "$CODE|$(sql "SELECT ST_NPoints(trace) FROM circuits WHERE id='$CIRCUIT'")"

nettoyer
echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
