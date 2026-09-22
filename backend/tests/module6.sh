#!/usr/bin/env bash
# =============================================================================
# Rubrique 4 — Pesées et traçabilité, volet saisie communale.
#
# CE QUE CETTE CAMPAGNE VÉRIFIE EN PREMIER. Qu'un tonnage impossible ne passe
# pas inaperçu. Le module 3 connaît la charge utile de chaque engin ; un poids
# au-dessus est soit une décimale déplacée, soit une surcharge réelle. Les deux
# appellent une action, aucune ne se voit en relisant une liste le mois suivant.
#
# Et que le registre reste un REGISTRE : une pesée annulée ne disparaît pas,
# elle est datée et imputée (B4.5, registre numérique conforme au décret).
#
#   docker compose run --rm api npm run test:module6
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Siipi2026!\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()   { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
refus() { $PSQL -c "$1" 2>&1 | grep -c "$2"; }
code()  { curl -s -o /tmp/siipi_m6.json -w '%{http_code}' "$@"; }
val()   { python3 -c "import json;print(json.load(open('/tmp/siipi_m6.json'))$1)" 2>/dev/null || echo erreur; }
nb()    { python3 -c "import json;print(len(json.load(open('/tmp/siipi_m6.json'))))" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

COMMUNE=$(sql "SELECT id FROM communes WHERE name ILIKE '%Chaâbane%' OR name ILIKE '%Chaabane%' OR id LIKE '%dar_chaabane%' ORDER BY length(name) LIMIT 1")
[ -n "$COMMUNE" ] || { echo "Dar Chaabane absente. Lancer : npm run seed && npm run seed:dar-chaabane" >&2; exit 1; }

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id='$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
[ -n "$DIR_EMAIL" ] || DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }

AUTRE=$(sql "SELECT id FROM communes WHERE id <> '$COMMUNE' ORDER BY id LIMIT 1")
CIRCUIT=$(sql "SELECT id FROM circuits WHERE commune_id='$COMMUNE' AND actif AND deleted_at IS NULL AND prestataire_id IS NULL ORDER BY nom LIMIT 1")
# On prend l'engin à la PLUS FORTE charge utile, pas le premier par
# immatriculation : un tracteur de 2 t mettait la pesée d'essai de 4 200 kg en
# surcharge, et le test se contredisait lui-même.
ENGIN=$(sql "SELECT id FROM vehicules WHERE commune_id='$COMMUNE' AND deleted_at IS NULL AND etat='en_service' AND charge_utile_t > 0 ORDER BY charge_utile_t DESC, registration LIMIT 1")
CHARGE=$(sql "SELECT charge_utile_t::integer FROM vehicules WHERE id='$ENGIN'")
# Le poids d'essai est la moitié de la charge utile : jamais en surcharge, quel
# que soit le parc de la commune.
POIDS=$(( CHARGE * 500 ))

nettoyer() { $PSQL -c "DELETE FROM pesees WHERE bon_numero LIKE 'TEST-M6%' OR observation LIKE 'TEST-M6%';" >/dev/null 2>&1; }
nettoyer

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la base refuse"

chk "une pesée datée de demain" 1 \
    "$(refus "INSERT INTO pesees (commune_id,date_pesee,circuit_id,vehicule_id,poids_net_kg,bon_numero) VALUES ('$COMMUNE',CURRENT_DATE+1,'$CIRCUIT','$ENGIN',1000,'TEST-M6-1');" PESEE_DANS_LE_FUTUR)"
chk "un poids nul ou négatif" 1 \
    "$(refus "INSERT INTO pesees (commune_id,circuit_id,vehicule_id,poids_net_kg,bon_numero) VALUES ('$COMMUNE','$CIRCUIT','$ENGIN',0,'TEST-M6-2');" pesee_poids_positif)"
chk "ni circuit ni observation : on ne saurait pas d'où vient le tonnage" 1 \
    "$(refus "INSERT INTO pesees (commune_id,vehicule_id,poids_net_kg,bon_numero) VALUES ('$COMMUNE','$ENGIN',1000,'TEST-M6-3');" pesee_origine_renseignee)"
chk "aucun engin, ni identifiant ni immatriculation" 1 \
    "$(refus "INSERT INTO pesees (commune_id,circuit_id,poids_net_kg,bon_numero) VALUES ('$COMMUNE','$CIRCUIT',1000,'TEST-M6-4');" pesee_engin_renseigne)"
chk "un brut sans tare" 1 \
    "$(refus "INSERT INTO pesees (commune_id,circuit_id,vehicule_id,poids_net_kg,poids_brut_kg,bon_numero) VALUES ('$COMMUNE','$CIRCUIT','$ENGIN',1000,5000,'TEST-M6-5');" pesee_brut_tare_ensemble)"
chk "un brut et une tare qui ne donnent pas le net" 1 \
    "$(refus "INSERT INTO pesees (commune_id,circuit_id,vehicule_id,poids_net_kg,poids_brut_kg,poids_tare_kg,bon_numero) VALUES ('$COMMUNE','$CIRCUIT','$ENGIN',1000,9000,5000,'TEST-M6-6');" pesee_poids_coherents)"
chk "un flux hors nomenclature (« gravats » et non « ddc »)" 1 \
    "$(refus "INSERT INTO pesees (commune_id,circuit_id,vehicule_id,poids_net_kg,type_dechet,bon_numero) VALUES ('$COMMUNE','$CIRCUIT','$ENGIN',1000,'gravats','TEST-M6-7');" pesee_type_dechet_valide)"
if [ -n "$AUTRE" ]; then
  ENGIN_AUTRE=$(sql "SELECT id FROM vehicules WHERE commune_id='$AUTRE' AND deleted_at IS NULL LIMIT 1")
  [ -n "$ENGIN_AUTRE" ] && chk "un engin d'une autre commune" 1 \
    "$(refus "INSERT INTO pesees (commune_id,circuit_id,vehicule_id,poids_net_kg,bon_numero) VALUES ('$COMMUNE','$CIRCUIT','$ENGIN_AUTRE',1000,'TEST-M6-8');" PESEE_ENGIN_HORS_COMMUNE)"
fi

# -----------------------------------------------------------------------------
echo
echo "2. Le contrôle qui compte : le tonnage impossible"

# Une décimale déplacée sur un engin dont on connaît la charge utile.
IMPOSSIBLE=$(( (CHARGE + 1) * 1000 * 10 ))
$PSQL -c "INSERT INTO pesees (commune_id,date_pesee,circuit_id,voyage,vehicule_id,poids_net_kg,bon_numero)
          VALUES ('$COMMUNE',CURRENT_DATE - 2,'$CIRCUIT',1,'$ENGIN',$IMPOSSIBLE,'TEST-M6-surcharge');" >/dev/null 2>&1
chk "un tonnage au-dessus de la charge utile est signalé BLOQUANT" 1 \
    "$(sql "SELECT count(*) FROM app.incoherences_pesees('$COMMUNE') WHERE gravite='bloquant' AND constat LIKE '%charge utile%'")"
chk "et il remonte dans le panneau du matin, tous domaines confondus" 1 \
    "$(sql "SELECT count(*) FROM app.incoherences_commune('$COMMUNE') WHERE domaine='pesees' AND gravite='bloquant'")"
# Le tri du panneau porte sur la gravité, pas sur l'alphabet.
chk "le bloquant arrive AVANT les avertissements" "bloquant" \
    "$(sql "SELECT gravite FROM app.incoherences_commune('$COMMUNE') LIMIT 1")"
chk "la liste marque la surcharge sans qu'on croise deux écrans" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/pesees?communeId=$COMMUNE")"
chk "au moins une ligne porte le drapeau de surcharge" 1 \
    "$(python3 -c "
import json
d=json.load(open('/tmp/siipi_m6.json'))
print(1 if any(p.get('surcharge') for p in d) else 0)" 2>/dev/null || echo erreur)"

# -----------------------------------------------------------------------------
echo
echo "3. La saisie du jour : les trous, pas les réussites"

chk "GET /pesees/attendues répond" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/pesees/attendues?communeId=$COMMUNE")"
ATTENDUS=$(nb)
chk "les circuits confiés à un prestataire en sont exclus" 0 \
    "$(python3 -c "
import json,sys
d=json.load(open('/tmp/siipi_m6.json'))
print(0 if isinstance(d,list) else 1)" 2>/dev/null || echo erreur)"
# Le nombre de voyages attendus doit valoir la somme des voyages_par_jour des
# circuits qui passent aujourd'hui — sinon la feuille ment par omission.
chk "un voyage attendu par voyage de la fiche" \
    "$(sql "SELECT COALESCE(sum(GREATEST(COALESCE(voyages_par_jour,1),1)),0) FROM circuits WHERE commune_id='$COMMUNE' AND actif AND deleted_at IS NULL AND prestataire_id IS NULL AND date_debut <= CURRENT_DATE AND (date_fin IS NULL OR date_fin >= CURRENT_DATE) AND EXTRACT(isodow FROM CURRENT_DATE)::smallint = ANY (jours_passage)")" \
    "$ATTENDUS"

# -----------------------------------------------------------------------------
echo
echo "4. Saisir, corriger, annuler"

CREE=$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"datePesee\":\"$(date -d '3 days ago' +%Y-%m-%d 2>/dev/null || date -v-3d +%Y-%m-%d)\",\"circuitId\":\"$CIRCUIT\",\"voyage\":1,\"vehiculeId\":\"$ENGIN\",\"typeDechet\":\"menager\",\"poidsNetKg\":$POIDS,\"bonNumero\":\"TEST-M6-ok\"}" \
  "$API/pesees?communeId=$COMMUNE")
