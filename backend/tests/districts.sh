#!/usr/bin/env bash
# =============================================================================
# Les districts de la FNCT (décision D-FNCT-2) — campagne de vérification.
#
# Le découpage officiel est celui du décret n° 2023-589 du 21 septembre 2023 :
# cinq districts, vingt-quatre gouvernorats (migration 078). La FNCT peut le
# redéfinir, en citant sa source.
#
# Elle commence par ce que la plateforme REFUSE : un découpage défini sans
# compte, par une commune ou un citoyen ; sans source ; qui oublie un
# gouvernorat ; qui nomme un gouvernorat ou un district inconnu, ou deux fois
# le même code ; un gouvernorat dans deux districts, même en SQL direct.
#
# Puis : le découpage en base est celui du décret, recopié dans un témoin
# indépendant (tests/donnees/districts-decret-2023-589.json) ; aucun orphelin,
# aucun doublon ; les sommes par district, dans les indicateurs nationaux et
# dans les agrégats WaPla, sont celles de leurs gouvernorats ; aucun nom de
# gouvernorat n'est écrit dans le code.
#
# LE DÉCOUPAGE EST UNE DONNÉE RÉELLE. La campagne le réécrit (c'est l'objet du
# PUT) : elle le relève en entrant et le rétablit en partant, quoi qu'il arrive
# (leçon de JC-007), puis vérifie qu'il est revenu à l'identique.
#
#   docker compose exec -T api npm run test:districts
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
TEMOIN="tests/donnees/districts-decret-2023-589.json"
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
# req <méthode> <chemin> [fichier du corps] [jeton] — la réponse dans $T/r.json.
req() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer ${4:-$T_FNCT}" \
       -H 'Content-Type: application/json' ${3:+--data-binary "@$3"} "$API$2"
}
# py <expression> : évaluée avec d (la réponse), W (le témoin), S (le découpage relevé en entrant).
py() {
  python3 - "$T" "$TEMOIN" "$1" <<'PYEOF' 2>/dev/null || echo erreur
import json, sys
t, temoin, expr = sys.argv[1:4]
d = json.load(open(f'{t}/r.json'))
W = json.load(open(temoin))
S = json.load(open(f'{t}/releve.json'))
officiel = {g: code for code, gs in W['districts'].items() for g in gs}
print(eval(expr))
PYEOF
}
# corps <fichier> <expression python qui rend le corps du PUT, à partir de S et W>
corps() {
  python3 - "$T" "$TEMOIN" "$2" > "$1" <<'PYEOF'
import json, sys
t, temoin, expr = sys.argv[1:4]
W = json.load(open(temoin))
S = json.load(open(f'{t}/releve.json'))
officiel = {g: code for code, gs in W['districts'].items() for g in gs}
districts = [{'code': x['code'], 'nom': x['nom'], 'nom_ar': x['nom_ar']} for x in S['districts']]
rattachements = {r['gouvernorat']: r['district_code'] for r in S['rattachements']}
print(json.dumps(eval(expr)))
PYEOF
}

T_FNCT=$(tok admin.national@siipi.tn)
T_DIR=$(tok directeur.marsa@siipi.tn)
T_CIT=$(tok citoyen.demo@siipi.tn)
[ -n "$T_FNCT" ] && [ -n "$T_DIR" ] && [ -n "$T_CIT" ] || { echo "API injoignable sur $API, ou compte d'essai absent" >&2; exit 1; }

