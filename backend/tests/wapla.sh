#!/usr/bin/env bash
# =============================================================================
# Couche WaPla, lot W2a — le schéma `wapla`, les références tunisiennes,
# l'amorce. docs/specs_metier/SPEC_wapla_couche_planification.md § 2, 3 et 7.
#
# Elle commence par ce que la plateforme REFUSE : une amorce sans compte, par
# un citoyen ou un prestataire, pour la commune d'un autre, pour un exercice
# futur ; une référence saisie par une commune (y compris en SQL direct), sans
# source, hors des bornes, pour un gouvernorat inconnu, en double ; une
# référence corrigée, effacée, ou retirée sans motif.
#
# Puis la SÉPARATION : aucun objet de SIIPI ne dépend du schéma `wapla`
# (pg_depend), aucune fonction de SIIPI ne le nomme, et le schéma supprimé le
# temps d'une transaction, les chiffres de SIIPI ne bougent pas.
#
# Enfin l'AMORCE, sur une commune de test bâtie pour elle : chaque valeur
# attendue est recalculée ici des seules lignes insérées (témoin indépendant),
# et une entrée que SIIPI ne tient pas reste vide, jamais 0.
#
#   docker compose exec -T api npm run test:wapla
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
vrai() { sed 's/True/t/;s/False/f/'; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
req() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer ${4:-$T_DIR}" \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}
# amorce [exercice] : l'amorce de la commune de test dans $T/r.json ; e <cle> : « valeur|provenance » de l'entrée.
amorce() { req GET "/wapla/amorce?communeId=$TC&exercice=${1:-$EX}" >/dev/null; }
# float() : un entier JSON (1500) et un décimal (1500.0) s'écrivent pareil ici.
e() { val "next((str(None if x['valeur'] is None else float(x['valeur'])) + '|' + str(x['provenance'])) for x in d['entrees'] if x['cle'] == '$1')"; }
champ() { val "next(x['$2'] for x in d['entrees'] if x['cle'] == '$1')"; }
fractions() {
  printf '{"organiques":%s,"papier_carton":%s,"plastiques":%s,"verre":%s,"metaux":%s,"textiles":%s,"fines_autres":%s}' "$@"
}

TC=test_wapla
GV=TEST-WAPLA
EX=2025
COMMUNE_DIR="$TC"
. tests/outils/directeur_temporaire.sh
nettoyer() {
  $PSQL -c "DELETE FROM fuel_logs WHERE commune_id = '$TC';" \
        -c "DELETE FROM pesees WHERE commune_id = '$TC';" \
        -c "DELETE FROM vehicules WHERE commune_id = '$TC';" \
        -c "DELETE FROM valeurs_cout_complet WHERE commune_id = '$TC';" \
        -c "DELETE FROM etudes_cout_complet WHERE commune_id = '$TC';" \
        -c "DELETE FROM caracterisations WHERE commune_id = '$TC' OR methode = 'TEST-WAPLA';" \
        -c "DELETE FROM parametres_commune WHERE commune_id = '$TC';" \
        -c "DELETE FROM wapla.facteurs_reference WHERE gouvernorat = '$GV';" >/dev/null 2>&1
}
fin() {
  nettoyer
  retirer_directeur_temporaire
  $PSQL -c "DELETE FROM audit_log WHERE commune_id = '$TC';" -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
  rm -rf "$T"
}
nettoyer
$PSQL -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune WaPla', 'TEST', '$GV', 0);" >/dev/null
directeur_temporaire "$TC"
trap fin EXIT
T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
T_FNCT=$(tok admin.national@siipi.tn)
T_PREST=$(tok prestataire.marsa@siipi.tn)
T_CIT=$(tok citoyen.demo@siipi.tn)
[ -n "$T_DIR" ] && [ -n "$T_FNCT" ] && [ -n "$T_PREST" ] && [ -n "$T_CIT" ] || { echo "API injoignable sur $API, ou compte d'essai absent" >&2; exit 1; }
AUTRE=$(sql "SELECT id FROM communes WHERE id <> '$TC' AND NOT est_demo AND deleted_at IS NULL ORDER BY id LIMIT 1")
ANNEE=$(sql "SELECT extract(year FROM (now() AT TIME ZONE 'Africa/Tunis'))::int")
FNCT_ID=$(sql "SELECT id FROM users WHERE email = 'admin.national@siipi.tn'")
REF="/wapla/facteurs-reference"
climat() { printf '{"code":"%s","gouvernorat":"%s","valeur":%s,"source":"%s","dateEffet":"%s"}' "$@"; }

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "une amorce sans compte : 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$API/wapla/amorce?communeId=$TC&exercice=$EX")"
chk "un citoyen, un prestataire : 403" "403|403" \
    "$(req GET "/wapla/amorce?communeId=$TC&exercice=$EX" "" "$T_CIT")|$(req GET "/wapla/amorce?communeId=$TC&exercice=$EX" "" "$T_PREST")"
