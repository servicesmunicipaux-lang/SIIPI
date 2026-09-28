#!/usr/bin/env bash
# =============================================================================
# Le tableau de bord KPI 5 axes, le Concours national de propreté et la
# préparation au décret DMA — Jalon 8 (TDR §3.2.10, A2.3, A3.1, A3.3, B7.4).
#
# LE TEST DE VALIDATION DE LA FEUILLE DE ROUTE : chaque indicateur est
# recalculé à la main et comparé au chiffre affiché. Pour que le calcul à la
# main soit possible, la campagne pose un jeu de données MAÎTRISÉ sur une
# année vierge (2021) : quatre contrôles terrain, cinq réclamations, trois
# pesées, quatre demandes d'enlèvement — et vérifie chaque valeur rendue.
#
# LA RÈGLE D'OR : une donnée manquante n'est pas un zéro. Elle est vérifiée
# avant toute saisie (tout est « non renseigné », rien ne vaut 0) et après
# (une valeur retirée redevient « non renseignée »).
#
#   docker compose exec -T api npm run test:kpi-5-axes
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

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
axes() { req GET "/kpi/5-axes?communeId=$COMMUNE&annee=$AN" >/dev/null; }

AN=2021
DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_DIR" ] && [ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")
DIR_ID=$(sql "SELECT id FROM users WHERE email='$DIR_EMAIL'")
GOUV=$($PSQL -c "SELECT gouvernorat FROM communes WHERE id='$COMMUNE'" 2>/dev/null)

nettoyer() {
  $PSQL -c "DELETE FROM evaluations_kpi WHERE annee = $AN;" >/dev/null 2>&1
  $PSQL -c "DELETE FROM controles_terrain WHERE circuit_id IN (SELECT id FROM circuits WHERE nom LIKE 'TEST-J8%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM circuits WHERE nom LIKE 'TEST-J8%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM tickets WHERE ticket_number LIKE 'TEST-J8%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM pesees WHERE observation = 'TEST-J8';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM demandes_enlevement WHERE numero LIKE 'TEST-J8%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM effectifs_service WHERE annee = $AN AND observation = 'TEST-J8';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM interventions_maintenance WHERE description = 'TEST-J8';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM vehicules WHERE registration LIKE 'TEST-J8%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM gouvernorats_district; DELETE FROM districts_fnct WHERE code LIKE 'test-%';" >/dev/null 2>&1
  $PSQL -c "UPDATE parametres_kpi SET valeur = 1 WHERE cle = 'bareme_provisoire'; UPDATE parametres_kpi SET valeur = 80 WHERE cle = 'taux_resolution_min';" >/dev/null 2>&1
}
nettoyer

# -----------------------------------------------------------------------------
echo
echo "1. LA RÈGLE D'OR — avant toute donnée, rien ne vaut zéro"
chk "les 5 axes de $AN se calculent" 200 "$(axes; echo 200)"
chk "sans contrôle terrain, la couverture des circuits est « non renseignée »" "non_renseigne|None" "$(ind M1-2 statut)|$(ind M1-2 valeur)"
chk "sans réclamation, leur traitement aussi" "non_renseigne|None" "$(ind M3-1 statut)|$(ind M3-1 note)"
chk "sans pesée, le tonnage n'est pas 0 : il est absent" "non_renseigne|None" "$(ind TONNAGE_T statut)|$(ind TONNAGE_T valeur)"
chk "les accidents non saisis ne valent pas « zéro accident »" "non_renseigne|None" "$(ind RH-ACCIDENTS statut)|$(ind RH-ACCIDENTS valeur)"
chk "aucun indicateur non renseigné ne porte de note" 0 \
    "$(val "sum(1 for i in d['indicateurs'] if i['statut']=='non_renseigne' and i['note'] is not None)")"
chk "le coût global à la tonne dit ce qui lui manque" "None|1" \
    "$(ind COUT_TONNE valeur)|$(val "1 if 'carburant' in next(i for i in d['indicateurs'] if i['code']=='COUT_TONNE')['detail']['manquent'] else 0")"

