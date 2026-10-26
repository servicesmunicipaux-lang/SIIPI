#!/usr/bin/env bash
# =============================================================================
# v0.15.81 — lot C : le coût de collecte, par circuit et par engin.
# DECISIONS_2026-10-20.md, complément du 26/10/2026 (lot C) ; migration 090,
# routes/coutCollecte.routes.ts.
#
# Elle commence par ce que la plateforme REFUSE : une période mal écrite, la
# commune d'un autre (introuvable), un prestataire ou un citoyen, une référence du
# guide écrite par l'application, un « don » qui n'est pas un booléen.
# Puis le calcul, contre un témoin indépendant (tests/cout_collecte_attendus.py,
# qui ne lit que le scénario et la méthode) : le réel d'abord (pleins,
# interventions), le ratio du guide à défaut et dit tel, le prix du guide quand
# la valeur d'achat manque, la durée max(10 ans, âge), le don non amorti, la
# ventilation au kilomètre ou au voyage, le personnel au pointage ou à l'équipe.
# Enfin ce qui empêche un total : une composante absente n'est jamais un 0, un
# coût à la tonne ne se donne que sur un circuit entièrement pesé, un total de
# commune que si chaque circuit a le sien, des frais indirects que d'une étude.
#
# Le prix du gasoil est un paramètre national : la table est gardée avant le
# premier geste et rendue ligne entière en partant (tests/outils/tables_nationales.sh).
#
#   docker compose exec -T api npm run test:cout-collecte
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

C=test_cout_collecte
C2=test_cout_collecte_b
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
garder_tables_nationales valeurs_parametres_nationaux
rendre_tables_nationales_en_sortie
releve_base_reelle

commune_essai "$C" "TEST Commune du coût de collecte"
commune_essai "$C2" "TEST Autre commune du coût de collecte"
compte_temporaire admin_commune "$C" "Directeur du coût"; T_D=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$C2" "Directeur de l'autre commune"; T_D2=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire super_admin_fnct "" "FNCT du coût"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire gestionnaire_prestataire "$C" "Prestataire du coût"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire citoyen "$C" "Citoyen du coût"; T_C=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_D" ] && [ -n "$T_D2" ] && [ -n "$T_F" ] && [ -n "$T_P" ] && [ -n "$T_C" ] \
  || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme refuse"
chk "une période mal écrite : 400" 400 "$(req GET "/cout-collecte?communeId=$C&periode=2026-13" "" "$T_D")"
chk "… ni « septembre » : 400" 400 "$(req GET "/cout-collecte?communeId=$C&periode=septembre" "" "$T_D")"
chk "le coût d'une autre commune est introuvable : 404" 404 "$(req GET "/cout-collecte?communeId=$C&periode=$MOIS" "" "$T_D2")"
chk "un prestataire ne lit pas le coût de la commune : 403" 403 "$(req GET "/cout-collecte?communeId=$C&periode=$MOIS" "" "$T_P")"
chk "un citoyen non plus : 403" 403 "$(req GET "/cout-collecte?communeId=$C&periode=$MOIS" "" "$T_C")"
chk "sans jeton, rien" 401 "$(req GET "/cout-collecte?communeId=$C&periode=$MOIS")"
chk "le rôle de l'application ne peut ni écrire ni effacer les références du guide" "false|false|false|true" \
    "$(sql "SELECT has_table_privilege('siipi_app','references_cout_engins','INSERT')||'|'||has_table_privilege('siipi_app','references_cout_engins','UPDATE')||'|'||has_table_privilege('siipi_app','references_cout_engins','DELETE')||'|'||has_table_privilege('siipi_app','references_cout_engins','SELECT')")"
chk "la base refuse une référence sans source" 1 \
    "$($PSQL -c "INSERT INTO references_cout_engins (classe, prix_neuf_tnd, date_effet, source) VALUES ('pick_up', 1000, DATE '2026-01-01', ' ')" 2>&1 | grep -c 'references_cout_source')"
chk "… une référence qui ne donne ni prix ni consommation" 1 \
    "$($PSQL -c "INSERT INTO references_cout_engins (classe, date_effet, source) VALUES ('pick_up', DATE '2026-01-01', 'TEST')" 2>&1 | grep -c 'references_cout_utile')"
chk "rien n'a été ajouté aux références" 9 "$(sql "SELECT count(*) FROM references_cout_engins")"

# -----------------------------------------------------------------------------
echo
echo "2. Les références du 26/10/2026"
chk "les taux d'entretien (6 % neuf, 14 % en fin de vie) et la durée de 10 ans, cités" "6|14|10|1" \
    "$(sql "SELECT (SELECT valeur_nombre::float FROM app.parametre_national('taux_entretien_neuf', DATE '2026-09-30'))||'|'||(SELECT valeur_nombre::float FROM app.parametre_national('taux_entretien_fin_de_vie', DATE '2026-09-30'))||'|'||(SELECT valeur_nombre::float FROM app.parametre_national('duree_amortissement_engins', DATE '2026-09-30'))||'|'||(SELECT count(*) = 3 FROM valeurs_parametres_nationaux WHERE code IN ('taux_entretien_neuf','taux_entretien_fin_de_vie','duree_amortissement_engins') AND reference LIKE '%TADAEEM%')::int")"
