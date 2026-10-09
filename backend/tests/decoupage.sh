#!/usr/bin/env bash
# =============================================================================
# Test du découpage communal officiel (migration 025).
#
# Une limite communale décide de ce qui relève de quelle commune : où atterrit
# un signalement, à qui s'impute un tonnage, quelle surface sert de
# dénominateur. Les tests portent donc moins sur l'affichage que sur trois
# garanties :
#
#   1. personne d'autre que la FNCT ne déplace une limite ;
#   2. un tracé absurde est refusé AVANT d'entrer en base ;
#   3. superficie, provenance et date restent d'accord avec le tracé.
#
#   docker compose run --rm api npm run test:decoupage
#
# Note : l'API limite les connexions à 20 par quart d'heure et par adresse IP.
# Pour enchaîner les campagnes, démarrer l'API avec AUTH_RATE_LIMIT_MAX=200.
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Siipi2026!\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
code() { curl -s -o /tmp/siipi_d.json -w '%{http_code}' "$@"; }
jq_()  { python3 -c "import json,sys;d=json.load(open('/tmp/siipi_d.json'));print($1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

T_FNCT=$(tok admin.national@siipi.tn)
T_HS=$(tok directeur.houmtsouk@siipi.tn)
T_CIT=$(tok citoyen.demo@siipi.tn)
[ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }

COMMUNE=medenine_djerba_midoun

echo
echo "1. Le référentiel est en place"
chk "au moins 340 communes ont un territoire" "t" \
    "$([ "$(sql "SELECT count(*) FROM communes WHERE boundary_geom IS NOT NULL")" -ge 340 ] && echo t || echo f)"
chk "aucune géométrie invalide" 0 \
    "$(sql "SELECT count(*) FROM communes WHERE boundary_geom IS NOT NULL AND NOT ST_IsValid(boundary_geom)")"
# Une limite mal projetée ne lève AUCUNE erreur : PostGIS ramène les
# coordonnées dans l'intervalle valide et l'on obtient des communes au large
# de l'Afrique. Seule une vérification explicite l'attrape.
chk "aucune commune hors du territoire tunisien" 0 \
    "$(sql "SELECT count(*) FROM communes WHERE boundary_geom IS NOT NULL
              AND NOT ST_Within(boundary_geom, ST_MakeEnvelope(7.0, 30.0, 12.5, 38.0, 4326))")"
chk "aucune superficie aberrante (> 30 000 km²)" 0 \
    "$(sql "SELECT count(*) FROM communes WHERE area_km2 > 30000")"
chk "le code municipalité officiel est renseigné" "t" \
    "$([ "$(sql "SELECT count(*) FROM communes WHERE code_municipalite IS NOT NULL")" -ge 340 ] && echo t || echo f)"
chk "et il est unique" 0 \
    "$(sql "SELECT count(*) FROM (SELECT code_municipalite FROM communes WHERE code_municipalite IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x")"
chk "le point de repère de chaque commune tombe dans son territoire" 0 \
    "$(sql "SELECT count(*) FROM communes WHERE boundary_geom IS NOT NULL AND geom IS NOT NULL
              AND NOT ST_Intersects(boundary_geom, geom)")"

echo
echo "2. Lecture des limites"
CODE=$(code "$API/communes/boundaries?communes=$COMMUNE" -H "Authorization: Bearer $T_HS")
chk "la commune lit sa limite" 200 "$CODE"
chk "avec sa superficie et son code officiel" "t" \
    "$(jq_ "'t' if d['features'][0]['properties']['areaKm2'] and d['features'][0]['properties']['codeMunicipalite'] else 'f'")"
CODE=$(code "$API/communes/boundaries?communes=$COMMUNE" -H "Authorization: Bearer $T_CIT")
chk "un citoyen aussi : une limite administrative n'est pas une donnée d'exploitation" 200 "$CODE"
CODE=$(code "$API/communes/boundaries?communes=$COMMUNE")
chk "mais pas un visiteur anonyme" 401 "$CODE"

# La simplification n'est pas un confort : les 349 tracés pleine résolution
# pèsent une douzaine de méga-octets, soit une minute d'attente sur une
# connexion moyenne pour un résultat visuellement identique.
BRUT=$(curl -s "$API/communes/boundaries?communes=$COMMUNE&tolerance=0" -H "Authorization: Bearer $T_HS" -o /dev/null -w '%{size_download}')
SIMPLE=$(curl -s "$API/communes/boundaries?communes=$COMMUNE&tolerance=0.01" -H "Authorization: Bearer $T_HS" -o /dev/null -w '%{size_download}')
chk "la version simplifiée est nettement plus légère" "t" \
    "$([ "$SIMPLE" -lt "$((BRUT / 3))" ] && echo t || echo f)"

echo
echo "3. Qui peut déplacer une limite"
SURFACE_AVANT=$(sql "SELECT area_km2 FROM communes WHERE id='$COMMUNE'")
CARRE='{"geometry":{"type":"Polygon","coordinates":[[[10.90,33.75],[11.00,33.75],[11.00,33.85],[10.90,33.85],[10.90,33.75]]]}}'

CODE=$(code -X PUT "$API/communes/$COMMUNE/frontiere" -H "Authorization: Bearer $T_HS" \
  -H 'Content-Type: application/json' -d "$CARRE")
chk "la commune ne redessine pas sa propre limite" 403 "$CODE"
CODE=$(code -X PUT "$API/communes/$COMMUNE/frontiere" -H "Authorization: Bearer $T_CIT" \
  -H 'Content-Type: application/json' -d "$CARRE")
chk "un citoyen non plus" 403 "$CODE"
chk "et la limite n'a pas bougé" "$SURFACE_AVANT" "$(sql "SELECT area_km2 FROM communes WHERE id='$COMMUNE'")"

# Le garde-fou doit tenir même sans passer par l'API : c'est un déclencheur en
# base, pas un contrôle applicatif contournable par une autre requête.
chk "même en SQL direct, la commune est refusée" "t" \
    "$($PSQL <<'SQL' 2>&1 | grep -q 'FRONTIERE_RESERVEE_FNCT' && echo t || echo f
BEGIN;
SELECT set_config('app.role','admin_commune',true),
       set_config('app.commune_id','medenine_djerba_midoun',true),
       set_config('app.user_id',(SELECT id::text FROM users WHERE email='directeur.midoun@siipi.tn'),true);
UPDATE communes SET boundary_geom = ST_Multi(ST_Buffer(boundary_geom, 0.01))
 WHERE id = 'medenine_djerba_midoun';
COMMIT;
SQL
)"

echo
echo "4. Un tracé absurde est refusé avant d'entrer en base"
CODE=$(code -X PUT "$API/communes/$COMMUNE/frontiere" -H "Authorization: Bearer $T_FNCT" \
  -H 'Content-Type: application/json' \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[2.0,48.0],[2.1,48.0],[2.1,48.1],[2.0,48.1],[2.0,48.0]]]}}')
