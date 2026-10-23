#!/usr/bin/env bash
# =============================================================================
# Jalon D, lot D4 — la bibliothèque nationale des données (migration 084, /bibliotheque).
# docs/specs_metier/SPEC_D_pret_a_presenter.md, D4.
#
# Un catalogue en LECTURE SEULE de ce que SIIPI réunit — neuf éléments : PCGD, études et rapports, coût
# complet, caractérisation, population, pesées, circuits, points relevés, réclamations — avec « N communes
# sur M », la période, la provenance. Réservé à la FNCT.
#
# Elle commence par ce que la plateforme REFUSE : une lecture sans compte, par un directeur de commune, un
# prestataire ou un citoyen (aucun nouveau rôle : le ministère la voit depuis un compte FNCT) ; un élément
# inconnu. Puis ce qu'elle ne fait JAMAIS : écrire quoi que ce soit, ouvrir un fichier (le chemin d'un
# rapport ne sort pas), montrer une donnée personnelle, mêler une version remplacée à un second rapport,
# classer les territoires. Enfin les chiffres : chaque élément, dans une commune de test bâtie pour ça, est
# compté exactement — « N communes sur M » avant et après, la période et le nombre de mois des pesées, le
# statut d'un PCGD, la nature d'une population (déclarée ou estimée) — et un export.
#
# Tout se passe dans deux communes de test, avec des comptes temporaires ; la campagne prouve en partant
# qu'aucune commune réelle n'a reçu de ligne.
#
#   docker compose exec -T api npm run test:bibliotheque
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

A=test_biblio_a   # la commune qui tient des données
B=test_biblio_b   # la commune qui n'en tient aucune (hors la population du référentiel)
ESSAI_C="'$A','$B'"
. tests/outils/comptes_temporaires.sh
. tests/outils/communes_essai.sh
. tests/outils/base_reelle.sh
nettoyer_c() {
  effacer_communes_essai "$ESSAI_C"
  retirer_comptes_temporaires
  effacer_communes_essai "$ESSAI_C"
}
nettoyer_c
trap 'nettoyer_c; rm -rf "$T"' EXIT
releve_base_reelle

compte_temporaire super_admin_fnct "" "Agent FNCT de la bibliothèque"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
# La commune de base : ce qu'elle voit, avant que les communes de test n'existent.
req GET /bibliotheque "" "$T_F" >/dev/null; cp "$T/r.json" "$T/avant_communes.json"
commune_essai "$A" "TEST Commune A de la bibliothèque"
commune_essai "$B" "TEST Commune B de la bibliothèque"
compte_temporaire admin_commune "$A" "Directeur A de la bibliothèque"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire gestionnaire_prestataire "$A" "Prestataire de la bibliothèque"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire citoyen "$A" "Citoyen de la bibliothèque"; T_C=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_F" ] && [ -n "$T_A" ] && [ -n "$T_P" ] && [ -n "$T_C" ] \
  || { echo "API injoignable sur $API, ou comptes temporaires refusés" >&2; exit 1; }

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "sans compte : 401" 401 "$(req GET /bibliotheque)"
chk "le directeur d'une commune ne lit pas la bibliothèque nationale : 403" 403 "$(req GET /bibliotheque "" "$T_A")"
chk "un prestataire non plus : 403" 403 "$(req GET /bibliotheque "" "$T_P")"
chk "un citoyen non plus : 403" 403 "$(req GET /bibliotheque "" "$T_C")"
chk "ni le détail d'un élément : 403" 403 "$(req GET /bibliotheque/pcgd "" "$T_A")"
chk "ni l'export : 403" 403 "$(req GET '/bibliotheque/lignes?format=csv' "" "$T_A")"
chk "un élément inconnu de la FNCT : 404" 404 "$(req GET /bibliotheque/inventaire "" "$T_F")"
chk "la FNCT lit le catalogue : 200" 200 "$(req GET /bibliotheque "" "$T_F")"
chk "neuf éléments, dans l'ordre : documents, références, séries" "pcgd,rapports_etudes,cout_complet,caracterisation,population,pesees,circuits,points,reclamations|documents,documents,documents,references,references,series,series,series,series" \
    "$(val "','.join(e['element'] for e in d['elements']) + '|' + ','.join(e['groupe'] for e in d['elements'])")"

