#!/usr/bin/env bash
# =============================================================================
# Couche WaPla, lot W5 — les agrégats nationaux des bilans étayés.
# docs/specs_metier/SPEC_wapla_couche_planification.md § 5, § 6 et § 8.
#
# Elle commence par ce que la plateforme REFUSE : les agrégats lus sans compte,
# par un citoyen, un prestataire, une commune — aussi en SQL direct — ; un
# exercice qui n'a pas commencé.
#
# Puis elle BÂTIT son territoire : un gouvernorat d'essai de 31 communes
# réelles, dont 12 ont un bilan étayé de l'exercice, et autour d'elles tout ce
# qui ne doit PAS compter — un bilan indicatif, un illustratif, un brouillon, un
# étayé retiré, un étayé d'un autre exercice, une commune retirée et la commune
# de démonstration, toutes deux avec un bilan étayé. Le test de sortie du lot :
# « 12 communes sur 31 », la commune de démonstration absente, aucun bilan non
# étayé dans les sommes, aucune route qui rende un rang ou un classement.
#
# Les sommes attendues viennent d'un témoin qui ne lit que les résultats du
# moteur et la définition des grandeurs de la note de cadrage — jamais la route.
#
#   docker compose exec -T api npm run test:wapla-agregats
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
req() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer ${3:-$T_FNCT}" "$API$2"
}
# py <expression> : évaluée sur la réponse ($T/r.json, d) et les résultats du moteur (R).
py() {
  python3 - "$T" "$1" <<'PYEOF' 2>/dev/null || echo erreur
import json, sys
t, expr = sys.argv[1], sys.argv[2]
d = json.load(open(f'{t}/r.json'))
R = json.load(open(f'{t}/res.json'))
gv = lambda nom: next((g for g in d['gouvernorats'] if g['gouvernorat'] == nom), None)
di = lambda code: next((x for x in d['districts'] if x['code'] == code), None)
print(eval(expr))
PYEOF
}

P=test_wapla_nat          # préfixe des communes d'essai
GA=TEST-WAPLA-NAT-A       # 31 communes, 12 bilans étayés
GB=TEST-WAPLA-NAT-B       # 2 communes, aucun bilan étayé
GC=TEST-WAPLA-NAT-C       # 1 commune, 1 bilan étayé
DIST=test-wapla-nat
EX=2019
nettoyer() {
  $PSQL -c "DELETE FROM wapla.bilans WHERE commune_id LIKE '${P}_%';" \
        -c "DELETE FROM gouvernorats_district WHERE gouvernorat LIKE 'TEST-WAPLA-NAT-%';" \
        -c "DELETE FROM districts_fnct WHERE code = '$DIST';" \
        -c "DELETE FROM audit_log WHERE commune_id LIKE '${P}_%';" \
        -c "DELETE FROM communes WHERE id LIKE '${P}_%';" >/dev/null 2>&1
}
fin() { nettoyer; rm -rf "$T"; }
nettoyer
trap fin EXIT

T_FNCT=$(tok admin.national@siipi.tn)
T_DIR=$(tok directeur.marsa@siipi.tn)
T_PREST=$(tok prestataire.marsa@siipi.tn)
T_CIT=$(tok citoyen.demo@siipi.tn)
[ -n "$T_FNCT" ] && [ -n "$T_DIR" ] && [ -n "$T_PREST" ] && [ -n "$T_CIT" ] || { echo "API injoignable sur $API, ou compte d'essai absent" >&2; exit 1; }
ANNEE=$(sql "SELECT extract(year FROM (now() AT TIME ZONE 'Africa/Tunis'))::int")
DIR_ID=$(sql "SELECT id FROM users WHERE email = 'directeur.marsa@siipi.tn'")
FNCT_ID=$(sql "SELECT id FROM users WHERE email = 'admin.national@siipi.tn'")
A="/wapla/agregats"

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "sans compte : 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$API$A?exercice=$EX")"
chk "un citoyen, un prestataire, une commune : 403" "403|403|403" \
    "$(req GET "$A?exercice=$EX" "$T_CIT")|$(req GET "$A?exercice=$EX" "$T_PREST")|$(req GET "$A?exercice=$EX" "$T_DIR")"