chk "la commune d'un autre : introuvable (404)" 404 "$(req GET "/wapla/amorce?communeId=$AUTRE&exercice=$EX")"
chk "la FNCT sans commune : 400" 400 "$(req GET "/wapla/amorce?exercice=$EX" "" "$T_FNCT")"
chk "un exercice qui n'a pas commencé, un exercice avant 2000 : 400" "400|400" \
    "$(req GET "/wapla/amorce?communeId=$TC&exercice=$((ANNEE + 1))")|$(req GET "/wapla/amorce?communeId=$TC&exercice=1999")"
chk "une commune ne saisit pas de référence tunisienne (403)" 403 \
    "$(req POST "$REF" "$(climat temperature_moyenne_c "$GV" 19 'TEST' 2020-01-01)")"
chk "… ni en SQL direct : la base le refuse" t \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$DIR_ID', true), set_config('app.commune_id', '$TC', true);
                 SET LOCAL ROLE siipi_app;
                 INSERT INTO wapla.facteurs_reference (code, gouvernorat, valeur, source, date_effet) VALUES ('temperature_moyenne_c', '$GV', 19, 'TEST', '2020-01-01'); COMMIT;" 2>&1 \
       | grep -q 'row-level security' && echo t || echo f)"
chk "une référence sans source : 400" 400 "$(req POST "$REF" "$(climat temperature_moyenne_c "$GV" 19 ' ' 2020-01-01)" "$T_FNCT")"
chk "une température de 60 °C, 5 000 mm de pluie : 400 (une unité à vérifier)" "400|400" \
    "$(req POST "$REF" "$(climat temperature_moyenne_c "$GV" 60 'TEST' 2020-01-01)" "$T_FNCT")|$(req POST "$REF" "$(climat precipitations_annuelles_mm "$GV" 5000 'TEST' 2020-01-01)" "$T_FNCT")"
chk "… et la base refuse les mêmes bornes en SQL direct" t \
    "$($PSQL -c "INSERT INTO wapla.facteurs_reference (code, gouvernorat, valeur, source, date_effet) VALUES ('temperature_moyenne_c', '$GV', 60, 'TEST', '2020-01-01');" 2>&1 \
       | grep -q 'facteurs_reference_bornes' && echo t || echo f)"
chk "un gouvernorat inconnu : 400" 400 "$(req POST "$REF" "$(climat temperature_moyenne_c 'TEST-INCONNU' 19 'TEST' 2020-01-01)" "$T_FNCT")"
chk "un code inconnu, une clé de trop : 400" "400|400" \
    "$(req POST "$REF" '{"code":"vent","gouvernorat":"'$GV'","valeur":1,"source":"TEST","dateEffet":"2020-01-01"}' "$T_FNCT")|$(req POST "$REF" '{"code":"temperature_moyenne_c","gouvernorat":"'$GV'","valeur":19,"source":"TEST","dateEffet":"2020-01-01","x":1}' "$T_FNCT")"
chk "rien n'est entré" 0 "$(sql "SELECT count(*) FROM wapla.facteurs_reference WHERE gouvernorat = '$GV'")"

