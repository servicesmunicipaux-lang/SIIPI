#!/usr/bin/env bash
# =============================================================================
# v0.15.89 — lot « Indicateurs ODD et radar » (DECISIONS_2026-11-04.md § 3 ;
# migration 097).
#
# Elle commence par ce qui est REFUSÉ : une déclaration ODD sans source, sans
# date ou datée dans l'avenir (par l'API et par la base), la déclaration d'un
# ODD que la plateforme calcule ; puis ce qui ne se calcule pas : une commune
# sans production spécifique (les deux ODD calculés non renseignés), un mois
# partiellement pesé (ODD 11.6.1 non renseigné, comme TAUX_COLLECTE). Puis, en
# septembre 2026, contre un témoin indépendant (tests/odd_attendus.py, qui ne lit
# que le scénario et la méthode) : le taux de collecte ODD avec le proxy des
# assimilés, chaque terme et sa provenance, l'indice de gaspillage alimentaire ;
# une déclaration d'après une étude qui remplace l'approximation. Enfin le radar
# de complétude : un indicateur « sans objet » ne fait pas baisser son axe, et le
# radar d'une commune ne bouge pas quand une autre déclare.
#
#   docker compose exec -T api npm run test:indicateurs-odd
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
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

A=test_odd_a; B=test_odd_b; C=test_odd_c; X=test_odd_x
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
compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_A=$COMPTE_ID
compte_temporaire admin_commune "$B" "Directeur B"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$C" "Directeur C"; T_C=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$X" "Directeur X"; T_X=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_C" ] && [ -n "$T_X" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }

AUJ=$(sql "SELECT app.jour_tunis()")
HIER=$(sql "SELECT app.jour_tunis() - 1")
DEMAIN=$(sql "SELECT app.jour_tunis() + 1")

# Le scénario, posé en base. Population 10 000 ; production 0,8 kg/hab/j, sauf B,
# qui n'en a pas ; A pèse tous ses voyages de septembre, C un seul. A et B ont une
# caractérisation (62,5 % d'organiques) ; C n'en a pas.
$PSQL >/dev/null <<SQL
INSERT INTO parametres_commune (commune_id, population_permanente, population_permanente_source, production_theorique_kg_hab_j, production_theorique_source)
VALUES ('$A', 10000, 'TEST INS 2025', 0.8, 'TEST PCGD'), ('$B', 10000, 'TEST INS 2025', NULL, NULL), ('$C', 10000, 'TEST INS 2025', 0.8, 'TEST PCGD');
INSERT INTO vehicules (id, registration, commune_id, type, classe_collecte, capacity_m3, volume_provenance) VALUES
  ('test-odd-a-bt', 'TEST-ODD A-BT', '$A', 'benne_tasseuse', 'benne_tasseuse', 16, 'constructeur'),
  ('test-odd-b-bt', 'TEST-ODD B-BT', '$B', 'benne_tasseuse', 'benne_tasseuse', 16, 'constructeur'),
  ('test-odd-c-bt', 'TEST-ODD C-BT', '$C', 'benne_tasseuse', 'benne_tasseuse', 16, 'constructeur');
INSERT INTO circuits (commune_id, nom, jours_passage, actif, vehicule_id, type_dechet, voyages_par_jour, date_debut) VALUES
  ('$A', 'TEST circuit A', ARRAY[1,3,5]::smallint[], true, 'test-odd-a-bt', 'menager', 2, DATE '2026-08-01'),
  ('$B', 'TEST circuit B', ARRAY[1,3,5]::smallint[], true, 'test-odd-b-bt', 'menager', 2, DATE '2026-08-01'),
  ('$C', 'TEST circuit C', ARRAY[1,2,3,4,5,6,7]::smallint[], true, 'test-odd-c-bt', 'menager', 1, DATE '2026-08-01');
INSERT INTO pesees (commune_id, circuit_id, voyage, date_pesee, poids_net_kg, vehicule_id, type_dechet, observation)
SELECT c.commune_id, c.id, v, d::date, 7000, c.vehicule_id, 'menager', 'TEST-ODD'
  FROM circuits c, generate_series(DATE '2026-09-01', DATE '2026-09-30', interval '1 day') d, generate_series(1, 2) v
 WHERE c.commune_id IN ('$A', '$B') AND extract(isodow FROM d) IN (1, 3, 5);