chk "… et la commune pas davantage en SQL direct : la base refuse" t \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$DIR_ID', true);
                 SET LOCAL ROLE siipi_app; SELECT count(*) FROM wapla.bilans_agregeables($EX); COMMIT;" 2>&1 \
       | grep -q 'AGREGAT_FNCT' && echo t || echo f)"
chk "… ni pour compter les communes d'un territoire" t \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$DIR_ID', true);
                 SET LOCAL ROLE siipi_app; SELECT count(*) FROM wapla.communes_par_gouvernorat(); COMMIT;" 2>&1 \
       | grep -q 'AGREGAT_FNCT' && echo t || echo f)"
chk "un exercice qui n'a pas commencé, ou absent : 400" "400|400" "$(req GET "$A?exercice=$((ANNEE + 1))")|$(req GET "$A")"

# -----------------------------------------------------------------------------
# Le territoire d'essai. Trois résultats du moteur corrigé (gisements de 1 000,
# 2 500 et 4 000 t), posés tour à tour sur les bilans : des sommes qui se
# vérifient, et un bilan non étayé qui fausserait la somme s'il y entrait.
echo '[{"waste_in": 1000}, {"waste_in": 2500}, {"waste_in": 4000}]' | npm run -s wapla:calculer > "$T/res.json"
python3 - "$T" "$P" "$GA" "$GB" "$GC" "$EX" > "$T/territoire.sql" <<'PYEOF'
import json, sys
t, p, ga, gb, gc, ex = sys.argv[1:7]
ex = int(ex)
R = json.load(open(f'{t}/res.json'))
communes, bilans = [], []
def commune(id_, gv, demo=False, retiree=False):
    retrait = "now(), 'TEST commune retirée du référentiel'" if retiree else 'NULL, NULL'
    communes.append(f"('{id_}', 'TEST {id_}', 'TEST', '{gv}', 0, {str(demo).lower()}, {retrait})")
def bilan(id_, niveau, r, exercice=ex, retire=False, brouillon=False):
    if brouillon:
        bilans.append(f"('{id_}', {exercice}, 'brouillon', NULL, NULL, NULL, NULL, NULL, NULL)")
        return
    bilans.append(f"('{id_}', {exercice}, 'calcule', 'w1b-1', $j${json.dumps(R[r])}$j$::jsonb, '{niveau}', '{{}}'::jsonb, now(), "
                  f"{'now()' if retire else 'NULL'})")
for i in range(1, 32):
    commune(f'{p}_a{i:02d}', ga)
for i in range(1, 13):
    bilan(f'{p}_a{i:02d}', 'etaye', (i - 1) % 3)       # les 12 étayés
bilan(f'{p}_a13', 'indicatif', 2)
bilan(f'{p}_a14', 'illustratif', 2)
bilan(f'{p}_a15', None, 0, brouillon=True)
bilan(f'{p}_a16', 'etaye', 2, retire=True)           # retiré par la commune
bilan(f'{p}_a17', 'etaye', 2, exercice=ex - 1)        # un autre exercice
commune(f'{p}_a32', ga, retiree=True)                # une commune retirée du référentiel
bilan(f'{p}_a32', 'etaye', 2)
commune(f'{p}_demo', ga, demo=True)                  # la commune de démonstration
bilan(f'{p}_demo', 'etaye', 2)
commune(f'{p}_b01', gb); commune(f'{p}_b02', gb)
bilan(f'{p}_b01', 'indicatif', 2)
commune(f'{p}_c01', gc)
bilan(f'{p}_c01', 'etaye', 0)
print('INSERT INTO communes (id, name, name_ar, gouvernorat, population, est_demo, deleted_at, motif_retrait) VALUES\n  ' + ',\n  '.join(communes) + ';')
print('INSERT INTO wapla.bilans (commune_id, exercice, statut, version_moteur, resultat, niveau, fiabilite, calcule_le, deleted_at) VALUES\n  '
      + ',\n  '.join(bilans) + ';')
PYEOF
$PSQL -v ON_ERROR_STOP=1 -f "$T/territoire.sql" >/dev/null 2>"$T/territoire.err"
$PSQL -c "INSERT INTO districts_fnct (code, nom, nom_ar, ordre) VALUES ('$DIST', 'TEST district WaPla', 'TEST', 32000);" \
      -c "INSERT INTO gouvernorats_district (gouvernorat, district_code) VALUES ('$GA', '$DIST'), ('$GC', '$DIST');" >/dev/null