# -----------------------------------------------------------------------------
echo
echo "2. Les références tunisiennes : datées, sourcées, retirées jamais effacées"
chk "la FNCT saisit les normales du gouvernorat (450 mm, 19,5 °C)" "201|201" \
    "$(req POST "$REF" "$(climat precipitations_annuelles_mm "$GV" 450 'TEST INM normales' 2020-01-01)" "$T_FNCT")|$(req POST "$REF" "$(climat temperature_moyenne_c "$GV" 19.5 'TEST INM normales' 2020-01-01)" "$T_FNCT")"
PLUIE=$(sql "SELECT id FROM wapla.facteurs_reference WHERE gouvernorat = '$GV' AND code = 'precipitations_annuelles_mm'")
chk "une seconde valeur en vigueur à la même date : 409" 409 \
    "$(req POST "$REF" "$(climat precipitations_annuelles_mm "$GV" 460 'TEST' 2020-01-01)" "$T_FNCT")"
chk "une valeur ne se corrige pas : la base refuse de toucher à la valeur" t \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role', 'super_admin_fnct', true), set_config('app.user_id', '$FNCT_ID', true);
                 SET LOCAL ROLE siipi_app; UPDATE wapla.facteurs_reference SET valeur = 999 WHERE id = '$PLUIE'; COMMIT;" 2>&1 \
       | grep -q 'permission denied' && echo t || echo f)"
chk "… ni ne s'efface" t \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role', 'super_admin_fnct', true), set_config('app.user_id', '$FNCT_ID', true);
                 SET LOCAL ROLE siipi_app; DELETE FROM wapla.facteurs_reference WHERE id = '$PLUIE'; COMMIT;" 2>&1 \
       | grep -q 'permission denied' && echo t || echo f)"
chk "un retrait sans motif : 400 par l'API, refusé par la base" "400|t" \
    "$(req POST "$REF/$PLUIE/retrait" '{"motif":" "}' "$T_FNCT")|$($PSQL -c "UPDATE wapla.facteurs_reference SET retire_le = now() WHERE id = '$PLUIE';" 2>&1 | grep -q 'facteurs_reference_retrait' && echo t || echo f)"
chk "une commune ne retire rien (403)" 403 "$(req POST "$REF/$PLUIE/retrait" '{"motif":"TEST"}')"
chk "la FNCT retire la pluie, avec son motif" "200|TEST valeur à reprendre" \
    "$(req POST "$REF/$PLUIE/retrait" '{"motif":"TEST valeur à reprendre"}' "$T_FNCT")|$(val "d['motif_retrait']")"
chk "retirée deux fois : introuvable (404)" 404 "$(req POST "$REF/$PLUIE/retrait" '{"motif":"TEST"}' "$T_FNCT")"
chk "la valeur retirée reste lisible, sur demande ; elle n'est plus en vigueur" "1|0" \
    "$(req GET "$REF?retirees=1" "" "$T_FNCT" >/dev/null; val "sum(1 for x in d if x['id'] == '$PLUIE' and x['retire_le'])")|$(req GET "$REF" "" "$T_FNCT" >/dev/null; val "sum(1 for x in d if x['id'] == '$PLUIE')")"

# -----------------------------------------------------------------------------
echo
echo "3. Une commune vide : l'amorce dit ce qui manque, jamais 0"
chk "l'amorce se lit" 200 "$(req GET "/wapla/amorce?communeId=$TC&exercice=$EX")"
chk "quinze entrées, dans l'ordre" "15|waste_in|ATY" "$(val "len(d['entrees'])")|$(val "d['entrees'][0]['cle']")|$(val "d['entrees'][-1]['cle']")"
chk "toutes vides sauf la température, chacune avec ce qui manque" "14|14" \
    "$(val "sum(1 for x in d['entrees'] if x['valeur'] is None and x['provenance'] is None)")|$(val "sum(1 for x in d['entrees'] if x['valeur'] is None and x['manque'])")"
chk "aucune valeur 0 inventée" 0 "$(val "sum(1 for x in d['entrees'] if x['valeur'] == 0)")"
chk "la température du gouvernorat : référence nationale, avec sa source et sa date" "19.5|reference_tunisienne|t" \
    "$(e ATY)|$(val "'TEST INM normales' in next(x['source'] for x in d['entrees'] if x['cle'] == 'ATY')" | vrai)"
