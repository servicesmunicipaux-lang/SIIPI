#!/usr/bin/env bash
# =============================================================================
# v0.15.79 — lot 17.2 : le moteur volumétrique.
# DECISIONS_2026-10-20.md, compléments du 25/10/2026 ; SPEC_v0.16.md, R4 ;
# migration 088, routes/volumetrie.routes.ts.
#
# Elle commence par ce que la matrice REFUSE : une benne qui tasse moins dense
# qu'une benne qui ne tasse pas, des bornes à l'envers, une valeur sans source,
# une valeur réécrite, un équipement inconnu, une tranche qui en chevauche une
# autre ; une commune qui écrit la matrice ; une commune qui lit l'estimation
# d'une autre (introuvable).
# Puis le calcul, contre un témoin indépendant (tests/volumetrie_attendus.py, qui
# ne lit que le scénario et la méthode) : les bornes de 7 et 8 m³, l'attelage, la
# densité du jour (révision en cours de mois), chaque « ce qui manque », et la
# règle cardinale de la SPEC v0.16 : une estimation ne s'additionne jamais à un
# tonnage pesé. Enfin l'avis de charge utile et son arabe, l'export.
#
# La matrice est une table nationale : gardée avant le premier geste, rendue
# ligne entière en partant (tests/outils/tables_nationales.sh).
#
#   docker compose exec -T api npm run test:volumetrie
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

C=test_volumetrie
C2=test_volumetrie_b
ESSAI="'$C','$C2'"
MOIS=2026-09
. tests/outils/comptes_temporaires.sh
. tests/outils/communes_essai.sh
. tests/outils/base_reelle.sh
. tests/outils/tables_nationales.sh
nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
  effacer_communes_essai "$ESSAI"
}
nettoyer
trap 'nettoyer; rm -rf "$T"' EXIT
garder_tables_nationales densites_reference
rendre_tables_nationales_en_sortie
releve_base_reelle

commune_essai "$C" "TEST Commune de la volumétrie"
commune_essai "$C2" "TEST Autre commune de la volumétrie"
compte_temporaire admin_commune "$C" "Directeur de la volumétrie"; T_D=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$C2" "Directeur de l'autre commune"; T_D2=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire super_admin_fnct "" "FNCT de la volumétrie"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_D" ] && [ -n "$T_D2" ] && [ -n "$T_F" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }
id_densite() { sql "SELECT id FROM densites_reference WHERE equipement = '$1' AND retire_le IS NULL ORDER BY date_effet, created_at LIMIT 1"; }
CBB=$(id_densite benne_basculante)
TAG=$(id_densite tracteur_remorque_agricole)

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la matrice refuse"
chk "une benne basculante à 0,4 t/m³, plus dense qu'une benne tasseuse : 400, avec la raison" "400|1" \
    "$(req POST /volumetrie/densites "{\"reprend\":\"$CBB\",\"densiteMin\":0.4,\"densiteMax\":0.4,\"dateEffet\":\"2026-09-01\",\"source\":\"TEST source\"}" "$T_F")|$(val "1 if 'plus dense' in d['error'] else 0")"
chk "des bornes à l'envers : 400" 400 \
    "$(req POST /volumetrie/densites "{\"reprend\":\"$CBB\",\"densiteMin\":0.25,\"densiteMax\":0.2,\"dateEffet\":\"2026-09-01\",\"source\":\"TEST source\"}" "$T_F")"
chk "une valeur sans source : 400" 400 \
    "$(req POST /volumetrie/densites "{\"reprend\":\"$CBB\",\"densiteMin\":0.2,\"densiteMax\":0.25,\"dateEffet\":\"2026-09-01\",\"source\":\"\"}" "$T_F")"
chk "une commune n'écrit pas la matrice : 403" 403 \
    "$(req POST /volumetrie/densites "{\"reprend\":\"$CBB\",\"densiteMin\":0.2,\"densiteMax\":0.25,\"dateEffet\":\"2026-09-01\",\"source\":\"TEST source\"}" "$T_D")"