chk "aucun prix du gasoil n'est posé par la migration (jamais 1,825 figé)" 0 "$(sql "SELECT count(*) FROM valeurs_parametres_nationaux WHERE code = 'prix_gasoil'")"
chk "aucun taux de charges, de frais généraux ni de lubrifiants n'existe" 0 \
    "$(sql "SELECT count(*) FROM definitions_parametres_nationaux WHERE code ~ '(charge|frais_gen|lubrifiant)'")"
chk "la benne tasseuse : 7 et 8 m³ au prix du BT7, 8,01 au BT12, 16 au BT16, 6,99 sans référence" "187000|187000|270000|380000|0" \
    "$(sql "SELECT (SELECT prix_neuf_tnd::int FROM app.reference_cout_engin('benne_tasseuse', 7, current_date))||'|'||(SELECT prix_neuf_tnd::int FROM app.reference_cout_engin('benne_tasseuse', 8, current_date))||'|'||(SELECT prix_neuf_tnd::int FROM app.reference_cout_engin('benne_tasseuse', 8.01, current_date))||'|'||(SELECT prix_neuf_tnd::int FROM app.reference_cout_engin('benne_tasseuse', 16, current_date))||'|'||(SELECT count(*) FROM app.reference_cout_engin('benne_tasseuse', 6.99, current_date))")"
chk "chaque référence cite le guide" 9 "$(sql "SELECT count(*) FROM references_cout_engins WHERE source LIKE '%TADAEEM%'")"
chk "la commune les lit, en lecture seule (le Tag : 60 000 TND, 10 l par séance)" "200|9|60000|10" \
    "$(req GET /cout-collecte/references "" "$T_D")|$(val "f\"{len(d)}|\" + next(f\"{x['prix_neuf_tnd']:.10g}|{x['conso_l_seance']:.10g}\" for x in d if x['classe'] == 'tracteur_remorque_agricole')")"
chk "un citoyen ne les lit pas : 403" 403 "$(req GET /cout-collecte/references "" "$T_C")"

# -----------------------------------------------------------------------------
echo
echo "3. Le scénario"
# U1 : benne tasseuse de 16 m³ achetée 300 000 TND, de 2020 ; trois pleins ; deux circuits.
# U2 : tracteur et remorque agricole, sans valeur d'achat ni l'un ni l'autre, de 2005.
# U3 : benne tasseuse de 8 m³ reçue en don (valeur 187 000), de 2018 ; entretien enregistré.
$PSQL >/dev/null <<SQL
INSERT INTO vehicules (id, registration, commune_id, type, classe_collecte, capacity_m3, volume_provenance, valeur_achat_tnd, date_premiere_circulation, acquis_par_don) VALUES
  ('test-cc-u1',  'TEST-CC U1',  '$C', 'benne_tasseuse', 'benne_tasseuse', 16, 'constructeur', 300000, DATE '2020-01-01', false),
  ('test-cc-tr',  'TEST-CC U2',  '$C', 'tracteur', NULL, NULL, NULL, NULL, DATE '2005-06-01', false),
  ('test-cc-u3',  'TEST-CC U3',  '$C', 'benne_tasseuse', 'benne_tasseuse', 8, 'constructeur', 187000, DATE '2018-03-01', true);
INSERT INTO vehicules (id, registration, commune_id, type, classe_collecte, capacity_m3, volume_provenance, attele_a) VALUES
  ('test-cc-rem', 'TEST-CC REM', '$C', 'remorque', 'tracteur_remorque_agricole', 6, 'mesure', 'test-cc-tr');
INSERT INTO circuits (commune_id, nom, jours_passage, actif, vehicule_id, type_dechet, voyages_par_jour, date_debut) VALUES
  ('$C',  'TEST A',  ARRAY[1,3,5]::smallint[],       true, 'test-cc-u1', 'menager', 2, DATE '2026-09-01'),
  ('$C',  'TEST A2', ARRAY[2,4]::smallint[],         true, 'test-cc-u1', 'menager', 1, DATE '2026-09-01'),
  ('$C',  'TEST B',  ARRAY[1,2,3,4,5,6]::smallint[], true, 'test-cc-tr', 'menager', 1, DATE '2026-09-01'),
  ('$C',  'TEST C',  ARRAY[6]::smallint[],           true, 'test-cc-u3', 'menager', 1, DATE '2026-09-01'),
  ('$C2', 'TEST D sans engin', ARRAY[1]::smallint[], true, NULL,         'menager', 1, DATE '2026-09-01');
