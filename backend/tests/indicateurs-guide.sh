#!/usr/bin/env bash
# =============================================================================
# v0.15.80 — lot K : les indicateurs du guide de référence (§ 1.2.7).
# DECISIONS_2026-10-20.md, complément du 26/10/2026 ; migration 089.
#
# Elle commence par ce qui est REFUSÉ : la résorption d'un point qui n'est pas un
# point noir, datée dans l'avenir, ou d'une autre commune ; la déclaration d'un
# taux que la plateforme calcule ; un repère de gouvernorat pour une fourchette.
# Puis trois communes de test, en septembre 2026, contre un témoin indépendant
# (tests/indicateurs_guide_attendus.py, qui ne lit que le scénario et la méthode) :
#   A — tous les voyages pesés : taux de collecte mesuré, remplissage, couverture
#       mesurée par les secteurs, points noirs (dont un résorbé) ;
#   B — aucune pesée : taux de collecte ESTIMÉ, en fourchette ; couverture et
#       points noirs déclarés (« 0 » seulement déclaré) ; un prestataire rend
#       l'estimation incomplète ;
#   C — un mois mêlé (un voyage pesé sur trente) : ni taux mesuré ni estimé, il
#       manque des pesées ; le remplissage, en fourchette.
# Et la règle de la SPEC v0.16 : une estimation ne s'ajoute jamais à une pesée.
#
#   docker compose exec -T api npm run test:indicateurs-guide
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
val()  { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
req() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" ${4:+-H "Authorization: Bearer $4"} \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}

A=test_guide_a; B=test_guide_b; C=test_guide_c; X=test_guide_x
ESSAI="'$A','$B','$C','$X'"
. tests/outils/comptes_temporaires.sh
. tests/outils/communes_essai.sh
. tests/outils/base_reelle.sh
nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
  effacer_communes_essai "$ESSAI"
}
nettoyer
trap 'nettoyer; rm -rf "$T"' EXIT
releve_base_reelle

for c in $A $B $C $X; do commune_essai "$c" "TEST Commune $c"; done
compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$B" "Directeur B"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$C" "Directeur C"; T_C=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$X" "Directeur X"; T_X=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire super_admin_fnct "" "FNCT du guide"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire gestionnaire_prestataire "$B" "Prestataire de B"; PRESTA=$COMPTE_ID
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_C" ] && [ -n "$T_X" ] && [ -n "$T_F" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }

AUJ=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date")
AVANT_HIER=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date - 2")

# Le scénario, posé en base. Population 10 000, production théorique 0,8 kg/hab/j.
$PSQL >/dev/null <<SQL
INSERT INTO parametres_commune (commune_id, population_permanente, population_permanente_source, production_theorique_kg_hab_j, production_theorique_source)
VALUES ('$A', 10000, 'TEST', 0.8, 'TEST guide'), ('$B', 10000, 'TEST', 0.8, 'TEST guide'), ('$C', 10000, 'TEST', 0.8, 'TEST guide');
INSERT INTO vehicules (id, registration, commune_id, type, classe_collecte, capacity_m3, volume_provenance) VALUES
  ('test-guide-a-bt', 'TEST-G A-BT', '$A', 'benne_tasseuse', 'benne_tasseuse', 16, 'constructeur'),
  ('test-guide-b-tr', 'TEST-G B-TR', '$B', 'tracteur', NULL, NULL, NULL),
  ('test-guide-c-tr', 'TEST-G C-TR', '$C', 'tracteur', NULL, NULL, NULL);
INSERT INTO vehicules (id, registration, commune_id, type, classe_collecte, capacity_m3, volume_provenance, attele_a) VALUES
  ('test-guide-b-rem', 'TEST-G B-REM', '$B', 'remorque', 'tracteur_remorque_agricole', 6, 'mesure', 'test-guide-b-tr'),
  ('test-guide-c-rem', 'TEST-G C-REM', '$C', 'remorque', 'tracteur_remorque_agricole', 6, 'mesure', 'test-guide-c-tr');
