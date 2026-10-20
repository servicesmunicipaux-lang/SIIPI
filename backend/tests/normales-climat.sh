#!/usr/bin/env bash
# =============================================================================
# Couche WaPla — les normales climatiques par gouvernorat (INM 1981-2010).
# DECISIONS_2026-10-16.md, amendement du 20/10/2026 ; SPEC_wapla § 3.1.
#
# Le climat de WaPla est une référence par GOUVERNORAT, saisie par la FNCT à
# partir des normales INM 1981-2010 (open data, licence OTL), chargée en base
# une fois (seed/normalesInm.ts) et versionnée par sa date d'effet. La commune
# peut la surcharger par sa météo locale ; rien ne l'y oblige.
#
# Elle commence par ce que le chargement REFUSE, sans rien écrire : un
# gouvernorat absent, inconnu ou en double, une valeur vide, écrite à la
# française ou hors des bornes, une source vide, une colonne manquante, et la
# réécriture d'une normale en vigueur. Puis : les gouvernorats du référentiel
# couverts, rejouer ne change rien, une commune n'écrit pas de normale. Enfin le
# moteur : un bilan reçoit les normales de son gouvernorat quand la commune n'a
# rien saisi ; la surcharge de la commune l'emporte ; un bilan sans climat n'est
# jamais « étayé », même sous le seuil des valeurs par défaut.
#
# Les normales sont FICTIVES, bâties sur la liste des gouvernorats de la base
# (aucun nom écrit ici), sous la date d'effet du 1er janvier de l'année en cours.
# La table nationale est gardée avant le premier geste et rendue ligne pour
# ligne en partant (tests/outils/tables_nationales.sh) : les normales réelles,
# quand elles seront chargées, ne bougent pas.
#
#   docker compose exec -T api npm run test:normales-climat
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
entree() { val "next((str(x['$2']) for x in d['entrees'] if x['cle'] == '$1'), 'absente')"; }
# charger <fichier> : le script de chargement, sa sortie dans $T/charge.txt ; rend son code de sortie.
charger() { npx tsx seed/normalesInm.ts --fichier "$1" --date-effet "$DATE_FICTIVE" > "$T/charge.txt" 2>&1; echo $?; }
lignes_normales() { sql "SELECT count(*) FROM wapla.facteurs_reference"; }

TC=test_normales_climat
TC2=test_normales_sans_climat
ESSAI_C="'$TC','$TC2'"
EX=$(TZ=Africa/Tunis date +%Y)
DATE_FICTIVE="$EX-01-01"
. tests/outils/comptes_temporaires.sh
. tests/outils/communes_essai.sh
. tests/outils/base_reelle.sh
. tests/outils/tables_nationales.sh
nettoyer_c() {
  effacer_communes_essai "$ESSAI_C"
  retirer_comptes_temporaires
  effacer_communes_essai "$ESSAI_C"
}
# La table des normales est nationale : gardée entière avant le premier geste.
garder_tables_nationales wapla.facteurs_reference
nettoyer_c
trap 'nettoyer_c; rm -rf "$T"' EXIT
rendre_tables_nationales_en_sortie
releve_base_reelle

# Les gouvernorats du référentiel, lus dans la base, et des normales fictives.
$PSQL -c "SELECT DISTINCT gouvernorat FROM communes
           WHERE deleted_at IS NULL AND NOT est_demo AND id NOT LIKE 'test%' AND gouvernorat IS NOT NULL
           ORDER BY 1" > "$T/gouvernorats.txt" 2>/dev/null
NB_GOUV=$(grep -c . "$T/gouvernorats.txt")
G1=$(head -1 "$T/gouvernorats.txt")
python3 - "$T" <<'PYEOF'
import sys
d = sys.argv[1]
gouv = [l.strip('\n') for l in open(f'{d}/gouvernorats.txt', encoding='utf-8') if l.strip()]
entete = ['gouvernorat', 'precipitations_annuelles_mm', 'temperature_moyenne_c', 'station', 'periode', 'source', 'licence']
def ligne(i, g):
    # Le premier gouvernorat : 350 mm et 19 °C, la classe climatique 3 de l'outil.
    apy, aty = ('350', '19') if i == 0 else (str(200 + 10 * i), f'{15 + 0.1 * i:.1f}')
    return [g, apy, aty, f'TEST station {i}', '1981-2010', 'TEST fictif, campagne normales-climat', 'OTL']
base = [ligne(i, g) for i, g in enumerate(gouv)]
def ecrire(nom, lignes, cols=entete):
    with open(f'{d}/{nom}.csv', 'w', encoding='utf-8') as f:
        f.write(';'.join(cols) + '\n')
        for l in lignes:
            f.write(';'.join(l) + '\n')