chk "un tracé hors de Tunisie est refusé" 400 "$CODE"
CODE=$(code -X PUT "$API/communes/$COMMUNE/frontiere" -H "Authorization: Bearer $T_FNCT" \
  -H 'Content-Type: application/json' \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[10.90,33.75],[10.9001,33.75],[10.9001,33.7501],[10.90,33.7501],[10.90,33.75]]]}}')
chk "un tracé minuscule est refusé" 400 "$CODE"
CODE=$(code -X PUT "$API/communes/$COMMUNE/frontiere" -H "Authorization: Bearer $T_FNCT" \
  -H 'Content-Type: application/json' -d '{"geometry":{"type":"Point","coordinates":[10.9,33.8]}}')
chk "une géométrie qui n'est pas une surface est refusée" 400 "$CODE"

echo
echo "5. La FNCT rectifie, la base tient les comptes"
CODE=$(code -X PUT "$API/communes/$COMMUNE/frontiere" -H "Authorization: Bearer $T_FNCT" \
  -H 'Content-Type: application/json' -d "$CARRE")
chk "la FNCT enregistre un tracé valide" 200 "$CODE"
chk "la provenance passe à « corrigé FNCT »" "corrige_fnct" \
    "$(sql "SELECT boundary_source FROM communes WHERE id='$COMMUNE'")"
