#!/usr/bin/env bash
# =============================================================================
# Le tableau de bord des indicateurs (5 axes) et la préparation au décret DMA —
# Jalon 8 (TDR §3.2.10, A2.3, A3.1, A3.3, B7.4), refondu au lot 1 de la
# refonte : plus de barème, de note ni de classement ; une valeur déclarée par
# la commune vaut dès qu'elle est enregistrée (SPEC_refonte_indicateurs_saisie.md
# § 1, décisions D1 et D3).
#
# LE TEST DE VALIDATION DE LA FEUILLE DE ROUTE : chaque indicateur est
# recalculé à la main et comparé au chiffre affiché. Pour que le calcul à la
# main soit possible, la campagne pose un jeu de données MAÎTRISÉ sur une
# année vierge (2021), dans SA commune de test : quatre contrôles terrain, cinq
# réclamations, trois pesées, quatre demandes d'enlèvement — et vérifie chaque
# valeur rendue. Le test de sortie du lot 1 l'exige : « les 19 indicateurs se
# calculent comme avant : mêmes valeurs sur le jeu maîtrisé ».
#
# LA RÈGLE D'OR : une donnée manquante n'est pas un zéro. Elle est vérifiée
# avant toute saisie (tout est « non renseigné », rien ne vaut 0) et après
# (une valeur retirée redevient « non renseignée »).
#
#   docker compose exec -T api npm run test:kpi-5-axes
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
# ind <code> <champ> — un champ d'un indicateur dans la dernière réponse 5-axes.
ind() { val "next((i['$2'] for i in d['indicateurs'] if i['code']=='$1'), 'absent')"; }
axes() { req GET "/kpi/5-axes?communeId=$TC&annee=$AN" >/dev/null; }

AN=2021
AN_COURANT=$(TZ=Africa/Tunis date +%Y)
TC=test_kpi_5_axes
COMMUNE_DIR="$TC"
. tests/outils/directeur_temporaire.sh
nettoyer() {
  $PSQL -c "DELETE FROM declarations_indicateurs WHERE commune_id = '$TC';" \
        -c "DELETE FROM parametres_commune WHERE commune_id = '$TC';" \
        -c "DELETE FROM controles_terrain WHERE commune_id = '$TC';" \
        -c "DELETE FROM circuits WHERE commune_id = '$TC';" \
        -c "DELETE FROM tickets WHERE commune_id = '$TC';" \
        -c "DELETE FROM pesees WHERE commune_id = '$TC';" \
        -c "DELETE FROM demandes_enlevement WHERE commune_id = '$TC';" \
        -c "DELETE FROM effectifs_service WHERE commune_id = '$TC';" \
        -c "DELETE FROM interventions_maintenance WHERE commune_id = '$TC';" \
        -c "DELETE FROM vehicules WHERE commune_id = '$TC';" \
        -c "DELETE FROM gouvernorats_district WHERE gouvernorat = 'TEST'; DELETE FROM districts_fnct WHERE code LIKE 'test-%';" \
        -c "UPDATE parametres_kpi SET valeur = 80 WHERE cle = 'taux_resolution_min';" >/dev/null 2>&1
}
fin() {
  nettoyer
  retirer_directeur_temporaire
  $PSQL -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
  rm -rf "$T"
}
# Le seuil de résolution est réglé par la FNCT pendant la campagne. La campagne rend la
# valeur ; la ligne entière, date et auteur compris, est gardée ici et rendue en
# partant (JC-013, tests/outils/tables_nationales.sh).
. "$(dirname "$0")/outils/tables_nationales.sh"
garder_tables_nationales parametres_kpi districts_fnct gouvernorats_district
nettoyer
$PSQL -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune des indicateurs', 'TEST', 'TEST', 10000);" >/dev/null
directeur_temporaire "$TC"
trap fin EXIT
T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_DIR" ] && [ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
FNCT_ID=$(sql "SELECT id FROM users WHERE email = 'admin.national@siipi.tn'")
# Une commune réelle, pour le cloisonnement : on n'y écrit rien, on vérifie
# seulement qu'elle reste introuvable pour le directeur de test.
AUTRE=$(sql "SELECT id FROM communes WHERE id <> '$TC' AND NOT est_demo AND deleted_at IS NULL ORDER BY id LIMIT 1")
DECL="/kpi/declarations/$TC/$AN"

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "le classement national n'existe plus" 404 "$(req GET "/kpi/concours-national?annee=$AN" "" "$T_FNCT")"
chk "ni le barème" 404 "$(req PUT /kpi/bareme '{"points":{}}' "$T_FNCT")"
chk "ni la fiche d'évaluation à valider" 404 "$(req GET "/kpi/evaluations/$TC/$AN")"
chk "un seuil de classement n'est plus un paramètre" 400 "$(req PUT /kpi/parametres '{"couverture_classement_min":60}' "$T_FNCT")"
chk "un taux au-dessus de 100 % est refusé" 400 "$(req PUT "$DECL" '{"valeurs":{"M2-4":{"valeur":120}}}')"
chk "un ratio sans cible est refusé" 400 "$(req PUT "$DECL" '{"valeurs":{"M1-1":{"valeur":8000}}}')"
chk "un indicateur calculé ne se déclare pas" 400 "$(req PUT "$DECL" '{"valeurs":{"M1-2":{"valeur":100}}}')"
chk "un code inconnu non plus" 400 "$(req PUT "$DECL" '{"valeurs":{"M9-9":{"valeur":1}}}')"
chk "la FNCT ne déclare pas à la place de la commune" 403 \
    "$(req PUT "$DECL" '{"valeurs":{"M2-4":{"valeur":50}}}' "$T_FNCT")"