INSERT INTO zones_collecte (commune_id, name, geom, estimated_population) VALUES
  ('$A', 'TEST secteur nord', ST_Multi(ST_MakeEnvelope(9.0, 35.0, 9.001, 35.001, 4326)), 6000),
  ('$A', 'TEST secteur sud', ST_Multi(ST_MakeEnvelope(9.0, 35.002, 9.001, 35.003, 4326)), 3000);
INSERT INTO circuits (commune_id, nom, jours_passage, actif, vehicule_id, type_dechet, voyages_par_jour, date_debut, zone_id)
SELECT '$A', 'TEST circuit A', ARRAY[1,3,5]::smallint[], true, 'test-guide-a-bt', 'menager', 2, DATE '2026-08-01', z.id
  FROM zones_collecte z WHERE z.commune_id = '$A' AND z.name = 'TEST secteur nord';
INSERT INTO circuits (commune_id, nom, jours_passage, actif, vehicule_id, type_dechet, voyages_par_jour, date_debut) VALUES
  ('$B', 'TEST circuit B', ARRAY[1,2,3,4,5,6,7]::smallint[], true, 'test-guide-b-tr', 'menager', 1, DATE '2026-08-01'),
  ('$C', 'TEST circuit C', ARRAY[1,2,3,4,5,6,7]::smallint[], true, 'test-guide-c-tr', 'menager', 1, DATE '2026-08-01');
-- A : tous les voyages de septembre pesés, 7 t chacun.
INSERT INTO pesees (commune_id, circuit_id, voyage, date_pesee, poids_net_kg, vehicule_id, type_dechet, observation)
SELECT '$A', c.id, v, d::date, 7000, 'test-guide-a-bt', 'menager', 'TEST-GUIDE'
  FROM circuits c, generate_series(DATE '2026-09-01', DATE '2026-09-30', interval '1 day') d, generate_series(1, 2) v
 WHERE c.commune_id = '$A' AND extract(isodow FROM d) IN (1, 3, 5);
-- C : un seul voyage pesé en septembre ; un autre, avant-hier, au-delà de la benne pleine.
INSERT INTO pesees (commune_id, circuit_id, voyage, date_pesee, poids_net_kg, vehicule_id, type_dechet, observation)
SELECT '$C', c.id, 1, DATE '2026-09-10', 1200, 'test-guide-c-tr', 'menager', 'TEST-GUIDE' FROM circuits c WHERE c.commune_id = '$C';
INSERT INTO pesees (commune_id, circuit_id, voyage, date_pesee, poids_net_kg, vehicule_id, type_dechet, observation)
SELECT '$C', c.id, 1, DATE '$AVANT_HIER', 2000, 'test-guide-c-tr', 'menager', 'TEST-GUIDE' FROM circuits c WHERE c.commune_id = '$C';
-- A : trois points noirs relevés le 15 août.
INSERT INTO points_collecte (circuit_id, commune_id, voyage, ordre, nom, type, geom, created_at)
SELECT c.id, '$A', 1, o, 'TEST point noir ' || o, 'point_noir', ST_SetSRID(ST_MakePoint(9.0005, 35.0005), 4326), TIMESTAMPTZ '2026-08-15 10:00+01'
  FROM circuits c, generate_series(1, 3) o WHERE c.commune_id = '$A';
-- Un arrêt ordinaire, pour le refus de résorption.
INSERT INTO points_collecte (circuit_id, commune_id, voyage, ordre, nom, type, geom)
SELECT c.id, '$A', 1, 4, 'TEST arrêt', 'porte_a_porte', ST_SetSRID(ST_MakePoint(9.0006, 35.0006), 4326) FROM circuits c WHERE c.commune_id = '$A';
SQL
CA=$(sql "SELECT id FROM circuits WHERE commune_id = '$A'")
PN1=$(sql "SELECT id FROM points_collecte WHERE commune_id = '$A' AND nom = 'TEST point noir 1'")
PN2=$(sql "SELECT id FROM points_collecte WHERE commune_id = '$A' AND nom = 'TEST point noir 2'")
ARRET=$(sql "SELECT id FROM points_collecte WHERE commune_id = '$A' AND nom = 'TEST arrêt'")
chk "le scénario est en base : 26 pesées pour A, 2 pour C, 3 points noirs" "26|2|3" \
    "$(sql "SELECT count(*) FROM pesees WHERE commune_id = '$A' AND date_pesee BETWEEN '2026-09-01' AND '2026-09-30'")|$(sql "SELECT count(*) FROM pesees WHERE commune_id = '$C'")|$(sql "SELECT count(*) FROM points_collecte WHERE commune_id = '$A' AND type = 'point_noir'")"

