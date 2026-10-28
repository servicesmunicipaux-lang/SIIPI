#!/usr/bin/env bash
# =============================================================================
# v0.15.82 — la préparation de la recette R1, pour Dar Chaâbane comme pour une
# commune qui part de zéro. docs/recette/R1_DAR_CHAABANE.md ; décision du 26/10/2026.
#
# Elle commence par ce que l'import du personnel REFUSE : un fichier qui porte un
# salaire, un CIN, une donnée de santé, une adresse ou un téléphone (en-tête en
# français ou en arabe), une case de huit chiffres ; un prestataire, un citoyen, la
# commune d'un autre. Puis l'import lui-même (aperçu sans écriture, validation,
# réimport sans double, mise à jour), la masse salariale déclarée sans effacer
# l'effectif, et ce que `recette:etat` dit à une commune vide.
#
# Enfin une base de PRODUCTION jetable (tests/outils/instance_essai.sh) : le
# chargement de Dar Chaâbane y pose les circuits, le parc et la masse salariale
# réels, jamais un agent fictif ; les contenus d'exemple y sont refusés. En
# développement, rien ne change.
#
#   docker compose exec -T api npm run test:preparation-recette
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
# Le corps d'un import : $1 = fichier CSV, $2 = valider (true/false).
corps() { printf '{"nomFichier":"personnel.csv","contenu":"%s","valider":%s}' "$(base64 -w0 "$1")" "${2:-false}"; }
importer() { req POST "/personnel/import?communeId=${4:-$C}" "$(corps "$1" "${2:-false}")" "${3:-$T_D}"; }
csv() { printf '%b' "$2" > "$T/$1.csv"; echo "$T/$1.csv"; }

C=test_prep_r1
C2=test_prep_r1_b
ESSAI="'$C','$C2'"
. tests/outils/comptes_temporaires.sh
. tests/outils/communes_essai.sh
. tests/outils/base_reelle.sh
. tests/outils/instance_essai.sh
nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
  effacer_communes_essai "$ESSAI"
}
nettoyer
trap 'nettoyer; retirer_bases_essai; rm -rf "$T"' EXIT
releve_base_reelle

commune_essai "$C" "TEST Commune qui part de zéro"
commune_essai "$C2" "TEST Autre commune"
compte_temporaire admin_commune "$C" "Chef de dépôt"; T_D=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$C2" "Directeur de l'autre commune"; T_D2=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire gestionnaire_prestataire "$C" "Prestataire"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire citoyen "$C" "Citoyen"; T_C=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_D" ] && [ -n "$T_D2" ] && [ -n "$T_P" ] && [ -n "$T_C" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }
agents() { sql "SELECT count(*) FROM personnel WHERE commune_id = '$C' AND deleted_at IS NULL"; }
ANNEE=$(sql "SELECT extract(year FROM (now() AT TIME ZONE 'Africa/Tunis'))::int")