chk "… ni ne la retire : 403" 403 "$(req POST "/volumetrie/densites/$CBB/retrait" '{"motif":"TEST retrait refusé"}' "$T_D")"
chk "la base refuse qu'une valeur se réécrive" 1 \
    "$($PSQL -c "UPDATE densites_reference SET densite_max = 0.3 WHERE id = '$CBB'" 2>&1 | grep -c 'ne se réécrit pas')"
chk "la base refuse un équipement inconnu" 1 \
    "$($PSQL -c "INSERT INTO densites_reference (equipement, densite_min, densite_max, date_effet, source) VALUES ('fusee', 0.2, 0.2, DATE '2026-01-01', 'TEST')" 2>&1 | grep -c "n'existe pas")"
chk "la base refuse une tranche qui en chevauche une autre (benne tasseuse de 7,5 à 9 m³)" 1 \
    "$($PSQL -c "INSERT INTO densites_reference (equipement, tranche_m3, densite_min, densite_max, date_effet, source) VALUES ('benne_tasseuse', '[7.5,9]', 0.4, 0.4, DATE '2026-01-01', 'TEST')" 2>&1 | grep -c 'chevauche')"
chk "le rôle de l'application ne peut ni effacer ni vider la matrice" "false|false|true" \
    "$(sql "SELECT has_table_privilege('siipi_app','densites_reference','DELETE')||'|'||has_table_privilege('siipi_app','densites_reference','TRUNCATE')||'|'||has_table_privilege('siipi_app','densites_reference','INSERT')")"
chk "rien n'a été ajouté à la matrice" 8 "$(sql "SELECT count(*) FROM densites_reference")"
chk "l'estimation d'une autre commune est introuvable : 404" 404 "$(req GET "/volumetrie/tonnage?communeId=$C&mois=$MOIS" "" "$T_D2")"
chk "un mois mal écrit : 400" 400 "$(req GET "/volumetrie/tonnage?communeId=$C&mois=2026-13" "" "$T_D")"
chk "sans jeton, rien" 401 "$(req GET "/volumetrie/densites")"

# -----------------------------------------------------------------------------
echo
echo "2. La matrice des 25 et 26/10/2026"
chk "lue par une commune" 200 "$(req GET /volumetrie/densites "" "$T_D")"
chk "huit valeurs en vigueur, celles des décisions" \
    "benne_tasseuse:[7,8]:0.35-0.35,benne_tasseuse:(8,):0.5-0.5,benne_basculante::0.2-0.25,pick_up::0.2-0.25,tracteur_remorque_agricole::0.2-0.25,tracteur_remorque_compactrice::0.3-0.3,ampli_roll::0.2-0.25,poubelles_conteneurs::0.2-0.25" \
    "$(val "','.join(f\"{x['equipement']}:{x['tranche_m3'] or ''}:{x['densite_min']:g}-{x['densite_max']:g}\" for x in d if x['en_vigueur'])")"
chk "chacune cite le guide et la décision qui la retient" True "$(val "all('TADAEEM' in x['source'] and 'décision du' in x['source'] for x in d)")"
chk "le pick-up et l'ampli-roll, qui ne tassent pas : la fourchette des non-compactants (décision du 26/10/2026)" "pick_up:0.2-0.25:1,ampli_roll:0.2-0.25:1" \
    "$(val "','.join(f\"{x['equipement']}:{x['densite_min']:g}-{x['densite_max']:g}:{int('26/10/2026' in x['source'])}\" for x in d if x['equipement'] in ('pick_up','ampli_roll'))")"
chk "seule la benne tasseuse de moins de 7 m³ n'a pas de densité" "0|1" \
    "$(sql "SELECT count(*) FROM app.densite_retenue('benne_tasseuse', 6.99, current_date)")|$(sql "SELECT count(*) FROM app.densite_retenue('benne_tasseuse', 7, current_date)")"