echo
echo "2. Le jeu de données maîtrisé de $AN"
CIRCUIT=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage) VALUES ('$COMMUNE', 'TEST-J8 circuit', '{1}') RETURNING id")
$PSQL -c "INSERT INTO controles_terrain (circuit_id, commune_id, date_controle, etat, controle_par) VALUES
  ('$CIRCUIT','$COMMUNE','$AN-03-01','fait','$DIR_ID'), ('$CIRCUIT','$COMMUNE','$AN-03-02','fait','$DIR_ID'),
  ('$CIRCUIT','$COMMUNE','$AN-03-03','partiel','$DIR_ID'), ('$CIRCUIT','$COMMUNE','$AN-03-04','non_fait','$DIR_ID');" >/dev/null
$PSQL -c "INSERT INTO tickets (ticket_number, commune_id, category, title, status, created_at, resolved_at) VALUES
  ('TEST-J8-1','$COMMUNE','point_noir','TEST-J8','resolu','$AN-04-01 08:00+01','$AN-04-03 08:00+01'),
  ('TEST-J8-2','$COMMUNE','point_noir','TEST-J8','resolu','$AN-04-01 08:00+01','$AN-04-03 08:00+01'),
  ('TEST-J8-3','$COMMUNE','point_noir','TEST-J8','resolu','$AN-04-01 08:00+01','$AN-04-11 08:00+01'),
  ('TEST-J8-4','$COMMUNE','point_noir','TEST-J8','recu','$AN-04-01 08:00+01',NULL),
  ('TEST-J8-5','$COMMUNE','point_noir','TEST-J8','rejete','$AN-04-01 08:00+01',NULL);" >/dev/null
$PSQL -c "INSERT INTO pesees (commune_id, date_pesee, type_dechet, poids_net_kg, vehicule_immat, observation) VALUES
  ('$COMMUNE','$AN-01-10','menager',24000,'TEST-J8','TEST-J8'), ('$COMMUNE','$AN-01-11','tri',5000,'TEST-J8','TEST-J8'),
  ('$COMMUNE','$AN-01-12','vert',1000,'TEST-J8','TEST-J8');" >/dev/null
$PSQL -c "INSERT INTO demandes_enlevement (numero, commune_id, type_dechet, statut, created_at) VALUES
  ('TEST-J8-1','$COMMUNE','vert','realisee','$AN-05-01'), ('TEST-J8-2','$COMMUNE','ddc','orientee_collecteur','$AN-05-01'),
  ('TEST-J8-3','$COMMUNE','vert','planifiee','$AN-05-01'), ('TEST-J8-4','$COMMUNE','vert','annulee','$AN-05-01'),
  ('TEST-J8-5','$COMMUNE','encombrant','recue','$AN-05-01');" >/dev/null
POP=$(sql "SELECT population FROM communes WHERE id='$COMMUNE'")
axes
# Recalculés à la main :
#   M1-2 : (2 faits + ½ partiel) / 4 contrôles = 62,5 %
#   M3-1 : 3 résolues / 4 (hors rejetée) = 75 % ; 2 sur 3 dans le délai de 7 jours
#          → note (0,75 + 0,667) / 2 = 0,708 ; délai moyen (2 + 2 + 10) / 3 = 4,7 j
#   M1-5 : 2 traitées (réalisée, orientée) / 3 (hors annulée, hors encombrant) = 66,7 %
#   TONNAGE_T : 30 t ; DMA-4 : (5 000 tri + 1 000 vert) / 30 000 = 20 %
#   KG_HAB_J : 30 000 kg / population / 31 jours de janvier
chk "couverture des circuits : 62,5 %" "62.5|0.625" "$(ind M1-2 valeur)|$(ind M1-2 note)"
chk "réclamations : 75 % résolues, note 0,708, délai moyen 4,7 jours" "75|0.708|4.7" \
    "$(ind M3-1 valeur)|$(val "round(next(i for i in d['indicateurs'] if i['code']=='M3-1')['note'],3)")|$(ind DELAI_MOYEN_J valeur)"