# -----------------------------------------------------------------------------
echo
echo "1. Ce que l'import du personnel refuse"
refus() {  # $1 = libellé, $2 = contenu du CSV, $3 = ce que le message doit nommer
  local f; f=$(csv refus "$2")
  chk "$1 : refusé en entier (400), et nommé" "400|1" "$(importer "$f")|$(val "1 if '''$3''' in d['error'] else 0")"
}
refus "une colonne « Salaire »" 'Nom;Prénom;Fonction;Salaire\nTESTUN;Ali;Chauffeur;950\n' "« Salaire » porte un salaire"
refus "une colonne « Prime de rendement »" 'Nom;Prénom;Fonction;Prime de rendement\nTESTUN;Ali;Chauffeur;50\n' "Prime de rendement"
refus "une colonne « CIN »" 'Nom;Prénom;Fonction;CIN\nTESTUN;Ali;Chauffeur;X\n' "numéro de pièce d’identité"
refus "une colonne « N° carte d'identité »" "Nom;Prénom;Fonction;N° carte d'identité\nTESTUN;Ali;Chauffeur;X\n" "pièce d’identité"
refus "une colonne « État de santé »" 'Nom;Prénom;Fonction;État de santé\nTESTUN;Ali;Chauffeur;X\n' "donnée de santé"
refus "une colonne « Maladie »" 'Nom;Prénom;Fonction;Maladie\nTESTUN;Ali;Chauffeur;X\n' "donnée de santé"
refus "une colonne « Adresse »" 'Nom;Prénom;Fonction;Adresse\nTESTUN;Ali;Chauffeur;X\n' "adresse ou un téléphone"
refus "une colonne « Téléphone »" 'Nom;Prénom;Fonction;Téléphone\nTESTUN;Ali;Chauffeur;X\n' "adresse ou un téléphone"
refus "en arabe, une colonne « الأجر »" 'اللقب;الاسم;الخطة;الأجر\nTESTUN;علي;سائق;950\n' "porte un salaire"
refus "en arabe, une colonne « رقم بطاقة التعريف »" 'اللقب;الاسم;الخطة;رقم بطاقة التعريف\nTESTUN;علي;سائق;X\n' "pièce d’identité"
refus "en arabe, une colonne « العنوان »" 'اللقب;الاسم;الخطة;العنوان\nTESTUN;علي;سائق;X\n' "adresse ou un téléphone"
refus "huit chiffres dans une case d'une colonne ignorée" 'Nom;Prénom;Fonction;Observation\nTESTUN;Ali;Chauffeur;09123456\n' "Ligne 2, colonne « Observation » : huit chiffres"
refus "… même écrits « 98 123 456 »" 'Nom;Prénom;Fonction;Observation\nTESTUN;Ali;Chauffeur;98 123 456\n' "forme d'un numéro de CIN ou de téléphone"
chk "rien n'a été écrit par ces refus" 0 "$(agents)"
BON=$(csv bon 'Nom;Prénom;Fonction;Statut\nTESTUN;Ali;Chauffeur;Titulaire\n')
chk "un prestataire n'importe pas le personnel : 403" 403 "$(importer "$BON" false "$T_P")"
chk "un citoyen non plus : 403" 403 "$(importer "$BON" false "$T_C")"
chk "la commune d'un autre est introuvable : 404" 404 "$(importer "$BON" false "$T_D2")"
chk "sans jeton, rien : 401" 401 "$(req POST "/personnel/import?communeId=$C" "$(corps "$BON")")"
chk "un fichier vide : 400, et c'est dit" "400|1" "$(importer "$(csv vide '
')")|$(val "1 if 'vide' in d['error'] else 0")"
chk "aucune des quatre colonnes : 400, et c'est dit" "400|1" "$(importer "$(csv autre 'Matricule;Grade\nA1;B\n')")|$(val "1 if 'Aucune colonne reconnue' in d['error'] else 0")"

# -----------------------------------------------------------------------------
echo
echo "2. Ce que chaque ligne refuse"
LIGNES=$(csv lignes 'Nom;Prénom;Fonction;Statut\n;Ali;Chauffeur;\nTESTDEUX;Sami;Pilote;\nTEST3;Mehdi;Agent;\nTESTQUATRE;Nizar;Agent;\nNizar;TESTQUATRE;Chauffeur;\n')
chk "l'aperçu de cinq lignes fautives : 200, rien d'écrit" "200|False|0" "$(importer "$LIGNES")|$(val "d['ecrit']")|$(agents)"
chk "un nom absent est obligatoire" 1 "$(val "sum(1 for l in d['lignes'] if l['numero']==2 and any('« Nom » est obligatoire' in e for e in l['erreurs']))")"
chk "une fonction inconnue est refusée, et les fonctions connues sont rappelées" 1 \
    "$(val "sum(1 for l in d['lignes'] if l['numero']==3 and any('Pilote' in e and 'Chauffeur' in e for e in l['erreurs']))")"
chk "un nom qui porte des chiffres est refusé" 1 "$(val "sum(1 for l in d['lignes'] if l['numero']==4 and any('chiffres' in e for e in l['erreurs']))")"
chk "le même agent, prénom et nom inversés, n'entre pas deux fois" 1 \
    "$(val "sum(1 for l in d['lignes'] if l['numero']==6 and any('ligne 5' in e for e in l['erreurs']))")"
chk "le résumé : une création, quatre erreurs" "1|4" "$(val "f\"{d['resume']['creer']}|{d['resume']['erreur']}\"")"

