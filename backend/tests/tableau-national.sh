#!/usr/bin/env bash
# =============================================================================
# Refonte, lot 4a — le tableau de bord national.
# docs/specs_metier/SPEC_refonte_indicateurs_saisie.md § 4.
#
# Elle commence par ce que la plateforme REFUSE : le détail national à une
# commune, un niveau inconnu, des bornes à l'envers ou trop larges.
#
# Puis le test de sortie du § 4 :
#   - la commune de démonstration est absente de tout agrégat ;
#   - un agrégat de gouvernorat dit sur combien de communes il porte ;
#   - aucune route ne rend un rang, aucune liste n'est rangée par valeur ;
# et ce que le lot ajoute : le déploiement mois par mois, où seule compte une
# saisie de la commune elle-même, et des tonnages qui ne se mêlent jamais.
#
# Les valeurs attendues sont recalculées ici à partir des seules données
# insérées (témoin indépendant).
#
#   docker compose exec -T api npm run test:tableau-national
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
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer ${4:-$T_FNCT}" \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}

GOUV=TEST-NAT
GOUV_DEMO=TEST-NAT-DEMO
DISTRICT=test_nat
REELLES="test_nat_1 test_nat_2 test_nat_3 test_nat_4 test_nat_5"
DEMOS="test_nat_demo test_nat_demo_seule"
COMMUNE_DIR=test_nat_1
. tests/outils/directeur_temporaire.sh
toutes() { echo "'test_nat_1','test_nat_2','test_nat_3','test_nat_4','test_nat_5','test_nat_demo','test_nat_demo_seule'"; }
nettoyer() {
  $PSQL -c "DELETE FROM pesees WHERE commune_id IN ($(toutes));" \
        -c "DELETE FROM gouvernorats_district WHERE gouvernorat IN ('$GOUV', '$GOUV_DEMO');" \
        -c "DELETE FROM districts_fnct WHERE code = '$DISTRICT';" >/dev/null 2>&1
}
fin() {
  nettoyer
  retirer_directeur_temporaire
  $PSQL -c "DELETE FROM audit_log WHERE commune_id IN ($(toutes));" \
        -c "DELETE FROM communes WHERE id IN ($(toutes));" >/dev/null 2>&1
  rm -rf "$T"
}
nettoyer
$PSQL -c "DELETE FROM audit_log WHERE commune_id IN ($(toutes));" -c "DELETE FROM communes WHERE id IN ($(toutes));" >/dev/null 2>&1
# Cinq communes réelles : n1 estimée (10 t/j), n2 déclarée (20), n3 qualifiée
# « mesurée » par la FNCT pendant la campagne (30), n4 estimée (5), n5 estimée
# (1) mais désactivée. Une commune de démonstration dans le même gouvernorat,
# une autre seule dans le sien.
creer() { # id activee source tonnage est_demo gouvernorat
  $PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population, activee, donnees_source, waste_tons_per_day, est_demo)
            VALUES ('$1', 'TEST $1', 'TEST', '$6', 10000, $2, '$3', $4, $5);" >/dev/null
}
creer test_nat_1 true estime 10 false "$GOUV"
creer test_nat_2 true declare 20 false "$GOUV"
creer test_nat_3 true estime 30 false "$GOUV"
creer test_nat_4 true estime 5 false "$GOUV"
creer test_nat_5 false estime 1 false "$GOUV"
creer test_nat_demo true estime 100 true "$GOUV"
creer test_nat_demo_seule true estime 100 true "$GOUV_DEMO"
$PSQL -c "INSERT INTO districts_fnct (code, nom, nom_ar, ordre) VALUES ('$DISTRICT', 'TEST District', 'TEST', 99);" \
      -c "INSERT INTO gouvernorats_district (gouvernorat, district_code) VALUES ('$GOUV', '$DISTRICT');" >/dev/null
