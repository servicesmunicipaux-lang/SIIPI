#!/usr/bin/env bash
# =============================================================================
# Refonte, lot 3a — les indicateurs dans le temps, et ce qui leur manque.
# docs/specs_metier/SPEC_refonte_indicateurs_saisie.md § 3.1, § 3.2, § 3.4.
#
# Elle commence par ce que la plateforme REFUSE : une série sans indicateur,
# un pas inconnu, des bornes à l'envers ou trop larges, la commune d'un autre,
# la déclaration d'un indicateur calculé, et les fonctions internes ouvertes
# à l'application.
#
# Puis les quatre tests de sortie du § 3.4 :
#   - un mois sans pesée est un TROU dans la série du tonnage, pas un zéro ;
#   - pour le coût à la tonne sans registre carburant, il manque exactement le
#     carburant ; un plein enregistré, l'indicateur se calcule et le manque
#     disparaît ;
#   - le repère du gouvernorat est absent sous cinq communes ;
#   - « non renseigné » et « il manque quelque chose » vont toujours ensemble.
#
# Les valeurs attendues sont recalculées ici à partir des seules données
# insérées (témoin indépendant), jamais lues dans le code testé.
#
#   docker compose exec -T api npm run test:series-indicateurs
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
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer ${4:-$T_DIR}" \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}

TC=test_series
GOUV=TEST-SERIES
VOISINES="test_series_v1 test_series_v2 test_series_v3 test_series_v4"
COMMUNE_DIR="$TC"
. tests/outils/directeur_temporaire.sh
toutes() { echo "'$TC','test_series_v1','test_series_v2','test_series_v3','test_series_v4'"; }
nettoyer() {
  $PSQL -c "DELETE FROM pesees WHERE commune_id IN ($(toutes));" \
        -c "DELETE FROM fuel_logs WHERE commune_id IN ($(toutes));" \
        -c "DELETE FROM interventions_maintenance WHERE commune_id IN ($(toutes));" \
        -c "DELETE FROM effectifs_service WHERE commune_id IN ($(toutes));" \
        -c "DELETE FROM declarations_indicateurs WHERE commune_id IN ($(toutes));" \
        -c "DELETE FROM parametres_commune WHERE commune_id IN ($(toutes));" \
        -c "DELETE FROM vehicules WHERE commune_id IN ($(toutes));" >/dev/null 2>&1
}
fin() {
  nettoyer
  retirer_directeur_temporaire
  $PSQL -c "DELETE FROM communes WHERE id IN ($(toutes));" >/dev/null 2>&1
  rm -rf "$T"
}
nettoyer
$PSQL -c "DELETE FROM communes WHERE id IN ($(toutes));" >/dev/null 2>&1
# Population nulle : le coût à la tonne ne doit pas en dépendre ; le kilo par
# habitant, si — c'est ce qui lui manquera.
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population, activee) VALUES ('$TC', 'TEST commune des séries', 'TEST', '$GOUV', 0, false);" >/dev/null
for v in $VOISINES; do
  $PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$v', 'TEST voisine $v', 'TEST', '$GOUV', 5000);" >/dev/null
done
directeur_temporaire "$TC"
trap fin EXIT
T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_DIR" ] && [ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
AUTRE=$(sql "SELECT id FROM communes WHERE id NOT LIKE 'test_series%' AND NOT est_demo AND deleted_at IS NULL ORDER BY id LIMIT 1")
S="/kpi/serie?communeId=$TC"

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "une série sans indicateur est refusée" 400 "$(req GET "$S&debut=2021-01-01&fin=2021-12-31&pas=mois")"
chk "un indicateur inconnu aussi" 400 "$(req GET "$S&code=XX-99&debut=2021-01-01&fin=2021-12-31&pas=mois")"
chk "un pas inconnu aussi" 400 "$(req GET "$S&code=TONNAGE_T&debut=2021-01-01&fin=2021-12-31&pas=semaine")"
chk "des bornes à l'envers aussi" 400 "$(req GET "$S&code=TONNAGE_T&debut=2021-12-31&fin=2021-01-01&pas=mois")"
chk "plus de 36 mois aussi, et le message le dit" "400|t" \
    "$(req GET "$S&code=TONNAGE_T&debut=2020-01-01&fin=2023-06-30&pas=mois")|$(val "'t' if '36 mois' in d['error'] else 'f'")"