echo
echo "2. Le territoire d'essai est bâti"
chk "36 communes d'essai, dont une retirée et la commune de démonstration" "36|1|1" \
    "$(sql "SELECT count(*) FROM communes WHERE id LIKE '${P}_%'")|$(sql "SELECT count(*) FROM communes WHERE id LIKE '${P}_%' AND deleted_at IS NOT NULL")|$(sql "SELECT count(*) FROM communes WHERE id LIKE '${P}_%' AND est_demo")"
chk "21 bilans d'essai posés" 21 "$(sql "SELECT count(*) FROM wapla.bilans WHERE commune_id LIKE '${P}_%'")"
chk "trois résultats du moteur, gisements 1 000, 2 500, 4 000 t" "1000.0|2500.0|4000.0" \
    "$(python3 -c "import json;R=json.load(open('$T/res.json'));print('|'.join(str(float(r['flux']['WG'])) for r in R))")"

# -----------------------------------------------------------------------------
echo
echo "3. « N communes sur M » — le test de sortie du lot"
chk "la FNCT lit les agrégats : 200" 200 "$(req GET "$A?exercice=$EX")"
chk "le gouvernorat d'essai : 12 communes sur 31" "12|31" "$(py "f\"{gv('$GA')['communes_etayees']}|{gv('$GA')['communes']}\"")"
chk "un gouvernorat sans bilan étayé : 0 sur 2, et aucune valeur (null, pas 0)" "0|2|None" \
    "$(py "f\"{gv('$GB')['communes_etayees']}|{gv('$GB')['communes']}|{gv('$GB')['valeurs']}\"")"
chk "le district d'essai réunit ses deux gouvernorats : 13 sur 32" "13|32" \
    "$(py "f\"{di('$DIST')['communes_etayees']}|{di('$DIST')['communes']}\"")"
chk "les gouvernorats sans district forment un groupe nommé, où est le B" t \
    "$(py "di(None) is not None and di(None)['communes'] >= 2 and gv('$GB')['district'] is None" | sed 's/True/t/;s/False/f/')"
chk "le national est la somme des gouvernorats, et celle des districts" "t|t" \
    "$(py "(sum(g['communes_etayees'] for g in d['gouvernorats']) == d['national']['communes_etayees'] and sum(g['communes'] for g in d['gouvernorats']) == d['national']['communes'], sum(x['communes_etayees'] for x in d['districts']) == d['national']['communes_etayees'] and sum(x['communes'] for x in d['districts']) == d['national']['communes'])" \
       | sed 's/[() ]//g;s/True/t/g;s/False/f/g;s/,/|/')"
chk "M national = les communes réelles du référentiel" "$(sql "SELECT count(*) FROM communes WHERE NOT est_demo AND deleted_at IS NULL")" "$(py "d['national']['communes']")"

# -----------------------------------------------------------------------------
echo
echo "4. Seuls les bilans étayés, d'une commune réelle, entrent dans les sommes"
# Le témoin : les grandeurs de la note de cadrage (§ 5), lues dans les seuls
# résultats du moteur — 4 fois chacun des trois résultats pour le gouvernorat A.
TEMOIN="dict(gisement_t=lambda r: r['flux']['WG'],
             mise_en_decharge_t=lambda r: sum(r['flux'][c] or 0 for c in ('D1', 'MR', 'CR', 'IRes', 'CU', 'BR1')),
             brule_air_libre_t=lambda r: r['flux']['WoB'],
             ges_t_co2e=lambda r: r['ges']['total'],
             upops_mg_teq=lambda r: sum(r['upops'].values()))"
chk "les cinq grandeurs du gouvernorat A = 4 × chacun des trois résultats, à 10⁻⁶ près" t \
    "$(py "all(abs(gv('$GA')['valeurs'][k] - 4 * sum(f(r) for r in R)) < 1e-6 for k, f in $TEMOIN.items())" | sed 's/True/t/;s/False/f/')"
chk "le gisement du gouvernorat A : 30 000 t (ni l'indicatif, ni l'illustratif, ni le retiré, ni l'autre exercice)" 30000.0 \
    "$(py "float(gv('$GA')['valeurs']['gisement_t'])")"
