#!/usr/bin/env bash
# =============================================================================
# Refonte, lot 5 — « Ma commune dans SIIPI » : la complétude de la commune.
# docs/specs_metier/SPEC_refonte_indicateurs_saisie.md § 2.4.
#
# Elle commence par ce que la plateforme REFUSE : une lecture sans compte, par
# un citoyen ou un prestataire, la commune d'un autre, une liste « toutes
# communes » (elle deviendrait un classement), un jour futur ou inexistant, un
# catalogue réécrit par l'application.
#
# Puis la règle du lot : chaque élément est présent ou à ajouter, jamais
# « 0 » ; la réponse ne porte ni total, ni pourcentage, ni rang ; un registre
# porte sur le mois du jour demandé ; ce qu'un élément débloque se lit dans les
# dépendances du catalogue ; « présent » ici et « il manque » sur un indicateur
# ne se contredisent jamais.
#
# Les données sont bâties dans une commune de test (TEST), puis effacées.
#
#   docker compose exec -T api npm run test:completude
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
fractions() {
  printf '{"organiques":%s,"papier_carton":%s,"plastiques":%s,"verre":%s,"metaux":%s,"textiles":%s,"fines_autres":%s}' "$@"
}
# La complétude de la commune de test (au jour donné), puis un élément : présent|nombre|annee.
completude() { req GET "/kpi/completude?communeId=$TC${1:+&jour=$1}" >/dev/null; }
el() {
  python3 -c "
import json
d = json.load(open('$T/r.json'))
e = next(x for x in d['elements'] if x['code'] == '$1')
print(('present' if e['present'] else 'a_ajouter') + '|' + str(e['nombre']) + '|' + str(e['annee']))" 2>/dev/null || echo erreur
}
indicateurs() { python3 -c "
import json
d = json.load(open('$T/r.json'))
print(','.join(next(x for x in d['elements'] if x['code'] == '$1')['indicateurs']))" 2>/dev/null || echo erreur; }

TC=test_completude
COMMUNE_DIR="$TC"
. tests/outils/directeur_temporaire.sh
NATIONALE=""
nettoyer() {
  $PSQL -c "DELETE FROM interventions_maintenance WHERE commune_id = '$TC';" \
        -c "DELETE FROM pesees WHERE commune_id = '$TC';" \
        -c "DELETE FROM circuits WHERE commune_id = '$TC';" \
        -c "DELETE FROM vehicules WHERE commune_id = '$TC';" \
        -c "DELETE FROM effectifs_service WHERE commune_id = '$TC';" \
        -c "DELETE FROM caracterisations WHERE commune_id = '$TC';" \
        -c "DELETE FROM pcgd WHERE commune_id = '$TC';" >/dev/null 2>&1
  [ -n "$NATIONALE" ] && $PSQL -c "DELETE FROM caracterisations WHERE id = '$NATIONALE';" >/dev/null 2>&1
}
fin() {
  nettoyer
  retirer_directeur_temporaire
  $PSQL -c "DELETE FROM audit_log WHERE commune_id = '$TC';" -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
  rm -rf "$T"
}
nettoyer
$PSQL -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
# Une commune vide : ni contour, ni rien, et une population à 0 — la colonne
# l'exige, et 0 habitant n'est pas une population (070 : NULLIF).
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune de la complétude', 'TEST', 'TEST', 0);" >/dev/null
directeur_temporaire "$TC"
trap fin EXIT
T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
T_FNCT=$(tok admin.national@siipi.tn)
T_PREST=$(tok prestataire.marsa@siipi.tn)
T_CIT=$(tok citoyen.demo@siipi.tn)
[ -n "$T_DIR" ] && [ -n "$T_FNCT" ] && [ -n "$T_PREST" ] && [ -n "$T_CIT" ] || { echo "API injoignable sur $API, ou compte d'essai absent" >&2; exit 1; }
AUTRE=$(sql "SELECT id FROM communes WHERE id <> '$TC' AND NOT est_demo AND deleted_at IS NULL ORDER BY id LIMIT 1")
AUJ=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date")
ANNEE=${AUJ%%-*}
VEILLE_DU_MOIS=$(sql "SELECT (date_trunc('month', DATE '$AUJ') - interval '1 day')::date")
DEMAIN=$(sql "SELECT DATE '$AUJ' + 1")

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "sans compte : 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$API/kpi/completude?communeId=$TC")"
chk "un citoyen, un prestataire : 403" "403|403" \
    "$(req GET "/kpi/completude?communeId=$TC" "" "$T_CIT")|$(req GET "/kpi/completude?communeId=$TC" "" "$T_PREST")"