INSERT INTO effectifs_service (commune_id, annee, service, effectif_ouvriers, effectif_encadrement, masse_salariale_tnd, source) VALUES
  ('$C',  2026, 'proprete', 10, 2, 365000, 'TEST budget'),
  ('$C2', 2026, 'proprete', 3, 1, 365000, 'TEST budget');
INSERT INTO personnel (commune_id, nom_complet, fonction)
SELECT '$C', 'TEST-CC Agent ' || n, 'agent' FROM generate_series(1, 10) n;
INSERT INTO personnel (commune_id, nom_complet, fonction)
SELECT '$C2', 'TEST-CC Équipier ' || n, 'agent' FROM generate_series(1, 2) n;
SQL
circuit() { sql "SELECT id FROM circuits WHERE commune_id IN ($ESSAI) AND nom = '$1'"; }
CA=$(circuit 'TEST A'); CA2=$(circuit 'TEST A2'); CB=$(circuit 'TEST B'); CC=$(circuit 'TEST C'); CD=$(circuit 'TEST D sans engin')
agent() { sql "SELECT id FROM personnel WHERE commune_id IN ($ESSAI) AND nom_complet = '$1'"; }
$PSQL >/dev/null <<SQL
-- Le pointage : 3 agents sur A (13 jours), 2 sur A2 (9), 2 sur B (26), 2 sur C (4), un balayeur sans circuit (30) ;
-- et une absence, qui ne compte pas.
INSERT INTO presences (commune_id, personnel_id, jour, present, circuit_id)
SELECT '$C', p.id, d::date, true, x.circuit::uuid
  FROM (VALUES ('1', '$CA', '{1,3,5}'), ('2', '$CA', '{1,3,5}'), ('3', '$CA', '{1,3,5}'),
               ('4', '$CA2', '{2,4}'), ('5', '$CA2', '{2,4}'),
               ('6', '$CB', '{1,2,3,4,5,6}'), ('7', '$CB', '{1,2,3,4,5,6}'),
               ('8', '$CC', '{6}'), ('9', '$CC', '{6}')) AS x(n, circuit, jours)
  JOIN personnel p ON p.commune_id = '$C' AND p.nom_complet = 'TEST-CC Agent ' || x.n
 CROSS JOIN generate_series(DATE '2026-09-01', DATE '2026-09-30', interval '1 day') d
 WHERE extract(isodow FROM d)::int = ANY (x.jours::int[]);
INSERT INTO presences (commune_id, personnel_id, jour, present)
SELECT '$C', p.id, d::date, true FROM personnel p
 CROSS JOIN generate_series(DATE '2026-09-01', DATE '2026-09-30', interval '1 day') d
 WHERE p.commune_id = '$C' AND p.nom_complet = 'TEST-CC Agent 10';
INSERT INTO presences (commune_id, personnel_id, jour, present, motif_absence)
SELECT '$C', p.id, DATE '2026-09-01', false, 'repos' FROM personnel p WHERE p.commune_id = '$C' AND p.nom_complet = 'TEST-CC Agent 1';
-- L'équipe du circuit sans engin de l'autre commune (sans pointage) : deux équipiers.
INSERT INTO circuit_equipe (circuit_id, personnel_id, role, date_debut)
SELECT '$CD', p.id, 'agent', DATE '2026-08-01' FROM personnel p WHERE p.commune_id = '$C2';
-- Les pesées : tous les voyages de A (13 jours × 2), un seul de A2, tous ceux de C (4 samedis), aucun de B.
INSERT INTO pesees (commune_id, circuit_id, voyage, date_pesee, poids_net_kg, vehicule_id, type_dechet, observation)
SELECT '$C', '$CA', v, d::date, 7000, 'test-cc-u1', 'menager', 'TEST-CC'
  FROM generate_series(DATE '2026-09-01', DATE '2026-09-30', interval '1 day') d CROSS JOIN generate_series(1, 2) v
 WHERE extract(isodow FROM d) IN (1, 3, 5);
INSERT INTO pesees (commune_id, circuit_id, voyage, date_pesee, poids_net_kg, vehicule_id, type_dechet, observation) VALUES
  ('$C', '$CA2', 1, DATE '2026-09-01', 2000, 'test-cc-u1', 'menager', 'TEST-CC');
INSERT INTO pesees (commune_id, circuit_id, voyage, date_pesee, poids_net_kg, vehicule_id, type_dechet, observation)
SELECT '$C', '$CC', 1, d::date, 4000, 'test-cc-u3', 'menager', 'TEST-CC'
  FROM generate_series(DATE '2026-09-01', DATE '2026-09-30', interval '1 day') d WHERE extract(isodow FROM d) = 6;