directeur_temporaire test_nat_1
trap fin EXIT
T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_DIR" ] && [ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
ANNEE=$(sql "SELECT extract(year FROM (now() AT TIME ZONE 'Africa/Tunis'))::int")
AUJ=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date")
# Une pesée saisie par le directeur (rôle commune) : la date de pesée est
# aujourd'hui (tonnage de l'année et des douze mois), la date de SAISIE est
# celle du mois à éprouver dans le déploiement.
peser() { # commune saisie_le kg provenance
  $PSQL -c "INSERT INTO pesees (commune_id, date_pesee, poids_net_kg, vehicule_immat, observation, saisi_par, created_at, provenance)
            VALUES ('$1', '$AUJ', $3, 'TEST-NAT', 'TEST-NAT', '$DIR_ID', '$2 10:00+01', '${4:-reel}');" >/dev/null
}
peser test_nat_1 2021-01-10 4000
peser test_nat_1 2021-03-05 4000
peser test_nat_2 2021-01-15 6000
peser test_nat_4 2021-02-20 2000
peser test_nat_5 2021-01-12 3000
peser test_nat_demo 2021-01-11 50000 simule

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "une commune ne lit pas le déploiement national" 403 "$(req GET "/observatoire/activite?debut=2021-01-01&fin=2021-03-31" "" "$T_DIR")"
chk "ni la répartition d'un indicateur" 403 "$(req GET "/kpi/repartition?code=TONNAGE_T&niveau=gouvernorat" "" "$T_DIR")"
chk "un niveau inconnu est refusé" 400 "$(req GET "/observatoire/activite?debut=2021-01-01&fin=2021-03-31&niveau=commune")"
chk "des bornes à l'envers aussi" 400 "$(req GET "/observatoire/activite?debut=2021-03-31&fin=2021-01-01")"
chk "plus de 24 mois aussi, et le message le dit" "400|t" \
    "$(req GET "/observatoire/activite?debut=2020-01-01&fin=2022-06-30")|$(val "'t' if '24 mois' in d['error'] else 'f'")"
chk "un indicateur inconnu est refusé" 400 "$(req GET "/kpi/repartition?code=XX-99&niveau=gouvernorat")"
chk "en SQL direct, une commune n'obtient aucune ligne du déploiement" 0 \
    "$($PSQL -c "SET app.role = 'admin_commune'; SET app.user_id = '$DIR_ID'; SET app.commune_id = 'test_nat_1'; SET ROLE siipi_app;
                 SELECT count(*) FROM app.activite_communes('2021-01-01', '2021-03-31');" 2>/dev/null | tail -1 | tr -d ' ')"

# -----------------------------------------------------------------------------
echo
echo "2. Une saisie est le fait de la commune — pas de la FNCT"
chk "la FNCT qualifie la provenance de n3 (« mesuré »)" 200 \
    "$(req PATCH /observatoire/communes/test_nat_3/provenance '{"donneesSource":"mesure"}')"
chk "cette écriture de la FNCT est bien au journal, au nom de la FNCT" 1 \
    "$(sql "SELECT count(*) FROM audit_log WHERE commune_id = 'test_nat_3' AND changed_by_role = 'super_admin_fnct'")"
chk "… mais n3 reste « incomplète » : la FNCT n'a pas utilisé la plateforme à sa place" "incomplete" \
    "$(sql "SELECT statut FROM app.statut_communes() WHERE commune_id = 'test_nat_3'")"
chk "une pesée de la commune (module 6, hors journal) la rend active" "active" \
    "$(sql "SELECT statut FROM app.statut_communes() WHERE commune_id = 'test_nat_4'")"

# -----------------------------------------------------------------------------
echo
echo "3. Le déploiement, mois par mois (témoin : janvier, février, mars 2021)"
req GET "/observatoire/activite?debut=2021-01-01&fin=2021-03-31&niveau=gouvernorat" >/dev/null
ligne() { val "[f\"{l['communes']}|{l['saisissent']}|{l['inactives']}|{l['pas_demarrees']}|{l['desactivees']}\" for l in d if l['cle'] == '$GOUV' and l['mois'].startswith('$1')][0]"; }
# communes | saisissent | inactives | pas démarrées | désactivées
chk "janvier : n1 et n2 saisissent ; n3, n4 pas démarrées ; n5 désactivée" "5|2|0|2|1" "$(ligne 2021-01)"
chk "février : n4 saisit ; n1 et n2 inactives ; n3 pas démarrée" "5|1|2|1|1" "$(ligne 2021-02)"
chk "mars : n1 saisit ; n2 et n4 inactives" "5|1|2|1|1" "$(ligne 2021-03)"
chk "la commune de démonstration n'y est pas (5 communes, pas 6)" f \
    "$(val "'t' if any(l['communes'] == 6 for l in d if l['cle'] == '$GOUV') or any(l['cle'] == '$GOUV_DEMO' for l in d) else 'f'")"
