#!/usr/bin/env bash
# =============================================================================
# Couche WaPla, lot W2b — les bilans : entrées, calcul, niveau de fiabilité.
# docs/specs_metier/SPEC_wapla_couche_planification.md § 3.1, § 6 et § 7.
#
# Elle commence par ce que la plateforme REFUSE : un bilan lu sans compte, par
# un citoyen ou un prestataire ; ouvert, saisi ou calculé par la FNCT (aussi
# en SQL direct) ; pour la commune d'un autre, pour un exercice futur, en
# double ; une entrée inconnue, hors des bornes de l'outil, sans valeur par
# défaut ; un calcul avant que les clés soient traitées ; une entrée effacée.
#
# Puis le parcours d'un bilan : né de l'amorce, une clé gardée par défaut
# (illustratif, que la FNCT ne voit pas), la clé saisie (étayé, au seuil près),
# le seuil de la FNCT qui le fait passer indicatif, une saisie qui rend le
# résultat caduc. Le résultat stocké est confronté au témoin indépendant
# (tests/wapla_attendus.py, mode corrigé). Enfin : rien de ce que la commune
# fait dans la couche ne compte comme une saisie dans SIIPI.
#
#   docker compose exec -T api npm run test:wapla-bilans
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
# provenance <cle> : la provenance de l'entrée dans le bilan de $T/r.json.
provenance() { val "next((x['provenance'] for x in d['entrees'] if x['cle'] == '$1'), 'absente')"; }
fractions() {
  printf '{"organiques":%s,"papier_carton":%s,"plastiques":%s,"verre":%s,"metaux":%s,"textiles":%s,"fines_autres":%s}' "$@"
}

TC=test_wapla_bilans
GV=TEST-WAPLA-BIL
EX=2025
COMMUNE_DIR="$TC"
. tests/outils/directeur_temporaire.sh
nettoyer() {
  $PSQL -c "DELETE FROM wapla.bilans WHERE commune_id = '$TC';" \
        -c "DELETE FROM fuel_logs WHERE commune_id = '$TC';" \
        -c "DELETE FROM pesees WHERE commune_id = '$TC';" \
        -c "DELETE FROM vehicules WHERE commune_id = '$TC';" \
        -c "DELETE FROM valeurs_cout_complet WHERE commune_id = '$TC';" \
        -c "DELETE FROM etudes_cout_complet WHERE commune_id = '$TC';" \
        -c "DELETE FROM caracterisations WHERE commune_id = '$TC';" \
        -c "DELETE FROM parametres_commune WHERE commune_id = '$TC';" \
        -c "DELETE FROM wapla.facteurs_reference WHERE gouvernorat = '$GV';" \
        -c "UPDATE wapla.reglages SET valeur = 0.30 WHERE cle = 'seuil_defauts_etaye';" >/dev/null 2>&1
}
fin() {
  nettoyer
  retirer_directeur_temporaire
  $PSQL -c "DELETE FROM audit_log WHERE commune_id = '$TC';" -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
  rm -rf "$T"
}
nettoyer
$PSQL -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune bilans WaPla', 'TEST', '$GV', 0);" >/dev/null
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
B="/wapla/bilans"

# Les données de la commune : 10 000 habitants à 0,8 kg/hab/j (2 920 t), 600 t
# pesées en 2025, 800 L de gasoil de collecte, une étude de coût complet, sa
# caractérisation, et les normales de son gouvernorat.
$PSQL -c "INSERT INTO parametres_commune (commune_id, population_permanente, population_permanente_source, production_theorique_kg_hab_j, production_theorique_source)
          VALUES ('$TC', 10000, 'TEST estimation', 0.8, 'TEST étude');" \
      -c "INSERT INTO pesees (commune_id, date_pesee, poids_net_kg, type_dechet, vehicule_immat, observation, saisi_par)
          VALUES ('$TC', '2025-03-15', 600000, 'menager', 'TEST-WAPLA-BIL', 'TEST-WAPLA-BIL', '$DIR_ID');" \
      -c "INSERT INTO vehicules (id, registration, commune_id, type, domaine_emploi) VALUES ('test-wapla-bil-1', 'TEST-WAPLA-BIL-1', '$TC', 'benne_tasseuse', 'Propreté (levée des déchets)');" \
      -c "INSERT INTO fuel_logs (commune_id, vehicule_id, date_plein, litres, montant_tnd, saisi_par) VALUES ('$TC', 'test-wapla-bil-1', '2025-05-10', 800, 0, '$DIR_ID');" >/dev/null