INSERT INTO pesees (commune_id, circuit_id, voyage, date_pesee, poids_net_kg, vehicule_id, type_dechet, observation)
SELECT '$C', c.id, 1, DATE '2026-09-10', 1200, c.vehicule_id, 'menager', 'TEST-ODD' FROM circuits c WHERE c.commune_id = '$C';
BEGIN;
WITH k AS (
  INSERT INTO caracterisations (commune_id, niveau_source, annee, methode, saison)
  SELECT x, 'autre_etude', 2025, 'TEST', 'annuelle' FROM unnest(ARRAY['$A', '$B']) x RETURNING id
)
INSERT INTO fractions_caracterisation (caracterisation_id, fraction, pourcentage)
SELECT k.id, f.fraction, f.pct FROM k, (VALUES ('organiques', 62.5), ('plastiques', 12.5), ('papier_carton', 10),
                                               ('verre', 5), ('metaux', 5), ('fines_autres', 5)) AS f(fraction, pct);
COMMIT;
SQL
chk "le scénario est en base : 26 pesées pour A et B, 1 pour C ; deux caractérisations" "26|26|1|2" \
    "$(sql "SELECT count(*) FROM pesees WHERE commune_id = '$A' AND date_pesee BETWEEN '2026-09-01' AND '2026-09-30'")|$(sql "SELECT count(*) FROM pesees WHERE commune_id = '$B'")|$(sql "SELECT count(*) FROM pesees WHERE commune_id = '$C'")|$(sql "SELECT count(*) FROM caracterisations WHERE commune_id IN ('$A', '$B')")"

declarer() { # commune jeton code corps-de-la-valeur — code HTTP
  req PUT "/kpi/declarations/$1/2026" "{\"valeurs\":{\"$3\":$4}}" "$2"
}
# Une écriture directe en base, sous le rôle de l'application et le compte de A.
ecrit_a() {
  $PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.commune_id', '$A', true), set_config('app.user_id', '$ID_A', true);
            SET LOCAL ROLE siipi_app; $1; ROLLBACK;" 2>&1 | grep -oE 'DECLARATION_[A-Z_]+|INSERT 0 1' | head -1
}

# -----------------------------------------------------------------------------
echo
echo "1. Ce qui est refusé"
chk "une déclaration ODD sans source ni date : 400, avec ce qu'il faut citer" "400|1" \
    "$(declarer $A "$T_A" ODD_12_5_1 '{"valeur":35}')|$(val "1 if 'source' in d['error'] else 0")"
chk "… avec une source mais sans date : 400" 400 "$(declarer $A "$T_A" ODD_12_5_1 '{"valeur":35,"source":"TEST étude de valorisation"}')"
chk "… datée de demain : 400" 400 \
    "$(declarer $A "$T_A" ODD_12_5_1 "{\"valeur\":35,\"source\":\"TEST étude de valorisation\",\"dateReference\":\"$DEMAIN\"}")"
chk "… datée d'un jour qui n'existe pas (30 février, 45 du 13e mois) : 400, jamais 500" "400|400|1" \
    "$(declarer $A "$T_A" ODD_12_5_1 '{"valeur":35,"source":"TEST étude de valorisation","dateReference":"2026-02-30"}')|$(declarer $A "$T_A" ODD_12_5_1 '{"valeur":35,"source":"TEST étude de valorisation","dateReference":"2026-13-45"}')|$(val "1 if 'existe pas' in json.dumps(d.get('details'), ensure_ascii=False) else 0")"
chk "… la base la refuse d'elle-même, sans source" DECLARATION_SOURCE \
    "$(ecrit_a "INSERT INTO declarations_indicateurs (commune_id, indicateur_code, annee, valeur, saisi_par) VALUES ('$A', 'FUITE_PLASTIQUE', 2026, 2.5, '$ID_A')")"
chk "… et datée dans l'avenir" DECLARATION_DATE \
    "$(ecrit_a "INSERT INTO declarations_indicateurs (commune_id, indicateur_code, annee, valeur, saisi_par, source, date_reference) VALUES ('$A', 'FUITE_PLASTIQUE', 2026, 2.5, '$ID_A', 'TEST étude', DATE '$DEMAIN')")"