req GET "/observatoire/activite?debut=2021-01-01&fin=2021-01-31&niveau=district" >/dev/null
chk "par district : le district de test porte les cinq communes du gouvernorat" "5|TEST District" \
    "$(val "[f\"{l['communes']}|{l['nom']}\" for l in d if l['cle'] == '$DISTRICT'][0]")"
chk "le déploiement s'exporte" 200 \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T_FNCT" "$API/observatoire/activite?debut=2021-01-01&fin=2021-03-31&format=csv")"

# -----------------------------------------------------------------------------
echo
echo "4. Un tonnage estimé ne s'additionne jamais à un tonnage pesé"
req GET /observatoire/gouvernorats >/dev/null
gouv() { val "(lambda v: float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else v)([g for g in d if g['gouvernorat'] == '$GOUV'][0]$1)"; }
chk "plus aucun tonnage mêlé dans le tableau par gouvernorat" "f|f" \
    "$(val "'t' if 'tonnage_jour' in d[0] else 'f'")|$(val "'t' if 'production_kg_hab_jour' in d[0] else 'f'")"
# Témoin : estimé = n1 + n4 + n5 = 16 ; déclaré = n2 = 20 ; mesuré = n3 = 30.
chk "chaque provenance à part : estimé 16, déclaré 20, mesuré 30 t/j" "16.0|20.0|30.0" \
    "$(gouv "['tonnage_jour_estime']")|$(gouv "['tonnage_jour_declare']")|$(gouv "['tonnage_jour_mesure']")"
# Témoin : pesé = 4 + 4 + 6 + 2 + 3 = 19 t sur 4 communes ; la démonstration
# (50 t simulées) n'y est pas.
chk "le pesé à part : 19 t sur 4 communes (la démonstration exclue)" "19.0|4.0" \
    "$(gouv "['tonnage_pese_12m_t']")|$(gouv "['communes_pesees']")"
chk "le gouvernorat compte 5 communes, la démonstration n'y est pas" 5.0 "$(gouv "['communes']")"
chk "le gouvernorat qui n'a qu'une commune de démonstration n'existe pas" f \
    "$(val "'t' if any(g['gouvernorat'] == '$GOUV_DEMO' for g in d) else 'f'")"

# -----------------------------------------------------------------------------
echo
echo "5. La répartition d'un indicateur : sur combien de communes, jamais un rang"
req GET "/kpi/repartition?annee=$ANNEE&code=TONNAGE_T&niveau=gouvernorat" >/dev/null
rep() { val "[g for g in d if g['cle'] == '$GOUV'][0]$1"; }
# Vrai si la liste $1 (expression Python sur d) est dans l'ordre alphabétique,
# comparé comme le fait localeCompare : sans accents ni casse.
alphabetique() {
  python3 -c "
import json, unicodedata
d = json.load(open('$T/r.json'))
cle = lambda s: ''.join(c for c in unicodedata.normalize('NFD', s or '') if not unicodedata.combining(c)).casefold()
noms = $1
print('t' if [cle(n) for n in noms] == sorted(cle(n) for n in noms) else 'f')" 2>/dev/null || echo erreur
}
chk "« 4 communes sur 5 » ont un tonnage pesé dans le gouvernorat" "4|5" "$(rep "['communes_renseignees']")|$(rep "['communes']")"
# Témoin : (8 + 6 + 2 + 3) / 4 = 4,75 t ; toutes mesurées.
chk "leur moyenne est 4,75 t, toutes mesurées" "4.75|4|0" \
    "$(rep "['valeur_moyenne']")|$(rep "['communes_mesurees']")|$(rep "['communes_declarees']")"