# -----------------------------------------------------------------------------
echo
echo "3. Le scénario"
# Les engins, posés en base : la typologie a sa propre campagne. La benne de chaque
# circuit est décrite au témoin telle qu'elle est bâtie, jamais lue dans le code.
$PSQL >/dev/null <<SQL
INSERT INTO vehicules (id, registration, commune_id, type, classe_collecte, capacity_m3, volume_provenance, charge_utile_t) VALUES
  ('test-vol-bt16', 'TEST-V BT16',  '$C', 'benne_tasseuse', 'benne_tasseuse', 16,   'constructeur', 12),
  ('test-vol-bt75', 'TEST-V BT75',  '$C', 'benne_tasseuse', 'benne_tasseuse', 7.5,  'mesure', 4),
  ('test-vol-bt8',  'TEST-V BT8',   '$C', 'benne_tasseuse', 'benne_tasseuse', 8,    'constructeur', NULL),
  ('test-vol-bt801','TEST-V BT801', '$C', 'benne_tasseuse', 'benne_tasseuse', 8.01, 'constructeur', NULL),
  ('test-vol-bt65', 'TEST-V BT65',  '$C', 'benne_tasseuse', 'benne_tasseuse', 6.5,  'declare', NULL),
  ('test-vol-tr',   'TEST-V TR',    '$C', 'tracteur', NULL, NULL, NULL, NULL),
  ('test-vol-tr0',  'TEST-V TR0',   '$C', 'tracteur', NULL, NULL, NULL, NULL),
  ('test-vol-pu',   'TEST-V PU',    '$C', 'camion', 'pick_up', 2.5, 'constructeur', NULL),
  ('test-vol-cam',  'TEST-V CAM',   '$C', 'camion', NULL, 6, 'declare', NULL),
  ('test-vol-cpt',  'TEST-V CPT',   '$C', 'tracteur_remorque', 'tracteur_remorque_compactrice', 10, 'constructeur', NULL),
  ('test-vol-gros', 'TEST-V GROS',  '$C', 'benne_tasseuse', 'benne_tasseuse', 30, 'declare', 10),
  ('test-vol-amp',  'TEST-V AMP',   '$C', 'camion_ampliroll', 'ampli_roll', 20, 'constructeur', NULL);
INSERT INTO vehicules (id, registration, commune_id, type, classe_collecte, capacity_m3, volume_provenance, attele_a) VALUES
  ('test-vol-rem',  'TEST-V REM',   '$C', 'remorque', 'tracteur_remorque_agricole', 6, 'mesure', 'test-vol-tr');
INSERT INTO circuits (commune_id, nom, jours_passage, actif, vehicule_id, type_dechet, voyages_par_jour, date_debut) VALUES
  ('$C', 'TEST A benne 16',        ARRAY[1,3,5]::smallint[], true, 'test-vol-bt16',  'menager', 2, DATE '2026-08-01'),
  ('$C', 'TEST B benne 7,5',       ARRAY[2,4]::smallint[],   true, 'test-vol-bt75',  'menager', 1, DATE '2026-08-01'),
  ('$C', 'TEST C benne 8',         ARRAY[6]::smallint[],     true, 'test-vol-bt8',   'menager', 1, DATE '2026-08-01'),
  ('$C', 'TEST D benne 8,01',      ARRAY[6]::smallint[],     true, 'test-vol-bt801', 'menager', 1, DATE '2026-08-01'),
  ('$C', 'TEST E benne 6,5',       ARRAY[1]::smallint[],     true, 'test-vol-bt65',  'menager', 1, DATE '2026-08-01'),
  ('$C', 'TEST F tracteur attelé', ARRAY[1,2,3,4,5,6,7]::smallint[], true, 'test-vol-tr', 'menager', 1, DATE '2026-08-01'),
  ('$C', 'TEST G tracteur seul',   ARRAY[1]::smallint[],     true, 'test-vol-tr0',   'menager', 1, DATE '2026-08-01'),
  ('$C', 'TEST H pick-up',         ARRAY[2]::smallint[],     true, 'test-vol-pu',    'menager', 1, DATE '2026-08-01'),
  ('$C', 'TEST I camion sans classe', ARRAY[3]::smallint[],  true, 'test-vol-cam',   'menager', 1, DATE '2026-08-01'),
  ('$C', 'TEST J sans engin',      ARRAY[4]::smallint[],     true, NULL,             'menager', 1, DATE '2026-08-01'),
  ('$C', 'TEST K balayage',        ARRAY[5]::smallint[],     true, 'test-vol-bt16',  'balayage', 1, DATE '2026-08-01'),
  ('$C', 'TEST L flux inconnu',    ARRAY[5]::smallint[],     true, 'test-vol-bt16',  NULL,      1, DATE '2026-08-01'),
  ('$C', 'TEST M compactrice mi-mois', ARRAY[1,3]::smallint[], true, 'test-vol-cpt', 'menager', 1, DATE '2026-09-15'),
  ('$C', 'TEST N sans jour',       ARRAY[]::smallint[],      true, 'test-vol-bt16',  'menager', 1, DATE '2026-08-01'),
  ('$C', 'TEST O tout pesé',       ARRAY[7]::smallint[],     true, 'test-vol-bt8',   'menager', 1, DATE '2026-08-01'),
  ('$C', 'TEST P ampli-roll',      ARRAY[2]::smallint[],     true, 'test-vol-amp',   'menager', 1, DATE '2026-08-01');