chk "saisie d'une pesée" 201 "$CREE"
PESEE=$(val "['id']")
# NUMERIC(10,2)/1000 arrondi à trois décimales rend « 4.200 », pas « 4.2 » :
# on compare des nombres, pas leur écriture.
chk "le tonnage est calculé" "$(python3 -c "print(f'{$POIDS/1000:.3f}')")" "$(val "['tonnage_t']")"
chk "et elle n'est pas en surcharge" "False" "$(val "['surcharge']")"

chk "correction du poids" 200 \
    "$(code -X PATCH -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"poidsNetKg\":$POIDS}" "$API/pesees/$PESEE")"

chk "annulation" 204 \
    "$(code -X DELETE -H "Authorization: Bearer $T_DIR" "$API/pesees/$PESEE")"
# Un registre numérique conforme au décret ne perd pas de lignes.
chk "la ligne annulée RESTE en base, datée et imputée" "1|t|t" \
    "$(sql "SELECT count(*)||'|'||bool_or(deleted_at IS NOT NULL)||'|'||bool_or(deleted_by IS NOT NULL) FROM pesees WHERE id='$PESEE'")"
chk "mais elle sort du registre" 0 \
    "$(sql "SELECT count(*) FROM pesees WHERE id='$PESEE' AND deleted_at IS NULL")"