# Le relevé du découpage en entrant, et son rétablissement en partant.
req GET /kpi/districts >/dev/null
cp "$T/r.json" "$T/releve.json"
retablir() {
  python3 - "$T/releve.json" > "$T/retablir.sql" <<'PYEOF'
import json, sys
S = json.load(open(sys.argv[1]))
q = lambda v: 'NULL' if v is None else "'" + str(v).replace("'", "''") + "'"
print('BEGIN; DELETE FROM gouvernorats_district; DELETE FROM districts_fnct;')
for x in S['districts']:
    print(f"INSERT INTO districts_fnct (code, nom, nom_ar, ordre, source) VALUES ({q(x['code'])}, {q(x['nom'])}, {q(x['nom_ar'])}, {x['ordre']}, {q(x['source'])});")
for r in S['rattachements']:
    print(f"INSERT INTO gouvernorats_district (gouvernorat, district_code) VALUES ({q(r['gouvernorat'])}, {q(r['district_code'])});")
print('COMMIT;')
PYEOF
  $PSQL -v ON_ERROR_STOP=1 -f "$T/retablir.sql" >/dev/null 2>&1
}
fin() { retablir; rm -rf "$T"; }
trap fin EXIT

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
corps "$T/officiel.json" "{'districts': districts, 'rattachements': rattachements, 'source': W['source']}"
chk "sans compte : 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H 'Content-Type: application/json' --data-binary "@$T/officiel.json" "$API/kpi/districts")"
chk "une commune, un citoyen : 403" "403|403" "$(req PUT /kpi/districts "$T/officiel.json" "$T_DIR")|$(req PUT /kpi/districts "$T/officiel.json" "$T_CIT")"
corps "$T/c.json" "{'districts': districts, 'rattachements': rattachements}"
chk "sans source citée : 400" 400 "$(req PUT /kpi/districts "$T/c.json")"
corps "$T/c.json" "{'districts': districts, 'rattachements': {g: c for g, c in rattachements.items() if g != 'Tozeur'}, 'source': 'TEST oubli'}"
chk "un gouvernorat oublié : 400, et la réponse le nomme" "400|True" "$(req PUT /kpi/districts "$T/c.json")|$(py "'Tozeur' in json.dumps(d, ensure_ascii=False)")"
corps "$T/c.json" "{'districts': districts, 'rattachements': {**rattachements, 'TEST-Atlantide': 'D1'}, 'source': 'TEST inconnu'}"
chk "un gouvernorat inconnu : 400" 400 "$(req PUT /kpi/districts "$T/c.json")"
corps "$T/c.json" "{'districts': districts, 'rattachements': {**rattachements, 'Tozeur': 'D9'}, 'source': 'TEST inconnu'}"
chk "un district inconnu : 400" 400 "$(req PUT /kpi/districts "$T/c.json")"
corps "$T/c.json" "{'districts': districts + [dict(districts[0])], 'rattachements': rattachements, 'source': 'TEST doublon'}"
chk "deux districts du même code : 400" 400 "$(req PUT /kpi/districts "$T/c.json")"
chk "un gouvernorat dans deux districts, même en SQL direct : la base refuse" t \
    "$($PSQL -c "INSERT INTO gouvernorats_district (gouvernorat, district_code) VALUES ('Sfax', 'D5');" 2>&1 | grep -q 'duplicate key\|unique' && echo t || echo f)"
chk "un district sans source digne de ce nom : la base refuse" t \
    "$($PSQL -c "INSERT INTO districts_fnct (code, nom, source) VALUES ('TEST-X', 'TEST', 'abc');" 2>&1 | grep -q 'districts_fnct_source' && echo t || echo f)"
chk "rien de tout cela n'a touché au découpage" 0 \
    "$(req GET /kpi/districts >/dev/null; py "0 if d == S else 1")"

# -----------------------------------------------------------------------------
echo
echo "2. Le découpage en base est celui du décret"
req GET /kpi/districts >/dev/null
chk "cinq districts, D1 à D5, dans cet ordre" "D1,D2,D3,D4,D5" "$(py "','.join(x['code'] for x in d['districts'])")"
chk "chacun a son nom en français et en arabe" 5 "$(py "sum(1 for x in d['districts'] if x['nom'].strip() and (x['nom_ar'] or '').strip())")"
chk "chacun cite le décret" 5 "$(py "sum(1 for x in d['districts'] if x['source'] == W['source'])")"
chk "24 gouvernorats rattachés" 24 "$(py "len(d['rattachements'])")"
chk "le rattachement est exactement celui du témoin" True "$(py "{r['gouvernorat']: r['district_code'] for r in d['rattachements']} == officiel")"
chk "aucun doublon : chaque gouvernorat une seule fois" True "$(py "len({r['gouvernorat'] for r in d['rattachements']}) == len(d['rattachements'])")"
chk "aucun orphelin : chaque gouvernorat d'une commune réelle a un district" "" \
    "$(py "', '.join(sorted(set(d['gouvernorats']) - {r['gouvernorat'] for r in d['rattachements']}))")"
chk "… et aucune commune réelle hors district, vu de la base" 0 \
    "$(sql "SELECT count(*) FROM communes c WHERE NOT c.est_demo AND c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM gouvernorats_district gd WHERE gd.gouvernorat = c.gouvernorat)")"
chk "les 24 gouvernorats du référentiel des communes sont ceux du décret" True "$(py "set(d['gouvernorats']) == set(officiel)")"