chk "la date de modification est posée par la base" "t" \
    "$([ -n "$(sql "SELECT boundary_maj_le FROM communes WHERE id='$COMMUNE' AND boundary_maj_le IS NOT NULL")" ] && echo t || echo f)"
chk "l'auteur de la rectification est enregistré" "t" \
    "$([ -n "$(sql "SELECT boundary_maj_par FROM communes WHERE id='$COMMUNE' AND boundary_maj_par IS NOT NULL")" ] && echo t || echo f)"
# Le carré de 0,1° sur 0,1° fait environ 103 km² à cette latitude : la
# superficie doit suivre le tracé, sans quoi les ratios au km² mentiraient.
chk "la superficie est recalculée depuis le tracé" "t" \
    "$(python3 -c "
s = float('$(sql "SELECT area_km2 FROM communes WHERE id='$COMMUNE'")')
print('t' if 95 < s < 115 else 'f')" 2>/dev/null)"
chk "et elle a bien changé" "f" \
    "$([ "$SURFACE_AVANT" = "$(sql "SELECT area_km2 FROM communes WHERE id='$COMMUNE'")" ] && echo t || echo f)"

echo
echo "6. Remise en état"
# Un banc d'essai ne doit pas laisser derrière lui un référentiel national faux.
# Cette section effaçait la limite de Midoun et demandait de relancer l'import
# à la main : faute de quoi Midoun restait sans territoire après chaque
# `npm test` — sur toute base où les campagnes tournent (JC-007). On rejoue
# l'import officiel : c'est la limite de référence, et l'outil qui la pose.
( cd "$(dirname "$0")/.." && npm run -s import:decoupage >/tmp/siipi_d_import.log 2>&1 )
chk "la limite officielle de Midoun est rendue, telle que l'import la pose" "officiel|t" \
    "$(sql "SELECT boundary_source FROM communes WHERE id='$COMMUNE'")|$(sql "SELECT (boundary_geom IS NOT NULL) FROM communes WHERE id='$COMMUNE'")"
chk "et sa superficie n'est plus celle du tracé d'essai" "f" \
    "$(python3 -c "
s = float('$(sql "SELECT area_km2 FROM communes WHERE id='$COMMUNE'")' or 0)
print('t' if 95 < s < 115 else 'f')" 2>/dev/null)"

echo
echo "7. Zarzouna rattachée à Bizerte, El Hchachna commune à part entière (D-FNCT-3)"
# Le témoin est la couche officielle elle-même, lue ici : la campagne ne
# compare pas l'API à la base, mais la base au document de référence.
COUCHE=$(dirname "$0")/../seed/data/decoupage_communal.geojson.gz
APPARIEMENT=$(dirname "$0")/../seed/data/appariement_communes.json
couche() { python3 -c "
import gzip, json
f = json.load(gzip.open('$COUCHE', 'rt', encoding='utf-8'))['features']
a = json.load(open('$APPARIEMENT', encoding='utf-8'))
$1" 2>/dev/null || echo erreur; }
code "$API/communes" -H "Authorization: Bearer $T_FNCT" >/dev/null
chk "Zarzouna ne figure plus comme commune" 0 "$(jq_ "sum(1 for c in d if c['id']=='bizerte_zarzouna')")"
chk "El Hchachna figure, commune active du gouvernorat de Bizerte" "1|Bizerte" \
    "$(jq_ "sum(1 for c in d if c['id']=='bizerte_el_hchachna')")|$(jq_ "[c['gouvernorat'] for c in d if c['id']=='bizerte_el_hchachna'][0]")"
chk "le référentiel compte autant de communes que la couche officielle" "$(couche "print(len(f))")" "$(jq_ "len(d)")"
chk "… 350, pas 351" 350 "$(jq_ "len(d)")"
IDS=$(jq_ "','.join(sorted(c['id'] for c in d))")
chk "chaque commune de la couche a sa commune au référentiel" 0 \
    "$(couche "ids = set('$IDS'.split(',')); print(sum(1 for x in f if a.get(str(x['properties']['code_municipalite']), {}).get('commune_id') not in ids))")"
code "$API/observatoire/gouvernorats" -H "Authorization: Bearer $T_FNCT" >/dev/null
chk "le tableau national compte à Bizerte les communes de la couche" "$(couche "print(sum(1 for x in f if x['properties']['nom_gouvernorat_fr']=='Bizerte'))")" \
    "$(jq_ "[g['communes'] for g in d if g['gouvernorat']=='Bizerte'][0]")"
chk "Zarzouna est introuvable, même pour la FNCT" 404 "$(code "$API/communes/bizerte_zarzouna" -H "Authorization: Bearer $T_FNCT")"
chk "un citoyen ne peut pas y déclarer son adresse" 404 \
    "$(code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
       -d '{"communeId":"bizerte_zarzouna","adresse":"TEST adresse"}')"