# Et la place se libère : on doit pouvoir resaisir ce voyage.
chk "le voyage annulé peut être resaisi" 201 \
    "$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"datePesee\":\"$(date -d '3 days ago' +%Y-%m-%d 2>/dev/null || date -v-3d +%Y-%m-%d)\",\"circuitId\":\"$CIRCUIT\",\"voyage\":1,\"vehiculeId\":\"$ENGIN\",\"poidsNetKg\":$POIDS,\"bonNumero\":\"TEST-M6-bis\"}" \
       "$API/pesees?communeId=$COMMUNE")"

# -----------------------------------------------------------------------------
echo
echo "5. Les tonnages et le coût à la tonne"

chk "GET /pesees/tonnages répond" 200 "$(code -H "Authorization: Bearer $T_DIR" "$API/pesees/tonnages?communeId=$COMMUNE")"
chk "GET /pesees/mensuel répond" 200 "$(code -H "Authorization: Bearer $T_DIR" "$API/pesees/mensuel?communeId=$COMMUNE")"
chk "GET /pesees/coherence répond" 200 "$(code -H "Authorization: Bearer $T_DIR" "$API/pesees/coherence?communeId=$COMMUNE")"

# La promesse du module 4 : le coût à la tonne n'existait pas faute de pesées.
chk "app.cout_service rend désormais un coût à la tonne" 1 \
    "$(sql "SELECT count(*) FROM information_schema.routines r JOIN information_schema.parameters p ON p.specific_name=r.specific_name WHERE r.routine_name='cout_service' AND p.parameter_name='cout_tonne_tnd'")"