# -----------------------------------------------------------------------------
echo
echo "1. Ce qui est refusé"
chk "résorber un arrêt qui n'est pas un point noir : 400, avec la raison" "400|1" \
    "$(req PATCH "/circuits/$CA/points/$ARRET" '{"resorbeLe":"2026-09-10"}' "$T_A")|$(val "1 if 'point noir' in d['error'] else 0")"
chk "… et la base le refuse d'elle-même" 1 \
    "$($PSQL -c "UPDATE points_collecte SET resorbe_le = DATE '2026-09-10' WHERE id = '$ARRET'" 2>&1 | grep -c 'points_collecte_resorption')"
chk "une résorption datée dans l'avenir : 400" 400 "$(req PATCH "/circuits/$CA/points/$PN1" '{"resorbeLe":"2099-01-01"}' "$T_A")"
chk "une autre commune ne résorbe pas ce point : introuvable (404)" 404 "$(req PATCH "/circuits/$CA/points/$PN1" '{"resorbeLe":"2026-09-10"}' "$T_X")"
chk "un taux calculé ne se déclare pas (taux de collecte) : 400" 400 \
    "$(req PUT "/kpi/declarations/$B/2026" '{"valeurs":{"TAUX_COLLECTE":{"valeur":90}}}' "$T_B")"
chk "… ni le remplissage" 400 "$(req PUT "/kpi/declarations/$B/2026" '{"valeurs":{"TAUX_REMPLISSAGE":{"valeur":80}}}' "$T_B")"
chk "aucun point noir n'a été résorbé par ces refus" 0 "$(sql "SELECT count(*) FROM points_collecte WHERE commune_id = '$A' AND resorbe_le IS NOT NULL")"

# -----------------------------------------------------------------------------
echo
echo "2. Les gestes de la commune"
chk "A résorbe un point noir le 10 septembre" "200|2026-09-10" \
    "$(req PATCH "/circuits/$CA/points/$PN1" '{"resorbeLe":"2026-09-10"}' "$T_A")|$(val "d['resorbe_le']")"
chk "… et un autre le 5 octobre" 200 "$(req PATCH "/circuits/$CA/points/$PN2" '{"resorbeLe":"2026-10-05"}' "$T_A")"
chk "un point résorbé reste à l'inventaire, daté" "3|2" \
    "$(sql "SELECT count(*) FROM points_collecte WHERE commune_id = '$A' AND type = 'point_noir' AND deleted_at IS NULL")|$(sql "SELECT count(*) FROM points_collecte WHERE commune_id = '$A' AND resorbe_le IS NOT NULL")"
chk "B déclare sa couverture (85 %) et « aucun point noir » (0), avec sa date" 200 \
    "$(req PUT "/kpi/declarations/$B/2026" '{"valeurs":{"TAUX_COUVERTURE":{"valeur":85},"POINTS_NOIRS":{"valeur":0,"commentaire":"Inventaire fait le 01/09/2026 : aucun point noir."}}}' "$T_B")"

# -----------------------------------------------------------------------------
echo
echo "3. Septembre, contre le témoin"
python3 - "$T/scenario.json" "$AUJ" <<'PY'
import json, sys
chemin, aujourdhui = sys.argv[1:3]
import datetime as dt
pa = []
for j in range(1, 31):
    d = dt.date(2026, 9, j)
    if d.isoweekday() in (1, 3, 5):
        pa += [{'circuit': 'TEST circuit A', 'date': d.isoformat(), 'voyage': v, 'kg': 7000} for v in (1, 2)]