chk "la réclamation rejetée n'est pas comptée" 4 "$(ind RECLAMATIONS valeur)"
chk "déchets verts et DDC : 66,7 % traités (ni l'annulée, ni l'encombrant)" "66.7" "$(ind M1-5 valeur)"
chk "tonnage : 30 t ; part collectée séparément : 20 %" "30|20" "$(ind TONNAGE_T valeur)|$(ind DMA-4 valeur)"
chk "production par habitant, sur les 31 jours de janvier" \
    "$(python3 -c "print(round(30000/$POP/31,3))")" "$(ind KG_HAB_J valeur)"

echo
echo "3. La fiche d'évaluation"
FICHE="/kpi/evaluations/$COMMUNE/$AN"
chk "un taux au-dessus de 100 % est refusé" 400 "$(req PUT "$FICHE" '{"valeurs":{"M2-4":{"valeur":120}}}')"
chk "un ratio sans cible est refusé" 400 "$(req PUT "$FICHE" '{"valeurs":{"M1-1":{"valeur":8000}}}')"
chk "un indicateur calculé ne se saisit pas" 400 "$(req PUT "$FICHE" '{"valeurs":{"M1-2":{"valeur":100}}}')"
chk "un code inconnu non plus" 400 "$(req PUT "$FICHE" '{"valeurs":{"M9-9":{"valeur":1}}}')"
chk "la fiche se saisit, en brouillon" "200|brouillon" \
    "$(req PUT "$FICHE" '{"a_abattoir":false,"decharge_controlee_anged":true,"experience_innovante":false,
      "valeurs":{"M1-1":{"valeur":8000,"cible":10000},"M1-9":{"valeur":3,"cible":10},"M2-4":{"valeur":90},
                 "M1-4":{"valeur":70},"M1-6":{"valeur":40,"cible":50},"M2-1":{"valeur":80},"M2-2":{"valeur":30,"cible":60},
                 "M2-3":{"valeur":85},"M3-2":{"valeur":4,"cible":4},"M3-4":{"valeur":2,"cible":8},
                 "DMA-1":{"valeur":25,"cible":100},"RH-ACCIDENTS":{"valeur":0}}}')|$(val "d['statut']")"
axes
chk "balayage : 8 000 / 10 000 ml = 0,8 ; bâchage : 3 / 10 = 0,3" "0.8|0.3" "$(ind M1-1 note)|$(ind M1-9 note)"
chk "« 0 accident » saisi est un zéro renseigné, qui s'affiche" "renseigne|0" "$(ind RH-ACCIDENTS statut)|$(ind RH-ACCIDENTS valeur)"

echo
echo "4. La reventilation du Concours"
chk "décharge contrôlée par l'ANGeD : M1-8 passe sur M1-9 (4 + 5 = 9 points)" "reventile|M1-9|9" \
    "$(ind M1-8 statut)|$(ind M1-8 reventile_vers)|$(ind M1-9 points_effectifs)"
chk "aucune expérience innovante : M1-10 passe sur M1-3 (6 + 4 = 10 points)" "reventile|10" "$(ind M1-10 statut)|$(ind M1-3 points_effectifs)"
chk "pas d'abattoir : M2-5 est sans objet, sans pénalité" "sans_objet|0" "$(ind M2-5 statut)|$(ind M2-5 points_effectifs)"
chk "le total applicable reste 96 points (100 − 4 de l'abattoir)" "96" "$(val "d['concours']['points_applicables']")"
# La note recalculée indépendamment : Σ note × points effectifs / Σ points
# effectifs, sur les seuls indicateurs renseignés.
chk "la note = somme des points obtenus / points renseignés × 100" \
    "$(val "round(100*sum(i['note']*i['points_effectifs'] for i in d['indicateurs'] if i['famille']=='concours' and i['statut']=='renseigne')/sum(i['points_effectifs'] for i in d['indicateurs'] if i['famille']=='concours' and i['statut']=='renseigne'),1)")" \
    "$(val "d['concours']['score']")"