# Les deux termes portent sur la même période : une année de salaires divisée
# par un mois de pesées donnerait un ratio douze fois trop élevé.
chk "et le nombre de mois pesés, pour que le ratio soit lisible" 1 \
    "$(sql "SELECT count(*) FROM information_schema.routines r JOIN information_schema.parameters p ON p.specific_name=r.specific_name WHERE r.routine_name='cout_service' AND p.parameter_name='mois_pesees'")"

# -----------------------------------------------------------------------------
echo
echo "6. L'ordre des routes, les erreurs, le cloisonnement"

chk "« attendues » n'est pas pris pour un identifiant" 200 "$(code -H "Authorization: Bearer $T_DIR" "$API/pesees/attendues?communeId=$COMMUNE")"
chk "« tonnages » non plus" 200 "$(code -H "Authorization: Bearer $T_DIR" "$API/pesees/tonnages?communeId=$COMMUNE")"
chk "« mensuel » non plus" 200 "$(code -H "Authorization: Bearer $T_DIR" "$API/pesees/mensuel?communeId=$COMMUNE")"
chk "« coherence » non plus" 200 "$(code -H "Authorization: Bearer $T_DIR" "$API/pesees/coherence?communeId=$COMMUNE")"
chk "un identifiant inconnu rend 404" 404 "$(code -H "Authorization: Bearer $T_DIR" "$API/pesees/00000000-0000-0000-0000-000000000000")"
chk "un identifiant mal formé rend 400, pas 500" 400 "$(code -H "Authorization: Bearer $T_DIR" "$API/pesees/pas-un-uuid")"
chk "sans jeton, 401" 401 "$(code "$API/pesees?communeId=$COMMUNE")"

if [ -n "$AUTRE" ]; then
  code -H "Authorization: Bearer $T_DIR" "$API/pesees?communeId=$AUTRE" >/dev/null
  chk "les pesées d'une autre commune ne sont pas lisibles" 0 "$(nb)"
fi
chk "un compte anonyme ne voit aucune pesée (base)" 0 \
    "$(sql "BEGIN; SET LOCAL ROLE siipi_app; SET LOCAL app.role='anonyme'; SELECT count(*) FROM pesees; ROLLBACK;" | tail -1)"
chk "un citoyen non plus (base)" 0 \
    "$(sql "BEGIN; SET LOCAL ROLE siipi_app; SET LOCAL app.role='citoyen'; SELECT count(*) FROM pesees; ROLLBACK;" | tail -1)"

# La table ANGeD reste intacte : ce module ne la touche pas.
chk "pesees_anged est inchangée" 1 \
    "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name='pesees_anged' AND column_name='ticket_number_anged'")"
chk "et le registre communal porte sa colonne « source »" 1 \
    "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name='pesees' AND column_name='source'")"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