# -----------------------------------------------------------------------------
echo
echo "3. Importer le registre"
REGISTRE=$(csv registre 'Nom;Prénom;Fonction;Statut;Observation\nTESTUN;Ali;Chauffeur;Titulaire;équipe du matin\nTESTDEUX;Sami;agent;contractuel;\nTESTTROIS;Mehdi;Chef d’équipe;;\nTESTQUATRE;Nizar;Agent de balayage;Occasionnel;\n')
chk "l'aperçu : quatre créations, la colonne « Observation » ignorée, rien d'écrit" "200|4|['Observation']|0" \
    "$(importer "$REGISTRE")|$(val "d['resume']['creer']")|$(val "d['colonnesIgnorees']")|$(agents)"
chk "la validation écrit les quatre agents (201)" "201|4|4" "$(importer "$REGISTRE" true)|$(val "d['crees']")|$(agents)"
chk "le nom complet est « Prénom Nom », la fonction et le statut lus en mots ou par leur code" \
    "Ali TESTUN:chauffeur:titulaire,Mehdi TESTTROIS:chef_equipe:titulaire,Nizar TESTQUATRE:agent_balayage:occasionnel,Sami TESTDEUX:agent:contractuel" \
    "$($PSQL -c "SELECT string_agg(nom_complet||':'||fonction||':'||statut, ',' ORDER BY nom_complet) FROM personnel WHERE commune_id = '$C'")"
chk "un statut laissé vide vaut « titulaire »" titulaire "$(sql "SELECT statut FROM personnel WHERE commune_id = '$C' AND nom_complet = 'Mehdi TESTTROIS'")"
chk "réimporter le même fichier : rien à créer ni à modifier (400), aucun double" "inchange:4|400|4" \
    "$(importer "$REGISTRE" >/dev/null; val "'inchange:'+str(d['resume']['inchange'])")|$(importer "$REGISTRE" true)|$(agents)"
$PSQL -c "INSERT INTO personnel (commune_id, nom_complet, fonction) VALUES ('$C', 'TESTCINQ Hedi', 'agent')" >/dev/null
MAJ=$(csv maj 'اللقب;الاسم;الخطة;الصفة\nTESTUN;Ali;عون جمع;مرسم\nTESTCINQ;Hedi;سائق;متعاقد\n')
chk "en arabe, sans chadda : un changement de fonction, et un agent inscrit « Nom Prénom » reconnu" "200|2|0|0" \
    "$(importer "$MAJ")|$(val "d['resume']['maj']")|$(val "d['resume']['creer']")|$(val "d['resume']['erreur']")"
chk "… validé : la fonction et le statut changent, personne n'est créé" "201|agent:titulaire|chauffeur:contractuel|5" \
    "$(importer "$MAJ" true)|$(sql "SELECT fonction||':'||statut FROM personnel WHERE commune_id='$C' AND nom_complet='Ali TESTUN'")|$(sql "SELECT fonction||':'||statut FROM personnel WHERE commune_id='$C' AND nom_complet='TESTCINQ Hedi'")|$(agents)"
chk "le registre n'a toujours ni salaire, ni CIN, ni santé, ni adresse" 0 \
    "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name = 'personnel' AND column_name ~ '(salaire|cin|sante|medical|adresse|telephone)'")"