chk "… ni en SQL direct : la base le refuse" t \
    "$($PSQL -c "SET app.role = 'super_admin_fnct'; SET app.user_id = '$FNCT_ID'; SET ROLE siipi_app;
                 INSERT INTO declarations_indicateurs (commune_id, indicateur_code, annee, valeur) VALUES ('$TC', 'M2-4', $AN, 50);" 2>&1 \
       | grep -q 'row-level security' && echo t || echo f)"
chk "la base refuse un taux au-dessus de 100 %, même en SQL direct" t \
    "$($PSQL -c "INSERT INTO declarations_indicateurs (commune_id, indicateur_code, annee, valeur) VALUES ('$TC', 'M2-4', $AN, 120);" 2>&1 \
       | grep -q 'DECLARATION_TAUX' && echo t || echo f)"
chk "et la déclaration d'un indicateur calculé" t \
    "$($PSQL -c "INSERT INTO declarations_indicateurs (commune_id, indicateur_code, annee, valeur) VALUES ('$TC', 'M1-2', $AN, 50);" 2>&1 \
       | grep -q 'DECLARATION_INDICATEUR_CALCULE' && echo t || echo f)"
chk "la commune ne commente pas une déclaration (réservé à la FNCT)" 403 \
    "$(req POST /kpi/commentaires-fnct/00000000-0000-0000-0000-000000000000 '{"commentaire":"TEST"}')"
chk "aucune déclaration n'est entrée" 0 "$(sql "SELECT count(*) FROM declarations_indicateurs WHERE commune_id = '$TC'")"

# -----------------------------------------------------------------------------
echo
echo "2. LA RÈGLE D'OR — avant toute donnée, rien ne vaut zéro"
chk "les 5 axes de $AN se calculent" 200 "$(axes; echo 200)"
chk "sans contrôle terrain, la couverture des circuits est « non renseignée »" "non_renseigne|None" "$(ind M1-2 statut)|$(ind M1-2 valeur)"
chk "sans réclamation, leur traitement aussi" "non_renseigne|None" "$(ind M3-1 statut)|$(ind M3-1 taux_atteinte)"
chk "sans pesée, le tonnage n'est pas 0 : il est absent" "non_renseigne|None" "$(ind TONNAGE_T statut)|$(ind TONNAGE_T valeur)"
chk "les accidents non saisis ne valent pas « zéro accident »" "non_renseigne|None" "$(ind RH-ACCIDENTS statut)|$(ind RH-ACCIDENTS valeur)"
chk "aucun indicateur non renseigné ne porte de taux d'atteinte" 0 \
    "$(val "sum(1 for i in d['indicateurs'] if i['statut']=='non_renseigne' and i['taux_atteinte'] is not None)")"
chk "le coût global à la tonne dit ce qui lui manque" "None|1" \
    "$(ind COUT_TONNE valeur)|$(val "1 if 'carburant' in next(i for i in d['indicateurs'] if i['code']=='COUT_TONNE')['detail']['manquent'] else 0")"