chk "le taux de collecte ODD est calculé : il ne se déclare pas (400)" 400 \
    "$(declarer $A "$T_A" ODD_11_6_1_A "{\"valeur\":60,\"source\":\"TEST étude\",\"dateReference\":\"$HIER\"}")"
chk "aucune déclaration ODD n'a été écrite par ces refus" 0 \
    "$(sql "SELECT count(*) FROM declarations_indicateurs WHERE commune_id = '$A' AND indicateur_code IN ('ODD_12_5_1', 'FUITE_PLASTIQUE', 'ODD_11_6_1_A')")"
chk "un indicateur qui n'est pas ODD se déclare toujours sans source (couverture, 85 %)" 200 \
    "$(declarer $C "$T_C" TAUX_COUVERTURE '{"valeur":85}')"

# -----------------------------------------------------------------------------
echo
echo "2. Ce qui ne se calcule pas : non renseigné, jamais zéro"
serie() {  # commune code jeton — la valeur mesurée de septembre, ou None
  req GET "/kpi/serie?communeId=$1&code=$2&debut=2026-09-01&fin=2026-09-30&pas=mois" "" "$3" >/dev/null
  val "(lambda p: float(p[0]['valeur']) if p else None)([x for x in d if x['source'] == 'mesure'])"
}
fiche() { req GET "/kpi/5-axes?communeId=$1&annee=2026" "" "$2" >/dev/null; cp "$T/r.json" "$T/fiche_$1.json"; }
ind() { python3 -c "import json;r=[i for i in json.load(open('$T/fiche_$1.json'))['indicateurs'] if i['code']=='$2'][0];print($3)"; }
manques() { req GET "/kpi/manques?communeId=$1&code=$2&annee=2026" "" "$3" >/dev/null; val "','.join(sorted({m['source'] for m in d}))"; }
fiche $B "$T_B"; fiche $C "$T_C"
chk "B, sans production spécifique : le taux ODD de septembre n'est pas calculé, son taux de collecte non plus" "None|None" \
    "$(serie $B ODD_11_6_1_A "$T_B")|$(serie $B TAUX_COLLECTE "$T_B")"
chk "… ses deux ODD calculés sont « non renseignés » sur l'année, sans valeur" "non_renseigne|None|non_renseigne|None" \
    "$(ind $B ODD_11_6_1_A "r['statut']+'|'+str(r['valeur'])")|$(ind $B ODD_12_3_1_B "r['statut']+'|'+str(r['valeur'])")"
# « Ce qui manque » se lit sur l'année : il y manque aussi, à juste titre, les
# pesées des voyages d'août et d'octobre.
chk "… et « ce qui manque » le dit, pour l'un et l'autre : la production théorique" "1|1" \
    "$(manques $B ODD_11_6_1_A "$T_B" | grep -c production_theorique)|$(manques $B ODD_12_3_1_B "$T_B" | grep -c production_theorique)"
chk "C, un voyage pesé sur trente : ni taux de collecte ni taux ODD en septembre" "None|None" \
    "$(serie $C TAUX_COLLECTE "$T_C")|$(serie $C ODD_11_6_1_A "$T_C")"
req GET "/kpi/manques?communeId=$C&code=ODD_11_6_1_A&annee=2026" "" "$T_C" >/dev/null
chk "… il manque à C les pesées de tous les voyages" 1 "$(val "1 if 'voyages_tous_peses' in {m['source'] for m in d} else 0")"

# -----------------------------------------------------------------------------
echo
echo "3. Septembre, contre le témoin"
PART=$(sql "SELECT valeur_nombre FROM app.parametre_national('part_assimiles_proxy', DATE '2026-09-30')")
chk "le proxy national des assimilés est un paramètre daté : 30 %" 30.0000 "$PART"
python3 - "$T/scenario.json" "$AUJ" "$PART" <<'PY'
import datetime as dt, json, sys
chemin, aujourdhui, part = sys.argv[1:4]
def pesees(circuit):
    return [{'circuit': circuit, 'date': dt.date(2026, 9, j).isoformat(), 'voyage': v, 'kg': 7000}
            for j in range(1, 31) if dt.date(2026, 9, j).isoweekday() in (1, 3, 5) for v in (1, 2)]