-- Le carnet de bord de U1 : 300 km sur A, 100 sur A2 en septembre ; 500 en août, hors période.
INSERT INTO carnets_de_bord (commune_id, vehicule_id, jour, seance, circuit_id, compteur_sortie, compteur_retour) VALUES
  ('$C', 'test-cc-u1', DATE '2026-08-31', 'matin', '$CA2', 500, 1000),
  ('$C', 'test-cc-u1', DATE '2026-09-02', 'matin', '$CA', 1000, 1100),
  ('$C', 'test-cc-u1', DATE '2026-09-04', 'matin', '$CA', 1100, 1200),
  ('$C', 'test-cc-u1', DATE '2026-09-07', 'matin', '$CA', 1200, 1300),
  ('$C', 'test-cc-u1', DATE '2026-09-08', 'matin', '$CA2', 1300, 1400);
-- Les pleins : trois de 800 TND pour U1 en septembre (et un en août), un de 1 200 pour U3.
INSERT INTO fuel_logs (commune_id, vehicule_id, date_plein, litres, montant_tnd) VALUES
  ('$C', 'test-cc-u1', DATE '2026-08-28', 400, 999),
  ('$C', 'test-cc-u1', DATE '2026-09-03', 400, 800),
  ('$C', 'test-cc-u1', DATE '2026-09-12', 400, 800),
  ('$C', 'test-cc-u1', DATE '2026-09-24', 400, 800),
  ('$C', 'test-cc-u3', DATE '2026-09-15', 600, 1200);
-- L'entretien de U3 : une intervention en août (300), une en septembre (500).
INSERT INTO interventions_maintenance (commune_id, vehicule_id, date_intervention, type, nature, cout_tnd, description) VALUES
  ('$C', 'test-cc-u3', DATE '2026-08-20', 'vidange', 'preventive', 300, 'TEST-CC'),
  ('$C', 'test-cc-u3', DATE '2026-09-10', 'pneumatiques', 'corrective', 500, 'TEST-CC');
SQL
chk "le pointage du scénario : 39, 18, 52, 8 jours sur les circuits, 30 sans circuit, une absence" "39|18|52|8|30|1" \
    "$(sql "SELECT (SELECT count(*) FROM presences WHERE circuit_id = '$CA')||'|'||(SELECT count(*) FROM presences WHERE circuit_id = '$CA2')||'|'||(SELECT count(*) FROM presences WHERE circuit_id = '$CB')||'|'||(SELECT count(*) FROM presences WHERE circuit_id = '$CC')||'|'||(SELECT count(*) FROM presences WHERE commune_id = '$C' AND circuit_id IS NULL AND present)||'|'||(SELECT count(*) FROM presences WHERE commune_id = '$C' AND NOT present)")"
chk "les pesées du scénario : 26 pour A, 1 pour A2, 4 pour C" "26|1|4" \
    "$(sql "SELECT (SELECT count(*) FROM pesees WHERE circuit_id = '$CA')||'|'||(SELECT count(*) FROM pesees WHERE circuit_id = '$CA2')||'|'||(SELECT count(*) FROM pesees WHERE circuit_id = '$CC')")"
TAUX=$(sql "SELECT valeur_nombre FROM app.parametre_national('redevance_anged', DATE '2026-09-15')")
chk "un taux de redevance s'applique en septembre 2026" 1 "$([ -n "$TAUX" ] && echo 1 || echo 0)"