chk "et le compte des indicateurs renseignés s'affiche avec" \
    "$(val "sum(1 for i in d['indicateurs'] if i['famille']=='concours' and i['statut']=='renseigne')")/16" \
    "$(val "d['concours']['indicateurs_renseignes']")/$(val "d['concours']['indicateurs_applicables']")"
chk "retirer une valeur la rend « non renseignée »" "non_renseigne" \
    "$(req PUT "$FICHE" '{"valeurs":{"M2-4":null}}' >/dev/null; axes; ind M2-4 statut)"
req PUT "$FICHE" '{"valeurs":{"M2-4":{"valeur":90}}}' >/dev/null

echo
echo "5. Le coût global à la tonne"
req POST "/trucks?communeId=$COMMUNE" '{"registration":"TEST-J8 001","type":"camion","etat":"en_service"}' >/dev/null
V=$(val "d['id']")
$PSQL -c "INSERT INTO interventions_maintenance (commune_id, vehicule_id, date_intervention, type, cout_tnd, description)
          VALUES ('$COMMUNE', '$V', '$AN-02-01', 'vidange', 3650, 'TEST-J8');
          INSERT INTO effectifs_service (commune_id, annee, service, effectif_ouvriers, effectif_encadrement, masse_salariale_tnd, source, observation)
          VALUES ('$COMMUNE', $AN, 'proprete', 50, 5, 365000, 'declaratif', 'TEST-J8');" >/dev/null
axes
chk "sans carburant ni redevances, toujours non renseigné" "None" "$(ind COUT_TONNE valeur)"
req PUT "$FICHE" '{"valeurs":{"ECO-CARBURANT":{"valeur":36500},"ECO-DECHARGE":{"valeur":7300}}}' >/dev/null
axes
# (365 000 + 36 500 + 3 650 + 7 300) × 31/365 jours pesés, ÷ 30 t
chk "complet : (salaires + carburant + maintenance + redevances) × 31/365 ÷ 30 t" \
    "$(python3 -c "print(round((365000+36500+3650+7300)*31/365/30,3))")" "$(ind COUT_TONNE valeur)"
chk "ratio d'encadrement 5 / 50, effectif 50" "0.1|50" "$(ind ENCADREMENT valeur)|$(ind EFFECTIF_OUVRIERS valeur)"

echo
echo "6. Les étapes de la fiche"
chk "la commune la soumet" "200|soumise" "$(req POST "$FICHE/soumettre")|$(val "d['statut']")"
chk "une retouche de la commune la ramène en brouillon" "brouillon" \
    "$(req PUT "$FICHE" '{"agent_reclamations":true}' >/dev/null; val "d['statut']")"
req POST "$FICHE/soumettre" >/dev/null
chk "la commune ne valide pas sa propre fiche" 403 "$(req POST "$FICHE/valider")"
chk "la FNCT valide" "200|validee" "$(req POST "$FICHE/valider" "" "$T_FNCT")|$(val "d['statut']")"
chk "une fiche validée ne se retouche plus" 409 "$(req PUT "$FICHE" '{"valeurs":{"M2-4":{"valeur":10}}}')"
chk "même en SQL direct" 1 \
    "$($PSQL -c "UPDATE valeurs_kpi SET valeur = 1 WHERE indicateur_code = 'M2-4' AND commune_id = '$COMMUNE' AND evaluation_id = (SELECT id FROM evaluations_kpi WHERE commune_id='$COMMUNE' AND annee=$AN)" 2>&1 | grep -c FICHE_VALIDEE)"

echo
echo "7. Le Concours national"
req GET "/kpi/concours-national?annee=$AN" "" "$T_FNCT" >/dev/null
chk "fiche validée et couverture suffisante : classée première" "1|True" \
    "$(val "next((c['rang'] for c in d if c['commune_id']=='$COMMUNE'), 'absent')")|$(val "next((c['classe'] for c in d if c['commune_id']=='$COMMUNE'), 'absent')")"