chk "la pluie retirée n'est plus proposée : la FNCT doit la reprendre" "None|None|t" \
    "$(e APY)|$(val "'normales climatiques' in next(x['manque'] for x in d['entrees'] if x['cle'] == 'APY')" | vrai)"
chk "la FNCT la reprend : la nouvelle valeur est proposée" "201|460.0|reference_tunisienne" \
    "$(req POST "$REF" "$(climat precipitations_annuelles_mm "$GV" 460 'TEST INM normales' 2021-01-01)" "$T_FNCT")|$(amorce; e APY)"
chk "une valeur datée après l'exercice ne vaut pas pour lui" "201|460.0|reference_tunisienne" \
    "$(req POST "$REF" "$(climat precipitations_annuelles_mm "$GV" 470 'TEST INM normales' 2026-01-01)" "$T_FNCT")|$(amorce; e APY)"

# -----------------------------------------------------------------------------
echo
echo "4. L'amorce sur une commune bâtie pour elle — exercice $EX"
# Le gisement : 12 000 habitants × 0,75 kg/hab/j × 365 = 3 285 t.
$PSQL -c "INSERT INTO parametres_commune (commune_id, population_permanente, population_permanente_source, production_theorique_kg_hab_j, production_theorique_source)
          VALUES ('$TC', 12000, 'TEST estimation', 0.75, 'TEST étude');" >/dev/null
# Les pesées : trois mois ménagers (1 050 t), des déchets verts, une pesée de
# l'année d'avant, une pesée supprimée — seules les trois premières comptent.
peser() { $PSQL -c "INSERT INTO pesees (commune_id, date_pesee, poids_net_kg, type_dechet, vehicule_immat, observation, saisi_par)
                    VALUES ('$TC', '$1', $2, '$3', 'TEST-WAPLA', 'TEST-WAPLA', '$DIR_ID');" >/dev/null; }
peser 2025-01-15 400000 menager
peser 2025-02-10 350000 menager
peser 2025-03-05 300000 menager
peser 2025-03-20 50000 vert
peser 2024-12-20 99000 menager
peser 2025-04-02 77000 menager
$PSQL -c "UPDATE pesees SET deleted_at = now() WHERE commune_id = '$TC' AND poids_net_kg = 77000;" >/dev/null
# Le parc : un engin de collecte avec ses pleins, un autre sans, une balayeuse.
$PSQL -c "INSERT INTO vehicules (id, registration, commune_id, type, domaine_emploi) VALUES
            ('test-wapla-c1', 'TEST-WAPLA-C1', '$TC', 'benne_tasseuse', 'Propreté (levée des déchets)'),
            ('test-wapla-c2', 'TEST-WAPLA-C2', '$TC', 'benne_tasseuse', 'Propreté (levée des déchets)'),
            ('test-wapla-b1', 'TEST-WAPLA-B1', '$TC', 'balayeuse', 'Propreté (balayage mécanique)');" >/dev/null
plein() { $PSQL -c "INSERT INTO fuel_logs (commune_id, vehicule_id, date_plein, litres, montant_tnd, saisi_par)
                    VALUES ('$TC', '$1', '$2', $3, 0, '$DIR_ID');" >/dev/null; }
plein test-wapla-c1 2025-01-10 1000
plein test-wapla-c1 2025-06-10 500
plein test-wapla-c1 2024-11-10 300
plein test-wapla-b1 2025-02-10 700
# L'étude de coût complet de l'exercice, et celle d'un autre exercice.
ETUDE=$($PSQL -c "INSERT INTO etudes_cout_complet (commune_id, exercice, document, bureau_etudes, provenance) VALUES ('$TC', $EX, 'TEST rapport', 'TEST bureau', 'declare_bureau_etudes') RETURNING id;" | head -1 | tr -d ' ')
$PSQL -c "INSERT INTO valeurs_cout_complet (etude_id, commune_id, nature, code, montant, retenue) VALUES ('$ETUDE', '$TC', 'total', 'cout_total', 850000, true);" >/dev/null
ETUDE2=$($PSQL -c "INSERT INTO etudes_cout_complet (commune_id, exercice, document, provenance) VALUES ('$TC', 2024, 'TEST rapport 2024', 'declare_bureau_etudes') RETURNING id;" | head -1 | tr -d ' ')
$PSQL -c "INSERT INTO valeurs_cout_complet (etude_id, commune_id, nature, code, montant, retenue) VALUES ('$ETUDE2', '$TC', 'total', 'cout_total', 999999, true);" >/dev/null

# Le témoin : les valeurs attendues, des seules lignes insérées et des taux en table.
REDEVANCE=$(sql "SELECT round(sum(p.poids_net_kg / 1000.0 * (SELECT v.valeur_nombre FROM valeurs_parametres_nationaux v
                   WHERE v.code = 'redevance_anged' AND v.retire_le IS NULL AND v.date_effet <= p.date_pesee ORDER BY v.date_effet DESC LIMIT 1)), 3)
                 FROM pesees p WHERE p.commune_id = '$TC' AND p.deleted_at IS NULL AND extract(year FROM p.date_pesee) = $EX")