chk "plus de note ni de points : ni « concours », ni « points » dans la réponse" "0|0" \
    "$(val "int('concours' in d)")|$(val "sum(1 for i in d['indicateurs'] for k in i if 'point' in k or k == 'note')")"
chk "la couverture se dit en clair : 0 indicateur calculable sur 19" "0|19" \
    "$(val "d['couverture']['calculables']")|$(val "d['couverture']['total']")"

# -----------------------------------------------------------------------------
echo
echo "3. Le jeu de données maîtrisé de $AN — les mêmes valeurs qu'avant le retrait"
CIRCUIT=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage) VALUES ('$TC', 'TEST-J8 circuit', '{1}') RETURNING id")
$PSQL -c "INSERT INTO controles_terrain (circuit_id, commune_id, date_controle, etat, controle_par) VALUES
  ('$CIRCUIT','$TC','$AN-03-01','fait','$DIR_ID'), ('$CIRCUIT','$TC','$AN-03-02','fait','$DIR_ID'),
  ('$CIRCUIT','$TC','$AN-03-03','partiel','$DIR_ID'), ('$CIRCUIT','$TC','$AN-03-04','non_fait','$DIR_ID');" >/dev/null
$PSQL -c "INSERT INTO tickets (ticket_number, commune_id, category, title, status, created_at, resolved_at) VALUES
  ('TEST-J8-1','$TC','point_noir','TEST-J8','resolu','$AN-04-01 08:00+01','$AN-04-03 08:00+01'),
  ('TEST-J8-2','$TC','point_noir','TEST-J8','resolu','$AN-04-01 08:00+01','$AN-04-03 08:00+01'),
  ('TEST-J8-3','$TC','point_noir','TEST-J8','resolu','$AN-04-01 08:00+01','$AN-04-11 08:00+01'),
  ('TEST-J8-4','$TC','point_noir','TEST-J8','recu','$AN-04-01 08:00+01',NULL),
  ('TEST-J8-5','$TC','point_noir','TEST-J8','rejete','$AN-04-01 08:00+01',NULL);" >/dev/null
$PSQL -c "INSERT INTO pesees (commune_id, date_pesee, type_dechet, poids_net_kg, vehicule_immat, observation) VALUES
  ('$TC','$AN-01-10','menager',24000,'TEST-J8','TEST-J8'), ('$TC','$AN-01-11','tri',5000,'TEST-J8','TEST-J8'),
  ('$TC','$AN-01-12','vert',1000,'TEST-J8','TEST-J8');" >/dev/null
$PSQL -c "INSERT INTO demandes_enlevement (numero, commune_id, type_dechet, statut, created_at) VALUES
  ('TEST-J8-1','$TC','vert','realisee','$AN-05-01'), ('TEST-J8-2','$TC','ddc','orientee_collecteur','$AN-05-01'),
  ('TEST-J8-3','$TC','vert','planifiee','$AN-05-01'), ('TEST-J8-4','$TC','vert','annulee','$AN-05-01'),
  ('TEST-J8-5','$TC','encombrant','recue','$AN-05-01');" >/dev/null
axes
# Recalculés à la main :
#   M1-2 : (2 faits + ½ partiel) / 4 contrôles = 62,5 %
#   M3-1 : 3 résolues / 4 (hors rejetée) = 75 % ; 2 sur 3 dans le délai de 7 jours
#          → taux d'atteinte (0,75 + 0,667) / 2 = 0,708 ; délai moyen (2 + 2 + 10) / 3 = 4,7 j
#   M1-5 : 2 traitées (réalisée, orientée) / 3 (hors annulée, hors encombrant) = 66,7 %
#   TONNAGE_T : 30 t ; DMA-4 : (5 000 tri + 1 000 vert) / 30 000 = 20 %
#   KG_HAB_J : 30 000 kg / 10 000 habitants / 31 jours de janvier
chk "couverture des circuits : 62,5 %" "62.5|0.625" "$(ind M1-2 valeur)|$(ind M1-2 taux_atteinte)"
chk "réclamations : 75 % résolues, taux d'atteinte 0,708, délai moyen 4,7 jours" "75|0.708|4.7" \
    "$(ind M3-1 valeur)|$(val "round(next(i for i in d['indicateurs'] if i['code']=='M3-1')['taux_atteinte'],3)")|$(ind DELAI_MOYEN_J valeur)"