SQL
circuit() { sql "SELECT id FROM circuits WHERE commune_id = '$C' AND nom = '$1'"; }
CA=$(circuit 'TEST A benne 16'); CO=$(circuit 'TEST O tout pesé')
# Trois voyages pesés du circuit A (le 2 : voyage 1 ; le 4 : voyages 1 et 2), tous ceux du circuit O (les dimanches).
$PSQL >/dev/null <<SQL
INSERT INTO pesees (commune_id, circuit_id, voyage, date_pesee, poids_net_kg, vehicule_id, type_dechet, observation) VALUES
  ('$C', '$CA', 1, DATE '2026-09-02', 7400, 'test-vol-bt16', 'menager', 'TEST-VOL'),
  ('$C', '$CA', 1, DATE '2026-09-04', 8100, 'test-vol-bt16', 'menager', 'TEST-VOL'),
  ('$C', '$CA', 2, DATE '2026-09-04', 6900, 'test-vol-bt16', 'menager', 'TEST-VOL');
INSERT INTO pesees (commune_id, circuit_id, voyage, date_pesee, poids_net_kg, vehicule_id, type_dechet, observation)
SELECT '$C', '$CO', 1, d::date, 3000, 'test-vol-bt8', 'menager', 'TEST-VOL'
  FROM generate_series(DATE '2026-09-01', DATE '2026-09-30', interval '1 day') d WHERE extract(isodow FROM d) = 7;
SQL
chk "les pesées du scénario sont en base (3 pour A, 4 dimanches pour O)" "3|4" \
    "$(sql "SELECT count(*) FROM pesees WHERE circuit_id = '$CA'")|$(sql "SELECT count(*) FROM pesees WHERE circuit_id = '$CO'")"
# Une révision de la FNCT en cours de mois : le tracteur à remorque agricole à 0,22 – 0,24 dès le 16.
chk "la FNCT révise une densité, datée du 16/09" 201 \
    "$(req POST /volumetrie/densites "{\"reprend\":\"$TAG\",\"densiteMin\":0.22,\"densiteMax\":0.24,\"dateEffet\":\"2026-09-16\",\"source\":\"TEST révision de la campagne volumetrie\"}" "$T_F")"
REV=$(val "d['id']")
chk "une révision datée après le mois ne le touche pas" 201 \
    "$(req POST /volumetrie/densites "{\"reprend\":\"$TAG\",\"densiteMin\":0.21,\"densiteMax\":0.21,\"dateEffet\":\"2026-11-01\",\"source\":\"TEST révision future\"}" "$T_F")"