circuit = lambda nom, jours, voyages: {'nom': nom, 'jours': jours, 'voyages': voyages, 'date_debut': '2026-08-01'}
s = {'mois': '2026-09', 'aujourdhui': aujourdhui, 'part_assimiles_pct': float(part), 'communes': {
    'A': {'production': 0.8, 'population': 10000, 'circuits': [circuit('TEST circuit A', [1, 3, 5], 2)],
          'pesees': pesees('TEST circuit A'), 'organiques': 62.5},
    'B': {'production': None, 'population': 10000, 'circuits': [circuit('TEST circuit B', [1, 3, 5], 2)],
          'pesees': pesees('TEST circuit B'), 'organiques': 62.5},
    'C': {'production': 0.8, 'population': 10000, 'circuits': [circuit('TEST circuit C', [1, 2, 3, 4, 5, 6, 7], 1)],
          'pesees': [{'circuit': 'TEST circuit C', 'date': '2026-09-10', 'voyage': 1, 'kg': 1200}]},
}}
json.dump(s, open(chemin, 'w', encoding='utf-8'), ensure_ascii=False)
PY
python3 tests/odd_attendus.py "$T/scenario.json" > "$T/attendus.json"
attendu() { python3 -c "import json;print(json.load(open('$T/attendus.json'))['$1']$2)"; }
chk "le témoin a calculé trois communes" 3 "$(python3 -c "import json;print(len(json.load(open('$T/attendus.json'))))" 2>&1)"
for c in A B C; do
  eval "id=\$$c; jeton=\$T_$c"
  chk "$c — taux de collecte ODD de septembre, comme le témoin" "$(attendu $c "['ODD_11_6_1_A']")" "$(serie "$id" ODD_11_6_1_A "$jeton")"
done
req GET "/kpi/serie?communeId=$A&code=ODD_11_6_1_A&debut=2026-09-01&fin=2026-09-30&pas=mois" "" "$T_A" >/dev/null
chk "A : chaque terme, comme le témoin (pesé, gisement ménager, gisement assimilé)" \
    "$(attendu A "['termes_11_6_1_A']['collecte_t']")|$(attendu A "['termes_11_6_1_A']['gisement_menager_t']")|$(attendu A "['termes_11_6_1_A']['gisement_assimile_t']")" \
    "$(val "f\"{float(d[0]['detail']['collecte_t'])}|{float(d[0]['detail']['gisement_menager_t'])}|{float(d[0]['detail']['gisement_assimile_t'])}\"")"
chk "A : la provenance de chaque terme (estimé ; pesé ; proxy de 30 % ; population et production avec leur source)" \
    "estime|pese|proxy|30|TEST INS 2025|TEST PCGD|26|26" \
    "$(val "'|'.join(str(x) for x in [d[0]['detail']['nature'], d[0]['detail']['provenance_collecte'], d[0]['detail']['provenance_assimiles'], int(float(d[0]['detail']['part_assimiles_pct'])), d[0]['detail']['population_provenance'], d[0]['detail']['production_source'], d[0]['detail']['voyages_peses'], d[0]['detail']['voyages_attendus']])")"
chk "A : le taux de collecte ne change pas (75,8 %) ; l'ODD, qui ajoute les assimilés, est plus bas" "75.8|1" \
    "$(serie $A TAUX_COLLECTE "$T_A")|$(python3 -c "print(1 if $(serie $A ODD_11_6_1_A "$T_A") < 75.8 else 0)")"
fiche $A "$T_A"
chk "A : gaspillage alimentaire, comme le témoin (kg/hab/j et t/j), mesuré et dit « approximation »" \
    "$(attendu A "['ODD_12_3_1_B']")|$(attendu A "['total_t_j']")|mesure|approximation|autre_etude|2025" \
    "$(ind $A ODD_12_3_1_B "f\"{float(r['valeur'])}|{float(r['detail']['total_t_j'])}|{r['source']}|{r['detail']['nature']}|{r['detail']['caracterisation_niveau']}|{r['detail']['caracterisation_annee']}\"")"
# Sans étude propre, C retient la moyenne nationale de l'ANGeD si la FNCT l'a
# saisie (app.caracterisation_retenue) ; sinon, rien. Les deux cas se contrôlent :
# la campagne ne suppose pas l'absence d'une donnée nationale qu'elle ne pose pas.
if [ "$(sql "SELECT count(*) FROM caracterisations WHERE commune_id IS NULL AND deleted_at IS NULL")" -gt 0 ]; then
  ATTENDU_C="renseigne|moyenne_nationale_anged|0"