# Le scénario tel qu'il a été bâti, pour le témoin. $1 = fichier, $2 = prix du gasoil (ou vide),
# $3 = pesées de B (kg par voyage, ou 0), $4 = coût d'une intervention de U3 sans coût (« sans » ou vide).
scenario() {
  python3 - "$1" "$TAUX" "${2:-}" "${3:-0}" "${4:-}" <<'PY'
import json, sys
from datetime import date, timedelta
chemin, taux, gasoil, kg_b, sans_cout = sys.argv[1:6]
debut, fin = date(2026, 9, 1), date(2026, 9, 30)
jours = [debut + timedelta(n) for n in range((fin - debut).days + 1)]
passages = lambda js: [d for d in jours if d.isoweekday() in js]
def age(d):
    return fin.year - d.year - ((fin.month, fin.day) < (d.month, d.day))
membre = lambda valeur, don=False: {'valeur': valeur, 'don': don}
unites = {
    'TEST-CC U1': {'classe': 'benne_tasseuse', 'volume': 16, 'age': age(date(2020, 1, 1)), 'membres': [membre(300000)],
                   'interventions_jamais': 0, 'interventions_periode': [], 'pleins_periode': [800, 800, 800],
                   'seances': len(passages({1, 2, 3, 4, 5}))},
    'TEST-CC U2': {'classe': 'tracteur_remorque_agricole', 'volume': 6, 'age': age(date(2005, 6, 1)),
                   'membres': [membre(None), membre(None)], 'interventions_jamais': 0, 'interventions_periode': [],
                   'pleins_periode': [], 'seances': len(passages({1, 2, 3, 4, 5, 6}))},
    'TEST-CC U3': {'classe': 'benne_tasseuse', 'volume': 8, 'age': age(date(2018, 3, 1)), 'membres': [membre(187000, True)],
                   'interventions_jamais': 2 + (1 if sans_cout else 0),
                   'interventions_periode': [500] + ([None] if sans_cout else []), 'pleins_periode': [1200],
                   'seances': len(passages({6}))},
}
b_attendus = len(passages({1, 2, 3, 4, 5, 6}))
circuits = [
    {'nom': 'TEST A', 'unite': 'TEST-CC U1', 'km': 300, 'voyages_attendus': 2 * len(passages({1, 3, 5})),
     'jours_pointes': 3 * len(passages({1, 3, 5})), 'equipiers': 0, 'pesees_kg': [7000] * (2 * len(passages({1, 3, 5})))},
    {'nom': 'TEST A2', 'unite': 'TEST-CC U1', 'km': 100, 'voyages_attendus': len(passages({2, 4})),
     'jours_pointes': 2 * len(passages({2, 4})), 'equipiers': 0, 'pesees_kg': [2000]},
    {'nom': 'TEST B', 'unite': 'TEST-CC U2', 'km': 0, 'voyages_attendus': b_attendus,
     'jours_pointes': 2 * b_attendus, 'equipiers': 0, 'pesees_kg': [int(kg_b)] * b_attendus if int(kg_b) else []},
    {'nom': 'TEST C', 'unite': 'TEST-CC U3', 'km': 0, 'voyages_attendus': len(passages({6})),
     'jours_pointes': 2 * len(passages({6})), 'equipiers': 0, 'pesees_kg': [4000] * len(passages({6}))},
]
pointes = sum(c['jours_pointes'] for c in circuits) + len(jours)
json.dump({'jours': len(jours), 'masse_an': 365000, 'effectif': 12, 'jours_pointes_commune': pointes,
           'taux_redevance': taux, 'unites': unites, 'circuits': circuits,
           'parametres': {'duree': 10, 'taux_neuf': 6, 'taux_fin': 14, 'prix_gasoil': gasoil or None}},
          open(chemin, 'w', encoding='utf-8'), ensure_ascii=False)
PY
}
scenario "$T/scenario1.json"
python3 tests/cout_collecte_attendus.py "$T/scenario1.json" > "$T/attendus1.json"
chk "le témoin a calculé ses valeurs (3 engins, 4 circuits)" "3|4" \
    "$(python3 -c "import json;d=json.load(open('$T/attendus1.json'));print(f\"{len(d['engins'])}|{len(d['circuits'])}\")" 2>&1)"

# Compare la réponse de l'API au témoin. $1 = attendus, $2 = « circuits » ou « engins », $3 = nom, $4 = champs.
compare() {
  python3 - "$T/cout.json" "$1" "$2" "$3" "$4" <<'PY'
import json, sys
api = json.load(open(sys.argv[1], encoding='utf-8'))
att = json.load(open(sys.argv[2], encoding='utf-8'))
quoi, nom, champs = sys.argv[3], sys.argv[4], sys.argv[5].split(',')
cle = 'circuit' if quoi == 'circuits' else 'immat'
a = next((l for l in api[quoi] if l[cle] == nom), None)
b = att[quoi].get(nom)
if a is None or b is None:
    print('absent'); sys.exit()
def norm(x):
    return None if x is None else (round(float(x), 3) if isinstance(x, (int, float)) and not isinstance(x, bool) else x)
ecarts = [f'{c}: {norm(a.get(c))} au lieu de {norm(b.get(c))}' for c in champs if norm(a.get(c)) != norm(b.get(c))]
print('ok' if not ecarts else '; '.join(ecarts))
PY
}
lire() { req GET "/cout-collecte?communeId=$1&periode=${2:-$MOIS}" "" "${3:-$T_D}" >/dev/null; cp "$T/r.json" "$T/cout.json"; }
circ() { python3 -c "import json;d={l['circuit']:l for l in json.load(open('$T/cout.json'))['circuits']};print($1)" 2>/dev/null || echo erreur; }
eng()  { python3 -c "import json;d={l['immat']:l for l in json.load(open('$T/cout.json'))['engins']};print($1)" 2>/dev/null || echo erreur; }
ENGIN=amortissement_tnd,amortissement_provenance,entretien_tnd,entretien_provenance,carburant_tnd,carburant_provenance,valeur_tnd,valeur_provenance,duree_ans
CIRCUIT=personnel_tnd,carburant_tnd,carburant_provenance,entretien_tnd,entretien_provenance,amortissement_tnd,amortissement_provenance,redevance_tnd,total_tnd,cout_tonne,cle_engin,manque