AUJ=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date")
python3 - "$T/scenario.json" "$AUJ" "$MOIS" <<'PY'
import json, sys
chemin, aujourdhui, mois = sys.argv[1:4]
bt = lambda v: {'type': 'benne_tasseuse', 'classe': 'benne_tasseuse', 'volume': v}
circuits = [
    {'nom': 'TEST A benne 16', 'jours': [1, 3, 5], 'voyages': 2, 'date_debut': '2026-08-01', 'type_dechet': 'menager', 'engin': bt(16)},
    {'nom': 'TEST B benne 7,5', 'jours': [2, 4], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'menager', 'engin': bt(7.5)},
    {'nom': 'TEST C benne 8', 'jours': [6], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'menager', 'engin': bt(8)},
    {'nom': 'TEST D benne 8,01', 'jours': [6], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'menager', 'engin': bt(8.01)},
    {'nom': 'TEST E benne 6,5', 'jours': [1], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'menager', 'engin': bt(6.5)},
    {'nom': 'TEST F tracteur attelé', 'jours': [1, 2, 3, 4, 5, 6, 7], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'menager',
     'engin': {'type': 'tracteur', 'remorques': [{'type': 'remorque', 'classe': 'tracteur_remorque_agricole', 'volume': 6}]}},
    {'nom': 'TEST G tracteur seul', 'jours': [1], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'menager',
     'engin': {'type': 'tracteur', 'remorques': []}},
    {'nom': 'TEST H pick-up', 'jours': [2], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'menager',
     'engin': {'type': 'camion', 'classe': 'pick_up', 'volume': 2.5}},
    {'nom': 'TEST I camion sans classe', 'jours': [3], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'menager',
     'engin': {'type': 'camion', 'classe': None, 'volume': 6}},
    {'nom': 'TEST J sans engin', 'jours': [4], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'menager', 'engin': None},
    {'nom': 'TEST K balayage', 'jours': [5], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'balayage', 'engin': bt(16)},
    {'nom': 'TEST L flux inconnu', 'jours': [5], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': None, 'engin': bt(16)},
    {'nom': 'TEST M compactrice mi-mois', 'jours': [1, 3], 'voyages': 1, 'date_debut': '2026-09-15', 'type_dechet': 'menager',
     'engin': {'type': 'tracteur_remorque', 'classe': 'tracteur_remorque_compactrice', 'volume': 10}},
    {'nom': 'TEST N sans jour', 'jours': [], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'menager', 'engin': bt(16)},
    {'nom': 'TEST O tout pesé', 'jours': [7], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'menager', 'engin': bt(8)},
    {'nom': 'TEST P ampli-roll', 'jours': [2], 'voyages': 1, 'date_debut': '2026-08-01', 'type_dechet': 'menager',
     'engin': {'type': 'camion_ampliroll', 'classe': 'ampli_roll', 'volume': 20}},
]
pesees = [{'circuit': 'TEST A benne 16', 'date': '2026-09-02', 'voyage': 1, 'kg': 7400},
          {'circuit': 'TEST A benne 16', 'date': '2026-09-04', 'voyage': 1, 'kg': 8100},
          {'circuit': 'TEST A benne 16', 'date': '2026-09-04', 'voyage': 2, 'kg': 6900}]
pesees += [{'circuit': 'TEST O tout pesé', 'date': f'2026-09-{j:02d}', 'voyage': 1, 'kg': 3000} for j in (6, 13, 20, 27)]
revisions = [{'equipement': 'tracteur_remorque_agricole', 'min': 0.22, 'max': 0.24, 'date_effet': '2026-09-16'},
             {'equipement': 'tracteur_remorque_agricole', 'min': 0.21, 'max': 0.21, 'date_effet': '2026-11-01'}]
json.dump({'mois': mois, 'aujourdhui': aujourdhui, 'circuits': circuits, 'pesees': pesees, 'revisions': revisions},
          open(chemin, 'w', encoding='utf-8'), ensure_ascii=False)
PY
python3 tests/volumetrie_attendus.py "$T/scenario.json" > "$T/attendus.json"
chk "le témoin a calculé ses valeurs" 16 "$(python3 -c "import json;print(len(json.load(open('$T/attendus.json'))))" 2>&1)"

# -----------------------------------------------------------------------------
echo
echo "4. Le calcul, contre le témoin"
chk "la commune lit son estimation de septembre" 200 "$(req GET "/volumetrie/tonnage?communeId=$C&mois=$MOIS" "" "$T_D")"
cp "$T/r.json" "$T/tonnage.json"
compare() {  # $1 = circuit, $2 = champs
  python3 - "$T/tonnage.json" "$T/attendus.json" "$1" "$2" <<'PY'
import json, sys
api = {l['circuit']: l for l in json.load(open(sys.argv[1], encoding='utf-8'))}
att = json.load(open(sys.argv[2], encoding='utf-8'))
nom, champs = sys.argv[3], sys.argv[4].split(',')
a, b = api.get(nom), att.get(nom)
if a is None or b is None:
    print('circuit absent'); sys.exit()
def norm(x):
    return None if x is None else (round(float(x), 3) if isinstance(x, (int, float)) else x)
ecarts = [f'{c}: {norm(a.get(c))} au lieu de {norm(b.get(c))}' for c in champs if norm(a.get(c)) != norm(b.get(c))]
print('ok' if not ecarts else '; '.join(ecarts))
PY
}
TOUT=voyages_attendus,voyages_peses,voyages_estimes,tonnage_min_t,tonnage_max_t,tonnage_pese_t,manque
for c in 'TEST A benne 16' 'TEST B benne 7,5' 'TEST C benne 8' 'TEST D benne 8,01' 'TEST E benne 6,5' 'TEST F tracteur attelé' \
         'TEST G tracteur seul' 'TEST H pick-up' 'TEST I camion sans classe' 'TEST J sans engin' 'TEST K balayage' \
         'TEST L flux inconnu' 'TEST M compactrice mi-mois' 'TEST N sans jour' 'TEST O tout pesé' 'TEST P ampli-roll'; do
  chk "« $c » : voyages, fourchette, pesé et ce qui manque, comme le témoin" ok "$(compare "$c" "$TOUT")"
done
chk "les bornes : 8 m³ à 0,35, 8,01 m³ à 0,5, 6,5 m³ sans densité" "0.35|0.5|densite_absente" \
    "$(python3 -c "
import json;d={l['circuit']:l for l in json.load(open('$T/tonnage.json'))}
print(f\"{d['TEST C benne 8']['densite_min']:g}|{d['TEST D benne 8,01']['densite_min']:g}|{d['TEST E benne 6,5']['manque']}\")")"
chk "le pick-up (2,5 m³) et l'ampli-roll (20 m³) s'estiment à 0,20 – 0,25 sans « ce qui manque » (5 mardis chacun)" "2.5|3.13|None|20|25|None" \
    "$(python3 -c "
import json;d={l['circuit']:l for l in json.load(open('$T/tonnage.json'))}
h, p = d['TEST H pick-up'], d['TEST P ampli-roll']
print(f\"{h['tonnage_min_t']:g}|{h['tonnage_max_t']:g}|{h['manque']}|{p['tonnage_min_t']:g}|{p['tonnage_max_t']:g}|{p['manque']}\")")"
chk "le tracteur attelé : la benne est la remorque, et c'est dit" "TEST-V REM|tracteur_remorque_agricole|6" \
    "$(python3 -c "
import json;d={l['circuit']:l for l in json.load(open('$T/tonnage.json'))}['TEST F tracteur attelé']
print(f\"{d['porteur_immat']}|{d['classe']}|{d['volume_m3']:g}\")")"
chk "la révision du 16/09 ne vaut que pour les voyages qui la suivent (15 à 0,20–0,25, 15 à 0,22–0,24)" "37.8|44.1" \
    "$(python3 -c "
import json;d={l['circuit']:l for l in json.load(open('$T/tonnage.json'))}['TEST F tracteur attelé']
print(f\"{d['tonnage_min_t']:g}|{d['tonnage_max_t']:g}\")")"

# -----------------------------------------------------------------------------
echo
echo "5. Une estimation ne s'additionne jamais à une pesée"
chk "le circuit A : 26 voyages attendus, 3 pesés, seuls les 23 autres estimés" "26|3|23" \
    "$(python3 -c "
import json;d={l['circuit']:l for l in json.load(open('$T/tonnage.json'))}['TEST A benne 16']
print(f\"{d['voyages_attendus']}|{d['voyages_peses']}|{d['voyages_estimes']}\")")"
chk "… l'estimé est 23 × 16 m³ × 0,5, le pesé (22,4 t) reste à part" "184|184|22.4" \
    "$(python3 -c "
import json;d={l['circuit']:l for l in json.load(open('$T/tonnage.json'))}['TEST A benne 16']
print(f\"{d['tonnage_min_t']:g}|{d['tonnage_max_t']:g}|{d['tonnage_pese_t']:g}\")")"
chk "un circuit entièrement pesé n'a pas d'estimation, et rien ne manque" "None|None|12|None" \
    "$(python3 -c "
import json;d={l['circuit']:l for l in json.load(open('$T/tonnage.json'))}['TEST O tout pesé']
print(f\"{d['tonnage_min_t']}|{d['tonnage_max_t']}|{d['tonnage_pese_t']:g}|{d['manque']}\")")"
chk "aucune ligne ni aucune colonne ne totalise estimé et pesé" 0 \
    "$(python3 -c "
import json;d=json.load(open('$T/tonnage.json'))
print(sum(1 for l in d for k in l if 'total' in k))")"
curl -s -o "$T/tonnage.csv" -H "Authorization: Bearer $T_D" "$API/volumetrie/tonnage?communeId=$C&mois=$MOIS&format=csv"
chk "l'export porte l'estimé « benne pleine » et le pesé dans deux colonnes, sans total" "1|0" \
    "$(python3 -c "
t=open('$T/tonnage.csv',encoding='utf-8-sig').read().splitlines()[0]
print(f\"{int('Estimé min (t, benne pleine)' in t and 'Pesé (t)' in t)}|{int('otal' in t)}\")")"
chk "un mois à venir : aucun voyage attendu, aucune estimation" "aucun_voyage_attendu|None" \
    "$(req GET "/volumetrie/tonnage?communeId=$C&mois=2027-12" "" "$T_D" >/dev/null; val "next(f\"{l['manque']}|{l['tonnage_max_t']}\" for l in d if l['circuit']=='TEST A benne 16')")"

# -----------------------------------------------------------------------------
echo
echo "6. « À vérifier » : une benne au-delà de sa charge utile"
req GET "/communes/$C/coherence" "" "$T_D" >/dev/null
chk "la benne de 30 m³ (15 à 15 t par voyage) pour 10 t de charge utile : avis d'information" "information|1" \
    "$(val "next((e['gravite'] + '|' + str(int('au-delà de la charge utile de 10 t' in e['constat'])) for e in d if e['sujet'] == 'TEST-V GROS' and 'charge utile' in e['constat']), 'aucun')")"
chk "… et son arabe" 1 "$(val "1 if any(e['sujet'] == 'TEST-V GROS' and 'الحمولة النافعة' in (e['constat_ar'] or '') for e in d) else 0")"
chk "la benne de 16 m³ (8 t) pour 12 t : aucun avis de charge utile" 0 "$(val "sum(1 for e in d if e['sujet'] == 'TEST-V BT16' and 'charge utile' in e['constat'])")"
chk "la benne de 7,5 m³ (2,63 t) pour 4 t : aucun avis" 0 "$(val "sum(1 for e in d if e['sujet'] == 'TEST-V BT75' and 'charge utile' in e['constat'])")"

# -----------------------------------------------------------------------------
echo
echo "7. Retirer une valeur"
chk "la FNCT retire la révision du 16/09, avec son motif" 200 "$(req POST "/volumetrie/densites/$REV/retrait" '{"motif":"TEST retrait de la révision"}' "$T_F")"
chk "… elle reste lisible, retirée" 1 "$(req GET /volumetrie/densites "" "$T_D" >/dev/null; val "sum(1 for x in d if x['id'] == '$REV' and x['retire_le'] and not x['en_vigueur'])")"
chk "… l'estimation revient à 0,20 – 0,25 pour tout le mois" "36|45" \
    "$(req GET "/volumetrie/tonnage?communeId=$C&mois=$MOIS" "" "$T_D" >/dev/null; val "next(f\"{l['tonnage_min_t']:g}|{l['tonnage_max_t']:g}\" for l in d if l['circuit']=='TEST F tracteur attelé')")"
chk "un retrait sans motif : 400" 400 "$(req POST "/volumetrie/densites/$TAG/retrait" '{"motif":""}' "$T_F")"

# -----------------------------------------------------------------------------
echo
echo "8. En partant"
base_reelle_intacte "pendant la campagne"
nettoyer
rendre_tables_nationales
tables_nationales_rendues "en partant"
chk "les communes de test, leurs engins, circuits et pesées sont retirés" "0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM vehicules WHERE id LIKE 'test-vol-%'")|$(sql "SELECT count(*) FROM pesees WHERE observation = 'TEST-VOL'")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
