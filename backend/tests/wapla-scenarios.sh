#!/usr/bin/env bash
# =============================================================================
# Couche WaPla, lot W4a — les scénarios : hypothèses, comparaison au statu
# quo, écart de coût, figement. docs/specs_metier/SPEC_wapla_couche_planification.md
# § 5, § 6 (point 3) et § 8 (test de sortie de W4).
#
# Elle commence par ce que la plateforme REFUSE : un scénario créé par la FNCT
# (aussi en SQL direct), par un prestataire, sur le bilan d'une autre commune,
# sur un bilan non calculé, sans nom ; une hypothèse inconnue ou hors bornes ;
# un scénario figé que l'on modifie, recalcule ou dont on touche les entrées
# (aussi en SQL direct) ; figer un brouillon.
#
# Puis la comparaison : le statu quo sans compostage, un scénario qui envoie
# 20 % de la collecte au compostage. Le compostage est un procédé AJOUTÉ :
# l'écart de coût reste « non renseigné » tant que ses coûts manquent, puis vaut
# annuité + exploitation − recettes. Les valeurs attendues sont recalculées ici,
# des seuls résultats stockés (témoin indépendant de comparaison.ts), et le
# résultat du scénario est confronté au témoin du moteur.
#
# Enfin le test de sortie du lot : un scénario figé garde ses chiffres après un
# changement des références de la FNCT et un nouveau calcul du statu quo.
#
#   docker compose exec -T api npm run test:wapla-scenarios
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