# -----------------------------------------------------------------------------
echo
echo "4. Septembre, sans prix du gasoil : contre le témoin"
chk "la commune lit son coût de septembre" 200 "$(req GET "/cout-collecte?communeId=$C&periode=$MOIS" "" "$T_D")"
lire "$C"
for e in 'TEST-CC U1' 'TEST-CC U2' 'TEST-CC U3'; do
  chk "l'engin « $e » : amortissement, entretien, carburant et leurs provenances, comme le témoin" ok "$(compare "$T/attendus1.json" engins "$e" "$ENGIN")"
done
for c in 'TEST A' 'TEST A2' 'TEST B' 'TEST C'; do
  chk "le circuit « $c » : chaque composante, le total et la tonne, comme le témoin" ok "$(compare "$T/attendus1.json" circuits "$c" "$CIRCUIT")"
done
chk "sans prix du gasoil, le carburant de U2 (sans plein) est absent, jamais 0 ; B ne totalise pas" "None|None|['carburant', 'redevance']|None" \
    "$(circ "f\"{d['TEST B']['carburant_tnd']}|{d['TEST B']['carburant_provenance']}|{d['TEST B']['manque']}|{d['TEST B']['total_tnd']}\"")"
chk "la FNCT ne lit que le coût, elle le lit aussi" 200 "$(req GET "/cout-collecte?communeId=$C&periode=$MOIS" "" "$T_F")"

# -----------------------------------------------------------------------------
echo
echo "5. Le réel d'abord, le guide à défaut, et dit tel"
chk "U1 : ses trois pleins (2 400 TND), jamais la consommation du guide" "2400|reel" \
    "$(eng "f\"{d['TEST-CC U1']['carburant_tnd']:.10g}|{d['TEST-CC U1']['carburant_provenance']}\"")"
chk "U1 : sans intervention enregistrée, l'entretien au ratio du guide à 6 ans (10,8 %)" "2663.014|ratio_guide" \
    "$(eng "f\"{d['TEST-CC U1']['entretien_tnd']:.10g}|{d['TEST-CC U1']['entretien_provenance']}\"")"
chk "U1 : amorti sur 10 ans (âge 6), à sa valeur réelle" "300000|reel|10|2465.753" \
    "$(eng "f\"{d['TEST-CC U1']['valeur_tnd']:.10g}|{d['TEST-CC U1']['valeur_provenance']}|{d['TEST-CC U1']['duree_ans']:.10g}|{d['TEST-CC U1']['amortissement_tnd']:.10g}\"")"
chk "U3 : ses interventions de septembre (500), pas celle d'août, jamais le ratio" "500|reel" \
    "$(eng "f\"{d['TEST-CC U3']['entretien_tnd']:.10g}|{d['TEST-CC U3']['entretien_provenance']}\"")"
chk "U3, reçu en don : non amorti, et c'est dit" "0|don" \
    "$(eng "f\"{d['TEST-CC U3']['amortissement_tnd']:.10g}|{d['TEST-CC U3']['amortissement_provenance']}\"")"
chk "U2, sans valeur d'achat : au prix du guide de l'attelage (60 000), amorti sur son âge (21 ans)" "60000|prix_guide|21|21" \
    "$(eng "f\"{d['TEST-CC U2']['valeur_tnd']:.10g}|{d['TEST-CC U2']['valeur_provenance']}|{d['TEST-CC U2']['duree_ans']:.10g}|{d['TEST-CC U2']['age_ans']}\"")"
chk "U2 : le tracteur et sa remorque sont une seule unité" "test-cc-rem,test-cc-tr" "$(eng "','.join(sorted(d['TEST-CC U2']['membres']))")"
chk "U2 : l'entretien au taux de fin de vie (14 %), sur le prix du guide" "690.411|ratio_guide" \
    "$(eng "f\"{d['TEST-CC U2']['entretien_tnd']:.10g}|{d['TEST-CC U2']['entretien_provenance']}\"")"

# -----------------------------------------------------------------------------
echo
echo "6. La ventilation et le personnel"
chk "U1 se ventile au kilomètre de septembre (300 / 100 km), pas à celui d'août" "km|km|1800|600" \
    "$(circ "f\"{d['TEST A']['cle_engin']}|{d['TEST A2']['cle_engin']}|{d['TEST A']['carburant_tnd']:.10g}|{d['TEST A2']['carburant_tnd']:.10g}\"")"
chk "U2, sans carnet de bord, au voyage" voyages "$(circ "d['TEST B']['cle_engin']")"
chk "le personnel au pointage : 30 000 TND pour septembre × 39 / 147 jours pointés sur A" "pointage|7959.184" \
    "$(circ "f\"{d['TEST A']['personnel_cle']}|{d['TEST A']['personnel_tnd']:.10g}\"")"