s = {
    'mois': '2026-09', 'aujourdhui': aujourdhui,
    'communes': {
        'A': {'theorique': 0.8, 'population': 10000,
              'circuits': [{'nom': 'TEST circuit A', 'jours': [1, 3, 5], 'voyages': 2, 'date_debut': '2026-08-01', 'type': 'menager',
                            'engin': {'classe': 'benne_tasseuse', 'volume': 16}}],
              'pesees': pa,
              'secteurs': [{'population': 6000, 'desservi': True}, {'population': 3000, 'desservi': False}],
              'points_noirs': [{'releve': '2026-08-15', 'resorbe': '2026-09-10'}, {'releve': '2026-08-15', 'resorbe': '2026-10-05'},
                               {'releve': '2026-08-15'}]},
        'B': {'theorique': 0.8, 'population': 10000,
              'circuits': [{'nom': 'TEST circuit B', 'jours': [1, 2, 3, 4, 5, 6, 7], 'voyages': 1, 'date_debut': '2026-08-01', 'type': 'menager',
                            'engin': {'classe': 'tracteur_remorque_agricole', 'volume': 6}}],
              'pesees': []},
        'C': {'theorique': 0.8, 'population': 10000,
              'circuits': [{'nom': 'TEST circuit C', 'jours': [1, 2, 3, 4, 5, 6, 7], 'voyages': 1, 'date_debut': '2026-08-01', 'type': 'menager',
                            'engin': {'classe': 'tracteur_remorque_agricole', 'volume': 6}}],
              'pesees': [{'circuit': 'TEST circuit C', 'date': '2026-09-10', 'voyage': 1, 'kg': 1200}]},
    },
}
json.dump(s, open(chemin, 'w', encoding='utf-8'), ensure_ascii=False)
PY
python3 tests/indicateurs_guide_attendus.py "$T/scenario.json" > "$T/attendus.json"
chk "le témoin a calculé trois communes" 3 "$(python3 -c "import json;print(len(json.load(open('$T/attendus.json'))))" 2>&1)"
# Ce que l'API rend pour septembre : la série mensuelle (valeur, borne haute, source) ; rien = None.
serie() {  # $1 = commune, $2 = code, $3 = jeton
  req GET "/kpi/serie?communeId=$1&code=$2&debut=2026-09-01&fin=2026-09-30&pas=mois" "" "$3" >/dev/null
  val "(lambda p: None if not p else (float(p[0]['valeur']) if p[0]['detail'].get('valeur_max') is None else [float(p[0]['valeur']), float(p[0]['detail']['valeur_max'])]))([x for x in d if x['source'] == 'mesure'])"
}
attendu() { python3 -c "import json;print(json.load(open('$T/attendus.json'))['$1']['$2'])"; }
for code in TAUX_COLLECTE TAUX_COLLECTE_ESTIME TAUX_REMPLISSAGE POINTS_NOIRS; do
  chk "A — $code, comme le témoin" "$(attendu A $code)" "$(serie $A $code "$T_A")"
  chk "B — $code, comme le témoin" "$(attendu B $code)" "$(serie $B $code "$T_B")"
  chk "C — $code, comme le témoin" "$(attendu C $code)" "$(serie $C $code "$T_C")"
done
chk "A : 182 t pesées sur 240 t produites, 75,8 %" "75.8|182.0|240.0" \
    "$(req GET "/kpi/serie?communeId=$A&code=TAUX_COLLECTE&debut=2026-09-01&fin=2026-09-30&pas=mois" "" "$T_A" >/dev/null; val "f\"{float(d[0]['valeur'])}|{float(d[0]['detail']['collecte_t'])}|{float(d[0]['detail']['produit_t'])}\"")"
chk "B : estimé 15 – 18,8 %, sans pesée (36 à 45 t estimées)" "15.0|18.8|36.0|45.0" \
    "$(req GET "/kpi/serie?communeId=$B&code=TAUX_COLLECTE_ESTIME&debut=2026-09-01&fin=2026-09-30&pas=mois" "" "$T_B" >/dev/null; val "f\"{float(d[0]['valeur'])}|{float(d[0]['detail']['valeur_max'])}|{float(d[0]['detail']['estime_min_t'])}|{float(d[0]['detail']['estime_max_t'])}\"")"