# -----------------------------------------------------------------------------
echo
echo "3. Les sommes par district sont celles de leurs gouvernorats"
AN=$(sql "SELECT extract(year FROM (now() AT TIME ZONE 'Africa/Tunis'))::int")
req GET "/kpi/national?annee=$AN&niveau=gouvernorat" >/dev/null; cp "$T/r.json" "$T/gouv.json"
req GET "/kpi/national?annee=$AN&niveau=national" >/dev/null; cp "$T/r.json" "$T/nat.json"
req GET "/kpi/national?annee=$AN&niveau=district" >/dev/null
SOMMES="(lambda G, N: (
  sorted(x['cle'] for x in d),
  all(x['communes'] == sum(g['communes'] for g in G if officiel.get(g['cle']) == x['cle']) for x in d),
  sum(x['communes'] for x in d) == N[0]['communes'],
  all((x['tonnage_t'] or 0) - sum(g['tonnage_t'] or 0 for g in G if officiel.get(g['cle']) == x['cle']) < 1e-6 for x in d),
))(json.load(open('$T/gouv.json')), json.load(open('$T/nat.json')))"
chk "indicateurs nationaux : D1 à D5, aucun « non rattaché »" "['D1', 'D2', 'D3', 'D4', 'D5']" "$(py "$SOMMES[0]")"
chk "… chaque district compte les communes de ses gouvernorats" True "$(py "$SOMMES[1]")"
chk "… les cinq districts font le national" True "$(py "$SOMMES[2]")"
chk "… et les tonnages pesés de ses gouvernorats" True "$(py "$SOMMES[3]")"
req GET "/wapla/agregats?exercice=$((AN - 1))" >/dev/null
chk "agrégats WaPla : D1 à D5, dans l'ordre de la FNCT, aucun groupe sans district" "D1,D2,D3,D4,D5" "$(py "','.join(str(x['code']) for x in d['districts'])")"
chk "… le M de chaque district est la somme de ses gouvernorats" True \
    "$(py "all(x['communes'] == sum(g['communes'] for g in d['gouvernorats'] if officiel.get(g['gouvernorat']) == x['code']) for x in d['districts'])")"
chk "… et chaque gouvernorat porte son district" True "$(py "all(g['district'] == officiel[g['gouvernorat']] for g in d['gouvernorats'])")"
chk "… les cinq districts font le national" True "$(py "sum(x['communes'] for x in d['districts']) == d['national']['communes']")"

# -----------------------------------------------------------------------------
echo
echo "4. La FNCT redéfinit le découpage — puis le décret est rétabli"
chk "le même découpage, renvoyé : 200, et rien ne change (noms arabes compris)" "200|0" \
    "$(req PUT /kpi/districts "$T/officiel.json")|$(req GET /kpi/districts >/dev/null; py "0 if d == S else 1")"
corps "$T/c.json" "{'districts': districts, 'rattachements': {**rattachements, 'Zaghouan': 'D3'}, 'source': 'TEST décision fictive de la FNCT'}"
chk "Zaghouan passe en D3 : 200, la source citée est gardée" "200|TEST décision fictive de la FNCT" \
    "$(req PUT /kpi/districts "$T/c.json")|$(req GET /kpi/districts >/dev/null; py "d['districts'][0]['source']")"
req GET "/kpi/national?annee=$AN&niveau=district" >/dev/null
chk "les sommes suivent : D3 compte désormais les communes de Zaghouan" True \
    "$(py "next(x['communes'] for x in d if x['cle'] == 'D3') == sum(g['communes'] for g in json.load(open('$T/gouv.json')) if g['cle'] == 'Zaghouan' or officiel.get(g['cle']) == 'D3')")"
retablir
req GET /kpi/districts >/dev/null
chk "le découpage relevé en entrant est rétabli à l'identique" 0 "$(py "0 if d == S else 1")"

# -----------------------------------------------------------------------------
echo
echo "5. Aucun nom de gouvernorat n'est écrit dans le code"
# Hors commentaires, et hors des exemples du contrat (document.ts) : un nom
# entre guillemets serait une règle cachée, que le découpage de la base ne
# pourrait plus corriger. Le front (web/src) est vérifié de même par son
# `npm run lint` (scripts/verifier-gouvernorats.mjs) : ce conteneur ne le voit pas.
chk "aucun gouvernorat entre guillemets dans le code de l'API (src/)" "" \
    "$(python3 - "$TEMOIN" <<'PYEOF' 2>/dev/null || echo erreur
import json, os, re, sys
W = json.load(open(sys.argv[1]))
noms = sorted({g for gs in W['districts'].values() for g in gs} | {'La Manouba'})
motif = re.compile('[\'"`](' + '|'.join(map(re.escape, noms)) + ')[\'"`]')
trouves = []
for base in ('src',):
    for dossier, _, fichiers in os.walk(base):
        for f in fichiers:
            if not f.endswith('.ts') or f == 'document.ts':
                continue
            for n, ligne in enumerate(open(os.path.join(dossier, f), encoding='utf-8'), 1):
                # Un commentaire « // » se retire, pas le « // » d'une adresse (https://…).
                code = re.sub(r"""(^|[^:'"`])//.*$""", r'\1', ligne).strip()
                if code.startswith('*') or code.startswith('/*'):
                    continue
                if motif.search(code):
                    trouves.append(f'{f}:{n}')
print(' '.join(trouves))
PYEOF
)"
chk "… et la recherche a bien lu le code : elle trouve « Africa/Tunis », qui n'est pas un gouvernorat" t     "$(grep -rqF "'Africa/Tunis'" src && echo t || echo f)"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