PROVISOIRE=$(sql "SELECT bool_or(v.provisoire) FROM pesees p JOIN LATERAL (SELECT provisoire FROM valeurs_parametres_nationaux v
                   WHERE v.code = 'redevance_anged' AND v.retire_le IS NULL AND v.date_effet <= p.date_pesee ORDER BY v.date_effet DESC LIMIT 1) v ON true
                 WHERE p.commune_id = '$TC' AND p.deleted_at IS NULL AND extract(year FROM p.date_pesee) = $EX")
amorce
chk "le gisement : 12 000 × 0,75 × 365 = 3 285 t, déclaré, avec la population et la production derrière" "3285.0|siipi_declare|12000|0.75" \
    "$(e waste_in)|$(val "int(next(x['detail']['population'] for x in d['entrees'] if x['cle'] == 'waste_in'))")|$(val "float(next(x['detail']['production_kg_hab_j'] for x in d['entrees'] if x['cle'] == 'waste_in'))")"
chk "les déchets collectés : 1 050 t pesées (ni les verts, ni 2024, ni la pesée supprimée), mesurées" "1050.0|siipi_mesure" "$(e dechets_collectes_t)"
chk "… trois mois pesés sur douze : dit, et pas extrapolé" "3|t" \
    "$(val "next(x['detail']['mois_peses'] for x in d['entrees'] if x['cle'] == 'dechets_collectes_t')")|$(val "'3 mois pesés sur 12' in next(x['ecart'] for x in d['entrees'] if x['cle'] == 'dechets_collectes_t')" | vrai)"
chk "le taux de collecte : 1 050 / 3 285" "$(python3 -c "print(round(1050/3285, 6))")|siipi_declare|None" "$(e tc_1)|$(champ tc_1 ecart)"
chk "le gasoil de collecte : 1 500 L (ni la balayeuse, ni 2024), mesuré" "1500.0|siipi_mesure" "$(e ghg_1)"
chk "… un engin de collecte sur deux a des pleins : dit" t "$(val "'avec des pleins enregistrés : 1 sur 2' in next(x['ecart'] for x in d['entrees'] if x['cle'] == 'ghg_1')" | vrai)"
chk "le coût de collecte : le coût total publié par l'étude de $EX (pas celle de 2024), déclaré" "850000.0|siipi_declare" "$(e cost_1)"
chk "la redevance ANGeD : chaque pesée de $EX au taux de sa date (témoin : $REDEVANCE TND), déclarée" "$(python3 -c "print(float('$REDEVANCE'))")|siipi_declare" "$(e cost_5)"
chk "… et le taux provisoire se dit" "$PROVISOIRE" "$(val "str(next(x['detail']['provisoire'] for x in d['entrees'] if x['cle'] == 'cost_5')).lower()" | sed 's/true/t/;s/false/f/')"
chk "la composition : sans aucune caractérisation, rien" "None|None" "$(e ghg_6)"
req POST /references/caracterisations "{\"niveauSource\":\"moyenne_nationale_anged\",\"annee\":2022,\"methode\":\"TEST-WAPLA\",\"fractions\":$(fractions 62 11 11 4 3 4 5)}" "$T_FNCT" >/dev/null
amorce
chk "avec la seule moyenne nationale : proposée, dite comme telle" "0.62|siipi_declare|f|t" \
    "$(e ghg_6)|$(val "next(x['detail']['propre_a_la_commune'] for x in d['entrees'] if x['cle'] == 'ghg_6')" | vrai)|$(val "'Moyenne nationale' in next(x['ecart'] for x in d['entrees'] if x['cle'] == 'ghg_6')" | vrai)"