chk "C : remplissage 80 – 100 % (1,2 t pour une benne de 6 m³ à 0,20 – 0,25)" "[80.0, 100.0]" "$(serie $C TAUX_REMPLISSAGE "$T_C")"
chk "A : deux points noirs non résorbés fin septembre ; un fin octobre" "2.0|1.0" \
    "$(serie $A POINTS_NOIRS "$T_A")|$(req GET "/kpi/serie?communeId=$A&code=POINTS_NOIRS&debut=2026-10-01&fin=2026-10-31&pas=mois" "" "$T_A" >/dev/null; val "float(d[0]['valeur'])")"

# -----------------------------------------------------------------------------
echo
echo "4. Une estimation ne s'ajoute jamais à une pesée"
chk "C, mois mêlé : ni taux mesuré ni taux estimé" "None|None" "$(serie $C TAUX_COLLECTE "$T_C")|$(serie $C TAUX_COLLECTE_ESTIME "$T_C")"
chk "A, tout pesé : aucun taux estimé" None "$(serie $A TAUX_COLLECTE_ESTIME "$T_A")"
chk "B, rien de pesé : aucun taux mesuré" None "$(serie $B TAUX_COLLECTE "$T_B")"
$PSQL -c "INSERT INTO circuits (commune_id, nom, jours_passage, actif, type_dechet, voyages_par_jour, date_debut, prestataire_id)
          VALUES ('$B', 'TEST circuit prestataire', ARRAY[1]::smallint[], true, 'menager', 1, DATE '2026-08-01', '$PRESTA')" >/dev/null
chk "B confie un circuit ménager à un prestataire : l'estimation n'est plus complète, plus de taux estimé" None "$(serie $B TAUX_COLLECTE_ESTIME "$T_B")"
$PSQL -c "DELETE FROM circuits WHERE commune_id = '$B' AND nom = 'TEST circuit prestataire'" >/dev/null
chk "… le circuit retiré, il revient" "[15.0, 18.8]" "$(serie $B TAUX_COLLECTE_ESTIME "$T_B")"

# -----------------------------------------------------------------------------
echo
echo "5. La fiche de l'année, ce qui manque, la répartition"
fiche() { req GET "/kpi/5-axes?communeId=$1&annee=2026" "" "$T_F" >/dev/null; cp "$T/r.json" "$T/fiche_$1.json"; }
ind() { python3 -c "import json;r=[i for i in json.load(open('$T/fiche_$1.json'))['indicateurs'] if i['code']=='$2'][0];print($3)"; }
fiche $A; fiche $B; fiche $C
chk "A : couverture mesurée par les secteurs, 60 %" "renseigne|mesure|60.0" "$(ind $A TAUX_COUVERTURE "f\"{r['statut']}|{r['source']}|{float(r['valeur'])}\"")"
chk "B : couverture déclarée, 85 %" "renseigne|declare|85.0" "$(ind $B TAUX_COUVERTURE "f\"{r['statut']}|{r['source']}|{float(r['valeur'])}\"")"
chk "C : couverture non renseignée (ni secteurs ni déclaration)" non_renseigne "$(ind $C TAUX_COUVERTURE "r['statut']")"
chk "B : « 0 point noir » seulement parce qu'il est déclaré" "renseigne|declare|0.0" "$(ind $B POINTS_NOIRS "f\"{r['statut']}|{r['source']}|{float(r['valeur'])}\"")"
chk "C : sans inventaire ni déclaration, pas de zéro : non renseigné" non_renseigne "$(ind $C POINTS_NOIRS "r['statut']")"
incoherents() {  # non renseigné ⇔ il manque quelque chose, pour chaque indicateur du guide
  for code in TAUX_COLLECTE TAUX_COLLECTE_ESTIME TAUX_REMPLISSAGE TAUX_COUVERTURE POINTS_NOIRS; do
    req GET "/kpi/manques?communeId=$1&code=$code&annee=2026" "" "$T_F" >/dev/null
    python3 -c "
import json
statut=[i['statut'] for i in json.load(open('$T/fiche_$1.json'))['indicateurs'] if i['code']=='$code'][0]
n=len(json.load(open('$T/r.json')))
if (statut=='non_renseigne') != (n>0): print('$code:'+statut+':'+str(n))"
  done | paste -sd' ' -
}
chk "« non renseigné » et « ce qui manque » vont ensemble, pour A, B et C" "||" "$(incoherents $A)|$(incoherents $B)|$(incoherents $C)"
req GET "/kpi/manques?communeId=$C&code=TAUX_COLLECTE&annee=2026" "" "$T_F" >/dev/null
chk "au taux de collecte de C, il manque exactement les pesées de tous les voyages" voyages_tous_peses "$(val "','.join(sorted({m['source'] for m in d}))")"
chk "le catalogue dit les deux fourchettes" "TAUX_COLLECTE_ESTIME,TAUX_REMPLISSAGE" \
    "$(req GET /kpi/indicateurs "" "$T_A" >/dev/null; val "','.join(sorted(i['code'] for i in d['indicateurs'] if i['fourchette']))")"