chk "aucun taux de charges ajouté : les jours pointés de la commune (147) se partagent les 30 000 TND, pas plus" "30000" \
    "$(circ "f\"{sum(l['personnel_tnd'] for l in d.values()) * 147 / 117:.0f}\"")"
lire "$C2" "$MOIS" "$T_D2"
chk "sans pointage, à l'équipe : 30 000 × 2 équipiers / 4 agents du service" "equipe|15000" \
    "$(circ "f\"{d['TEST D sans engin']['personnel_cle']}|{d['TEST D sans engin']['personnel_tnd']:.10g}\"")"
chk "un circuit sans engin : « engin » manque, aucun total, aucun 0 posé" "['engin', 'redevance']|None|None" \
    "$(circ "f\"{d['TEST D sans engin']['manque']}|{d['TEST D sans engin']['carburant_tnd']}|{d['TEST D sans engin']['total_tnd']}\"")"
chk "sans étude de coût complet, aucun frais indirect ; aucun forfait" "None|None" \
    "$(python3 -c "import json;d=json.load(open('$T/cout.json'));print(f\"{d['indirects']}|{d['commune']['cout_complet_tnd']}\")")"

# -----------------------------------------------------------------------------
echo
echo "7. Ce qui empêche un total"
lire "$C"
chk "A2 a son total, mais pas de coût à la tonne : 1 voyage pesé sur 9" "1|None|9|1" \
    "$(circ "f\"{int(d['TEST A2']['total_tnd'] is not None)}|{d['TEST A2']['cout_tonne']}|{d['TEST A2']['voyages_attendus']}|{d['TEST A2']['voyages_peses']}\"")"
chk "A, entièrement pesé, a son coût à la tonne pesée (182 t)" "182|1" \
    "$(circ "f\"{d['TEST A']['pese_t']:.10g}|{int(d['TEST A']['cout_tonne'] is not None)}\"")"
chk "B n'a pas de redevance (aucune pesée) : le total de la commune n'existe pas" "3|4|None|None" \
    "$(python3 -c "import json;d=json.load(open('$T/cout.json'))['commune'];print(f\"{d['circuits_complets']}|{d['circuits']}|{d['cout_direct_tnd']}|{d['cout_complet_tnd']}\")")"
chk "le coût par habitant ne se donne pas sur un mois" "None|None" \
    "$(python3 -c "import json;d=json.load(open('$T/cout.json'))['commune'];print(f\"{d['cout_direct_par_habitant']}|{d['cout_complet_par_habitant']}\")")"

# Une intervention de septembre sans coût : l'entretien réel n'est plus connu, il n'est pas remplacé par le ratio.
$PSQL -c "INSERT INTO interventions_maintenance (commune_id, vehicule_id, date_intervention, type, nature, description) VALUES ('$C', 'test-cc-u3', DATE '2026-09-20', 'freinage', 'corrective', 'TEST-CC sans coût')" >/dev/null
scenario "$T/scenario2.json" "" 0 sans
python3 tests/cout_collecte_attendus.py "$T/scenario2.json" > "$T/attendus2.json"
lire "$C"
chk "une intervention sans coût : l'entretien de C est absent, jamais le ratio" ok "$(compare "$T/attendus2.json" circuits 'TEST C' "$CIRCUIT")"
chk "… « entretien » manque, C ne totalise plus" "['entretien']|None" "$(circ "f\"{d['TEST C']['manque']}|{d['TEST C']['total_tnd']}\"")"
$PSQL -c "UPDATE interventions_maintenance SET deleted_at = now() WHERE description = 'TEST-CC sans coût'" >/dev/null

# -----------------------------------------------------------------------------
echo
echo "8. Le prix du gasoil, puis toutes les pesées de B, puis une étude"
chk "la FNCT pose un prix du gasoil (2,2 TND/l), daté du 01/01/2026" 201 \
    "$(req POST /parametres-nationaux/prix_gasoil '{"dateEffet":"2026-01-01","valeurNombre":2.2,"provisoire":true}' "$T_F")"
$PSQL >/dev/null <<SQL
INSERT INTO pesees (commune_id, circuit_id, voyage, date_pesee, poids_net_kg, vehicule_id, type_dechet, observation)
SELECT '$C', '$CB', 1, d::date, 1500, 'test-cc-rem', 'menager', 'TEST-CC'
  FROM generate_series(DATE '2026-09-01', DATE '2026-09-30', interval '1 day') d WHERE extract(isodow FROM d) BETWEEN 1 AND 6;
INSERT INTO etudes_cout_complet (commune_id, exercice, document) VALUES ('$C', 2026, 'TEST-CC étude 2026');
INSERT INTO valeurs_cout_complet (etude_id, commune_id, nature, code, montant)
SELECT e.id, '$C', 'poste', x.code, x.montant FROM etudes_cout_complet e
 CROSS JOIN (VALUES ('qp_parc', 36500), ('qp_administration', 73000)) AS x(code, montant)
 WHERE e.commune_id = '$C';