chk "un directeur ne lit pas la complétude d'une autre commune : introuvable (404)" 404 \
    "$(req GET "/kpi/completude?communeId=$AUTRE")"
chk "la FNCT ne reçoit pas de liste « toutes communes » : il faut une commune (400)" 400 \
    "$(req GET /kpi/completude "" "$T_FNCT")"
chk "un jour futur est refusé" 400 "$(req GET "/kpi/completude?communeId=$TC&jour=$DEMAIN")"
chk "un jour inexistant, un format faux aussi" "400|400" \
    "$(req GET "/kpi/completude?communeId=$TC&jour=2026-02-31")|$(req GET "/kpi/completude?communeId=$TC&jour=13/10/2026")"
chk "l'application ne réécrit pas le catalogue des éléments" t \
    "$($PSQL -c "SET ROLE siipi_app; INSERT INTO elements_completude VALUES ('x','reference',99,'x','x','x','x','ecran','x');" 2>&1 \
       | grep -q 'permission denied' && echo t || echo f)"
chk "… ni leurs sources" t \
    "$($PSQL -c "SET ROLE siipi_app; DELETE FROM sources_elements_completude;" 2>&1 | grep -q 'permission denied' && echo t || echo f)"
chk "la fonction interne n'est pas appelable par l'application" t \
    "$($PSQL -c "SET ROLE siipi_app; SELECT app._element_completude('$TC', 'circuits', DATE '$AUJ');" 2>&1 | grep -q 'permission denied' && echo t || echo f)"
chk "appelée en SQL pour une commune hors de son périmètre, la complétude ne rend rien" 0 \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$DIR_ID', true), set_config('app.commune_id', '$TC', true);
                 SET LOCAL ROLE siipi_app; SELECT count(*) FROM app.completude_commune('$AUTRE', DATE '$AUJ'); COMMIT;" 2>/dev/null | tail -1 | tr -d ' ')"
chk "un mois sans accident ne s'affiche pas « à ajouter » : le registre des incidents n'est pas dans la liste" 0 \
    "$(sql "SELECT count(*) FROM elements_completude WHERE code IN ('incidents', 'reclamations') OR cible IN ('incident')")"

# -----------------------------------------------------------------------------
echo
echo "2. Une commune vide : tout est à ajouter, rien n'est « 0 »"
chk "la liste se lit" 200 "$(req GET "/kpi/completude?communeId=$TC")"
chk "21 éléments : 14 données de référence, 7 registres du mois" "21|14|7" \
    "$(val "len(d['elements'])")|$(val "sum(1 for e in d['elements'] if e['rubrique'] == 'reference')")|$(val "sum(1 for e in d['elements'] if e['rubrique'] == 'registre_mois')")"
chk "le jour par défaut est aujourd'hui, à Tunis" "$AUJ" "$(val "d['jour']")"
chk "tout est à ajouter, et aucun nombre n'est donné (jamais « 0 »)" "0|0" \
    "$(val "sum(1 for e in d['elements'] if e['present'])")|$(val "sum(1 for e in d['elements'] if e['nombre'] is not None)")"
chk "ce n'est pas une note : la réponse ne porte que le jour et la liste" "elements,jour" "$(val "','.join(sorted(d.keys()))")"
chk "… et aucun élément ne porte de score, de pourcentage, de poids ni de rang" \
    "aide_ar,aide_fr,annee,cible,code,indicateurs,libelle_ar,libelle_fr,nature,nombre,ordre,present,rubrique" \
    "$(val "','.join(sorted(set().union(*[e.keys() for e in d['elements']])))")"
chk "chaque élément dit en français et en arabe ce qu'il est et à quoi il sert" 0 \
    "$(val "sum(1 for e in d['elements'] if not (e['libelle_fr'] and e['libelle_ar'] and e['aide_fr'] and e['aide_ar']))")"
chk "chacun se complète par la commune : un formulaire, un écran ou un paramètre" "formulaire,ecran,parametre" \
    "$(val "','.join(n for n in ['formulaire', 'ecran', 'parametre'] if any(e['nature'] == n for e in d['elements']))")"