# -----------------------------------------------------------------------------
echo
echo "4. La masse salariale de l'année, sans effacer l'effectif"
chk "la commune déclare l'effectif de l'année" 200 \
    "$(req PUT "/personnel/effectifs?communeId=$C" "{\"annee\":$ANNEE,\"effectifOuvriers\":10,\"effectifEncadrement\":2,\"source\":\"TEST budget\"}" "$T_D")"
chk "… puis sa masse salariale seule : l'effectif reste" "200|10|2|365000|TESTbudget" \
    "$(req PUT "/personnel/effectifs?communeId=$C" "{\"annee\":$ANNEE,\"masseSalarialeTnd\":365000}" "$T_D")|$(sql "SELECT effectif_ouvriers||'|'||effectif_encadrement||'|'||masse_salariale_tnd::int||'|'||source FROM effectifs_service WHERE commune_id='$C' AND annee=$ANNEE")"
chk "un champ envoyé à null s'efface, lui" "200|" \
    "$(req PUT "/personnel/effectifs?communeId=$C" "{\"annee\":$ANNEE,\"effectifEncadrement\":null}" "$T_D")|$(sql "SELECT effectif_encadrement FROM effectifs_service WHERE commune_id='$C' AND annee=$ANNEE")"

# -----------------------------------------------------------------------------
echo
echo "5. Ce que recette:etat dit à une commune qui part de zéro"
etat() { DATABASE_URL="${2:-$DATABASE_URL}" npm run -s recette:etat -- "$1" >"$T/etat.txt" 2>&1; echo $?; }
ligne() { grep -c -F -- "$1" "$T/etat.txt"; }
CODE=$(etat "$C2")
chk "une commune vide : PAS PRÊTE (code 3)" 3 "$CODE"
chk "… et chaque registre vide dit son geste : parc, personnel, circuits" "1|1|1" \
    "$(ligne 'Parc vide : « + Ajouter » → Importer le parc (CSV)')|$(ligne 'Personnel vide : « + Ajouter » → Importer le personnel (CSV : Nom, Prénom, Fonction, Statut')|$(ligne 'Aucun circuit : Circuits → créer chaque circuit')"
chk "… sans proposer le jeu de Dar Chaâbane à une autre commune" 0 "$(ligne 'charger:dar-chaabane')"
chk "… la masse salariale et le prix du gasoil à recueillir, les modèles des documents provisoires" "1|1|1" \
    "$(ligne "Masse salariale $ANNEE du service propreté : non renseignée")|$(ligne 'Prix du gasoil (paramètres nationaux, FNCT) : ')|$(ligne 'Modèles des documents encore provisoires : ')"
$PSQL >/dev/null <<SQL
INSERT INTO personnel (commune_id, nom_complet, fonction, deleted_at) VALUES ('$C', 'TEST Retiré', 'agent', now());
INSERT INTO vehicules (id, registration, commune_id, type) VALUES ('test-prep-v1', 'TEST-PREP 1', '$C', 'benne_tasseuse');
INSERT INTO circuits (commune_id, nom, vehicule_id, jours_passage, actif, date_debut) VALUES ('$C', 'TEST-PREP circuit', 'test-prep-v1', ARRAY[1]::smallint[], true, CURRENT_DATE);
SQL
etat "$C" >/dev/null
chk "un agent retiré ne compte pas : 5 agents, pas 6" 1 "$(ligne 'Registres chargés : 1 engin(s), 5 agent(s) actif(s), 1 circuit(s)')"
chk "la masse salariale déclarée est vue" 1 "$(ligne "Masse salariale $ANNEE du service propreté : renseignée")"
chk "l'engin du circuit sans classe ni volume est à compléter" 1 "$(ligne 'Engins de circuit sans classe ou sans volume de benne : 1')"
base_reelle_intacte "pendant la campagne"