ETUDE=$($PSQL -c "INSERT INTO etudes_cout_complet (commune_id, exercice, document, provenance) VALUES ('$TC', $EX, 'TEST rapport', 'declare_bureau_etudes') RETURNING id;" | head -1 | tr -d ' ')
$PSQL -c "INSERT INTO valeurs_cout_complet (etude_id, commune_id, nature, code, montant, retenue) VALUES ('$ETUDE', '$TC', 'total', 'cout_total', 400000, true);" >/dev/null
req POST "/references/caracterisations?communeId=$TC" "{\"niveauSource\":\"autre_etude\",\"annee\":2024,\"fractions\":$(fractions 55 14 13 5 4 4 5)}" >/dev/null
req POST /wapla/facteurs-reference "{\"code\":\"precipitations_annuelles_mm\",\"gouvernorat\":\"$GV\",\"valeur\":450,\"source\":\"TEST INM\",\"dateEffet\":\"2020-01-01\"}" "$T_FNCT" >/dev/null
req POST /wapla/facteurs-reference "{\"code\":\"temperature_moyenne_c\",\"gouvernorat\":\"$GV\",\"valeur\":19,\"source\":\"TEST INM\",\"dateEffet\":\"2020-01-01\"}" "$T_FNCT" >/dev/null
# Ce que SIIPI compte comme saisies de la commune, avant tout bilan WaPla.
SAISIES="SELECT count(*) FROM app._saisies_communales() s WHERE s.commune_id = '$TC'"
SAISIES_AVANT=$(sql "$SAISIES")

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "sans compte : 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$API$B?communeId=$TC")"
chk "un citoyen, un prestataire : 403" "403|403" "$(req GET "$B?communeId=$TC" "" "$T_CIT")|$(req GET "$B?communeId=$TC" "" "$T_PREST")"
chk "la FNCT n'ouvre pas le bilan d'une commune (403)" 403 "$(req POST "$B?communeId=$TC" "{\"exercice\":$EX}" "$T_FNCT")"
chk "… ni en SQL direct : la base le refuse" t \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role', 'super_admin_fnct', true), set_config('app.user_id', '$FNCT_ID', true);
                 SET LOCAL ROLE siipi_app; INSERT INTO wapla.bilans (commune_id, exercice) VALUES ('$TC', $EX); COMMIT;" 2>&1 \
       | grep -q 'row-level security' && echo t || echo f)"
chk "la commune d'un autre : introuvable (404)" 404 "$(req POST "$B?communeId=$AUTRE" "{\"exercice\":$EX}")"
chk "un exercice qui n'a pas commencé, une clé de trop : 400" "400|400" \
    "$(req POST "$B?communeId=$TC" "{\"exercice\":$((ANNEE + 1))}")|$(req POST "$B?communeId=$TC" "{\"exercice\":$EX,\"x\":1}")"
chk "un bilan qui n'existe pas : 404" 404 "$(req GET "$B/00000000-0000-0000-0000-000000000000")"
chk "rien n'est ouvert" 0 "$(sql "SELECT count(*) FROM wapla.bilans WHERE commune_id = '$TC'")"

# -----------------------------------------------------------------------------
echo
echo "2. Un bilan naît de l'amorce"
chk "la commune ouvre son bilan $EX" 201 "$(req POST "$B?communeId=$TC" "{\"exercice\":$EX}")"
BILAN=$(val "d['id']")
chk "un second bilan pour le même exercice : 409" 409 "$(req POST "$B?communeId=$TC" "{\"exercice\":$EX}")"
req GET "$B/$BILAN" >/dev/null
chk "un brouillon, sans résultat ni niveau" "brouillon|None|None" "$(val "d['statut']")|$(val "d['resultat']")|$(val "d['niveau']")"
chk "le gisement et le taux de collecte viennent de SIIPI, déclarés" "siipi_declare|siipi_declare|2920.0" \
    "$(provenance waste_in)|$(provenance tc_1)|$(val "float(next(x['valeur'] for x in d['entrees'] if x['cle'] == 'waste_in'))")"
chk "le gasoil est mesuré ; le coût complet et la redevance sont déclarés ; le climat est une référence" \
    "siipi_mesure|siipi_declare|siipi_declare|reference_tunisienne|reference_tunisienne" \
    "$(provenance ghg_1)|$(provenance cost_1)|$(provenance cost_5)|$(provenance APY)|$(provenance ATY)"
chk "la composition propre à la commune entre avec son niveau de source" "siipi_declare|t" \
    "$(provenance ghg_6)|$(val "next(x['detail']['propre_a_la_commune'] for x in d['entrees'] if x['cle'] == 'ghg_6')" | vrai)"
chk "ni centre de tri ni incinération dans le statu quo tunisien (SPEC § 3.3)" "False|False|reference_tunisienne" \
    "$(val "next(x['valeur'] for x in d['entrees'] if x['cle'] == 'mrf')")|$(val "next(x['valeur'] for x in d['entrees'] if x['cle'] == 'incineration')")|$(provenance mrf)"