chk "plus de 10 ans aussi" 400 "$(req GET "$S&code=TONNAGE_T&debut=2010-01-01&fin=2025-12-31&pas=annee")"
chk "la série d'une autre commune est introuvable (404)" "404|404|404" \
    "$(req GET "/kpi/serie?communeId=$AUTRE&code=TONNAGE_T&debut=2021-01-01&fin=2021-12-31&pas=mois")|$(req GET "/kpi/manques?communeId=$AUTRE&code=TONNAGE_T")|$(req GET "/kpi/reference-gouvernorat?communeId=$AUTRE&code=TONNAGE_T&debut=2021-01-01&fin=2021-12-31&pas=mois")"
chk "ce qui manque à un indicateur inconnu est refusé" 400 "$(req GET "/kpi/manques?communeId=$TC&code=XX-99")"
chk "un indicateur calculé ne se déclare pas : on complète ses sources (400)" 400 \
    "$(req PUT "/kpi/declarations/$TC/2021" '{"valeurs":{"COUT_TONNE":{"valeur":120}}}')"
chk "les fonctions de calcul internes sont fermées à l'application" "f|f|f|f" \
    "$(sql "SELECT has_function_privilege('siipi_app', 'app._mesures_kpi_periode(date,date,text[])', 'EXECUTE')")|$(sql "SELECT has_function_privilege('siipi_app', 'app._mesures_kpi_auto_periode(date,date,text[])', 'EXECUTE')")|$(sql "SELECT has_function_privilege('siipi_app', 'app._serie(text[],text,date,date,text)', 'EXECUTE')")|$(sql "SELECT has_function_privilege('siipi_app', 'app.source_tenue(text,text,date,date,text)', 'EXECUTE')")"

# -----------------------------------------------------------------------------
echo
echo "2. Un mois sans pesée est un trou, pas un zéro"
peser() { # commune jour kg
  $PSQL -c "INSERT INTO pesees (commune_id, date_pesee, poids_net_kg, vehicule_immat, observation) VALUES ('$1', '$2', $3, 'TEST-SERIES', 'TEST-SERIES');" >/dev/null
}
peser "$TC" 2021-01-15 5000
peser "$TC" 2021-01-20 1500
peser "$TC" 2021-03-10 7000
chk "la série mensuelle de janvier à mars a deux points : janvier et mars" "200|2|2021-01-01,2021-03-01" \
    "$(req GET "$S&code=TONNAGE_T&debut=2021-01-01&fin=2021-03-31&pas=mois")|$(val "len(d)")|$(val "','.join(p['periode_debut'] for p in d)")"
chk "aucune ligne pour février — ni zéro, ni valeur vide" f "$(val "'t' if any(p['periode_debut'].startswith('2021-02') for p in d) else 'f'")"
chk "les valeurs sont les pesées du mois, en tonnes, mesurées" "6.5|7.0|mesure" \
    "$(val "str(float(d[0]['valeur']))")|$(val "str(float(d[1]['valeur']))")|$(val "d[0]['source']")"
req GET "$S&code=TONNAGE_T&debut=2021-01-01&fin=2021-12-31&pas=annee" >/dev/null
SERIE_AN=$(val "str(float(d[0]['valeur'])) if len(d) == 1 else 'erreur'")
chk "le point annuel fait la somme des mois (témoin : 13,5 t)" "13.5" "$SERIE_AN"
req GET "/kpi/5-axes?communeId=$TC&annee=2021" >/dev/null
chk "et c'est la valeur de la carte de l'indicateur" "$SERIE_AN" \
    "$(val "str(float([i for i in d['indicateurs'] if i['code'] == 'TONNAGE_T'][0]['valeur']))")"
chk "un état d'aujourd'hui (circuits enregistrés) n'a pas de point pour une année passée" "200|0" \
    "$(req GET "$S&code=CIRCUITS&debut=2021-01-01&fin=2021-12-31&pas=annee")|$(val "len(d)")"
chk "une valeur annuelle (masse salariale) ne se découpe pas en mois" "200|0" \
    "$(req GET "$S&code=MASSE_SALARIALE&debut=2021-01-01&fin=2021-12-31&pas=mois")|$(val "len(d)")"
chk "la série s'exporte (CSV, en-têtes en français)" "200|t" \
    "$(curl -s -o "$T/serie.csv" -w '%{http_code}' -H "Authorization: Bearer $T_DIR" "$API$S&code=TONNAGE_T&debut=2021-01-01&fin=2021-03-31&pas=mois&format=csv")|$(grep -q 'Début de la période' "$T/serie.csv" && echo t || echo f)"