chk "la réclamation rejetée n'est pas comptée" 4 "$(ind RECLAMATIONS valeur)"
chk "déchets verts et DDC : 66,7 % traités (ni l'annulée, ni l'encombrant)" "66.7" "$(ind M1-5 valeur)"
chk "tonnage : 30 t ; part collectée séparément : 20 %" "30|20" "$(ind TONNAGE_T valeur)|$(ind DMA-4 valeur)"
chk "production par habitant, sur les 31 jours de janvier" "$(python3 -c "print(round(30000/10000/31,3))")" "$(ind KG_HAB_J valeur)"
chk "chaque valeur calculée porte la source « mesuré »" "mesure|mesure" "$(ind M1-2 source)|$(ind TONNAGE_T source)"

# -----------------------------------------------------------------------------
echo
echo "4. Les déclarations : elles valent dès qu'elles sont enregistrées (D3)"
chk "la commune déclare, sans brouillon ni soumission" 200 \
    "$(req PUT "$DECL" '{"profil":{"a_abattoir":false,"decharge_controlee_anged":true},
      "valeurs":{"M1-1":{"valeur":8000,"cible":10000},"M1-9":{"valeur":3,"cible":10},"M2-4":{"valeur":90},
                 "M1-4":{"valeur":70},"M1-6":{"valeur":40,"cible":50},"M2-1":{"valeur":80},"M2-2":{"valeur":30,"cible":60},
                 "M2-3":{"valeur":85},"M3-2":{"valeur":4,"cible":4},"M3-4":{"valeur":2,"cible":8},
                 "DMA-1":{"valeur":25,"cible":100},"RH-ACCIDENTS":{"valeur":0}}}')"
axes
chk "la valeur s'affiche tout de suite, badge « déclaré », avec son auteur" "renseigne|declare|TEST Directeur de campagne" \
    "$(ind M2-4 statut)|$(ind M2-4 source)|$(val "next(i for i in d['indicateurs'] if i['code']=='M2-4')['declaration']['saisi_par']")"
chk "… et sa date de saisie" t \
    "$(val "'t' if next(i for i in d['indicateurs'] if i['code']=='M2-4')['declaration']['saisi_le'] else 'f'")"
chk "balayage : 8 000 / 10 000 ml = 0,8 ; bâchage : 3 / 10 = 0,3" "0.8|0.3" "$(ind M1-1 taux_atteinte)|$(ind M1-9 taux_atteinte)"
chk "« 0 accident » déclaré est un zéro renseigné, qui s'affiche" "renseigne|0" "$(ind RH-ACCIDENTS statut)|$(ind RH-ACCIDENTS valeur)"
chk "pas d'abattoir : M2-5 est « sans objet », pas « non renseigné »" "sans_objet" "$(ind M2-5 statut)"
chk "décharge contrôlée par l'ANGeD : M1-8 est « sans objet »" "sans_objet" "$(ind M1-8 statut)"
chk "le profil est rangé dans les paramètres de la commune" "false|true" \
    "$(sql "SELECT a_abattoir || '|' || decharge_controlee_anged FROM parametres_commune WHERE commune_id = '$TC'")"
chk "la couverture, recomptée : calculables sur applicables (les sans-objet sortent du total)" \
    "$(val "sum(1 for i in d['indicateurs'] if i['famille']=='indicateur' and i['statut']=='renseigne')")|$(val "sum(1 for i in d['indicateurs'] if i['famille']=='indicateur' and i['statut']!='sans_objet')")" \
    "$(val "d['couverture']['calculables']")|$(val "d['couverture']['total']")"
chk "… soit 17 indicateurs applicables sur 19" 17 "$(val "d['couverture']['total']")"
chk "une correction remplace la déclaration : une seule en vigueur" "1|95" \
    "$(req PUT "$DECL" '{"valeurs":{"M2-4":{"valeur":95}}}' >/dev/null; sql "SELECT count(*) || '|' || max(valeur)::int FROM declarations_indicateurs WHERE commune_id = '$TC' AND indicateur_code = 'M2-4' AND deleted_at IS NULL")"