chk "le gouvernorat C : son seul bilan étayé, 1 000 t" "1|1|1000.0" \
    "$(py "f\"{gv('$GC')['communes_etayees']}|{gv('$GC')['communes']}|{float(gv('$GC')['valeurs']['gisement_t'])}\"")"
chk "la base ne retient que les 13 bilans étayés du territoire d'essai" "13|0" \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role', 'super_admin_fnct', true), set_config('app.user_id', '$FNCT_ID', true);
                 SET LOCAL ROLE siipi_app;
                 SELECT count(*) FILTER (WHERE commune_id LIKE '${P}_%') || '|' || count(*) FILTER (WHERE commune_id IN ('${P}_demo', '${P}_a32', '${P}_a13', '${P}_a14', '${P}_a15', '${P}_a16', '${P}_a17'))
                   FROM wapla.bilans_agregeables($EX); COMMIT;" 2>/dev/null | tr -d ' ' | grep -E '^[0-9]+\|[0-9]+$')"
$PSQL -c "UPDATE wapla.bilans SET statut = 'brouillon', resultat = NULL, version_moteur = NULL, niveau = NULL, fiabilite = NULL, calcule_le = NULL
           WHERE commune_id = '${P}_a01' AND exercice = $EX;" >/dev/null
req GET "$A?exercice=$EX" >/dev/null
chk "une saisie rend un bilan brouillon : il sort de l'agrégat (11 sur 31, 29 000 t)" "11|31|29000.0" \
    "$(py "f\"{gv('$GA')['communes_etayees']}|{gv('$GA')['communes']}|{float(gv('$GA')['valeurs']['gisement_t'])}\"")"
req GET "$A?exercice=$((EX - 1))" >/dev/null
chk "l'autre exercice a ses propres agrégats : 1 sur 31" "1|31" "$(py "f\"{gv('$GA')['communes_etayees']}|{gv('$GA')['communes']}\"")"

# -----------------------------------------------------------------------------
echo
echo "5. Aucun classement, aucune commune"
req GET "$A?exercice=$EX" >/dev/null
chk "la commune de démonstration est absente : aucune commune n'est nommée dans la réponse" 0 "$(grep -o "${P}_[a-z0-9]*" "$T/r.json" | wc -l | tr -d ' ')"
chk "aucune clé de rang, de classement, de position dans la réponse" "" \
    "$(py "sorted({k for x in [d['national']] + d['districts'] + d['gouvernorats'] for k in x} & {'rang', 'classement', 'rank', 'ranking', 'position', 'palmares', 'score', 'note'})" | sed 's/^\[\]$//')"
chk "les gouvernorats par ordre alphabétique, pas par valeur (A, B, C ; A le plus grand, B sans valeur)" t \
    "$(py "[g['gouvernorat'] for g in d['gouvernorats'] if g['gouvernorat'].startswith('TEST-WAPLA-NAT-')] == ['$GA', '$GB', '$GC']" | sed 's/True/t/;s/False/f/')"
curl -s "$API/openapi.json" -o "$T/openapi.json"
chk "aucune route du contrat ne rend un rang ou un classement" "" \
    "$(python3 - "$T/openapi.json" <<'PYEOF' 2>/dev/null || echo erreur
import json, sys
interdits = {'rang', 'classement', 'rank', 'ranking', 'palmares', 'position_classement'}
trouves = set()
def parcourir(x, chemin):
    if isinstance(x, dict):
        for k, v in (x.get('properties') or {}).items():
            if k.lower() in interdits:
                trouves.add(f'{chemin}.{k}')
        for k, v in x.items():
            parcourir(v, f'{chemin}/{k}')
    elif isinstance(x, list):
        for v in x:
            parcourir(v, chemin)
parcourir(json.load(open(sys.argv[1])), '')
print(' '.join(sorted(trouves)))
PYEOF
)"
# Par segment : « déclassement » (lot 16.4, la sortie d'un engin du parc) n'est pas un classement.
chk "aucun chemin du contrat ne nomme un classement" 0 \
    "$(python3 -c "import json,re;print(sum(1 for p in json.load(open('$T/openapi.json'))['paths'] if re.search(r'(^|/)(classements?|palmares|rangs?|ranking)(/|-|$)', p.lower())))")"

[ -s "$T/territoire.err" ] && { echo; echo "  Le territoire d'essai n'a pas pu être bâti :"; head -5 "$T/territoire.err"; }
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