# -----------------------------------------------------------------------------
echo
echo "2. Les communes de test sont comptées, sans rien tenir encore"
req GET /bibliotheque "" "$T_F" >/dev/null; cp "$T/r.json" "$T/zero.json"
chk "les deux communes de test s'ajoutent aux communes réelles (le « M » de « N sur M »)" 2 \
    "$(python3 -c "import json;a=json.load(open('$T/avant_communes.json'));b=json.load(open('$T/zero.json'));print(b['communes_total']-a['communes_total'])")"
chk "elles ont chacune une population (celle du référentiel, « estimée ») : deux communes de plus" 2 \
    "$(python3 -c "import json;g=lambda f:next(e for e in json.load(open(f))['elements'] if e['element']=='population');print(g('$T/zero.json')['communes_avec']-g('$T/avant_communes.json')['communes_avec'])")"
chk "et rien d'autre ne bouge : un PCGD, un rapport, une pesée ne naissent pas d'une commune" "0,0,0,0,0,0" \
    "$(python3 -c "import json;g=lambda f,k:next(e for e in json.load(open(f))['elements'] if e['element']==k)['communes_avec'];print(','.join(str(g('$T/zero.json',k)-g('$T/avant_communes.json',k)) for k in ('pcgd','rapports_etudes','cout_complet','caracterisation','pesees','reclamations')))")"

# -----------------------------------------------------------------------------
echo
echo "3. Chaque élément, compté exactement : la commune A en tient, la commune B n'en tient aucun"
DOC=$(python3 -c "import uuid;print(uuid.uuid4())")
$PSQL <<SQL >/dev/null
INSERT INTO pcgd (commune_id, statut, annee_adoption, bureau_etudes) VALUES ('$A', 'adopte', 2024, 'TEST bureau PCGD');
-- Un rapport en deux versions : la version remplacée n'est pas un second rapport. Plus un autre document.
-- La première version est son propre document (id = document_id) ; la seconde y renvoie.
INSERT INTO rapports_etudes (id, commune_id, titre, categorie, auteur, date_document, fichier_url, nom_fichier, document_id, version)
  VALUES ('$DOC', '$A', 'TEST rapport version 1', 'audit', 'TEST auteur', '2026-02-01', 'TEST-chemin-secret/v1.pdf', 'v1.pdf', '$DOC', 1);
INSERT INTO rapports_etudes (commune_id, titre, categorie, auteur, date_document, fichier_url, nom_fichier, document_id, version)
  VALUES ('$A', 'TEST rapport version 2', 'audit', 'TEST auteur', '2026-03-01', 'TEST-chemin-secret/v2.pdf', 'v2.pdf', '$DOC', 2);
INSERT INTO rapports_etudes (commune_id, titre, categorie, auteur, date_document, fichier_url, nom_fichier, version)
  VALUES ('$A', 'TEST autre étude', 'etude_technique', 'TEST autre auteur', '2026-04-01', 'TEST-chemin-secret/e.pdf', 'e.pdf', 1);