chk "les groupes sont dans l'ordre alphabétique, jamais par valeur" t \
    "$(alphabetique "[g['nom'] or g['cle'] for g in d if g['cle'] != 'non_rattache']")"
req GET "/kpi/repartition?annee=$ANNEE&code=TONNAGE_T&niveau=district" >/dev/null
chk "par district, le district de test porte « 4 sur 5 »" "4|5" \
    "$(val "[f\"{g['communes_renseignees']}|{g['communes']}\" for g in d if g['cle'] == '$DISTRICT'][0]")"
req GET "/kpi/repartition?annee=$ANNEE&code=TONNAGE_T&niveau=commune" >/dev/null
chk "au niveau commune (FNCT), la démonstration n'apparaît pas" f \
    "$(val "'t' if any(c['commune_id'].startswith('test_nat_demo') for c in d) else 'f'")"
chk "… et les communes sont par ordre alphabétique, pas par valeur" t "$(alphabetique "[c['nom'] for c in d]")"
chk "la valeur de n1 est 8 t, mesurée" "8.0|mesure" \
    "$(val "[f\"{float(c['valeur'])}|{c['source']}\" for c in d if c['commune_id'] == 'test_nat_1'][0]")"
chk "la répartition au niveau commune s'exporte" 200 \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T_FNCT" "$API/kpi/repartition?annee=$ANNEE&code=TONNAGE_T&niveau=commune&format=csv")"

# Aucune réponse nationale ne porte de rang, quel que soit son niveau.
rangs() {
  python3 -c "
import json, sys
interdits = {'rang', 'rank', 'classement', 'position', 'palmares', 'palmarès'}
def cles(x):
    if isinstance(x, dict):
        for k, v in x.items():
            yield k
            yield from cles(v)
    elif isinstance(x, list):
        for v in x:
            yield from cles(v)
print(len([k for k in cles(json.load(open('$T/r.json'))) if k.lower() in interdits]))"
}
total=0
for route in "/kpi/repartition?annee=$ANNEE&code=TONNAGE_T&niveau=commune" "/kpi/repartition?annee=$ANNEE&code=M3-1&niveau=gouvernorat" \
             "/kpi/national?annee=$ANNEE&niveau=commune" "/kpi/national?annee=$ANNEE&niveau=gouvernorat" \
             "/kpi/dma?annee=$ANNEE&niveau=commune" "/observatoire/gouvernorats" "/observatoire/deploiement" \
             "/observatoire/activite?debut=2021-01-01&fin=2021-03-31&niveau=gouvernorat"; do
  req GET "$route" >/dev/null
  total=$((total + $(rangs)))
done
chk "aucune des réponses nationales ne porte un rang" 0 "$total"
req GET "/kpi/dma?annee=$ANNEE&niveau=commune" >/dev/null
chk "la liste DMA des communes est par nom, plus par indice" t "$(alphabetique "[l['nom'] for l in d['lignes']]")"

# -----------------------------------------------------------------------------
echo
echo "6. La carte et les districts, sans la démonstration"
req GET /observatoire/contours-gouvernorats >/dev/null
chk "les contours ne comptent que des gouvernorats de communes réelles, et les comptent toutes" \
    "$(sql "SELECT count(DISTINCT gouvernorat) FROM communes WHERE deleted_at IS NULL AND NOT est_demo AND boundary_geom IS NOT NULL")" \
    "$(val "len(d['features'])")"
chk "aucun contour ne contient une commune de démonstration" 0 \
    "$(val "sum(1 for f in d['features'] if f['properties']['gouvernorat'] == '$GOUV_DEMO')")"
chk "le gouvernorat de démonstration n'est pas proposé au rattachement" "200|f|t" \
    "$(req GET /kpi/districts)|$(grep -q "\"$GOUV_DEMO\"" "$T/r.json" && echo t || echo f)|$(grep -q "\"$GOUV\"" "$T/r.json" && echo t || echo f)"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