chk "… et le journal d'audit garde la précédente" 90 \
    "$(sql "SELECT (old_data->>'valeur')::numeric::int FROM audit_log WHERE table_name = 'declarations_indicateurs' AND operation = 'UPDATE'
             AND commune_id = '$TC' AND new_data->>'indicateur_code' = 'M2-4' ORDER BY id DESC LIMIT 1")"
chk "retirer une valeur la rend « non renseignée »" "non_renseigne" \
    "$(req PUT "$DECL" '{"valeurs":{"M2-4":null}}' >/dev/null; axes; ind M2-4 statut)"
chk "… par un retrait logique : la ligne reste, datée" "1|1" \
    "$(sql "SELECT count(*) || '|' || count(deleted_at) FROM declarations_indicateurs WHERE commune_id = '$TC' AND indicateur_code = 'M2-4'")"
req PUT "$DECL" '{"valeurs":{"M2-4":{"valeur":90}}}' >/dev/null

echo
echo "5. La FNCT commente, elle ne bloque pas"
ID_M19=$(sql "SELECT id FROM declarations_indicateurs WHERE commune_id = '$TC' AND indicateur_code = 'M1-9' AND deleted_at IS NULL")
chk "la FNCT commente la déclaration du bâchage" 200 \
    "$(req POST "/kpi/commentaires-fnct/$ID_M19" '{"commentaire":"TEST préciser le nombre de bennes basculantes"}' "$T_FNCT")"
axes
chk "le commentaire s'affiche à côté de la valeur, qui reste déclarée et retenue" \
    "TEST préciser le nombre de bennes basculantes|renseigne|3" \
    "$(val "next(i for i in d['indicateurs'] if i['code']=='M1-9')['declaration']['commentaire_fnct']")|$(ind M1-9 statut)|$(ind M1-9 valeur)"
chk "la commune n'écrit pas le commentaire de la FNCT, même en SQL direct" t \
    "$($PSQL -c "UPDATE declarations_indicateurs SET commentaire_fnct = 'faux' WHERE id = '$ID_M19';" 2>&1 \
       | grep -q 'DECLARATION_COMMENTAIRE_FNCT' && echo t || echo f)"
chk "une chaîne vide retire le commentaire" "None" \
    "$(req POST "/kpi/commentaires-fnct/$ID_M19" '{"commentaire":""}' "$T_FNCT" >/dev/null; axes; val "next(i for i in d['indicateurs'] if i['code']=='M1-9')['declaration']['commentaire_fnct']")"

# -----------------------------------------------------------------------------
echo
echo "6. Le coût global à la tonne"
req POST "/trucks?communeId=$TC" '{"registration":"TEST-J8 001","type":"camion","etat":"en_service"}' >/dev/null
V=$(val "d['id']")
$PSQL -c "INSERT INTO interventions_maintenance (commune_id, vehicule_id, date_intervention, type, cout_tnd, description)
          VALUES ('$TC', '$V', '$AN-02-01', 'vidange', 3650, 'TEST-J8');
          INSERT INTO effectifs_service (commune_id, annee, service, effectif_ouvriers, effectif_encadrement, masse_salariale_tnd, source, observation)
          VALUES ('$TC', $AN, 'proprete', 50, 5, 365000, 'declaratif', 'TEST-J8');" >/dev/null
axes
chk "sans carburant ni redevances, toujours non renseigné" "None" "$(ind COUT_TONNE valeur)"
req PUT "$DECL" '{"valeurs":{"ECO-CARBURANT":{"valeur":36500},"ECO-DECHARGE":{"valeur":7300}}}' >/dev/null
axes
# (365 000 + 36 500 + 3 650 + 7 300) × 31/365 jours pesés, ÷ 30 t
chk "complet : (salaires + carburant + maintenance + redevances) × 31/365 ÷ 30 t" \
    "$(python3 -c "print(round((365000+36500+3650+7300)*31/365/30,3))")" "$(ind COUT_TONNE valeur)"
chk "ratio d'encadrement 5 / 50, effectif 50" "0.1|50" "$(ind ENCADREMENT valeur)|$(ind EFFECTIF_OUVRIERS valeur)"

# -----------------------------------------------------------------------------
echo
echo "7. Les niveaux d'agrégation (A3.1) — sans classement"
req GET "/kpi/national?annee=$AN&niveau=national" "" "$T_FNCT" >/dev/null
chk "national : 30 t pesées, 75 % de réclamations résolues (recomposé des comptes)" "30|75" \
    "$(val "d[0]['tonnage_t']")|$(val "d[0]['taux_resolution']")"