ecrire('ok', base)
ecrire('manque', base[:-1])
ecrire('inconnu', base + [['TEST-Atlantide', '300', '18', 'TEST', '1981-2010', 'TEST', 'OTL']])
ecrire('double', base + [base[0]])
vide = [l[:] for l in base]; vide[1][2] = ''; ecrire('vide', vide)
virgule = [l[:] for l in base]; virgule[1][2] = '18,5'; ecrire('virgule', virgule)
hors = [l[:] for l in base]; hors[1][1] = '99999'; ecrire('hors', hors)
sans = [l[:] for l in base]; sans[1][5] = ''; ecrire('sans_source', sans)
ecrire('colonne', [l[:-1] for l in base], entete[:-1])
change = [l[:] for l in base]; change[0][1] = '360'; ecrire('change', change)
PYEOF

echo
echo "1. Le chargement refuse, et n'écrit rien"
[ "$NB_GOUV" -ge 2 ] || { echo "Le référentiel n'a pas de gouvernorats : lancer d'abord npm run seed." >&2; exit 1; }
AVANT=$(lignes_normales)
refuse() {  # $1 = libellé, $2 = fichier, $3 = ce que le message doit dire
  local code
  code=$(charger "$T/$2.csv")
  chk "$1 : refusé, en le disant, et rien n'est écrit" "1|1|$AVANT" \
      "$code|$(grep -c -- "$3" "$T/charge.txt" | head -1)|$(lignes_normales)"
}
refuse "un gouvernorat absent du fichier" manque "gouvernorat(s) sans normales"
refuse "un gouvernorat que le référentiel ne connaît pas" inconnu "n'est pas un gouvernorat du référentiel"
refuse "un gouvernorat en double" double "figure deux fois"
refuse "une température vide" vide "jamais une case vide"
refuse "une virgule décimale (18,5)" virgule "point décimal"
refuse "des précipitations hors des bornes (99 999 mm)" hors "hors des bornes"
refuse "une source vide" sans_source "« source » est vide"
refuse "une colonne manquante (licence)" colonne "colonne(s) absente(s)"
refuse "un fichier introuvable" introuvable "Fichier introuvable"

echo
echo "2. Le chargement : chaque gouvernorat du référentiel, deux grandeurs"
chk "le fichier fictif se charge" 0 "$(charger "$T/ok.csv")"
chk "deux valeurs par gouvernorat du référentiel ($NB_GOUV)" "$((AVANT + 2 * NB_GOUV))" "$(lignes_normales)"
chk "aucun gouvernorat du référentiel sans ses deux normales en vigueur" 0 \
    "$(sql "SELECT count(*) FROM (SELECT DISTINCT gouvernorat FROM communes WHERE deleted_at IS NULL AND NOT est_demo AND id NOT LIKE 'test%' AND gouvernorat IS NOT NULL) g
             WHERE (SELECT count(DISTINCT code) FROM wapla.facteurs_reference f
                     WHERE f.gouvernorat = g.gouvernorat AND f.date_effet = '$DATE_FICTIVE' AND f.retire_le IS NULL) <> 2")"
chk "aucune valeur ni source vide" 0 \
    "$(sql "SELECT count(*) FROM wapla.facteurs_reference WHERE date_effet = '$DATE_FICTIVE' AND (valeur IS NULL OR btrim(source) = '')")"
chk "la source dit la période, la station et la licence" 1 \
    "$(sql "SELECT count(*) FROM wapla.facteurs_reference WHERE gouvernorat = '$G1' AND code = 'precipitations_annuelles_mm' AND date_effet = '$DATE_FICTIVE'
             AND source LIKE 'INM, normales 1981-2010, station TEST station 0 — %(licence OTL)'")"
chk "rejoué, il ne change rien" "0|$((AVANT + 2 * NB_GOUV))|1" \
    "$(charger "$T/ok.csv")|$(lignes_normales)|$(grep -c '0 valeur(s) ajoutée(s)' "$T/charge.txt")"
chk "une normale en vigueur ne se réécrit pas : refusé, la valeur reste" "1|1|350" \
    "$(charger "$T/change.csv")|$(grep -c 'ne se réécrit pas' "$T/charge.txt")|$(sql "SELECT valeur FROM wapla.facteurs_reference WHERE gouvernorat = '$G1' AND code = 'precipitations_annuelles_mm' AND date_effet = '$DATE_FICTIVE' AND retire_le IS NULL")"

# -----------------------------------------------------------------------------
commune_essai "$TC" "TEST commune des normales climatiques"
commune_essai "$TC2" "TEST commune sans normales climatiques"
# La première dans le gouvernorat qui porte les normales de la classe 3 ; la
# seconde reste dans le gouvernorat « TEST », qui n'en a aucune.
$PSQL -c "UPDATE communes SET gouvernorat = '$G1' WHERE id = '$TC';" >/dev/null
compte_temporaire admin_commune "$TC" "Directeur des normales"; T_DIR=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$TC2" "Directeur sans normales"; T_DIR2=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire super_admin_fnct "" "Agent FNCT des normales"; T_FNCT=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_DIR" ] && [ -n "$T_DIR2" ] && [ -n "$T_FNCT" ] || { echo "API injoignable sur $API, ou comptes temporaires refusés" >&2; exit 1; }