chk "la commune enregistre sa caractérisation de 2024" 201 \
    "$(req POST "/references/caracterisations?communeId=$TC" "{\"niveauSource\":\"autre_etude\",\"annee\":2024,\"fractions\":$(fractions 55 14 13 5 4 4 5)}")"
amorce
chk "sa composition prend la place : biodéchets 0,55, papier 0,14, plastiques 0,13, propre à la commune" "0.55|0.14|0.13|t" \
    "$(e ghg_6 | cut -d'|' -f1)|$(e ghg_5 | cut -d'|' -f1)|$(e ghg_3 | cut -d'|' -f1)|$(val "next(x['detail']['propre_a_la_commune'] for x in d['entrees'] if x['cle'] == 'ghg_6')" | vrai)"
chk "la même composition pour le dépotoir, l'incinération et les feux" "0.55|0.14|0.13|0.13" \
    "$(e ghg_15 | cut -d'|' -f1)|$(e ghg_14 | cut -d'|' -f1)|$(e ghg_11 | cut -d'|' -f1)|$(e ghg_18 | cut -d'|' -f1)"
chk "aucune entrée n'est jamais 0 par défaut" 0 "$(val "sum(1 for x in d['entrees'] if x['valeur'] == 0)")"
# Moins d'habitants : le pesé dépasse le gisement — un écart, pas un plafond.
$PSQL -c "UPDATE parametres_commune SET population_permanente = 1000 WHERE commune_id = '$TC';" >/dev/null
amorce
chk "le pesé dépasse le gisement : le taux passe 1, sans plafond, et l'écart le dit" "$(python3 -c "print(round(1050/273.75, 6))")|t" \
    "$(e tc_1 | cut -d'|' -f1)|$(val "'dépasse le gisement' in (next(x['ecart'] for x in d['entrees'] if x['cle'] == 'tc_1') or '')" | vrai)"
chk "la FNCT lit la même amorce que la commune" t \
    "$(A=$(val "[(x['cle'], x['valeur']) for x in d['entrees']]"); req GET "/wapla/amorce?communeId=$TC&exercice=$EX" "" "$T_FNCT" >/dev/null; B=$(val "[(x['cle'], x['valeur']) for x in d['entrees']]"); [ "$A" = "$B" ] && [ "$A" != erreur ] && echo t || echo f)"

# -----------------------------------------------------------------------------
echo
echo "5. La séparation : SIIPI ne dépend jamais de la couche WaPla"
# Le schéma de l'objet qui dépend, quel que soit son genre (vue, contrainte,
# déclencheur, valeur par défaut, politique…) ; « wapla » s'il est de la couche.
# Le stockage TOAST d'une table de la couche vit dans pg_toast : c'est le
# moteur de PostgreSQL, pas SIIPI. Un genre d'objet inconnu compte, lui.
DEPENDANCES="SELECT count(*) FROM pg_depend d
  JOIN pg_namespace w ON w.nspname = 'wapla'
 WHERE ((d.refclassid = 'pg_class'::regclass AND d.refobjid IN (SELECT oid FROM pg_class WHERE relnamespace = w.oid))
     OR (d.refclassid = 'pg_proc'::regclass  AND d.refobjid IN (SELECT oid FROM pg_proc  WHERE pronamespace = w.oid))
     OR (d.refclassid = 'pg_type'::regclass  AND d.refobjid IN (SELECT oid FROM pg_type  WHERE typnamespace = w.oid)))
   AND COALESCE(CASE d.classid
          WHEN 'pg_class'::regclass      THEN (SELECT relnamespace FROM pg_class WHERE oid = d.objid)
          WHEN 'pg_proc'::regclass       THEN (SELECT pronamespace FROM pg_proc WHERE oid = d.objid)
          WHEN 'pg_type'::regclass       THEN (SELECT typnamespace FROM pg_type WHERE oid = d.objid)
          WHEN 'pg_constraint'::regclass THEN (SELECT connamespace FROM pg_constraint WHERE oid = d.objid)
          WHEN 'pg_rewrite'::regclass    THEN (SELECT c.relnamespace FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class WHERE r.oid = d.objid)
          WHEN 'pg_trigger'::regclass    THEN (SELECT c.relnamespace FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE t.oid = d.objid)
          WHEN 'pg_attrdef'::regclass    THEN (SELECT c.relnamespace FROM pg_attrdef a JOIN pg_class c ON c.oid = a.adrelid WHERE a.oid = d.objid)
          WHEN 'pg_policy'::regclass     THEN (SELECT c.relnamespace FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE p.oid = d.objid)
        END, 0) NOT IN (w.oid, 'pg_toast'::regnamespace::oid);"