chk "le tonnage pesé n'est pas une entrée du moteur : il n'entre pas" absente "$(provenance dechets_collectes_t)"
chk "reste à traiter : la part vers le compostage (le seul procédé optionnel actif)" tc_4 "$(val "','.join(d['a_traiter'])")"

# -----------------------------------------------------------------------------
echo
echo "3. Les entrées : ce qui est refusé"
chk "le calcul avant que la clé soit traitée : 400, et le message la nomme" "400|t" \
    "$(req POST "$B/$BILAN/calcul")|$(val "'tc_4' in d['error']" | vrai)"
chk "une entrée inconnue du moteur : 400" 400 "$(req PUT "$B/$BILAN/entrees/tc_99" '{"valeur":0.1}')"
chk "hors des bornes de l'outil (tc_14 : 0,1 à 0,3), une valeur texte : 400" "400|400" \
    "$(req PUT "$B/$BILAN/entrees/tc_14" '{"valeur":0.05}')|$(req PUT "$B/$BILAN/entrees/tc_14" '{"valeur":"0.2"}')"
chk "garder « par défaut » un coût, qui n'en a pas : 400" 400 "$(req PUT "$B/$BILAN/entrees/cost_11" '{"defaut":true}')"
chk "la FNCT ne saisit rien (403)" 403 "$(req PUT "$B/$BILAN/entrees/tc_4" '{"valeur":0.05}' "$T_FNCT")"
chk "une entrée ne s'efface pas, même en SQL direct" t \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$DIR_ID', true), set_config('app.commune_id', '$TC', true);
                 SET LOCAL ROLE siipi_app; DELETE FROM wapla.entrees WHERE bilan_id = '$BILAN'; COMMIT;" 2>&1 \
       | grep -q 'permission denied' && echo t || echo f)"
chk "une provenance venue de SIIPI sans source : la base la refuse" t \
    "$($PSQL -c "INSERT INTO wapla.entrees (bilan_id, commune_id, cle, valeur, provenance) VALUES ('$BILAN', '$TC', 'tc_6', '0.5', 'siipi_mesure');" 2>&1 \
       | grep -q 'entrees_source' && echo t || echo f)"

# -----------------------------------------------------------------------------
echo
echo "4. Une clé gardée par défaut : illustratif, et la FNCT ne le voit pas"
chk "la commune garde exprès la part par défaut vers le compostage" "200|defaut_wapla|" \
    "$(req PUT "$B/$BILAN/entrees/tc_4" '{"defaut":true}')|$(provenance tc_4)|$(val "','.join(d['a_traiter'])")"
chk "le calcul : illustratif, avec la version du moteur" "200|calcule|illustratif|w1b-1" \
    "$(req POST "$B/$BILAN/calcul")|$(val "d['statut']")|$(val "d['niveau']")|$(val "d['version_moteur']")"
chk "… la clé par défaut est nommée" tc_4 "$(val "','.join(d['fiabilite']['cles_par_defaut'])")"
chk "la FNCT ne voit pas un bilan illustratif : ni par son identifiant, ni dans la liste" "404|0" \
    "$(req GET "$B/$BILAN" "" "$T_FNCT")|$(req GET "$B?communeId=$TC" "" "$T_FNCT" >/dev/null; val "len(d)")"

# -----------------------------------------------------------------------------
echo
echo "5. La clé saisie : étayé, indicatif au seuil de la FNCT"
chk "une saisie rend le résultat caduc : le bilan revient au brouillon" "200|brouillon|None|None" \
    "$(req PUT "$B/$BILAN/entrees/tc_4" '{"valeur":0.05}')|$(val "d['statut']")|$(val "d['resultat']")|$(val "d['niveau']")"
chk "le calcul : étayé — 5 entrées comptées sur 17 restent par défaut (29,4 % < 30 %)" "200|etaye|5|17" \
    "$(req POST "$B/$BILAN/calcul")|$(val "d['niveau']")|$(val "len(d['fiabilite']['comptees_par_defaut'])")|$(val "d['fiabilite']['comptees']")"
chk "… lesquelles : recyclables à la source, non-collecté, gestion de la décharge" "ghg_19,ghg_4,tc_2,tc_35,tc_6" \
    "$(val "','.join(sorted(d['fiabilite']['comptees_par_defaut']))")"
chk "la FNCT lit un bilan étayé" "200|etaye" "$(req GET "$B/$BILAN" "" "$T_FNCT")|$(val "d['niveau']")"
chk "une commune ne règle pas le seuil (403) ; un seuil de 1,5 est refusé (400)" "403|400" \
    "$(req PUT /wapla/reglages/seuil_defauts_etaye '{"valeur":0.25}')|$(req PUT /wapla/reglages/seuil_defauts_etaye '{"valeur":1.5}' "$T_FNCT")"