chk "l'ordre est celui du catalogue, les données de référence d'abord" "population|balayage" \
    "$(val "d['elements'][0]['code'] + '|' + d['elements'][-1]['code']")"
chk "les pesées à ajouter ici, ce sont bien elles qui manquent au tonnage (TONNAGE_T)" 1 \
    "$(req GET "/kpi/manques?communeId=$TC&code=TONNAGE_T" >/dev/null; val "sum(1 for m in d if m['source'] == 'pesees')")"

# -----------------------------------------------------------------------------
echo
echo "3. Ce qu'un élément débloque — lu dans les dépendances du catalogue"
# Le témoin : la règle des dépendances (070) écrite à la main.
completude
trie() { indicateurs "$1" | tr ',' '\n' | sort | paste -sd, -; }
chk "les pesées débloquent le tonnage, la production par habitant, le coût à la tonne, DMA-4, et la collecte et le remplissage (lot K)" \
    "COUT_TONNE,DMA-4,KG_HAB_J,TAUX_COLLECTE,TAUX_REMPLISSAGE,TONNAGE_T" "$(trie pesees)"
chk "un circuit suffit à M1-3 (communication), M3-3 (usage du numérique), et sert à la collecte estimée (lot K)" \
    "CIRCUITS,M1-3,M3-3,TAUX_COLLECTE_ESTIME" "$(trie circuits)"
chk "la population (et la production théorique) débloque la production par habitant et les taux du guide (lot K)" \
    "KG_HAB_J,TAUX_COLLECTE,TAUX_COLLECTE_ESTIME,TAUX_COUVERTURE" "$(trie population)"
chk "le carburant : son indicateur et le coût à la tonne" "COUT_TONNE,ECO-CARBURANT" "$(trie carburant)"
chk "le PCGD, la caractérisation, le périmètre ne débloquent aucun indicateur (ils servent ailleurs, l'aide le dit)" "||" \
    "$(indicateurs pcgd)|$(indicateurs caracterisation)|$(indicateurs perimetre)"
CATALOGUE=$(sql "SELECT string_agg(code, ',') FROM indicateurs_kpi")
chk "aucun élément ne prétend débloquer un indicateur absent du catalogue" 0 \
    "$(val "sum(1 for e in d['elements'] for c in e['indicateurs'] if c not in '$CATALOGUE'.split(','))")"
# Une source nouvelle du catalogue sans élément ferait échouer ce contrôle : on
# décide alors, exprès, si elle entre dans la liste. Restent dehors : les
# incidents (un mois sans accident est une bonne nouvelle), les réclamations
# résolues (elles suivent les citoyens), la dotation EPI et les nettoyages des
# lieux (cimetière, marché, abattoir), qui ne valent que pour certaines communes,
# et les points noirs (lot K) : une commune qui n'en a aucun le déclare.
chk "les sources tenues par la commune sans élément sont exactement celles écartées exprès" \
    "epi,incidents,nettoyages_abattoirs,nettoyages_cimetieres,nettoyages_marches,points_noirs,reclamations_resolues" \
    "$(sql "SELECT string_agg(s.code, ',' ORDER BY s.code) FROM sources_indicateurs s
             WHERE s.nature IN ('formulaire', 'ecran', 'parametre')
               AND s.code NOT IN (SELECT source FROM sources_elements_completude)")"

# -----------------------------------------------------------------------------
echo
echo "4. Ajouter une donnée la rend présente"
$PSQL -c "UPDATE communes SET population = 8000 WHERE id = '$TC';" >/dev/null
$PSQL -c "INSERT INTO circuits (commune_id, nom) VALUES ('$TC', 'TEST-COMP circuit 1'), ('$TC', 'TEST-COMP circuit 2');" >/dev/null
$PSQL -c "INSERT INTO vehicules (id, registration, commune_id, type) VALUES ('test-comp-v1', 'TEST-COMP-1', '$TC', 'benne_tasseuse');" >/dev/null
completude
chk "la population : présente, 8000 habitants" "present|8000|None" "$(el population)"
chk "deux circuits : présents, 2" "present|2|None" "$(el circuits)"
chk "un engin : présent, 1" "present|1|None" "$(el parc)"
chk "les secteurs restent à ajouter" "a_ajouter|None|None" "$(el secteurs)"
chk "le PCGD, déclaré en préparation par la commune, est présent sans année" "201|present|1|None" \
    "$(req POST "/references/pcgd?communeId=$TC" '{"statut":"en_preparation"}')|$(completude; el pcgd)"