else
  ATTENDU_C="non_renseigne|None|1"
fi
chk "C, sans caractérisation propre : la moyenne nationale si elle existe, sinon rien de calculé et la caractérisation manque" "$ATTENDU_C" \
    "$(ind $C ODD_12_3_1_B "f\"{r['statut']}|{r['detail'].get('caracterisation_niveau')}\"")|$(manques $C ODD_12_3_1_B "$T_C" | grep -c caracterisation)"

# -----------------------------------------------------------------------------
echo
echo "4. Une déclaration d'après une étude"
chk "A déclare son taux de valorisation, avec la source et la date de l'étude" 200 \
    "$(declarer $A "$T_A" ODD_12_5_1 "{\"valeur\":35,\"source\":\"TEST étude de valorisation 2026\",\"dateReference\":\"$HIER\"}")"
chk "… la base garde la source et la date" "TEST étude de valorisation 2026|$HIER" \
    "$($PSQL -c "SELECT source || '|' || date_reference FROM declarations_indicateurs WHERE commune_id = '$A' AND indicateur_code = 'ODD_12_5_1' AND deleted_at IS NULL")"
chk "A déclare son gaspillage alimentaire d'après une étude : 0,31 kg/hab/j" 200 \
    "$(declarer $A "$T_A" ODD_12_3_1_B "{\"valeur\":0.31,\"source\":\"TEST étude gaspillage\",\"dateReference\":\"$HIER\"}")"
fiche $A "$T_A"
chk "… la déclaration remplace l'approximation, avec son étude" "renseigne|declare|0.31|TEST étude gaspillage" \
    "$(ind $A ODD_12_3_1_B "f\"{r['statut']}|{r['source']}|{float(r['valeur'])}|{r['declaration']['source']}\"")"
chk "… et le taux de valorisation déclaré se lit avec son étude" "declare|35.0|$HIER" \
    "$(ind $A ODD_12_5_1 "f\"{r['source']}|{float(r['valeur'])}|{r['declaration']['date_reference']}\"")"
chk "… un ODD n'a pas d'objectif : ni « % de l'objectif », ni place dans l'indice de l'axe 3" "None|1" \
    "$(ind $A ODD_12_5_1 "r['taux_atteinte']")|$(python3 -c "
import json
f=json.load(open('$T/fiche_$A.json'))
a=[x for x in f['axes'] if x['axe']==3][0]
print(1 if a['notes']==sum(1 for i in f['indicateurs'] if i['axe']==3 and i['famille'] not in ('donnee','odd') and i['statut']!='sans_objet') else 0)")"
chk "le retrait de la déclaration rend l'approximation" "200|mesure|$(attendu A "['ODD_12_3_1_B']")" \
    "$(req PUT "/kpi/declarations/$A/2026" '{"valeurs":{"ODD_12_3_1_B":null}}' "$T_A")|$(fiche $A "$T_A"; ind $A ODD_12_3_1_B "f\"{r['source']}|{float(r['valeur'])}\"")"
chk "le retrait est logique : la déclaration retirée reste en base" 1 \
    "$(sql "SELECT count(*) FROM declarations_indicateurs WHERE commune_id = '$A' AND indicateur_code = 'ODD_12_3_1_B' AND deleted_at IS NOT NULL")"
req GET /kpi/indicateurs "" "$T_A" >/dev/null
chk "le catalogue dit quels indicateurs exigent une étude : les quatre ODD déclarables" "FUITE_PLASTIQUE,ODD_11_6_1_B,ODD_12_3_1_B,ODD_12_5_1" \
    "$(val "','.join(sorted(i['code'] for i in d['indicateurs'] if i['exige_source']))")"
chk "les cinq indicateurs ODD sont de la famille « odd », sur l'axe 3" "5|3" \
    "$(val "len([i for i in d['indicateurs'] if i['famille']=='odd'])")|$(val "','.join(sorted({str(i['axe']) for i in d['indicateurs'] if i['famille']=='odd'}))")"