INSERT INTO etudes_cout_complet (commune_id, exercice, document, bureau_etudes) VALUES ('$A', 2025, 'TEST étude de coût', 'TEST bureau coût');
-- Une caractérisation se pose avec ses fractions, qui font 100 % (la base l'exige).
WITH c AS (INSERT INTO caracterisations (commune_id, niveau_source, annee) VALUES ('$A', 'etude_anged_commune', 2025) RETURNING id)
  INSERT INTO fractions_caracterisation (caracterisation_id, fraction, pourcentage) SELECT id, (SELECT code FROM fractions_reference ORDER BY code LIMIT 1), 100 FROM c;
INSERT INTO parametres_commune (commune_id, population_permanente, population_permanente_source) VALUES ('$A', 4321, 'TEST recensement');
INSERT INTO pesees (commune_id, date_pesee, poids_net_kg, observation, vehicule_immat, type_dechet)
  VALUES ('$A', '2026-01-10', 1000, 'TEST', 'TEST-1', 'menager'), ('$A', '2026-01-20', 2000, 'TEST', 'TEST-1', 'menager'), ('$A', '2026-03-05', 3000, 'TEST', 'TEST-1', 'menager');
INSERT INTO circuits (commune_id, nom) VALUES ('$A', 'TEST circuit 1'), ('$A', 'TEST circuit 2');
INSERT INTO points_collecte (circuit_id, commune_id, ordre, geom, type)
  SELECT id, '$A', 1, ST_SetSRID(ST_MakePoint(10.1, 36.1), 4326), 'point_de_collecte' FROM circuits WHERE commune_id = '$A' AND nom = 'TEST circuit 1';
INSERT INTO tickets (ticket_number, commune_id, category, title) VALUES ('TEST-BIB-1', '$A', 'autre', 'TEST réclamation');
SQL
SOMME_AVANT=$(sql "SELECT (SELECT count(*) FROM pcgd) + (SELECT count(*) FROM rapports_etudes) + (SELECT count(*) FROM pesees) + (SELECT count(*) FROM circuits) + (SELECT count(*) FROM tickets) + (SELECT count(*) FROM audit_log)")
req GET /bibliotheque "" "$T_F" >/dev/null; cp "$T/r.json" "$T/apres.json"
diff_el() {  # $1 = élément, $2 = champ : l'écart entre « avant les données » et « après »
  python3 -c "import json;g=lambda f:next(e for e in json.load(open(f))['elements'] if e['element']=='$1')['$2'];print(g('$T/apres.json')-g('$T/zero.json'))"
}
chk "PCGD : une commune de plus, un document de plus" "1|1" "$(diff_el pcgd communes_avec)|$(diff_el pcgd nombre)"
chk "études et rapports : une commune de plus, deux documents (la version remplacée ne compte pas)" "1|2" "$(diff_el rapports_etudes communes_avec)|$(diff_el rapports_etudes nombre)"
chk "coût complet : une commune, une étude" "1|1" "$(diff_el cout_complet communes_avec)|$(diff_el cout_complet nombre)"
chk "caractérisation : une commune, une caractérisation" "1|1" "$(diff_el caracterisation communes_avec)|$(diff_el caracterisation nombre)"
chk "pesées : une commune, trois pesées" "1|3" "$(diff_el pesees communes_avec)|$(diff_el pesees nombre)"
chk "circuits : une commune, deux circuits" "1|2" "$(diff_el circuits communes_avec)|$(diff_el circuits nombre)"
chk "points relevés : une commune, un point" "1|1" "$(diff_el points communes_avec)|$(diff_el points nombre)"
chk "réclamations : une commune, une réclamation" "1|1" "$(diff_el reclamations communes_avec)|$(diff_el reclamations nombre)"
chk "population : aucune commune de plus, mais une devient « déclarée » et ne compte plus « estimée »" "0|1|-1" \
    "$(diff_el population communes_avec)|$(python3 -c "import json;r=lambda f:next(e for e in json.load(open(f))['elements'] if e['element']=='population')['repartition'];print(r('$T/apres.json').get('declaree',0)-r('$T/zero.json').get('declaree',0))")|$(python3 -c "import json;r=lambda f:next(e for e in json.load(open(f))['elements'] if e['element']=='population')['repartition'];print(r('$T/apres.json').get('estimee',0)-r('$T/zero.json').get('estimee',0))")"
chk "le PCGD dit son statut dans la répartition : un « adopté » de plus" 1 \
    "$(python3 -c "import json;r=lambda f:next(e for e in json.load(open(f))['elements'] if e['element']=='pcgd')['repartition'];print(r('$T/apres.json').get('adopte',0)-r('$T/zero.json').get('adopte',0))")"

# -----------------------------------------------------------------------------
echo
echo "4. Le détail : la période, le nombre de mois, la nature — et ce qui ne sort pas"
req GET /bibliotheque/pesees "" "$T_F" >/dev/null; cp "$T/r.json" "$T/pesees.json"
chk "les pesées de A : trois, du 10/01 au 05/03, sur deux mois, de nature « pesé »" "3|2026-01-10|2026-03-05|2|pese" \
    "$(val "next(str(l['nombre'])+'|'+l['premiere']+'|'+l['derniere']+'|'+str(l['mois_couverts'])+'|'+l['nature'] for l in d['lignes'] if l['commune_id'] == '$A')")"
chk "le tonnage n'est pas additionné ici : aucune colonne de poids" True "$(val "not any('poids' in k or 'tonnage' in k for l in d['lignes'] for k in l)")"
req GET /bibliotheque/rapports_etudes "" "$T_F" >/dev/null; cp "$T/r.json" "$T/rapports.json"
chk "les rapports de A : le titre, l'auteur et la catégorie de la dernière version, et l'autre étude" "TEST autre étude|TEST rapport version 2" \
    "$(val "'|'.join(sorted(l['intitule'] for l in d['lignes'] if l['commune_id'] == '$A'))")"
chk "la version remplacée n'est pas listée" False "$(val "any(l['intitule'] == 'TEST rapport version 1' for l in d['lignes'])")"
chk "AUCUN accès aux fichiers : le chemin d'un rapport ne sort nulle part (détail, catalogue, export)" 0 \
    "$(cat "$T/rapports.json" "$T/apres.json" | grep -c 'TEST-chemin-secret')"
chk "aucune donnée personnelle : les lignes n'ont que les champs du catalogue" True \
    "$(val "all(set(l) <= {'commune_id','commune','commune_ar','gouvernorat','intitule','annee','auteur','statut','nature','nombre','premiere','derniere','mois_couverts'} for l in d['lignes'])")"
req GET /bibliotheque/population "" "$T_F" >/dev/null
chk "la population de A est « déclarée », celle de B « estimée » (le référentiel)" "declaree|4321|estimee|5000" \
    "$(val "next(l['nature']+'|'+str(l['nombre']) for l in d['lignes'] if l['commune_id'] == '$A') + '|' + next(l['nature']+'|'+str(l['nombre']) for l in d['lignes'] if l['commune_id'] == '$B')")"
req GET /bibliotheque/pcgd "" "$T_F" >/dev/null
chk "B n'a aucun PCGD : absente des lignes, jamais une ligne à zéro" False "$(val "any(l['commune_id'] == '$B' for l in d['lignes'])")"
chk "le territoire de A dit « 1 commune sur 2 » ; un territoire sans PCGD dit zéro, un vrai zéro" "2|1" \
    "$(val "next(str(g['communes'])+'|'+str(g['communes_avec']) for g in d['gouvernorats'] if g['cle'] == 'TEST')")"
chk "les territoires viennent dans l'ordre alphabétique, jamais classés par valeur" True \
    "$(val "[g['nom'] for g in d['gouvernorats']] == sorted((g['nom'] for g in d['gouvernorats']), key=lambda n: __import__('unicodedata').normalize('NFD', n).encode('ascii','ignore').decode().lower()) or [g['nom'] for g in d['gouvernorats']] == sorted((g['nom'] for g in d['gouvernorats']), key=lambda n: n.lower())")"
chk "les districts aussi (les communes de test n'ont pas de district : « non rattaché »)" True "$(val "any(x['cle'] == 'non_rattache' for x in d['districts'])")"

# -----------------------------------------------------------------------------
echo
echo "5. L'export, et la lecture seule"
chk "l'export CSV des pesées répond en CSV" "200|text/csv; charset=utf-8" \
    "$(curl -s -o "$T/e.csv" -D "$T/e.h" -w '%{http_code}' "$API/bibliotheque/lignes?element=pesees&format=csv" -H "Authorization: Bearer $T_F")|$(grep -i '^content-type:' "$T/e.h" | head -1 | cut -d' ' -f2- | tr -d '\r')"
chk "il porte les trois pesées de A, sous leur gouvernorat" 1 "$([ "$(grep -c 'TEST Commune A' "$T/e.csv")" = 1 ] && echo 1 || echo 0)"
chk "l'export Excel répond aussi" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$API/bibliotheque/lignes?element=pesees&format=xlsx" -H "Authorization: Bearer $T_F")"
chk "lire la bibliothèque n'a rien écrit : mêmes lignes dans les sources et au journal d'audit" "$SOMME_AVANT" \
    "$(sql "SELECT (SELECT count(*) FROM pcgd) + (SELECT count(*) FROM rapports_etudes) + (SELECT count(*) FROM pesees) + (SELECT count(*) FROM circuits) + (SELECT count(*) FROM tickets) + (SELECT count(*) FROM audit_log)")"

# -----------------------------------------------------------------------------
echo
echo "Aucune commune réelle n'a reçu de ligne"
base_reelle_intacte "pendant la campagne"
nettoyer_c
chk "ses communes de test et leurs lignes, et ses comptes temporaires, sont effacés" "0|0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM pcgd WHERE commune_id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM pesees WHERE commune_id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