TC=test_wapla_scen
GV=TEST-WAPLA-SCEN
EX=2025
COMMUNE_DIR="$TC"
. tests/outils/directeur_temporaire.sh
nettoyer() {
  $PSQL -c "DELETE FROM wapla.bilans WHERE commune_id = '$TC';" \
        -c "DELETE FROM pesees WHERE commune_id = '$TC';" \
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
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune scénarios WaPla', 'TEST', '$GV', 0);" >/dev/null
directeur_temporaire "$TC"
trap fin EXIT
T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
T_FNCT=$(tok admin.national@siipi.tn)
T_PREST=$(tok prestataire.marsa@siipi.tn)
[ -n "$T_DIR" ] && [ -n "$T_FNCT" ] && [ -n "$T_PREST" ] || { echo "API injoignable sur $API, ou compte d'essai absent" >&2; exit 1; }
FNCT_ID=$(sql "SELECT id FROM users WHERE email = 'admin.national@siipi.tn'")
$PSQL -c "INSERT INTO parametres_commune (commune_id, population_permanente, population_permanente_source, production_theorique_kg_hab_j, production_theorique_source)
          VALUES ('$TC', 10000, 'TEST estimation', 0.8, 'TEST étude');" \
      -c "INSERT INTO pesees (commune_id, date_pesee, poids_net_kg, type_dechet, vehicule_immat, observation, saisi_par)
          VALUES ('$TC', '2025-03-15', 600000, 'menager', 'TEST-WAPLA-SCEN', 'TEST-WAPLA-SCEN', '$DIR_ID');" >/dev/null
req POST /wapla/facteurs-reference "{\"code\":\"precipitations_annuelles_mm\",\"gouvernorat\":\"$GV\",\"valeur\":450,\"source\":\"TEST INM\",\"dateEffet\":\"2020-01-01\"}" "$T_FNCT" >/dev/null
req POST /wapla/facteurs-reference "{\"code\":\"temperature_moyenne_c\",\"gouvernorat\":\"$GV\",\"valeur\":19,\"source\":\"TEST INM\",\"dateEffet\":\"2020-01-01\"}" "$T_FNCT" >/dev/null
SAISIES="SELECT count(*) FROM app._saisies_communales() s WHERE s.commune_id = '$TC'"
SAISIES_AVANT=$(sql "$SAISIES")

# Le statu quo : pas de compostage (0 %), calculé.
req POST "/wapla/bilans?communeId=$TC" "{\"exercice\":$EX}" >/dev/null
BILAN=$(val "d['id']")
req PUT "/wapla/bilans/$BILAN/entrees/tc_4" '{"valeur":0}' >/dev/null
S="/wapla/scenarios"

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "un scénario sur un bilan non calculé : 400, et le message dit quoi faire" "400|t" \
    "$(req POST "/wapla/bilans/$BILAN/scenarios" '{"nom":"TEST compostage"}')|$(val "'Calculez d’abord le bilan' in d['error']" | vrai)"
req POST "/wapla/bilans/$BILAN/calcul" >/dev/null
chk "le statu quo est calculé" calcule "$(req GET "/wapla/bilans/$BILAN" >/dev/null; val "d['statut']")"
chk "la FNCT ne crée pas de scénario (403) ; un prestataire non plus" "403|403" \
    "$(req POST "/wapla/bilans/$BILAN/scenarios" '{"nom":"TEST"}' "$T_FNCT")|$(req POST "/wapla/bilans/$BILAN/scenarios" '{"nom":"TEST"}' "$T_PREST")"
chk "… ni en SQL direct : la base le refuse" t \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role', 'super_admin_fnct', true), set_config('app.user_id', '$FNCT_ID', true);
                 SET LOCAL ROLE siipi_app; INSERT INTO wapla.scenarios (bilan_id, commune_id, nom) VALUES ('$BILAN', '$TC', 'TEST'); COMMIT;" 2>&1 \
       | grep -q 'row-level security' && echo t || echo f)"
chk "sans nom, une clé de trop : 400" "400|400" \
    "$(req POST "/wapla/bilans/$BILAN/scenarios" '{"nom":"  "}')|$(req POST "/wapla/bilans/$BILAN/scenarios" '{"nom":"TEST","x":1}')"
chk "un bilan qui n'existe pas : 404" 404 "$(req POST "/wapla/bilans/00000000-0000-0000-0000-000000000000/scenarios" '{"nom":"TEST"}')"
chk "rien n'est créé" 0 "$(sql "SELECT count(*) FROM wapla.scenarios WHERE commune_id = '$TC'")"

# -----------------------------------------------------------------------------
echo
echo "2. Un scénario copie le statu quo, puis pose ses hypothèses"
chk "la commune crée le scénario « TEST compostage »" "201|brouillon" \
    "$(req POST "/wapla/bilans/$BILAN/scenarios" '{"nom":"TEST compostage","description":"20 % vers le compostage"}')|$(val "d['statut']")"
SCEN=$(val "d['id']")
chk "il copie les entrées du statu quo, avec leur provenance" "t|siipi_declare|saisie_commune" \
    "$(N1=$(sql "SELECT count(*) FROM wapla.entrees WHERE bilan_id = '$BILAN'"); N2=$(val "len(d['entrees'])"); [ "$N1" = "$N2" ] && [ "$N1" -gt 5 ] && echo t || echo f)|$(val "next(x['provenance'] for x in d['entrees'] if x['cle'] == 'waste_in')")|$(val "next(x['provenance'] for x in d['entrees'] if x['cle'] == 'tc_4')")"
chk "une hypothèse inconnue, hors des bornes, un texte : 400" "400|400|400" \
    "$(req PUT "$S/$SCEN/entrees/tc_99" '{"valeur":0.1}')|$(req PUT "$S/$SCEN/entrees/tc_14" '{"valeur":0.9}')|$(req PUT "$S/$SCEN/entrees/tc_4" '{"valeur":"0.2"}')"
chk "la FNCT ne pose pas d'hypothèse (403)" 403 "$(req PUT "$S/$SCEN/entrees/tc_4" '{"valeur":0.2}' "$T_FNCT")"
chk "20 % de la collecte au compostage : une hypothèse de scénario" "200|hypothese_scenario" \
    "$(req PUT "$S/$SCEN/entrees/tc_4" '{"valeur":0.2}')|$(val "next(x['provenance'] for x in d['entrees'] if x['cle'] == 'tc_4')")"
chk "figer un brouillon : 400" 400 "$(req POST "$S/$SCEN/figer")"

# -----------------------------------------------------------------------------
echo
echo "3. La comparaison au statu quo"
chk "le calcul du scénario" "200|calcule|w1b-1" "$(req POST "$S/$SCEN/calcul")|$(val "d['statut']")|$(val "d['version_moteur']")"
cp "$T/r.json" "$T/scen.json"
# Le témoin : les quatre grandeurs, recalculées des seuls flux stockés.
python3 - "$T/scen.json" > "$T/temoin.txt" <<'PY'
import json, math, sys
s = json.load(open(sys.argv[1]))
def grandeurs(r):
    f = lambda c: r['flux'].get(c) or 0
    return {'mise_en_decharge_t': sum(f(c) for c in ('D1', 'MR', 'CR', 'IRes', 'CU', 'BR1')),
            'brule_air_libre_t': f('WoB'), 'ges_t_co2e': r['ges']['total'], 'upops_mg_teq': sum(r['upops'].values())}
a, b, c = grandeurs(s['statu_quo']), grandeurs(s['resultat']), s['comparaison']['indicateurs']
ecarts = [k for k in a if not (math.isclose(c[k]['statu_quo'], a[k], rel_tol=1e-9, abs_tol=1e-9)
                               and math.isclose(c[k]['scenario'], b[k], rel_tol=1e-9, abs_tol=1e-9)
                               and math.isclose(c[k]['ecart'], b[k] - a[k], rel_tol=1e-9, abs_tol=1e-9))]
print(len(ecarts), 't' if b['mise_en_decharge_t'] < a['mise_en_decharge_t'] else 'f')
PY
read -r N_ECARTS MOINS_DECHARGE < "$T/temoin.txt"
chk "les quatre grandeurs (décharge, brûlage, GES, uPOPs) : statu quo, scénario, écart — d'accord avec le témoin" 0 "$N_ECARTS"
chk "envoyer 20 % au compostage met moins de déchets en décharge" t "$MOINS_DECHARGE"
chk "le statu quo copié est celui du bilan calculé" t \
    "$(req GET "/wapla/bilans/$BILAN" >/dev/null; python3 -c "
import json
b = json.load(open('$T/r.json')); s = json.load(open('$T/scen.json'))
print('t' if b['resultat']['ges'] == s['statu_quo']['ges'] and b['resultat']['flux'] == s['statu_quo']['flux'] else 'f')")"
chk "le compostage est un procédé ajouté ; sans ses coûts, l'écart de coût est « non renseigné », et le dit" "compostage|None|compostage" \
    "$(python3 -c "import json;c=json.load(open('$T/scen.json'))['comparaison']['cout'];print(','.join(c['procedes_ajoutes']) + '|' + str(c['ecart']) + '|' + ','.join(c['couts_manquants']))")"
# Les coûts du compostage ajouté : 200 000 TND sur 10 ans sans intérêt, 50 000 TND/an
# d'exploitation, le compost vendu 20 TND/t.
for h in 'cost_15:200000' 'cost_16:10' 'cost_17:0' 'cost_3:50000' 'cost_4:20'; do req PUT "$S/$SCEN/entrees/${h%%:*}" "{\"valeur\":${h#*:}}" >/dev/null; done
chk "une hypothèse posée rend le calcul caduc" "brouillon|None" "$(val "d['statut']")|$(val "d['comparaison']")"
req POST "$S/$SCEN/calcul" >/dev/null
cp "$T/r.json" "$T/scen.json"
chk "l'écart de coût : 200 000 / 10 + 50 000 − compost × 20 (témoin), tous coûts saisis" t \
    "$(python3 -c "
import json, math
s = json.load(open('$T/scen.json'))
attendu = 200000 / 10 + 50000 - s['resultat']['flux']['CMP'] * 20
c = s['comparaison']['cout']
print('t' if math.isclose(c['ecart'], attendu, rel_tol=1e-9) and not c['couts_manquants'] else 'f')")"
chk "le résultat du scénario, confronté au témoin du moteur (mode corrigé)" 0 \
    "$(python3 -c "
import json
s = json.load(open('$T/scen.json'))
print(json.dumps([{e['cle']: e['valeur'] for e in s['entrees']}]))" | python3 tests/wapla_attendus.py --mode=corrige > "$T/temoin.json"; python3 - "$T/scen.json" "$T/temoin.json" <<'PY'
import json, math, sys
r = json.load(open(sys.argv[1]))['resultat']; t = json.load(open(sys.argv[2]))[0]
ecarts = []
def comparer(c, a, b):
    if isinstance(b, dict):
        for k in b: comparer(f'{c}.{k}', a.get(k) if isinstance(a, dict) else None, b[k])
    elif a is None or b is None or isinstance(b, bool):
        if a != b: ecarts.append(c)
    elif not math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9): ecarts.append(c)