chk "rien ne s'efface : la ligne reste, retirée, rattachée à Bizerte, motif et source écrits" "true|bizerte_bizerte_nord_centre|true|false" \
    "$(sql "SELECT (deleted_at IS NOT NULL)||'|'||fusionnee_dans||'|'||(motif_retrait LIKE '%Instance Prospective%')||'|'||activee FROM communes WHERE id='bizerte_zarzouna'")"
chk "El Hchachna a son contour officiel, et la position la retrouve" "officiel|bizerte_el_hchachna" \
    "$(sql "SELECT boundary_source FROM communes WHERE id='bizerte_el_hchachna'")|$(P=$(sql "SELECT ST_Y(p)||','||ST_X(p) FROM (SELECT ST_PointOnSurface(boundary_geom) p FROM communes WHERE id='bizerte_el_hchachna') x"); code -X POST "$API/communes/localiser" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' -d "{\"lat\":${P%,*},\"lng\":${P#*,}}" >/dev/null; jq_ "d['commune']['id']")"
code "$API/observatoire/corrections-referentiel" -H "Authorization: Bearer $T_CIT" >/dev/null
chk "l'observatoire dit la correction et sa source" "Zarzouna>Bizerte (Nord & Centre)|El Hchachna|Instance Prospective, arrêté conjoint en attente" \
    "$(jq_ "[c['commune']+'>'+c['cible'] for c in d if c['nature']=='rattachee'][0]")|$(jq_ "[c['commune'] for c in d if c['nature']=='creee'][0]")|$(jq_ "d[0]['source']")"

# Le rattachement, éprouvé sur des communes de test : ce qu'il refuse d'abord.
$PSQL -c "DELETE FROM pesees WHERE commune_id LIKE 'test_fusion_%';
          DELETE FROM points_collecte WHERE commune_id LIKE 'test_fusion_%';
          DELETE FROM circuits WHERE commune_id LIKE 'test_fusion_%';
          DELETE FROM vehicules WHERE commune_id LIKE 'test_fusion_%';
          UPDATE communes SET fusionnee_dans = NULL WHERE id LIKE 'test_fusion_%';
          DELETE FROM communes WHERE id LIKE 'test_fusion_%';
          INSERT INTO communes (id, name, name_ar, gouvernorat) VALUES
            ('test_fusion_a', 'TEST rattachée', 'TEST', 'TEST'),
            ('test_fusion_b', 'TEST qui reçoit', 'TEST', 'TEST'),
            ('test_fusion_c', 'TEST déjà retirée', 'TEST', 'TEST');" >/dev/null 2>&1