CODE_NAT=$(req POST /references/caracterisations "{\"niveauSource\":\"moyenne_nationale_anged\",\"annee\":2022,\"methode\":\"TEST-COMP\",\"fractions\":$(fractions 62 11 11 4 3 4 5)}" "$T_FNCT")
NATIONALE=$(val "d['id']")
chk "une moyenne nationale saisie par la FNCT ne rend pas la caractérisation « présente »" "201|a_ajouter|None|None" \
    "$CODE_NAT|$(completude; el caracterisation)"
chk "la caractérisation propre à la commune, elle, la rend présente, avec son année" "201|present|1|2024" \
    "$(req POST "/references/caracterisations?communeId=$TC" "{\"niveauSource\":\"autre_etude\",\"annee\":2024,\"fractions\":$(fractions 55 13 14 5 4 4 5)}")|$(completude; el caracterisation)"
$PSQL -c "INSERT INTO effectifs_service (commune_id, annee, effectif_ouvriers, effectif_encadrement) VALUES ('$TC', $ANNEE, 20, 3);" >/dev/null
completude
chk "l'effectif de l'année : présent, 23 agents, $ANNEE" "present|23|$ANNEE" "$(el effectifs)"
chk "la masse salariale, non saisie, reste à ajouter (l'année concernée est dite)" "a_ajouter|None|$ANNEE" "$(el masse_salariale)"

# -----------------------------------------------------------------------------
echo
echo "5. Les registres portent sur le mois du jour demandé"
$PSQL -c "INSERT INTO pesees (commune_id, date_pesee, poids_net_kg, vehicule_immat, observation) VALUES ('$TC', '$AUJ', 5000, 'TEST-COMP-1', 'TEST-COMP');" >/dev/null
completude
chk "une pesée aujourd'hui : le registre des pesées est tenu ce mois-ci, 1 pesée" "present|1|None" "$(el pesees)"
completude "$VEILLE_DU_MOIS"
chk "la veille du premier du mois, il ne l'était pas" "a_ajouter|None|None" "$(el pesees)"
chk "« présent » ici et « il manque » sur l'indicateur ne se contredisent pas : TONNAGE_T ne manque plus de pesées" 0 \
    "$(req GET "/kpi/manques?communeId=$TC&code=TONNAGE_T" >/dev/null; val "sum(1 for m in d if m['source'] == 'pesees')")"
$PSQL -c "INSERT INTO interventions_maintenance (commune_id, vehicule_id, date_intervention, type) VALUES ('$TC', 'test-comp-v1', '$AUJ', 'vidange');" >/dev/null
completude
chk "une intervention d'entretien sans coût ne tient pas le registre (le coût de maintenance ne se calculerait pas)" "a_ajouter|None|None" "$(el maintenance)"
chk "… et l'indicateur dit la même chose : la maintenance lui manque" 1 \
    "$(req GET "/kpi/manques?communeId=$TC&code=COUT_MAINTENANCE" >/dev/null; val "sum(1 for m in d if m['source'] == 'maintenance')")"
$PSQL -c "UPDATE interventions_maintenance SET cout_tnd = 120 WHERE commune_id = '$TC';" >/dev/null
completude
chk "avec son coût, le registre est tenu" "present|1|None" "$(el maintenance)"

# -----------------------------------------------------------------------------
echo
echo "6. La FNCT lit la même liste, et lire n'écrit rien"
D1=$(req GET "/kpi/completude?communeId=$TC" >/dev/null; val "[(e['code'], e['present'], e['nombre']) for e in d['elements']]")
D2=$(req GET "/kpi/completude?communeId=$TC" "" "$T_FNCT" >/dev/null; val "[(e['code'], e['present'], e['nombre']) for e in d['elements']]")
chk "la FNCT lit la complétude de la commune, identique à celle du directeur" t "$([ "$D1" = "$D2" ] && [ "$D1" != erreur ] && echo t || echo f)"
AVANT=$(sql "SELECT count(*) FROM audit_log WHERE commune_id = '$TC'")
completude; completude "$VEILLE_DU_MOIS"
chk "lire la complétude n'écrit rien au journal de la commune" "$AVANT" "$(sql "SELECT count(*) FROM audit_log WHERE commune_id = '$TC'")"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