chk "la FNCT abaisse le seuil à 25 %" "200|0.25" "$(req PUT /wapla/reglages/seuil_defauts_etaye '{"valeur":0.25}' "$T_FNCT")|$(val "d['valeur']")"
chk "recalculé, le même bilan devient indicatif (29,4 % ≥ 25 %)" "200|indicatif|0.25" \
    "$(req POST "$B/$BILAN/calcul")|$(val "d['niveau']")|$(val "d['fiabilite']['seuil']")"
req PUT /wapla/reglages/seuil_defauts_etaye '{"valeur":0.30}' "$T_FNCT" >/dev/null
req POST "$B/$BILAN/calcul" >/dev/null

# -----------------------------------------------------------------------------
echo
echo "6. Le résultat stocké, confronté au témoin indépendant"
req GET "$B/$BILAN" >/dev/null
cp "$T/r.json" "$T/bilan.json"
python3 -c "
import json
b = json.load(open('$T/bilan.json'))
print(json.dumps([{e['cle']: e['valeur'] for e in b['entrees']}]))" > "$T/jeu.json"
python3 tests/wapla_attendus.py --mode=corrige < "$T/jeu.json" > "$T/temoin.json"
chk "le moteur, appelé par l'API, et le témoin donnent les mêmes flux, uPOPs, GES, climat et coûts (à 10⁻⁹ près)" 0 \
    "$(python3 - "$T/bilan.json" "$T/temoin.json" <<'PY'
import json, math, sys
r = json.load(open(sys.argv[1]))['resultat']
t = json.load(open(sys.argv[2]))[0]
ecarts = []
def comparer(c, a, b):
    if isinstance(b, dict):
        for k in b: comparer(f'{c}.{k}', a.get(k, 'ABSENT') if isinstance(a, dict) else 'ABSENT', b[k])
    elif a is None or b is None or isinstance(b, bool):
        if a != b: ecarts.append(c)
    elif not math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9): ecarts.append(c)
if 'erreur' in t: ecarts.append('témoin arrêté : ' + t['erreur'])
else:
    for k in ('flux', 'upops', 'ges', 'climat', 'couts'): comparer(k, r[k], t[k])
for e in ecarts[:5]: print(e, file=sys.stderr)
print(len(ecarts))
PY
)"
chk "le résultat est en mode corrigé, et dit sa version" "corrige|w1b-1" "$(val "d['resultat']['mode']")|$(val "d['resultat']['version_moteur']")"
chk "le gisement calculé est celui de SIIPI (2 920 t), et la masse se conserve" "2920.0|t" \
    "$(val "float(d['resultat']['flux']['WG'])")|$(val "abs(d['resultat']['flux']['WG'] - sum(d['resultat']['flux'][k] or 0 for k in ('LGE1','LGE2','OBE','CE','OFG','EFLD','ReT','CMP','LW','LS1','LS2'))) < 1e-6" | vrai)"
chk "une erreur du moteur revient en clair (coefficients au-delà de 1) : 400" "200|400|t" \
    "$(req PUT "$B/$BILAN/entrees/tc_2" '{"valeur":0.9}')|$(req POST "$B/$BILAN/calcul")|$(val "'dépassent 1' in d['error']" | vrai)"
req PUT "$B/$BILAN/entrees/tc_2" '{"valeur":0.1}' >/dev/null

# -----------------------------------------------------------------------------
echo
echo "7. Le retrait, et la séparation"
chk "la FNCT ne retire rien (403)" 403 "$(req POST "$B/$BILAN/retrait" "" "$T_FNCT")"
chk "la commune retire son bilan : il disparaît des lectures, la ligne reste, datée" "204|404|1" \
    "$(req POST "$B/$BILAN/retrait")|$(req GET "$B/$BILAN")|$(sql "SELECT count(*) FROM wapla.bilans WHERE id = '$BILAN' AND deleted_at IS NOT NULL")"
chk "retiré deux fois : introuvable (404)" 404 "$(req POST "$B/$BILAN/retrait")"
chk "un nouveau bilan pour le même exercice peut alors s'ouvrir" 201 "$(req POST "$B?communeId=$TC" "{\"exercice\":$EX}")"
chk "rien de ce que la commune a fait dans la couche ne compte comme saisie dans SIIPI" "$SAISIES_AVANT" "$(sql "$SAISIES")"
chk "… ni n'entre au journal d'audit de SIIPI" 0 \
    "$(sql "SELECT count(*) FROM audit_log WHERE commune_id = '$TC' AND table_name IN ('bilans', 'entrees', 'reglages')")"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