chk "une fourchette n'a pas de repère de gouvernorat" "200|0" \
    "$(req GET "/kpi/reference-gouvernorat?communeId=$C&code=TAUX_REMPLISSAGE&debut=2026-09-01&fin=2026-09-30&pas=mois" "" "$T_C")|$(val "len(d)")"
chk "la répartition par commune (FNCT) rend la borne haute du remplissage de C" 1 \
    "$(req GET "/kpi/repartition?code=TAUX_REMPLISSAGE&niveau=commune&annee=2026" "" "$T_F" >/dev/null; val "sum(1 for x in d if x['commune_id']=='$C' and x['valeur_max'] is not None and x['valeur_max'] > x['valeur'])")"

# -----------------------------------------------------------------------------
echo
echo "6. « À vérifier » : au-delà de la benne pleine"
req GET "/communes/$C/coherence" "" "$T_C" >/dev/null
chk "C : un voyage pesé (2 t) au-delà de la benne pleine (6 m³ à 0,25 t/m³ au plus) : avis d'information" "information|1" \
    "$(val "next((e['gravite'] + '|' + str(int(e['constat'].startswith('1 voyage(s)'))) for e in d if 'benne pleine' in e['constat']), 'aucun')")"
chk "… et son arabe" 1 "$(val "1 if any('الصندوق الممتلئ' in (e['constat_ar'] or '') for e in d if 'benne pleine' in e['constat']) else 0")"
req GET "/communes/$A/coherence" "" "$T_A" >/dev/null
chk "A : 7 t dans une benne de 16 m³ à 0,5 (8 t) : aucun avis" 0 "$(val "sum(1 for e in d if 'benne pleine' in e['constat'])")"

# -----------------------------------------------------------------------------
echo
echo "7. Des calculs qui ne compilent pas à la volée"
# Avec la compilation à la volée (JIT), le tonnage estimé d'un mois prenait 3,4 s et
# la fiche annuelle d'une commune une minute ; sans, 33 ms et une demi-seconde.
chk "les calculs de la volumétrie et du guide portent « jit = off »" 16 \
    "$(sql "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'app' AND 'jit=off' = ANY (p.proconfig)
               AND p.proname IN ('tonnage_estime', 'densite_retenue', 'engin_de_travail', '_production_theorique_kg', '_voyages_periode',
                                 '_estimation_periode', '_remplissage_periode', '_couverture', '_points_noirs', '_mesures_guide_periode',
                                 '_mesures_guide_auto_periode', '_mesures_kpi_periode', '_mesures_kpi_auto_periode', 'source_tenue',
                                 'incoherences_volumetrie', 'incoherences_engins')")"

echo
echo "8. En partant"
base_reelle_intacte "pendant la campagne"
nettoyer
chk "les communes de test, leurs circuits, pesées et points sont retirés" "0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM pesees WHERE observation = 'TEST-GUIDE'")|$(sql "SELECT count(*) FROM points_collecte WHERE commune_id IN ($ESSAI)")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