chk "aucun agrégat ne porte de note ni de classement" 0 "$(val "sum(1 for g in d if 'concours' in g)")"
req GET "/kpi/national?annee=$AN&niveau=commune" "" "$T_FNCT" >/dev/null
chk "niveau commune : les axes et la couverture de la commune, sans rang" "17|0" \
    "$(val "next(c['couverture']['total'] for c in d if c['commune_id']=='$TC')")|$(val "sum(1 for c in d if 'rang' in c or 'score' in c)")"
# Le découpage officiel (D-FNCT-2) ne couvre pas le gouvernorat d'essai : sa
# commune est « non rattachée », pas glissée dans un district voisin. Le PUT,
# qui réécrit tout le découpage, est éprouvé par la campagne `districts`, qui
# le rétablit en partant ; ici, rien n'est réécrit.
chk "un gouvernorat qu'aucun district ne couvre est « non rattaché » — rien n'est inventé" "True" \
    "$(req GET "/kpi/national?annee=$AN&niveau=district" "" "$T_FNCT" >/dev/null; val "any(g['cle'] == 'non_rattache' for g in d)")"
chk "la commune ne définit pas les districts" 403 \
    "$(req PUT /kpi/districts '{"districts":[{"code":"test-nord","nom":"Nord"}],"rattachements":{},"source":"TEST source"}')"
chk "un district inconnu est refusé" 400 \
    "$(req PUT /kpi/districts '{"districts":[{"code":"test-nord","nom":"TEST Nord"}],"rattachements":{"TEST":"test-sud"},"source":"TEST source"}' "$T_FNCT")"
$PSQL -c "INSERT INTO districts_fnct (code, nom, nom_ar, ordre, source) VALUES ('test-nord', 'TEST Nord', 'TEST', 99, 'TEST source');" \
      -c "INSERT INTO gouvernorats_district (gouvernorat, district_code) VALUES ('TEST', 'test-nord');" >/dev/null
chk "un gouvernorat rattaché compte dans son district" "test-nord" \
    "$(req GET "/kpi/national?annee=$AN&niveau=district" "" "$T_FNCT" >/dev/null; val "next(g['cle'] for g in d if g['cle']=='test-nord')")"

# -----------------------------------------------------------------------------
echo
echo "8. La préparation au décret DMA"
req GET "/kpi/dma?annee=$AN&niveau=commune" "" "$T_FNCT" >/dev/null
chk "le décret n'est pas en vigueur, et l'écran le sait" "False" "$(val "d['en_vigueur']")"
chk "indice (25 % conteneurs + 20 % collecte séparée) / 2 = 22,5 : niveau initial" "22.5|initial" \
    "$(val "next(l['dma']['indice'] for l in d['lignes'] if l['commune_id']=='$TC')")|$(val "next(l['dma']['niveau'] for l in d['lignes'] if l['commune_id']=='$TC')")"

# -----------------------------------------------------------------------------
echo
echo "9. Les alertes (A3.3) et « À vérifier »"
req GET "/kpi/alertes?annee=$AN" "" "$T_FNCT" >/dev/null
chk "la réclamation en attente depuis plus de 48 h est signalée" 1 \
    "$(val "sum(1 for a in d if a['commune_id']=='$TC' and a['code']=='reclamations_en_attente')")"
chk "le bâchage à 30 % sous le seuil de 80 % aussi" 1 \
    "$(val "sum(1 for a in d if a['commune_id']=='$TC' and a['code']=='bachage_insuffisant')")"
chk "plus aucune « fiche à valider »" 0 "$(val "sum(1 for a in d if a['code']=='fiche_a_valider')")"
chk "un seuil relevé par la FNCT change les alertes" 1 \
    "$(req PUT /kpi/parametres '{"taux_resolution_min":90}' "$T_FNCT" >/dev/null; req GET "/kpi/alertes?annee=$AN" "" "$T_FNCT" >/dev/null; val "sum(1 for a in d if a['commune_id']=='$TC' and a['code']=='resolution_faible')")"