rattacher() { $PSQL -c "SELECT app.rattacher_commune('$1', '$2', '$3');" 2>&1 | head -1; }
chk "une commune ne se rattache pas à elle-même" 1 "$(rattacher test_fusion_a test_fusion_a 'TEST motif' | grep -c RATTACHEMENT_SOI)"
chk "un motif est exigé" 1 "$(rattacher test_fusion_a test_fusion_b 'x' | grep -c RATTACHEMENT_MOTIF)"
$PSQL -c "SELECT app.rattacher_commune('test_fusion_c', 'test_fusion_b', 'TEST motif de retrait');" >/dev/null 2>&1
chk "on ne rattache pas à une commune retirée" 1 "$(rattacher test_fusion_a test_fusion_c 'TEST motif' | grep -c RATTACHEMENT_CIBLE)"
CIRCUIT=$(sql "INSERT INTO circuits (commune_id, nom) VALUES ('test_fusion_a', 'TEST circuit à rattacher') RETURNING id")
$PSQL -c "INSERT INTO points_collecte (circuit_id, commune_id, voyage, ordre, nom, geom, source)
            VALUES ('$CIRCUIT', 'test_fusion_a', 1, 1, 'TEST point', ST_SetSRID(ST_MakePoint(9.8, 37.2), 4326), 'saisie');
          INSERT INTO pesees (commune_id, circuit_id, date_pesee, poids_net_kg, vehicule_immat, observation)
            VALUES ('test_fusion_a', '$CIRCUIT', CURRENT_DATE - 1, 1000, 'TEST 9999', 'TEST pesée à rattacher');
          INSERT INTO vehicules (id, registration, commune_id, type) VALUES ('test-fusion-engin', 'TEST 9999', 'test_fusion_a', 'camion');" >/dev/null 2>&1
chk "une donnée hors du champ décidé (un engin) fait refuser, et la dit" 1 "$(rattacher test_fusion_a test_fusion_b 'TEST motif' | grep -c 'vehicules : 1')"
chk "… sans rien avoir déplacé" "test_fusion_a|f" \
    "$(sql "SELECT commune_id FROM circuits WHERE id='$CIRCUIT'")|$(sql "SELECT (deleted_at IS NOT NULL) FROM communes WHERE id='test_fusion_a'")"
$PSQL -c "DELETE FROM vehicules WHERE id = 'test-fusion-engin';" >/dev/null 2>&1
chk "le rattachement déplace circuits, points et pesées" '{"pesees": 1, "circuits": 1, "points_collecte": 1}' \
    "$($PSQL -c "SELECT app.rattacher_commune('test_fusion_a', 'test_fusion_b', 'TEST motif de rattachement');" 2>/dev/null | head -1)"
chk "… les données historiques sont à la commune qui reçoit" "test_fusion_b|test_fusion_b|test_fusion_b" \
    "$(sql "SELECT commune_id FROM circuits WHERE id='$CIRCUIT'")|$(sql "SELECT commune_id FROM points_collecte WHERE circuit_id='$CIRCUIT'")|$(sql "SELECT commune_id FROM pesees WHERE circuit_id='$CIRCUIT'")"
chk "… et la commune rattachée est retirée, jamais effacée" "t|test_fusion_b" \
    "$(sql "SELECT (deleted_at IS NOT NULL) FROM communes WHERE id='test_fusion_a'")|$(sql "SELECT fusionnee_dans FROM communes WHERE id='test_fusion_a'")"
chk "on ne rattache pas deux fois" 1 "$(rattacher test_fusion_a test_fusion_b 'TEST motif' | grep -c RATTACHEMENT_SOURCE)"
chk "l'application n'a aucun droit sur le rattachement" "f" \
    "$(sql "SELECT has_function_privilege('siipi_app', 'app.rattacher_commune(text,text,text)', 'EXECUTE')")"
$PSQL -c "DELETE FROM pesees WHERE commune_id LIKE 'test_fusion_%';
          DELETE FROM points_collecte WHERE commune_id LIKE 'test_fusion_%';
          DELETE FROM circuits WHERE commune_id LIKE 'test_fusion_%';
          UPDATE communes SET fusionnee_dans = NULL WHERE id LIKE 'test_fusion_%';
          DELETE FROM communes WHERE id LIKE 'test_fusion_%';" >/dev/null 2>&1
chk "les communes de test sont retirées" 0 "$(sql "SELECT count(*) FROM communes WHERE id LIKE 'test_fusion_%'")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