# -----------------------------------------------------------------------------
echo
echo "3. Ce qui manque — et qui disparaît quand la donnée arrive"
manques() { req GET "/kpi/manques?communeId=$TC&code=$1&annee=2021" >/dev/null; val "'|'.join(sorted({str(m['groupe']) + ':' + [x for x in d if x['groupe'] == m['groupe']][0]['source'] for m in d}))"; }
chk "sans population, il manque au kilo par habitant la population (les pesées sont là)" "2:population" "$(manques KG_HAB_J)"
chk "… et le formulaire à ouvrir est le paramètre « population »" "parametre|population" "$(val "d[0]['nature'] + '|' + d[0]['cible']")"
chk "au coût à la tonne, il manque masse salariale, carburant, maintenance et redevances" \
    "2:masse_salariale|3:carburant|4:maintenance|5:declaration" "$(manques COUT_TONNE)"
# Les données sources, une à une — jamais le résultat.
req POST "/trucks?communeId=$TC" '{"registration":"TEST-SERIES 1","type":"benne_tasseuse"}' >/dev/null
VEH=$(val "d['id']")
$PSQL -c "INSERT INTO effectifs_service (commune_id, annee, service, effectif_ouvriers, effectif_encadrement, masse_salariale_tnd) VALUES ('$TC', 2021, 'proprete', 20, 2, 300000);" >/dev/null
$PSQL -c "INSERT INTO interventions_maintenance (commune_id, vehicule_id, date_intervention, type, cout_tnd) VALUES ('$TC', '$VEH', '2021-05-04', 'vidange', 1200);" >/dev/null
chk "la commune déclare ses redevances de décharge" 200 \
    "$(req PUT "/kpi/declarations/$TC/2021" '{"valeurs":{"ECO-DECHARGE":{"valeur":9000}}}')"
chk "il ne manque plus que le carburant — registre, ou à défaut sa déclaration" "3:carburant" "$(manques COUT_TONNE)"
chk "… les deux voies sont proposées, le registre d'abord" "carburant:formulaire:plein-carburant|declaration:declaration:ECO-CARBURANT" \
    "$(val "'|'.join(m['source'] + ':' + m['nature'] + ':' + m['cible'] for m in d)")"
req GET "/kpi/5-axes?communeId=$TC&annee=2021" >/dev/null
chk "le coût à la tonne reste non renseigné" "non_renseigne|None" \
    "$(val "[i['statut'] + '|' + str(i['valeur']) for i in d['indicateurs'] if i['code'] == 'COUT_TONNE'][0]")"
chk "un plein enregistré au registre carburant" 201 \
    "$(req POST /registres/carburant "{\"vehiculeId\":\"$VEH\",\"datePlein\":\"2021-06-01\",\"litres\":400,\"montantTnd\":880}")"
chk "le manque a disparu" "" "$(manques COUT_TONNE)"
# Témoin : (masse + carburant + maintenance + redevances) × jours pesés / jours
# de l'année, divisé par le tonnage. Janvier et mars pesés : 62 jours sur 365.
ATTENDU=$(python3 -c "print(float(round((300000 + 880 + 1200 + 9000) * min(1, 62 / 365) / 13.5, 3)))")
req GET "/kpi/5-axes?communeId=$TC&annee=2021" >/dev/null
chk "le coût à la tonne se calcule, sans population (témoin : $ATTENDU TND/t)" "renseigne|$ATTENDU" \
    "$(val "[i['statut'] + '|' + str(float(i['valeur'])) for i in d['indicateurs'] if i['code'] == 'COUT_TONNE'][0]")"
$PSQL -c "INSERT INTO parametres_commune (commune_id, population_permanente, population_permanente_source) VALUES ('$TC', 10000, 'TEST recensement fictif') ON CONFLICT (commune_id) DO UPDATE SET population_permanente = 10000, population_permanente_source = 'TEST recensement fictif';" >/dev/null
chk "la population déclarée, le kilo par habitant ne manque plus de rien" "" "$(manques KG_HAB_J)"
chk "un indicateur seulement déclaré manque de sa déclaration" "1:declaration" "$(manques M1-4)"
chk "… déclarée, il ne manque plus de rien" "200|" \
    "$(req PUT "/kpi/declarations/$TC/2021" '{"valeurs":{"M1-4":{"valeur":75}}}')|$(manques M1-4)"
req GET "$S&code=M1-4&debut=2021-01-01&fin=2021-12-31&pas=annee" >/dev/null
chk "son point annuel est déclaré, avec son taux d'atteinte" "75.0|declare|0.75" \
    "$(val "str(float(d[0]['valeur'])) + '|' + d[0]['source'] + '|' + str(d[0]['taux_atteinte'])")"