req PUT "/kpi/declarations/$TC/$AN_COURANT" '{"valeurs":{"M1-9":{"valeur":2,"cible":10}}}' >/dev/null
chk "un bâchage déclaré sous le seuil pour l'année en cours remonte dans « À vérifier »" 1 \
    "$(req GET "/communes/$TC/coherence" >/dev/null; val "sum(1 for e in d if e['domaine']=='kpi')")"

# -----------------------------------------------------------------------------
echo
echo "10. Cloisonnement"
chk "une commune ne lit pas les indicateurs d'une autre (404)" 404 "$(req GET "/kpi/5-axes?communeId=$AUTRE&annee=$AN")"
chk "ni ses déclarations, ni n'y déclare" "404|404" \
    "$(req GET "/kpi/declarations/$AUTRE/$AN")|$(req PUT "/kpi/declarations/$AUTRE/$AN" '{"profil":{"a_abattoir":true}}')"
chk "les vues nationales et les alertes sont à la FNCT" "403|403" \
    "$(req GET "/kpi/national?annee=$AN")|$(req GET "/kpi/alertes?annee=$AN")"
chk "la FNCT ouvre les indicateurs et les déclarations de n'importe quelle commune (A2.3)" "200|200" \
    "$(req GET "/kpi/5-axes?communeId=$TC&annee=$AN" "" "$T_FNCT")|$(req GET "$DECL" "" "$T_FNCT")"
# Un prestataire temporaire de la commune de test (JC-011) : la campagne
# empruntait le premier prestataire de la base, et sautait ce contrôle sans lui.
. tests/outils/comptes_temporaires.sh
compte_temporaire gestionnaire_prestataire "$TC" "Prestataire des indicateurs"
PREST=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); PREST_ID=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$TC" "Autre prestataire des indicateurs"; AUTRE_PREST_ID=$COMPTE_ID
# Un circuit confié à chacun : sans ligne à lui, « ses seules lignes » se
# vérifierait sur une liste vide, donc sur rien.
$PSQL -c "INSERT INTO circuits (commune_id, nom, prestataire_id) VALUES
            ('$TC', 'TEST circuit du prestataire', '$PREST_ID'),
            ('$TC', 'TEST circuit de l''autre prestataire', '$AUTRE_PREST_ID');" >/dev/null
ajouter_a_la_sortie "\$PSQL -c \"DELETE FROM circuits WHERE commune_id = '$TC' AND nom LIKE 'TEST circuit %prestataire';\" >/dev/null 2>&1; retirer_comptes_temporaires"
rendre_tables_nationales_en_sortie
chk "le prestataire temporaire se connecte" t "$([ -n "$PREST" ] && echo t || echo f)"
chk "le prestataire a son tableau restreint : sa ligne, aucune de l'autre prestataire (B7.4)" "200|1|0" \
    "$(req GET /kpi/prestataire "" "$PREST")|$(val "sum(1 for l in d['lignes'] if l['prestataire_id']=='$PREST_ID')")|$(val "sum(1 for l in d['lignes'] if l['prestataire_id']!='$PREST_ID')")"
chk "et rien des indicateurs de la commune" 403 "$(req GET "/kpi/5-axes?communeId=$TC" "" "$PREST")"

# -----------------------------------------------------------------------------
echo
echo "11. Le mot a disparu (test de sortie du lot 1, § 1.5)"
# Hors les migrations déjà appliquées, qu'on ne réécrit pas, et celle du retrait,
# qui doit nommer ce qu'elle retire.
chk "plus aucun « concours » dans le code de l'API, ses migrations nouvelles et ses campagnes" 0 \
    "$(grep -rli concours src migrations tests seed 2>/dev/null \
       | grep -v -e 'migrations/050_' -e 'migrations/055_' -e 'migrations/063_' -e 'migrations/068_retrait_concours' -e 'tests/kpi-5-axes.sh' | wc -l)"
chk "ni dans le contrat d'API servi" 0 "$(curl -s "$API/openapi.json" | grep -ci concours)"
chk "le catalogue ne connaît plus que des indicateurs, sans points" "dma,donnee,indicateur|0" \
    "$(req GET /kpi/indicateurs >/dev/null; val "','.join(sorted({i['famille'] for i in d['indicateurs']}))")|$(val "sum(1 for i in d['indicateurs'] if 'points' in i)")"

echo
echo "Les tables nationales rendues ligne pour ligne, dates comprises (JC-013)"
rendre_tables_nationales
tables_nationales_rendues "en partant"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