if 'erreur' in t: ecarts.append(t['erreur'])
else:
    for k in ('flux', 'upops', 'ges', 'couts'): comparer(k, r[k], t[k])
print(len(ecarts))
PY
)"
chk "la FNCT lit le scénario (le bilan n'est pas illustratif)" 200 "$(req GET "$S/$SCEN" "" "$T_FNCT")"

# -----------------------------------------------------------------------------
echo
echo "4. Figé, il ne change plus"
chk "la commune fige le scénario" "200|fige" "$(req POST "$S/$SCEN/figer")|$(val "d['statut']")"
EMPREINTE="SELECT md5(resultat::text || statu_quo::text || comparaison::text || version_moteur) FROM wapla.scenarios WHERE id = '$SCEN'"
EMPREINTE_ENTREES="SELECT md5(string_agg(cle || valeur::text || provenance, '|' ORDER BY cle)) FROM wapla.entrees_scenario WHERE scenario_id = '$SCEN'"
AVANT=$(sql "$EMPREINTE"); AVANT_E=$(sql "$EMPREINTE_ENTREES")
chk "une hypothèse sur un scénario figé : 409" 409 "$(req PUT "$S/$SCEN/entrees/tc_4" '{"valeur":0.3}')"
chk "un nouveau calcul : 409 ; figer deux fois : 409" "409|409" "$(req POST "$S/$SCEN/calcul")|$(req POST "$S/$SCEN/figer")"
chk "en SQL direct, la base refuse de toucher au scénario figé" t \
    "$($PSQL -c "UPDATE wapla.scenarios SET nom = 'TEST changé' WHERE id = '$SCEN';" 2>&1 | grep -q 'SCENARIO_FIGE' && echo t || echo f)"