chk "aucun objet hors du schéma wapla ne dépend d'un objet du schéma wapla (pg_depend)" 0 "$(sql "$DEPENDANCES")"
chk "… et ce contrôle attrape bien une vue de SIIPI qui lirait wapla (créée et défaite dans une transaction)" t \
    "$(N=$($PSQL -c "BEGIN; CREATE VIEW public.test_wapla_interdite AS SELECT * FROM wapla.facteurs_reference; $DEPENDANCES ROLLBACK;" 2>/dev/null | grep -E '^[0-9]+$' | tail -1); [ "${N:-0}" -ge 1 ] && echo t || echo f)"
chk "aucune fonction de SIIPI (schémas app et public) ne nomme le schéma wapla" 0 \
    "$(sql "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname IN ('app', 'public') AND p.prosrc ILIKE '%wapla%'")"
chk "aucune vue de SIIPI ne le nomme" 0 \
    "$(sql "SELECT count(*) FROM pg_views WHERE schemaname IN ('app', 'public') AND definition ILIKE '%wapla%'")"
# Les chiffres de SIIPI sur la commune de test, avec et sans le schéma wapla
# (supprimé le temps d'une transaction, puis rendu par ROLLBACK).
EMPREINTE="SELECT set_config('app.role', 'super_admin_fnct', true), set_config('app.user_id', '$FNCT_ID', true);
           SET LOCAL ROLE siipi_app;
           SELECT 'LIGNES:' || count(*) || ':' || md5(string_agg(x, '|' ORDER BY x)) FROM (
             SELECT 'c' || c::text AS x FROM app.completude_commune('$TC', DATE '$EX-12-31') c
             UNION ALL SELECT 'k' || k::text FROM app.mesures_kpi_communes($EX, ARRAY['$TC']) k
             UNION ALL SELECT 'r' || r::text FROM app.redevance_anged('$TC', $EX) r
             UNION ALL SELECT 'p' || p::text FROM app.production_specifique('$TC', $EX) p) t;"
AVANT=$($PSQL -c "BEGIN; $EMPREINTE ROLLBACK;" 2>/dev/null | grep '^LIGNES:')
SANS=$($PSQL -c "BEGIN; DROP SCHEMA wapla CASCADE; $EMPREINTE ROLLBACK;" 2>/dev/null | grep '^LIGNES:')
chk "les chiffres de SIIPI se calculent (complétude, indicateurs, redevance, production : plus de 20 lignes)" t \
    "$([ "$(echo "$AVANT" | cut -d: -f2)" -gt 20 ] 2>/dev/null && echo t || echo f)"
chk "le schéma wapla supprimé, ils sont identiques à la ligne près" "$AVANT" "$SANS"
chk "et le schéma est toujours là après la transaction" 1 "$(sql "SELECT count(*) FROM pg_namespace WHERE nspname = 'wapla'")"
chk "hors de src/wapla, seuls app.ts (qui monte les routes) et le contrat importent la couche ; personne n'importe le moteur" "src/app.ts,src/openapi/document.ts|0" \
    "$(grep -rlE "from '(\./|\.\./)+wapla/" src | grep '\.ts$' | grep -v '^src/wapla/' | sort | paste -sd, -)|$(grep -rlE "wapla/moteur" src | grep '\.ts$' | grep -vc '^src/wapla/')"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
