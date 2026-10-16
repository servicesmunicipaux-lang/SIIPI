#!/usr/bin/env bash
# =============================================================================
# Le courriel (décision du 16 octobre 2026 : « courriel d'abord, SMS plus
# tard » ; B1.2, B5.4.3) — campagne de vérification.
#
# Deux usages : le mot de passe provisoire d'un compte part à son titulaire, et
# les notifications partent aux citoyens qui l'ont DEMANDÉ, type par type
# (migration 081 : pour le courriel, une préférence absente vaut « désactivé »).
#
# CE QUE CETTE CAMPAGNE VÉRIFIE D'ABORD : ce que la plateforme refuse. L'état du
# serveur et l'essai sont à la FNCT seule ; la base refuse une ligne qui
# prétendrait un SMS parti ; un citoyen qui n'a rien demandé ne reçoit rien.
# Puis les trois situations d'un serveur : aucun désigné (rien ne part, et c'est
# dit), désigné (le courriel part, le mot de passe n'est plus à l'écran),
# injoignable (l'échec est dit, le mot de passe revient à l'écran).
#
# TOUT EST JETABLE (leçon de JC-007) : une base neuve, migrée et semée pour
# elle ; une API à part, sur le port 4006, redémarrée pour chaque situation ;
# un serveur SMTP d'essai (tests/outils/serveur_smtp.py) qui ne relaie rien et
# range chaque courriel reçu dans le dossier temporaire. Aucun courriel ne
# quitte la machine. Tout disparaît en partant.
#
#   docker compose exec -T api npm run test:courriel
# =============================================================================

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1
pass=0; fail=0
T=$(mktemp -d)
BOITE="$T/boite"
PORT_ESSAI=4006
PORT_SMTP=2526
PORT_MORT=2527   # personne n'y écoute : un serveur injoignable
BASE=siipi_essai_courriel
. tests/outils/instance_essai.sh
API="http://localhost:$PORT_ESSAI"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d $BASE"
SECRET_SMTP="TEST-secret-smtp-$$"
PORTAIL="https://portail.essai.test"

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
# La boîte du serveur d'essai : combien de courriels, et pour qui.
recus()      { ls "$BOITE" 2>/dev/null | grep -c '\.json$'; }
recus_pour() { grep -l "\"$1\"" "$BOITE"/*.json 2>/dev/null | wc -l | tr -d ' '; }
# Le dernier courriel reçu par une adresse : un champ (sujet, texte).
dernier() {
  python3 - "$BOITE" "$1" "$2" <<'PYEOF' 2>/dev/null || echo erreur
import glob, json, sys
boite, a, champ = sys.argv[1:]
f = [json.load(open(p, encoding='utf-8')) for p in sorted(glob.glob(boite + '/*.json'))]
f = [m for m in f if a in m['a']]
print(f[-1][champ] if f else 'aucun')
PYEOF
}
mdp_du_courriel() { dernier "$1" texte | sed -n 's/^Mot de passe provisoire : //p' | tr -d '\r'; }
# L'API d'essai, avec ou sans serveur de courriel.
api() {
  api_essai "$PORT_ESSAI" "$BASE" COURRIEL_URL_PORTAIL="$PORTAIL" "$@" \
    || { echo "L'API d'essai n'a pas démarré." >&2; tail -20 "$T/api_$PORT_ESSAI.log" >&2; exit 1; }
}
api_sans_serveur()   { api SMTP_HOST=; }
api_avec_serveur()   { api SMTP_HOST=127.0.0.1 SMTP_PORT="$1" SMTP_SECURITE=aucune SMTP_MOT_DE_PASSE="$SECRET_SMTP"; }
jetons() {
  T_FNCT=$(tok admin.national@siipi.tn)
  T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
  T_A=$(tok "$CIT_A_EMAIL" "$CIT_MDP")
  T_B=$(tok "$CIT_B_EMAIL" "$CIT_MDP")
  [ -n "$T_FNCT" ] && [ -n "$T_DIR" ] && [ -n "$T_A" ] && [ -n "$T_B" ] \
    || { echo "Un compte d'essai n'a pas pu se connecter à l'API d'essai." >&2; exit 1; }
}
# Une publication du directeur, publiée, envoyée à toute la commune ; rend son identifiant.
publier() {
  local id
  id=$(sql "INSERT INTO publications (commune_id, type, titre_fr, contenu_fr, statut, publiee_le)
            VALUES ('$TC', 'notification', '$1', 'TEST-C contenu', 'publiee', now()) RETURNING id")
  curl -s -o "$T/envoi.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d '{"canal":"push"}' "$API/communication/$id/envoyer" > "$T/envoi.code"
  echo "$id"
}
courriels_de() { sql "SELECT count(*) FROM notifications_citoyen WHERE reference_id = '$1' AND canal = 'email'"; }
statut_courriel() { sql "SELECT string_agg(statut, ',' ORDER BY statut) FROM notifications_citoyen WHERE reference_id = '$1' AND canal = 'email' AND citoyen_id = '$2'"; }

TC=test_courriel
COMMUNE_DIR="$TC"
CIT_A_EMAIL="test-courriel-a@example.test"
CIT_B_EMAIL="test-courriel-b@example.test"
CIT_MDP="TEST-Citoyen-$$"
. tests/outils/directeur_temporaire.sh
PID_SMTP=""
fin() {
  arreter_api_essai
  [ -n "$PID_SMTP" ] && kill "$PID_SMTP" 2>/dev/null
  retirer_bases_essai
  rm -rf "$T"
}
trap fin EXIT

base_essai "$BASE"
DATABASE_URL="$(url_essai "$BASE")" npm run -s seed > "$T/seed.log" 2>&1 \
  || { echo "La base d'essai n'a pas pu être semée (voir le journal du seed)." >&2; tail -5 "$T/seed.log" >&2; exit 1; }
python3 tests/outils/serveur_smtp.py "$PORT_SMTP" "$BOITE" > "$T/smtp.log" 2>&1 &
PID_SMTP=$!
api_sans_serveur
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune du courriel', 'TEST', 'TEST', 5000);" >/dev/null
directeur_temporaire "$TC"
for e in "$CIT_A_EMAIL" "$CIT_B_EMAIL"; do
  code -X POST "$API/citizens/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$e\",\"password\":\"$CIT_MDP\",\"fullName\":\"TEST-C Citoyen\"}" >/dev/null
  code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $(tok "$e" "$CIT_MDP")" -H 'Content-Type: application/json' \
    -d "{\"communeId\":\"$TC\",\"adresse\":\"TEST-C, rue de test\"}" >/dev/null
done
CIT_A=$(sql "SELECT c.id FROM users u JOIN citoyens c ON c.user_id = u.id WHERE u.email = '$CIT_A_EMAIL' AND c.commune_id = '$TC'")
CIT_B=$(sql "SELECT c.id FROM users u JOIN citoyens c ON c.user_id = u.id WHERE u.email = '$CIT_B_EMAIL' AND c.commune_id = '$TC'")
[ -n "$CIT_A" ] && [ -n "$CIT_B" ] || { echo "Les citoyens d'essai n'ont pas pu être créés." >&2; exit 1; }
jetons
chk "la campagne travaille sur sa base jetable, pas sur celle des campagnes" "$BASE|t" \
    "$(sql "SELECT current_database()")|$([ "$BASE" != "${PGDATABASE:-siipi_national}" ] && echo t || echo f)"
for _ in $(seq 1 20); do (exec 3<>"/dev/tcp/127.0.0.1/$PORT_SMTP") 2>/dev/null && break; sleep 0.5; done
chk "le serveur SMTP d'essai écoute, et sa boîte est vide" "t|0" \
    "$( (exec 3<>"/dev/tcp/127.0.0.1/$PORT_SMTP") 2>/dev/null && echo t || echo f)|$(recus)"

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "l'état du serveur sans compte : 401" 401 "$(code "$API/courriel/etat")"
chk "… à un directeur de commune, à un citoyen : 403" "403|403" \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/courriel/etat")|$(code -H "Authorization: Bearer $T_A" "$API/courriel/etat")"
chk "l'essai, à un directeur de commune : 403" 403 \
    "$(code -X POST -H "Authorization: Bearer $T_DIR" "$API/courriel/essai")"
chk "la base refuse une ligne qui prétendrait un SMS parti" t \
    "$($PSQL -c "INSERT INTO notifications_citoyen (commune_id, citoyen_id, type, canal, titre, corps, statut)
                 VALUES ('$TC', '$CIT_A', 'notification_ciblee', 'sms', 'TEST-C', 'TEST-C', 'livre');" 2>&1 \
       | grep -q 'notifications_canal_valide' && echo t || echo f)"
chk "… et un statut inventé" t \
    "$($PSQL -c "INSERT INTO notifications_citoyen (commune_id, citoyen_id, type, canal, titre, corps, statut)
                 VALUES ('$TC', '$CIT_A', 'notification_ciblee', 'email', 'TEST-C', 'TEST-C', 'lu_par_le_citoyen');" 2>&1 \
       | grep -q 'notifications_statut_valide' && echo t || echo f)"
code -H "Authorization: Bearer $T_A" "$API/citoyen/preferences" >/dev/null
chk "par défaut, un citoyen n'a demandé aucun courriel (sur demande), le push reste activé" "0|3" \
    "$(python3 -c "import json;d=json.load(open('$T/r.json'));print(sum(x['active'] for x in d if x['canal']=='email'),sum(x['active'] for x in d if x['canal']=='push'),sep='|')")"

# -----------------------------------------------------------------------------
echo
echo "2. Aucun serveur désigné : rien ne part, et c'est dit"
code -H "Authorization: Bearer $T_FNCT" "$API/courriel/etat" >/dev/null
chk "l'état le dit : non configuré, aucun serveur" "False|None" "$(val "['configure']")|$(val "['serveur']")"
code -X POST -H "Authorization: Bearer $T_FNCT" "$API/courriel/essai" >/dev/null
chk "l'essai : « non_configure », jamais « envoyé »" non_configure "$(val "['statut']")"
CODE=$(code -X POST "$API/comptes" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"test-courriel-agent1@example.test\",\"fullName\":\"TEST-C Agent un\",\"role\":\"admin_commune\",\"communeId\":\"$TC\"}")
chk "un compte s'ouvre : 201, courriel « non_configure »" "201|non_configure" "$CODE|$(val "['courriel']['statut']")"
chk "… et le mot de passe provisoire revient au cadre, qui le transmettra" t \
    "$(val "['motDePasseProvisoire']" | grep -Eq '^[A-Z][a-z]{5}-[0-9]{4}$' && echo t || echo f)"
code -X PUT "$API/citoyen/preferences" -H "Authorization: Bearer $T_A" -H 'Content-Type: application/json' \
  -d '{"preferences":[{"canal":"email","type":"notification_ciblee","active":true},{"canal":"email","type":"decision_reclamation","active":true}]}' >/dev/null
PUB0=$(publier "TEST-C publication sans serveur")
chk "une publication part : 201" 201 "$(cat "$T/envoi.code")"
chk "le citoyen qui a demandé le courriel : une ligne « non_configure » ; l'autre : aucune" "non_configure|" \
    "$(statut_courriel "$PUB0" "$CIT_A")|$(statut_courriel "$PUB0" "$CIT_B")"
chk "la boîte du serveur d'essai est restée vide" 0 "$(recus)"

# -----------------------------------------------------------------------------
echo
echo "3. Un serveur désigné : le courriel part"
api_avec_serveur "$PORT_SMTP"
jetons
code -H "Authorization: Bearer $T_FNCT" "$API/courriel/etat" >/dev/null
chk "l'état : configuré, le serveur, sa sécurité" "True|127.0.0.1:$PORT_SMTP|aucune" \
    "$(val "['configure']")|$(val "['serveur']")|$(val "['securite']")"
chk "… et jamais le mot de passe du serveur" f "$(grep -q "$SECRET_SMTP" "$T/r.json" && echo t || echo f)"
code -X POST -H "Authorization: Bearer $T_FNCT" "$API/courriel/essai" >/dev/null
chk "l'essai part, à l'adresse du compte FNCT et à nulle autre" "envoye|admin.national@siipi.tn|1|1" \
    "$(val "['statut']")|$(val "['destinataire']")|$(recus)|$(recus_pour admin.national@siipi.tn)"

AGENT2="test-courriel-agent2@example.test"
CODE=$(code -X POST "$API/comptes" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$AGENT2\",\"fullName\":\"TEST-C Agent deux\",\"role\":\"admin_commune\",\"communeId\":\"$TC\"}")
chk "un compte s'ouvre : 201, courriel « envoye »" "201|envoye" "$CODE|$(val "['courriel']['statut']")"
chk "… et le mot de passe provisoire N'EST PAS dans la réponse" f \
    "$(python3 -c "import json;print('t' if 'motDePasseProvisoire' in json.load(open('$T/r.json')) else 'f')")"
MDP2=$(mdp_du_courriel "$AGENT2")
chk "le titulaire l'a reçu, avec l'adresse du portail" "t|Votre compte SIIPI|t" \
    "$(echo "$MDP2" | grep -Eq '^[A-Z][a-z]{5}-[0-9]{4}$' && echo t || echo f)|$(dernier "$AGENT2" sujet)|$(dernier "$AGENT2" texte | grep -q "$PORTAIL" && echo t || echo f)"
curl -s -o "$T/r.json" -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$AGENT2\",\"password\":\"$MDP2\"}"
chk "le mot de passe du courriel ouvre le compte, marqué provisoire" "t|True" \
    "$([ -n "$(val "['token']")" ] && [ "$(val "['token']")" != erreur ] && echo t || echo f)|$(val "['user']['motDePasseProvisoire']")"
chk "il n'est écrit ni dans le journal de l'API, ni dans la base" "f|0" \
    "$(grep -q "$MDP2" "$T/api_$PORT_ESSAI.log" && echo t || echo f)|$(sql "SELECT (SELECT count(*) FROM audit_log a WHERE a::text LIKE '%$MDP2%') + (SELECT count(*) FROM users u WHERE u::text LIKE '%$MDP2%') + (SELECT count(*) FROM notifications_citoyen n WHERE n::text LIKE '%$MDP2%')")"
AGENT2_ID=$(sql "SELECT id FROM users WHERE email = '$AGENT2'")
code -X POST -H "Authorization: Bearer $T_DIR" "$API/comptes/$AGENT2_ID/mot-de-passe" >/dev/null
MDP2B=$(mdp_du_courriel "$AGENT2")
chk "une réinitialisation : envoyée, absente de la réponse, un nouveau mot de passe reçu" "envoye|f|Votre nouveau mot de passe SIIPI|t" \
    "$(val "['courriel']['statut']")|$(grep -q 'motDePasseProvisoire' "$T/r.json" && echo t || echo f)|$(dernier "$AGENT2" sujet)|$([ -n "$MDP2B" ] && [ "$MDP2B" != "$MDP2" ] && echo t || echo f)"

AVANT=$(recus)
PUB1=$(publier "TEST-C publication avec serveur")
chk "une publication part : 201" 201 "$(cat "$T/envoi.code")"
chk "un courriel, au seul citoyen qui l'a demandé, avec le titre en sujet" "1|1|0|TEST-C publication avec serveur" \
    "$(( $(recus) - AVANT ))|$(recus_pour "$CIT_A_EMAIL")|$(recus_pour "$CIT_B_EMAIL")|$(dernier "$CIT_A_EMAIL" sujet)"
chk "… avec le lien vers la publication et la manière de s'en désabonner" "t|t" \
    "$(dernier "$CIT_A_EMAIL" texte | grep -q "$PORTAIL/publications/$PUB1" && echo t || echo f)|$(dernier "$CIT_A_EMAIL" texte | grep -q 'Mes notifications' && echo t || echo f)"
chk "consigné « livre » pour lui, rien pour l'autre" "livre|" "$(statut_courriel "$PUB1" "$CIT_A")|$(statut_courriel "$PUB1" "$CIT_B")"
chk "le push n'est pas remplacé : une ligne push pour chacun des deux" 2 \
    "$(sql "SELECT count(DISTINCT citoyen_id) FROM notifications_citoyen WHERE reference_id = '$PUB1' AND canal = 'push'")"
code -H "Authorization: Bearer $T_A" "$API/citoyen/notifications" >/dev/null
chk "l'historique « Mes notifications » reste celui du push : aucun courriel dedans" "0|t" \
    "$(python3 -c "import json;d=json.load(open('$T/r.json'));print(sum(1 for n in d if n['canal']=='email'))")|$(python3 -c "import json;d=json.load(open('$T/r.json'));print('t' if any(n['canal']=='push' for n in d) else 'f')")"
AUJ=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date")
code -H "Authorization: Bearer $T_DIR" "$API/communication/indicateurs?communeId=$TC&debut=$AUJ&fin=$AUJ" >/dev/null
chk "les indicateurs comptent les courriels à part : 2, dont 1 accepté, 1 non parti" "2|1|0|1" \
    "$(val "['volumetrie']['courriels']['total']")|$(val "['volumetrie']['courriels']['envoye']")|$(val "['volumetrie']['courriels']['echec']")|$(val "['volumetrie']['courriels']['non_configure']")"

TICKET_A=$(sql "INSERT INTO tickets (ticket_number, commune_id, category, title, citizen_id, status)
                VALUES ('TEST-C-A', '$TC', 'point_noir', 'TEST-C ticket A', '$CIT_A', 'recu') RETURNING id")
TICKET_B=$(sql "INSERT INTO tickets (ticket_number, commune_id, category, title, citizen_id, status)
                VALUES ('TEST-C-B', '$TC', 'point_noir', 'TEST-C ticket B', '$CIT_B', 'recu') RETURNING id")
AVANT=$(recus)
code -X PATCH -H "Authorization: Bearer $T_DIR" "$API/tickets/$TICKET_A/accept" >/dev/null
code -X PATCH -H "Authorization: Bearer $T_DIR" "$API/tickets/$TICKET_B/accept" >/dev/null
chk "une décision sur une réclamation : un courriel au citoyen qui l'a demandé, aucun à l'autre" "1|Votre réclamation a été acceptée|livre|" \
    "$(( $(recus) - AVANT ))|$(dernier "$CIT_A_EMAIL" sujet)|$(statut_courriel "$TICKET_A" "$CIT_A")|$(statut_courriel "$TICKET_B" "$CIT_B")"
code -H "Authorization: Bearer $T_DIR" "$API/tickets?communeId=$TC" >/dev/null
chk "le ticket montre le statut du push (sans navigateur), pas celui du courriel" sans_souscription \
    "$(python3 -c "import json;print(next(t['notification_statut'] for t in json.load(open('$T/r.json')) if t['id']=='$TICKET_A'))" 2>/dev/null)"

code -X PUT "$API/citoyen/preferences" -H "Authorization: Bearer $T_A" -H 'Content-Type: application/json' \
  -d '{"preferences":[{"canal":"email","type":"notification_ciblee","active":false}]}' >/dev/null
AVANT=$(recus)
PUB2=$(publier "TEST-C après désabonnement")
chk "le citoyen retire sa demande : plus aucun courriel, plus aucune ligne courriel" "0|0" \
    "$(( $(recus) - AVANT ))|$(courriels_de "$PUB2")"
$PSQL -c "UPDATE citoyens SET notifications = false WHERE id = '$CIT_A';" >/dev/null
code -X PATCH -H "Authorization: Bearer $T_DIR" "$API/tickets/$(sql "INSERT INTO tickets (ticket_number, commune_id, category, title, citizen_id, status)
  VALUES ('TEST-C-A2', '$TC', 'point_noir', 'TEST-C ticket A2', '$CIT_A', 'recu') RETURNING id")/accept" >/dev/null
chk "un citoyen qui refuse toute notification ne reçoit pas de courriel, même demandé" "0" "$(( $(recus) - AVANT ))"
$PSQL -c "UPDATE citoyens SET notifications = true WHERE id = '$CIT_A';" >/dev/null

# -----------------------------------------------------------------------------
echo
echo "4. Un serveur injoignable : l'échec est dit, rien n'est perdu"
api_avec_serveur "$PORT_MORT"
jetons
code -X POST -H "Authorization: Bearer $T_FNCT" "$API/courriel/essai" >/dev/null
chk "l'essai : « echec », avec le message du serveur" "echec|t" "$(val "['statut']")|$([ -n "$(val "['erreur']")" ] && echo t || echo f)"
CODE=$(code -X POST "$API/comptes" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"test-courriel-agent3@example.test\",\"fullName\":\"TEST-C Agent trois\",\"role\":\"admin_commune\",\"communeId\":\"$TC\"}")
MDP3=$(val "['motDePasseProvisoire']")
chk "un compte s'ouvre quand même : 201, « echec », et le mot de passe revient au cadre" "201|echec|t" \
    "$CODE|$(val "['courriel']['statut']")|$(echo "$MDP3" | grep -Eq '^[A-Z][a-z]{5}-[0-9]{4}$' && echo t || echo f)"
chk "… le journal de l'API dit l'échec, sans le mot de passe" "t|f" \
    "$(grep -q "\[courriel\] échec d'envoi" "$T/api_$PORT_ESSAI.log" && echo t || echo f)|$(grep -q "$MDP3" "$T/api_$PORT_ESSAI.log" && echo t || echo f)"
code -X PUT "$API/citoyen/preferences" -H "Authorization: Bearer $T_A" -H 'Content-Type: application/json' \
  -d '{"preferences":[{"canal":"email","type":"notification_ciblee","active":true}]}' >/dev/null
PUB3=$(publier "TEST-C serveur injoignable")
chk "une publication part quand même : 201, le courriel consigné « echec »" "201|echec" \
    "$(cat "$T/envoi.code")|$(statut_courriel "$PUB3" "$CIT_A")"
chk "rien n'est arrivé dans la boîte d'essai pendant ce temps" 0 "$(recus_pour test-courriel-agent3@example.test)"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