chk "… à ses entrées (modifier, ajouter, effacer)" "t|t|t" \
    "$($PSQL -c "UPDATE wapla.entrees_scenario SET valeur = '0.5' WHERE scenario_id = '$SCEN' AND cle = 'tc_4';" 2>&1 | grep -q 'SCENARIO_FIGE' && echo t || echo f)|$($PSQL -c "INSERT INTO wapla.entrees_scenario (scenario_id, commune_id, cle, valeur, provenance) VALUES ('$SCEN', '$TC', 'tc_6', '0.4', 'hypothese_scenario');" 2>&1 | grep -q 'SCENARIO_FIGE' && echo t || echo f)|$($PSQL -c "DELETE FROM wapla.entrees_scenario WHERE scenario_id = '$SCEN';" 2>&1 | grep -q 'SCENARIO_FIGE' && echo t || echo f)"
# Le test de sortie de W4 : les références de la FNCT changent, le statu quo
# est recalculé — le scénario figé ne bouge pas.
PLUIE=$(sql "SELECT id FROM wapla.facteurs_reference WHERE gouvernorat = '$GV' AND code = 'precipitations_annuelles_mm' AND retire_le IS NULL")
req POST "/wapla/facteurs-reference/$PLUIE/retrait" '{"motif":"TEST nouvelle normale"}' "$T_FNCT" >/dev/null
req POST /wapla/facteurs-reference "{\"code\":\"precipitations_annuelles_mm\",\"gouvernorat\":\"$GV\",\"valeur\":1200,\"source\":\"TEST INM\",\"dateEffet\":\"2020-01-01\"}" "$T_FNCT" >/dev/null
req PUT /wapla/reglages/seuil_defauts_etaye '{"valeur":0.10}' "$T_FNCT" >/dev/null
req PUT "/wapla/bilans/$BILAN/entrees/APY" '{"valeur":1200}' >/dev/null
req PUT "/wapla/bilans/$BILAN/entrees/tc_2" '{"valeur":0.05}' >/dev/null
chk "le statu quo, lui, change : recalculé, ses GES ne sont plus ceux du scénario figé" "200|t" \
    "$(req POST "/wapla/bilans/$BILAN/calcul")|$(python3 -c "
import json
b = json.load(open('$T/r.json')); s = json.load(open('$T/scen.json'))
print('t' if b['resultat']['ges']['total'] != s['statu_quo']['ges']['total'] else 'f')")"
chk "le scénario figé garde ses chiffres, sa comparaison, sa version du moteur et ses entrées, à l'octet près" "$AVANT|$AVANT_E" \
    "$(sql "$EMPREINTE")|$(sql "$EMPREINTE_ENTREES")"
chk "un scénario figé se retire (logiquement) : il disparaît des lectures, la ligne reste" "204|404|1" \
    "$(req POST "$S/$SCEN/retrait")|$(req GET "$S/$SCEN")|$(sql "SELECT count(*) FROM wapla.scenarios WHERE id = '$SCEN' AND deleted_at IS NOT NULL AND statut = 'fige'")"

# -----------------------------------------------------------------------------
echo
echo "5. Un bilan illustratif : la FNCT ne voit pas ses scénarios ; rien ne compte dans SIIPI"
req POST "/wapla/bilans?communeId=$TC" '{"exercice":2024}' >/dev/null
B24=$(val "d['id']")
req PUT "/wapla/bilans/$B24/entrees/tc_4" '{"defaut":true}' >/dev/null
req PUT "/wapla/bilans/$B24/entrees/waste_in" '{"valeur":2000}' >/dev/null
req PUT "/wapla/bilans/$B24/entrees/tc_1" '{"valeur":0.3}' >/dev/null
req POST "/wapla/bilans/$B24/calcul" >/dev/null
chk "le bilan 2024 est illustratif" illustratif "$(val "d['niveau']")"
chk "la commune y crée un scénario ; la FNCT ne le voit pas (404), ni dans la liste" "201|404|404" \
    "$(req POST "/wapla/bilans/$B24/scenarios" '{"nom":"TEST illustratif"}')|$(req GET "$S/$(val "d['id']")" "" "$T_FNCT")|$(req GET "/wapla/bilans/$B24/scenarios" "" "$T_FNCT")"
chk "rien de ce que la commune a fait dans la couche ne compte comme saisie dans SIIPI" "$SAISIES_AVANT" "$(sql "$SAISIES")"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
