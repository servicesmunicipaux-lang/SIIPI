#!/usr/bin/env bash
# =============================================================================
# Le socle de notification — Jalon 2, lot 1 (B5.1.2, B5.2.3, B5.4.3).
#
# CE QUE CETTE CAMPAGNE VÉRIFIE D'ABORD, comme le demande la feuille de route :
# qu'un échec est CONSIGNÉ et NON SILENCIEUX, qu'un désabonné ne reçoit rien,
# et qu'une commune ne voit jamais QUI a reçu quoi — seul l'agrégat de
# envois_notification lui reste ouvert (campagne module5).
#
#   docker compose exec -T api npm run test:notifications
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
code() { curl -s -o "$T/r.json" -w '%{http_code}' "$@"; }
val()  { python3 -c "import json;print(json.load(open('$T/r.json'))$1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")

EMAIL_TEST="test-notif@example.test"

nettoyer() {
  $PSQL -c "DELETE FROM notifications_envoyees WHERE titre LIKE 'TEST-NOTIF%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM tickets WHERE title LIKE 'TEST-NOTIF%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM push_souscriptions WHERE endpoint LIKE 'https://exemple.test/%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM publications WHERE titre_fr LIKE 'TEST-NOTIF%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM citoyens WHERE user_id IN (SELECT id FROM users WHERE email = '$EMAIL_TEST');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM users WHERE email = '$EMAIL_TEST';" >/dev/null 2>&1
}
nettoyer

# --- Un citoyen à soi, plutôt que d'espérer qu'un compte de démonstration --
# rattaché à cette commune existe déjà (campagne autonome, jouable sur une
# installation qui vient d'être seedée).
CODE=$(code -X POST "$API/citizens/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL_TEST\",\"password\":\"Siipi2026!\",\"fullName\":\"TEST-NOTIF Citoyen\"}")
chk "le citoyen de test s'inscrit" 201 "$CODE"
T_CIT=$(tok "$EMAIL_TEST")
CIT_ID=$(sql "SELECT c.id FROM users u JOIN citoyens c ON c.user_id=u.id WHERE u.email='$EMAIL_TEST'")
code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"adresse\":\"TEST-NOTIF, rue de test\"}" >/dev/null

# -----------------------------------------------------------------------------
echo
echo "1. Clé publique VAPID"
CODE=$(code -H "Authorization: Bearer $T_CIT" "$API/citoyen/push/cle-publique")
chk "la route répond" 200 "$CODE"
chk "une clé est configurée dans cet environnement" 1 \
    "$(python3 -c "print(1 if $(val "['clePublique']" 2>/dev/null | wc -c) > 5 else 0)" 2>/dev/null || echo 0)"