SQL
scenario "$T/scenario3.json" 2.2 1500
python3 tests/cout_collecte_attendus.py "$T/scenario3.json" > "$T/attendus3.json"
lire "$C"
for c in 'TEST A' 'TEST A2' 'TEST B' 'TEST C'; do
  chk "« $c », tout renseigné : comme le témoin" ok "$(compare "$T/attendus3.json" circuits "$c" "$CIRCUIT")"
done
chk "U2 : le carburant au ratio du guide, 10 l × 26 séances × 2,2 TND" "572|ratio_guide" \
    "$(eng "f\"{d['TEST-CC U2']['carburant_tnd']:.10g}|{d['TEST-CC U2']['carburant_provenance']}\"")"
chk "U1 garde ses pleins : un prix du gasoil ne remplace pas le réel" "2400|reel" \
    "$(eng "f\"{d['TEST-CC U1']['carburant_tnd']:.10g}|{d['TEST-CC U1']['carburant_provenance']}\"")"
chk "chaque circuit a son total : le coût direct de la commune est leur somme" 1 \
    "$(python3 - "$T/cout.json" "$T/attendus3.json" <<'PY'
import json, sys
from decimal import Decimal
api, att = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
somme = sum(Decimal(str(c['total_tnd'])) for c in att['circuits'].values())
print(int(api['commune']['circuits_complets'] == 4 and abs(Decimal(str(api['commune']['cout_direct_tnd'])) - somme) < Decimal('0.0015')))
PY
)"
chk "les frais indirects de l'étude 2026, rapportés à septembre : 3 000 (parc) + 6 000 (administration)" "3000|6000|9000" \
    "$(python3 -c "import json;d=json.load(open('$T/cout.json'))['indirects'];print(f\"{d['parc_tnd']:.10g}|{d['administration_tnd']:.10g}|{d['indirects_tnd']:.10g}\")")"
chk "le coût complet = direct + indirects" 1 \
    "$(python3 -c "import json;d=json.load(open('$T/cout.json'))['commune'];print(int(abs(d['cout_complet_tnd'] - d['cout_direct_tnd'] - 9000) < 0.0015))")"
lire "$C" 2026
chk "sur l'année, le coût par habitant se donne (population de la commune)" 1 \
    "$(python3 -c "
import json;d=json.load(open('$T/cout.json'))['commune']
print(int(d['population'] == 5000 and d['cout_complet_tnd'] is not None and d['cout_complet_par_habitant'] == round(d['cout_complet_tnd'] / 5000, 3)))")"

# -----------------------------------------------------------------------------
echo
echo "9. Acquis par don, par l'API ; l'export"
chk "un « don » qui n'est pas un booléen : 400" 400 "$(req PATCH /trucks/test-cc-u3 '{"acquisParDon":"oui"}' "$T_D")"
chk "la commune dit que U3 n'est pas un don" "200|False" "$(req PATCH /trucks/test-cc-u3 '{"acquisParDon":false}' "$T_D")|$(val "d['acquis_par_don']")"
lire "$C"
chk "… U3 s'amortit alors à sa valeur réelle, sur 10 ans" "1536.986|reel" \
    "$(eng "f\"{d['TEST-CC U3']['amortissement_tnd']:.10g}|{d['TEST-CC U3']['amortissement_provenance']}\"")"
chk "… et redevient un don" "200|True" "$(req PATCH /trucks/test-cc-u3 '{"acquisParDon":true}' "$T_D")|$(val "d['acquis_par_don']")"
curl -s -o "$T/cout.csv" -H "Authorization: Bearer $T_D" "$API/cout-collecte?communeId=$C&periode=$MOIS&format=csv"
chk "l'export : une ligne par circuit, chaque provenance en mots, le coût à la tonne pesée" "5|1|1" \
    "$(python3 -c "
t=open('$T/cout.csv',encoding='utf-8-sig').read()
print(f\"{len(t.splitlines())}|{int('Ratio du guide' in t and 'Don (non amorti)' in t and 'Réel' in t)}|{int('Coût à la tonne pesée' in t.splitlines()[0])}\")")"

# -----------------------------------------------------------------------------
echo
echo "10. En partant"
base_reelle_intacte "pendant la campagne"
nettoyer
rendre_tables_nationales
tables_nationales_rendues "en partant"
chk "les communes de test, leurs engins, pesées et études sont retirés" "0|0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM vehicules WHERE id LIKE 'test-cc-%'")|$(sql "SELECT count(*) FROM pesees WHERE observation = 'TEST-CC'")|$(sql "SELECT count(*) FROM etudes_cout_complet WHERE document LIKE 'TEST-CC%'")"
chk "aucun prix du gasoil ne reste" 0 "$(sql "SELECT count(*) FROM valeurs_parametres_nationaux WHERE code = 'prix_gasoil'")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