# -----------------------------------------------------------------------------
echo
echo "6. Une base de production : le réel de Dar Chaâbane, jamais d'agent fictif"
B=siipi_essai_prep_prod
base_essai "$B"
psql_essai "$B" "SELECT app.fixer_nature_instance('production')" >/dev/null
URL=$(url_essai "$B")
charger() { DATABASE_URL="$URL" npx tsx "seed/$1" > "$T/$1.log" 2>&1; echo $?; }
chk "le référentiel se charge sur la base de production" 0 "$(DATABASE_URL="$URL" npx tsx seed/seed.ts >"$T/seed.log" 2>&1; echo $?)"
DC=$(psql_essai "$B" "SELECT id FROM communes WHERE id LIKE '%dar_chaabane%'")
chk "Dar Chaâbane est au référentiel" 1 "$([ -n "$DC" ] && echo 1 || echo 0)"
CODE=$(etat "$DC" "$URL")
chk "avant tout chargement, recette:etat propose le jeu de démarrage de Dar Chaâbane, sans agent fictif" "3|1" \
    "$CODE|$(ligne 'npm run charger:dar-chaabane:prod — jamais d’agent fictif en production')"
chk "les circuits du registre communal se chargent" 0 "$(charger darChaabane.ts)"
chk "… sans un seul agent fictif, et c'est dit" "0|0|1" \
    "$(psql_essai "$B" "SELECT count(*) FROM personnel")|$(psql_essai "$B" "SELECT count(*) FROM circuit_equipe")|$(grep -c 'aucun agent créé' "$T/darChaabane.ts.log")"
chk "le parc se charge" 0 "$(charger parcDarChaabane.ts)"
chk "le personnel : la masse salariale seule, aucun agent, et le geste de l'import est dit" "0|0|4|1" \
    "$(charger personnelDarChaabane.ts)|$(psql_essai "$B" "SELECT count(*) FROM personnel")|$(psql_essai "$B" "SELECT count(*) FROM effectifs_service WHERE masse_salariale_tnd IS NOT NULL")|$(grep -c 'Personnel → Importer' "$T/personnelDarChaabane.ts.log")"
chk "les 13 circuits et les 29 engins du registre sont là" "13|29" \
    "$(psql_essai "$B" "SELECT count(*) FROM circuits WHERE commune_id = '$DC'")|$(psql_essai "$B" "SELECT count(*) FROM vehicules WHERE commune_id = '$DC'")"
chk "les contenus d'exemple sont refusés (code 1), rien n'est publié" "1|1|0" \
    "$(charger communicationDarChaabane.ts)|$(grep -c 'Refusé : la base est une base de PRODUCTION' "$T/communicationDarChaabane.ts.log")|$(psql_essai "$B" "SELECT count(*) FROM publications")"
etat "$DC" "$URL" >/dev/null
chk "recette:etat dit alors à la commune d'importer son personnel" "1|1" \
    "$(ligne 'Registres chargés : 29 engin(s), 0 agent(s) actif(s), 13 circuit(s)')|$(ligne 'Personnel vide : « + Ajouter » → Importer le personnel')"

B2=siipi_essai_prep_dev
base_essai "$B2"
URL=$(url_essai "$B2")
DATABASE_URL="$URL" npx tsx seed/seed.ts --referentiel >"$T/seed_dev.log" 2>&1
chk "en développement, rien ne change : les 17 agents fictifs et leurs équipes, comme avant" "0|17|16" \
    "$(charger darChaabane.ts)|$(psql_essai "$B2" "SELECT count(*) FROM personnel")|$(psql_essai "$B2" "SELECT count(*) FROM circuit_equipe")"

# -----------------------------------------------------------------------------
echo
echo "7. En partant"
retirer_bases_essai
chk "les bases d'essai sont retirées" 0 "$(psql_essai postgres "SELECT count(*) FROM pg_database WHERE datname LIKE 'siipi_essai_prep_%'")"
base_reelle_intacte "après les bases de production et de développement jetables"
nettoyer
chk "les communes de test et leurs agents sont retirés" "0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM personnel WHERE commune_id IN ($ESSAI)")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