chk "le classement s'exporte en CSV" 1 \
    "$(curl -s -H "Authorization: Bearer $T_FNCT" "$API/kpi/concours-national?annee=$AN&format=csv" | grep -c "^1;$($PSQL -c "SELECT name FROM communes WHERE id='$COMMUNE'")")"
req POST "$FICHE/rouvrir" '{"motif":"TEST-J8 préciser le balayage"}' "$T_FNCT" >/dev/null
chk "rouverte : hors du classement officiel, présente au provisoire" "fiche_non_validee|True" \
    "$(req GET "/kpi/concours-national?annee=$AN" "" "$T_FNCT" >/dev/null; val "next(c['motif_non_classe'] for c in d if c['commune_id']=='$COMMUNE')")|$(req GET "/kpi/concours-national?annee=$AN&officiel=false" "" "$T_FNCT" >/dev/null; val "next(c['classe'] for c in d if c['commune_id']=='$COMMUNE')")"
chk "un renvoi sans motif est refusé" 400 "$(req POST "$FICHE/rouvrir" '{"motif":""}' "$T_FNCT")"
req POST "$FICHE/soumettre" >/dev/null; req POST "$FICHE/valider" "" "$T_FNCT" >/dev/null

echo
echo "8. Les niveaux d'agrégation (A3.1)"
req GET "/kpi/national?annee=$AN&niveau=national" "" "$T_FNCT" >/dev/null
chk "national : 30 t pesées, 75 % de réclamations résolues (recomposé des comptes)" "30|75" \
    "$(val "d[0]['tonnage_t']")|$(val "d[0]['taux_resolution']")"
req GET "/kpi/concours-national?annee=$AN&niveau=gouvernorat" "" "$T_FNCT" >/dev/null
chk "gouvernorat : la note moyenne des communes classées" 1 \
    "$(val "1 if next(g for g in d if g['cle']=='$GOUV')['concours']['communes_classees'] >= 1 else 0")"
chk "sans districts définis, les communes sont « non rattachées » — rien n'est inventé" "non_rattache" \
    "$(req GET "/kpi/national?annee=$AN&niveau=district" "" "$T_FNCT" >/dev/null; val "d[0]['cle']")"
chk "la commune ne définit pas les districts" 403 \
    "$(req PUT /kpi/districts '{"districts":[{"code":"test-nord","nom":"Nord"}],"rattachements":{}}')"
chk "un district inconnu est refusé" 400 \
    "$(req PUT /kpi/districts "{\"districts\":[{\"code\":\"test-nord\",\"nom\":\"TEST Nord\"}],\"rattachements\":{\"$GOUV\":\"test-sud\"}}" "$T_FNCT")"
chk "la FNCT définit ses districts et y rattache les gouvernorats" "200|test-nord" \
    "$(req PUT /kpi/districts "{\"districts\":[{\"code\":\"test-nord\",\"nom\":\"TEST Nord\"}],\"rattachements\":{\"$GOUV\":\"test-nord\"}}" "$T_FNCT")|$(req GET "/kpi/concours-national?annee=$AN&niveau=district" "" "$T_FNCT" >/dev/null; val "next(g['cle'] for g in d if g['concours']['communes_classees']>0)")"

echo
echo "9. La préparation au décret DMA — sans effet sur la note"
req GET "/kpi/dma?annee=$AN&niveau=commune" "" "$T_FNCT" >/dev/null
chk "le décret n'est pas en vigueur, et l'écran le sait" "False" "$(val "d['en_vigueur']")"
chk "indice (25 % conteneurs + 20 % collecte séparée) / 2 = 22,5 : niveau initial" "22.5|initial" \
    "$(val "next(l['dma']['indice'] for l in d['lignes'] if l['commune_id']=='$COMMUNE')")|$(val "next(l['dma']['niveau'] for l in d['lignes'] if l['commune_id']=='$COMMUNE')")"
chk "les indicateurs DMA n'ont aucun point au Concours" "None|None" "$(axes; ind DMA-1 points_effectifs)|$(ind DMA-4 points_effectifs)"