$PSQL -c "INSERT INTO declarations_indicateurs (commune_id, indicateur_code, annee, mois, valeur, cible) VALUES ('$TC', 'M3-2', 2021, 2, 3, 4);" >/dev/null
chk "une déclaration mensuelle fait un point mensuel, et un seul" "200|1|2021-02-01|declare" \
    "$(req GET "$S&code=M3-2&debut=2021-01-01&fin=2021-06-30&pas=mois")|$(val "len(d)")|$(val "d[0]['periode_debut']")|$(val "d[0]['source']")"
chk "un indicateur sans objet pour la commune ne manque de rien" "200|" \
    "$(req PUT "/kpi/declarations/$TC/2021" '{"profil":{"a_abattoir":false},"valeurs":{}}')|$(manques M2-5)"

# -----------------------------------------------------------------------------
echo
echo "4. « Non renseigné » et « il manque quelque chose » vont ensemble"
# Pour chaque indicateur et donnée de la commune, en 2021 : non renseigné ⇔ au
# moins un manque ; renseigné ou sans objet ⇔ aucun.
incoherents() {
  req GET "/kpi/5-axes?communeId=$1&annee=2021" "" "$T_FNCT" >/dev/null
  cp "$T/r.json" "$T/axes.json"
  for code in $(python3 -c "import json;print(' '.join(i['code'] for i in json.load(open('$T/axes.json'))['indicateurs']))"); do
    req GET "/kpi/manques?communeId=$1&code=$code&annee=2021" "" "$T_FNCT" >/dev/null
    python3 -c "
import json
statut=[i['statut'] for i in json.load(open('$T/axes.json'))['indicateurs'] if i['code']=='$code'][0]
n=len(json.load(open('$T/r.json')))
if (statut=='non_renseigne') != (n>0): print('$code:'+statut+':'+str(n))"
  done | paste -sd' ' -
}
chk "commune de test (tout le parcours ci-dessus) : aucune incohérence" "" "$(incoherents "$TC")"
chk "commune voisine sans aucune donnée : aucune incohérence" "" "$(incoherents test_series_v1)"
chk "chaque indicateur du catalogue a ses dépendances (une donnée, pas du code)" 0 \
    "$(sql "SELECT count(*) FROM indicateurs_kpi k WHERE NOT EXISTS (SELECT 1 FROM dependances_indicateurs d WHERE d.indicateur_code = k.code)")"

# -----------------------------------------------------------------------------
echo
echo "5. Le repère du gouvernorat : jamais sous cinq communes, jamais un nom"
REF="/kpi/reference-gouvernorat?communeId=$TC&code=TONNAGE_T&debut=2021-01-01&fin=2021-03-31&pas=mois"
peser test_series_v1 2021-01-05 2000
peser test_series_v2 2021-01-06 3000
peser test_series_v3 2021-01-07 4000
chk "quatre communes ont une valeur en janvier : pas de repère" "200|0" "$(req GET "$REF")|$(val "len(d)")"
peser test_series_v4 2021-01-08 5000
# Témoin : (6,5 + 2 + 3 + 4 + 5) / 5 = 4,1 t ; mars n'a qu'une commune.
chk "cinq communes : le repère de janvier apparaît, moyenne 4,1 t sur 5 communes" "200|1|2021-01-01|4.1|5" \
    "$(req GET "$REF")|$(val "len(d)")|$(val "d[0]['periode_debut']")|$(val "str(float(d[0]['moyenne']))")|$(val "d[0]['communes']")"
chk "mars, une seule commune : pas de repère" f "$(val "'t' if any(p['periode_debut'].startswith('2021-03') for p in d) else 'f'")"
chk "la réponse ne nomme aucune commune" "f|periode_debut,periode_fin,moyenne,communes" \
    "$(grep -q 'test_series' "$T/r.json" && echo t || echo f)|$(val "','.join(d[0].keys())")"

# -----------------------------------------------------------------------------
echo
echo "6. Les droits"
chk "la FNCT lit la série et ce qui manque à la commune" "200|200" \
    "$(req GET "$S&code=TONNAGE_T&debut=2021-01-01&fin=2021-03-31&pas=mois" "" "$T_FNCT")|$(req GET "/kpi/manques?communeId=$TC&code=KG_HAB_J&annee=2021" "" "$T_FNCT")"
chk "en SQL direct, une commune ne lit pas la série d'une autre" 0 \
    "$($PSQL -c "SET app.role = 'admin_commune'; SET app.user_id = '$DIR_ID'; SET app.commune_id = '$TC'; SET ROLE siipi_app;
                 SELECT count(*) FROM app.serie_indicateur('test_series_v1', 'TONNAGE_T', '2021-01-01', '2021-03-31', 'mois');" 2>/dev/null | tail -1 | tr -d ' ')"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