echo
echo "3. Une commune n'écrit pas de normale"
chk "un directeur : 403" 403 \
    "$(req POST /wapla/facteurs-reference "{\"code\":\"temperature_moyenne_c\",\"gouvernorat\":\"$G1\",\"valeur\":30,\"source\":\"TEST\",\"dateEffet\":\"$DATE_FICTIVE\"}")"

# Les entrées que la commune saisit pour que le bilan se calcule, et soit étayé
# s'il a son climat : les cinq clés, puis les quinze entrées comptées hors climat.
saisir() {  # $1 = bilan, $2 = jeton
  local c v
  for c in waste_in:1000 tc_1:0.5 tc_4:0 tc_5:0 tc_22:0 \
           tc_2:0.1 tc_6:0.5 tc_35:0 ghg_1:900 cost_1:100000 cost_5:50000 \
           ghg_5:0.1 ghg_6:0.55 ghg_14:0.1 ghg_15:0.55 ghg_3:0.1 ghg_11:0.1 ghg_18:0.1 ghg_4:0.8 ghg_19:0; do
    v=$(req PUT "/wapla/bilans/$1/entrees/${c%%:*}" "{\"valeur\":${c#*:}}" "$2")
    [ "$v" = 200 ] || echo "  (saisie de ${c%%:*} : $v)"
  done
}

echo
echo "4. Un bilan reçoit les normales de son gouvernorat"
chk "la commune ouvre son bilan" 201 "$(req POST "/wapla/bilans?communeId=$TC" "{\"exercice\":$EX}")"
BILAN=$(val "d['id']")
chk "précipitations : la normale du gouvernorat, en référence nationale" "350|reference_tunisienne" "$(entree APY valeur)|$(entree APY provenance)"
chk "température : idem" "19|reference_tunisienne" "$(entree ATY valeur)|$(entree ATY provenance)"
saisir "$BILAN" "$T_DIR"
chk "le calcul passe, étayé, climat renseigné, classe climatique 3" "200|etaye|True|3" \
    "$(req POST "/wapla/bilans/$BILAN/calcul")|$(val "d['niveau']")|$(val "d['fiabilite']['climat_renseigne']")|$(val "d['resultat']['climat']['classe']")"

echo
echo "5. La météo locale de la commune l'emporte"
chk "la commune saisit 1 200 mm : saisie de la commune" "200|1200|saisie_commune" \
    "$(req PUT "/wapla/bilans/$BILAN/entrees/APY" '{"valeur":1200}')|$(entree APY valeur)|$(entree APY provenance)"
chk "recalculé : classe climatique 6 (19 °C, plus de 1 000 mm), toujours étayé" "200|6|etaye" \
    "$(req POST "/wapla/bilans/$BILAN/calcul")|$(val "d['resultat']['climat']['classe']")|$(val "d['niveau']")"

echo
echo "6. Sans climat, un bilan n'est jamais étayé"
chk "dans un gouvernorat sans normales, le bilan n'a pas de climat" "201|absente|absente" \
    "$(req POST "/wapla/bilans?communeId=$TC2" "{\"exercice\":$EX}" "$T_DIR2")|$(entree APY valeur)|$(entree ATY valeur)"
BILAN2=$(val "d['id']")
chk "l'amorce le dit" t \
    "$(req GET "/wapla/amorce?communeId=$TC2&exercice=$EX" "" "$T_DIR2" >/dev/null; val "'t' if next(x for x in d['entrees'] if x['cle'] == 'APY')['manque'] else 'f'")"
saisir "$BILAN2" "$T_DIR2"
chk "les mêmes saisies, sous le seuil des valeurs par défaut : indicatif, climat non renseigné, sans classe" "200|indicatif|False|None" \
    "$(req POST "/wapla/bilans/$BILAN2/calcul" "" "$T_DIR2")|$(val "d['niveau']")|$(val "d['fiabilite']['climat_renseigne']")|$(val "d['resultat']['climat']['classe']")"
chk "… alors que seules les deux entrées du climat restent par défaut (2 sur 17, sous le seuil)" "2|17|True" \
    "$(val "len(d['fiabilite']['comptees_par_defaut'])")|$(val "d['fiabilite']['comptees']")|$(val "d['fiabilite']['part_par_defaut'] < d['fiabilite']['seuil']")"
# Les agrégats ne se lisent que sous le rôle de la FNCT : il est posé pour la session.
chk "et il n'entre pas dans les agrégats de la FNCT" 0 \
    "$($PSQL -c "SELECT set_config('app.role', 'super_admin_fnct', false)" \
             -c "SELECT count(*) FROM wapla.bilans_agregeables($EX) WHERE commune_id = '$TC2'" 2>/dev/null | tail -1)"

echo
echo "Aucune commune réelle n'a reçu de ligne ; la table nationale est rendue"
base_reelle_intacte "pendant la campagne"
nettoyer_c
chk "ses communes de test et ses comptes temporaires sont effacés" "0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
rendre_tables_nationales
tables_nationales_rendues "en partant"
base_reelle_intacte "en partant"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