# -----------------------------------------------------------------------------
echo
echo "5. Le radar de complétude"
radar() { python3 -c "import json;print(';'.join(f\"{a['axe']}:{a['renseignes']}/{a['applicables']}\" for a in json.load(open('$T/fiche_$1.json'))['completude']))"; }
fiche $A "$T_A"
chk "le radar de A compte, par axe, ses indicateurs renseignés parmi les applicables — comme sa fiche" 1 \
    "$(python3 -c "
import json
f=json.load(open('$T/fiche_$A.json'))
# Le taux mesuré et le taux estimé s'excluent : ils comptent pour un seul indicateur.
paire=('TAUX_COLLECTE', 'TAUX_COLLECTE_ESTIME')
def attendu(axe):
    lus=[i for i in f['indicateurs'] if i['axe']==axe and i['statut']!='sans_objet']
    n=len(lus); r=sum(1 for i in lus if i['statut']=='renseigne')
    p=[i for i in lus if i['code'] in paire]
    if len(p)==2:
        n-=1; r-=1 if all(i['statut']=='renseigne' for i in p) else 0
    return r, n
ok=all((a['renseignes'], a['applicables'])==attendu(a['axe']) for a in f['completude'])
print(1 if ok and len(f['completude'])==5 else 0)")"
chk "… sur l'axe 1, le taux de collecte mesuré et l'estimé comptent pour un seul indicateur" 1 \
    "$(python3 -c "
import json
f=json.load(open('$T/fiche_$A.json'))
lus=[i for i in f['indicateurs'] if i['axe']==1 and i['statut']!='sans_objet']
print(1 if [a for a in f['completude'] if a['axe']==1][0]['applicables']==len(lus)-1 else 0)")"
chk "… sans chiffre global : cinq axes, rien d'autre" "applicables,axe,renseignes" \
    "$(python3 -c "import json;print(','.join(sorted({k for a in json.load(open('$T/fiche_$A.json'))['completude'] for k in a})))")"
AXE_DECHARGE=$(sql "SELECT axe FROM indicateurs_kpi WHERE code = 'M1-8'")
AVANT=$(radar $A | tr ';' '\n' | grep "^$AXE_DECHARGE:")
req PUT "/kpi/declarations/$A/2026" '{"profil":{"decharge_controlee_anged":true}}' "$T_A" >/dev/null
fiche $A "$T_A"
APRES=$(radar $A | tr ';' '\n' | grep "^$AXE_DECHARGE:")
chk "la décharge contrôlée par l'ANGeD rend un indicateur « sans objet » : il sort de son axe, les renseignés ne bougent pas" 1 \
    "$(python3 -c "
a=[int(x) for x in '$AVANT'.split(':')[1].split('/')]; b=[int(x) for x in '$APRES'.split(':')[1].split('/')]
print(1 if b[0]==a[0] and b[1]==a[1]-1 else 0)")"
RADAR_A=$(radar $A)
chk "X déclare deux valeurs ODD" 200 \
    "$(req PUT "/kpi/declarations/$X/2026" "{\"valeurs\":{\"ODD_12_5_1\":{\"valeur\":20,\"source\":\"TEST étude X\",\"dateReference\":\"$HIER\"},\"FUITE_PLASTIQUE\":{\"valeur\":3,\"source\":\"TEST étude X\",\"dateReference\":\"$HIER\"}}}" "$T_X")"
fiche $A "$T_A"
chk "… le radar de A ne bouge pas : il ne compte rien d'une autre commune" "$RADAR_A" "$(radar $A)"
chk "… la fiche de A ne porte que A" "$A" "$(python3 -c "import json;print(json.load(open('$T/fiche_$A.json'))['commune_id'])")"
chk "le directeur de A ne lit pas la fiche ni le radar de X : introuvable (404)" 404 \
    "$(req GET "/kpi/5-axes?communeId=$X&annee=2026" "" "$T_A")"

# -----------------------------------------------------------------------------
echo
echo "6. En partant"
base_reelle_intacte "pendant la campagne"
nettoyer
chk "les communes de test, leurs pesées, caractérisations et déclarations sont retirées" "0|0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM pesees WHERE observation = 'TEST-ODD'")|$(sql "SELECT count(*) FROM caracterisations WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM declarations_indicateurs WHERE commune_id IN ($ESSAI)")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