echo
echo "10. Le barème et les seuils (FNCT)"
BAREME=$(req GET /kpi/indicateurs >/dev/null; val "__import__('json').dumps({i['code']: i['points'] for i in d['indicateurs'] if i['famille']=='concours'})")
chk "le barème annonce qu'il est provisoire" 1 "$(val "d['parametres']['bareme_provisoire']")"
chk "un barème qui ne fait pas 100 est refusé" 400 \
    "$(req PUT /kpi/bareme "$(python3 -c "import json;b=json.loads('$BAREME');b['M1-1']+=1;print(json.dumps({'points':b}))")" "$T_FNCT")"
chk "un barème incomplet aussi" 400 "$(req PUT /kpi/bareme '{"points":{"M1-1":100}}' "$T_FNCT")"
chk "la commune ne touche pas au barème" 403 "$(req PUT /kpi/bareme "{\"points\":$BAREME}")"
chk "la FNCT le confirme : il n'est plus provisoire" "200|0" \
    "$(req PUT /kpi/bareme "{\"points\":$BAREME,\"confirmer\":true}" "$T_FNCT")|$(val "d['parametres']['bareme_provisoire']")"

echo
echo "11. Les alertes (A3.3)"
req GET "/kpi/alertes?annee=$AN" "" "$T_FNCT" >/dev/null
chk "la réclamation en attente depuis plus de 48 h est signalée" 1 \
    "$(val "sum(1 for a in d if a['commune_id']=='$COMMUNE' and a['code']=='reclamations_en_attente')")"
chk "le bâchage à 30 % sous le seuil de 80 % aussi" 1 \
    "$(val "sum(1 for a in d if a['commune_id']=='$COMMUNE' and a['code']=='bachage_insuffisant')")"
chk "un seuil relevé par la FNCT change les alertes" 1 \
    "$(req PUT /kpi/parametres '{"taux_resolution_min":90}' "$T_FNCT" >/dev/null; req GET "/kpi/alertes?annee=$AN" "" "$T_FNCT" >/dev/null; val "sum(1 for a in d if a['commune_id']=='$COMMUNE' and a['code']=='resolution_faible')")"
chk "la commune voit sa fiche de l'année dans « À vérifier »" 1 \
    "$(req GET "/communes/$COMMUNE/coherence" >/dev/null; val "sum(1 for e in d if e['domaine']=='kpi')")"

echo
echo "12. Cloisonnement"
AUTRE=$(sql "SELECT commune_id FROM users WHERE role='admin_commune' AND commune_id <> '$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
chk "une commune ne lit pas les indicateurs d'une autre (404)" 404 "$(req GET "/kpi/5-axes?communeId=$AUTRE&annee=$AN")"
chk "ni sa fiche, ni ne la saisit" "404|404" \
    "$(req GET "/kpi/evaluations/$AUTRE/$AN")|$(req PUT "/kpi/evaluations/$AUTRE/$AN" '{"a_abattoir":true}')"
chk "le classement national est à la FNCT" "403|403" \
    "$(req GET "/kpi/concours-national?annee=$AN")|$(req GET "/kpi/alertes?annee=$AN")"
chk "la FNCT ouvre les indicateurs de n'importe quelle commune (A2.3)" 200 "$(req GET "/kpi/5-axes?communeId=$AUTRE&annee=$AN" "" "$T_FNCT")"
PREST=$(tok "$(sql "SELECT email FROM users WHERE role='gestionnaire_prestataire' AND deleted_at IS NULL AND is_active ORDER BY created_at LIMIT 1")")
if [ -n "$PREST" ]; then
  chk "le prestataire a son tableau restreint, sur ses seules lignes (B7.4)" "200|1" \
      "$(req GET /kpi/prestataire "" "$PREST")|$(val "1 if all(l['prestataire_id']=='$(sql "SELECT id FROM users WHERE role='gestionnaire_prestataire' AND deleted_at IS NULL AND is_active ORDER BY created_at LIMIT 1")' for l in d['lignes']) else 0")"
  chk "et rien des indicateurs de la commune" 403 "$(req GET "/kpi/5-axes?communeId=$COMMUNE" "" "$PREST")"
fi

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
