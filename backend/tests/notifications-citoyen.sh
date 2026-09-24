#!/usr/bin/env bash
# =============================================================================
# Historique « Mes notifications » et préférences par canal/type (M6).
#
# Complète la campagne notifications (Jalon 2, lot 1) sans la répéter : ici on
# vérifie que l'HISTORIQUE reste consultable par le citoyen quelle que soit
# l'issue (préférence désactivée, opt-out global, échec technique) — c'est ce
# qui nourrit l'écran « Mes notifications » et son compteur de non-lus — puis
# le cloisonnement des préférences et de l'historique par citoyen, et enfin la
# relance manuelle (« Renvoyer ») réservée aux envois en échec.
#
#   docker compose exec -T api npm run test:notifications-citoyen
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
len()  { python3 -c "import json;print(len(json.load(open('$T/r.json'))))" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")

EMAIL_A="test-notifcit-a@example.test"
EMAIL_B="test-notifcit-b@example.test"

nettoyer() {
  $PSQL -c "DELETE FROM notifications_citoyen WHERE titre LIKE 'TEST-NOTIFCIT%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM tickets WHERE title LIKE 'TEST-NOTIFCIT%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM push_souscriptions WHERE endpoint LIKE 'https://exemple.test/notifcit%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM preferences_notification WHERE citoyen_id IN (SELECT c.id FROM citoyens c JOIN users u ON u.id=c.user_id WHERE u.email IN ('$EMAIL_A','$EMAIL_B'));" >/dev/null 2>&1
  $PSQL -c "DELETE FROM citoyens WHERE user_id IN (SELECT id FROM users WHERE email IN ('$EMAIL_A','$EMAIL_B'));" >/dev/null 2>&1
  $PSQL -c "DELETE FROM users WHERE email IN ('$EMAIL_A','$EMAIL_B');" >/dev/null 2>&1
}
nettoyer

code -X POST "$API/citizens/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL_A\",\"password\":\"Siipi2026!\",\"fullName\":\"TEST-NOTIFCIT Citoyen A\"}" >/dev/null
code -X POST "$API/citizens/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL_B\",\"password\":\"Siipi2026!\",\"fullName\":\"TEST-NOTIFCIT Citoyen B\"}" >/dev/null
T_A=$(tok "$EMAIL_A")
T_B=$(tok "$EMAIL_B")
CIT_A=$(sql "SELECT c.id FROM users u JOIN citoyens c ON c.user_id=u.id WHERE u.email='$EMAIL_A'")
CIT_B=$(sql "SELECT c.id FROM users u JOIN citoyens c ON c.user_id=u.id WHERE u.email='$EMAIL_B'")
USER_B=$(sql "SELECT id FROM users WHERE email='$EMAIL_B'")
code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_A" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"adresse\":\"TEST-NOTIFCIT, rue de test\"}" >/dev/null

# -----------------------------------------------------------------------------
echo
echo "1. Préférences par défaut : absence de ligne vaut « activé »"
CODE=$(code -H "Authorization: Bearer $T_A" "$API/citoyen/preferences")
chk "la route répond" 200 "$CODE"
chk "les 9 combinaisons canal × type sont rendues" 9 "$(len)"
chk "toutes activées par défaut" 0 \
    "$(python3 -c "import json;d=json.load(open('$T/r.json'));print(sum(1 for x in d if not x['active']))")"

echo
echo "2. Désactiver un type précis (préférence fine)"
CODE=$(code -X PUT "$API/citoyen/preferences" -H "Authorization: Bearer $T_A" -H 'Content-Type: application/json' \
  -d '{"preferences":[{"canal":"push","type":"decision_reclamation","active":false}]}')
chk "la préférence est enregistrée" 204 "$CODE"
code -H "Authorization: Bearer $T_A" "$API/citoyen/preferences" >/dev/null
CODE=$(code -H "Authorization: Bearer $T_A" "$API/citoyen/preferences")
chk "elle ressort désactivée, les 8 autres intactes" 1 \
    "$(python3 -c "
import json
d=json.load(open('$T/r.json'))
une=[x for x in d if x['canal']=='push' and x['type']=='decision_reclamation']
autres=[x for x in d if not (x['canal']=='push' and x['type']=='decision_reclamation')]
print(1 if (not une[0]['active']) and all(x['active'] for x in autres) else 0)")"

echo
echo "3. Historique conservé MALGRÉ un type désactivé (pas d'envoi, mais une trace)"
TICKET1=$(sql "INSERT INTO tickets (ticket_number, commune_id, category, title, citizen_id, status)
               VALUES ('TEST-NOTIFCIT-1', '$COMMUNE', 'point_noir', 'TEST-NOTIFCIT ticket 1', '$CIT_A', 'recu')
               RETURNING id")
code -X PATCH "$API/tickets/$TICKET1/accept" -H "Authorization: Bearer $T_DIR" >/dev/null
chk "consigné « non_souhaite » côté base" "non_souhaite" \
    "$(sql "SELECT statut FROM notifications_citoyen WHERE reference_id='$TICKET1' AND type='decision_reclamation'")"
CODE=$(code -H "Authorization: Bearer $T_A" "$API/citoyen/notifications")
chk "et visible dans l'historique du citoyen (l'API, pas seulement la base)" 1 \
    "$(python3 -c "import json;d=json.load(open('$T/r.json'));print(1 if any(n['statut']=='non_souhaite' for n in d) else 0)")"

echo
echo "4. Historique conservé MALGRÉ le push désactivé globalement (opt-out)"
$PSQL -c "UPDATE citoyens SET notifications = false WHERE id = '$CIT_A';" >/dev/null 2>&1
TICKET2=$(sql "INSERT INTO tickets (ticket_number, commune_id, category, title, citizen_id, status)
               VALUES ('TEST-NOTIFCIT-2', '$COMMUNE', 'point_noir', 'TEST-NOTIFCIT ticket 2', '$CIT_A', 'recu')
               RETURNING id")
code -X PATCH "$API/tickets/$TICKET2/refuse" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"reason":"TEST-NOTIFCIT motif"}' >/dev/null
chk "consigné « non_abonne »" "non_abonne" \
    "$(sql "SELECT statut FROM notifications_citoyen WHERE reference_id='$TICKET2' AND type='decision_reclamation'")"
$PSQL -c "UPDATE citoyens SET notifications = true WHERE id = '$CIT_A';" >/dev/null 2>&1

echo
echo "5. Un échec technique reste relançable : préparation (endpoint injoignable)"
code -X POST "$API/citoyen/push/souscriptions" -H "Authorization: Bearer $T_A" -H 'Content-Type: application/json' \
  -d '{"endpoint":"https://exemple.test/notifcit-injoignable","keys":{"p256dh":"abc","auth":"def"}}' >/dev/null
# La préférence désactivée en étape 2 empêcherait l'envoi : on la réactive
# pour obtenir un véritable essai (et donc un échec), pas un « non_souhaite ».
code -X PUT "$API/citoyen/preferences" -H "Authorization: Bearer $T_A" -H 'Content-Type: application/json' \
  -d '{"preferences":[{"canal":"push","type":"decision_reclamation","active":true}]}' >/dev/null
TICKET3=$(sql "INSERT INTO tickets (ticket_number, commune_id, category, title, citizen_id, status)
               VALUES ('TEST-NOTIFCIT-3', '$COMMUNE', 'point_noir', 'TEST-NOTIFCIT ticket 3', '$CIT_A', 'recu')
               RETURNING id")
code -X PATCH "$API/tickets/$TICKET3/accept" -H "Authorization: Bearer $T_DIR" >/dev/null
chk "consigné « echec »" "echec" \
    "$(sql "SELECT statut FROM notifications_citoyen WHERE reference_id='$TICKET3' AND type='decision_reclamation'")"
chk "une seule tentative avant relance" 1 \
    "$(sql "SELECT tentatives FROM notifications_citoyen WHERE reference_id='$TICKET3' AND type='decision_reclamation'")"

echo
echo "6. Compteur de non-lus"
CODE=$(code -H "Authorization: Bearer $T_A" "$API/citoyen/notifications?nonLues=true")
chk "les 3 notifications de test sont non lues" 3 "$(len)"

echo
echo "7. Marquer UNE notification comme lue"
NOTIF1=$(val "[0]['id']")
CODE=$(code -X PUT "$API/citoyen/notifications/$NOTIF1/lu" -H "Authorization: Bearer $T_A")
chk "la route répond" 200 "$CODE"
chk "elle est marquée lue" "True" "$(val "['lu']")"
CODE=$(code -H "Authorization: Bearer $T_A" "$API/citoyen/notifications?nonLues=true")
chk "il n'en reste plus que 2 non lues" 2 "$(len)"

echo
echo "8. Tout marquer comme lu"
CODE=$(code -X PUT "$API/citoyen/notifications/tout-lu" -H "Authorization: Bearer $T_A")
chk "la route répond" 200 "$CODE"
chk "les 2 restantes sont comptées" 2 "$(val "['maj']")"
CODE=$(code -H "Authorization: Bearer $T_A" "$API/citoyen/notifications?nonLues=true")
chk "plus aucune non lue" 0 "$(len)"
CODE=$(code -H "Authorization: Bearer $T_A" "$API/citoyen/notifications")
chk "mais l'historique complet reste consultable (rien n'est supprimé)" 3 "$(len)"

echo
echo "9. Relance manuelle (« Renvoyer ») — réservée à un échec"
CODE=$(code -X PATCH "$API/tickets/$TICKET1/notification/renvoyer" -H "Authorization: Bearer $T_DIR")
chk "refusée sur une notification qui n'est pas en échec (non_souhaite)" 400 "$CODE"
CODE=$(code -X PATCH "$API/tickets/$TICKET3/notification/renvoyer" -H "Authorization: Bearer $T_DIR")
chk "acceptée sur l'échec du ticket 3" 200 "$CODE"
chk "le nombre de tentatives est incrémenté" 2 \
    "$(sql "SELECT tentatives FROM notifications_citoyen WHERE reference_id='$TICKET3' AND type='decision_reclamation'")"
CODE=$(code -X PATCH "$API/tickets/$TICKET3/notification/renvoyer" -H 'Content-Type: application/json')
chk "sans jeton, rien" 401 "$CODE"

echo
echo "10. RLS — un citoyen ne voit jamais l'historique ni les préférences d'un autre"
chk "citoyen B ne lit pas les notifications de A" 0 \
    "$(sql "BEGIN; SET LOCAL ROLE siipi_app; SET LOCAL app.role='citoyen'; SET LOCAL app.user_id='$USER_B'; SELECT count(*) FROM notifications_citoyen WHERE citoyen_id='$CIT_A'; ROLLBACK;" | tail -1)"
chk "citoyen B ne lit pas les préférences de A" 0 \
    "$(sql "BEGIN; SET LOCAL ROLE siipi_app; SET LOCAL app.role='citoyen'; SET LOCAL app.user_id='$USER_B'; SELECT count(*) FROM preferences_notification WHERE citoyen_id='$CIT_A'; ROLLBACK;" | tail -1)"
CODE=$(code -H "Authorization: Bearer $T_B" "$API/citoyen/notifications")
chk "l'historique de B (par l'API) est bien vide, pas celui de A" 0 "$(len)"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