echo
echo "2. Décision de réclamation (B5.1.2) — sans souscription"
TICKET1=$(sql "INSERT INTO tickets (ticket_number, commune_id, category, title, citizen_id, status)
               VALUES ('TEST-NOTIF-1', '$COMMUNE', 'point_noir', 'TEST-NOTIF ticket 1', '$CIT_ID', 'recu')
               RETURNING id")
code -X PATCH "$API/tickets/$TICKET1/accept" -H "Authorization: Bearer $T_DIR" >/dev/null
chk "l'acceptation est consignée" "sans_souscription" \
    "$(sql "SELECT statut FROM notifications_envoyees WHERE reference_id='$TICKET1' AND contexte='decision_reclamation'")"

echo
echo "3. Un désabonné ne reçoit rien"
$PSQL -c "UPDATE citoyens SET notifications = false WHERE id = '$CIT_ID';" >/dev/null 2>&1
TICKET2=$(sql "INSERT INTO tickets (ticket_number, commune_id, category, title, citizen_id, status)
               VALUES ('TEST-NOTIF-2', '$COMMUNE', 'point_noir', 'TEST-NOTIF ticket 2', '$CIT_ID', 'recu')
               RETURNING id")
code -X PATCH "$API/tickets/$TICKET2/refuse" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"reason":"TEST-NOTIF motif de refus"}' >/dev/null
chk "le refus d'un désabonné est consigné « non_abonne »" "non_abonne" \
    "$(sql "SELECT statut FROM notifications_envoyees WHERE reference_id='$TICKET2' AND contexte='decision_reclamation'")"
$PSQL -c "UPDATE citoyens SET notifications = true WHERE id = '$CIT_ID';" >/dev/null 2>&1

echo
echo "4. Un échec est consigné et non silencieux"
code -X POST "$API/citoyen/push/souscriptions" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d '{"endpoint":"https://exemple.test/un-endpoint-qui-nexiste-pas","keys":{"p256dh":"abc","auth":"def"}}' >/dev/null
TICKET3=$(sql "INSERT INTO tickets (ticket_number, commune_id, category, title, citizen_id, status)
               VALUES ('TEST-NOTIF-3', '$COMMUNE', 'point_noir', 'TEST-NOTIF ticket 3', '$CIT_ID', 'recu')
               RETURNING id")
code -X PATCH "$API/tickets/$TICKET3/accept" -H "Authorization: Bearer $T_DIR" >/dev/null
chk "l'envoi vers un endpoint injoignable échoue" "echec" \
    "$(sql "SELECT statut FROM notifications_envoyees WHERE reference_id='$TICKET3' AND contexte='decision_reclamation'")"
chk "et l'échec porte un message, pas un champ vide" 1 \
    "$(sql "SELECT (length(coalesce(erreur,'')) > 0)::int FROM notifications_envoyees WHERE reference_id='$TICKET3' AND contexte='decision_reclamation'")"

echo
echo "5. Une publication envoyée en push atteint le citoyen du périmètre (B5.2.3 / B5.4.3)"
CODE=$(code -X POST "$API/communication?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"type":"notification","titreFr":"TEST-NOTIF publication","contenuFr":"TEST-NOTIF contenu","perimetreType":"commune"}')
chk "la publication est créée" 201 "$CODE"
PUB=$(val "['id']")
code -X POST "$API/communication/$PUB/publier" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' -d '{}' >/dev/null
CODE=$(code -X POST "$API/communication/$PUB/envoyer" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' -d '{"canal":"push"}')
chk "l'envoi est accepté" 201 "$CODE"
chk "le citoyen ciblé a une tentative consignée" "echec" \
    "$(sql "SELECT statut FROM notifications_envoyees WHERE reference_id='$PUB' AND citoyen_id='$CIT_ID' AND contexte='notification_ciblee'")"

echo
echo "6. Cloisonnement — même schéma que envois_notification (campagne module5) : la commune compte, elle ne lit jamais qui"
CIT_USER_ID=$(sql "SELECT user_id FROM citoyens WHERE id='$CIT_ID'")
chk "un admin_commune ne peut pas lire le journal individuel" 0 \
    "$(sql "BEGIN; SET LOCAL ROLE siipi_app; SET LOCAL app.role='admin_commune'; SET LOCAL app.commune_id='$COMMUNE'; SELECT count(*) FROM notifications_envoyees WHERE reference_id='$PUB'; ROLLBACK;" | tail -1)"
chk "le citoyen concerné voit ses propres notifications" 1 \
    "$(sql "BEGIN; SET LOCAL ROLE siipi_app; SET LOCAL app.role='citoyen'; SET LOCAL app.user_id='$CIT_USER_ID'; SELECT (count(*) > 0)::int FROM notifications_envoyees WHERE citoyen_id='$CIT_ID'; ROLLBACK;" | tail -1)"

echo
echo "7. Les souscriptions push n'appartiennent qu'au citoyen"
NB_AVANT=$(sql "SELECT count(*) FROM push_souscriptions WHERE citoyen_id='$CIT_ID'")
chk "la souscription de test existe" 1 "$(python3 -c "print(1 if int('$NB_AVANT' or 0) >= 1 else 0)")"
CODE=$(code -X DELETE "$API/citoyen/push/souscriptions" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d '{"endpoint":"https://exemple.test/un-endpoint-qui-nexiste-pas"}')
chk "le citoyen retire sa propre souscription" 204 "$CODE"
chk "elle a disparu" 0 "$(sql "SELECT count(*) FROM push_souscriptions WHERE citoyen_id='$CIT_ID'")"
chk "sans jeton, rien" 401 "$(code -X POST "$API/citoyen/push/souscriptions" -H 'Content-Type: application/json' -d '{}')"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
