#!/usr/bin/env bash
# =============================================================================
# Les paramètres — Jalon 7, lot 1 (B6.2 préférences et seuils, B6.4 format de
# date, B6.6 unités).
#
# CE QUI EST VÉRIFIÉ.
#   - Chacun règle ses préférences, et elles lui reviennent à la connexion et
#     à la reprise de session ; elles ne touchent que son compte.
#   - Un seuil de la commune déclenche réellement quelque chose : une
#     réclamation qui attend au-delà du délai remonte dans « À vérifier », et
#     n'y remonte plus quand le délai s'allonge ; une action planifiée
#     dépassée et un entretien en retard y remontent aussi ; le préavis
#     d'entretien par défaut s'applique au plan suivant.
#   - Les seuils ne se règlent que par la commune et la FNCT.
#
# ELLE NE TOUCHE À AUCUNE COMMUNE RÉELLE (JC-011). Jusqu'à la v0.15.52, elle
# prenait « le premier directeur de la base » — sur la pile d'essai, le compte
# de démonstration de La Marsa ; sur une base portant de vrais directeurs, le
# plus ancien d'entre eux — et écrivait dans sa commune ; son cloisonnement
# empruntait de même le premier directeur d'une autre commune, ou le premier
# prestataire de la base. Elle travaille désormais dans deux communes de test,
# avec des comptes temporaires (tests/outils/comptes_temporaires.sh), efface
# en partant tout ce qu'elles portent (tests/outils/communes_essai.sh), et
# prouve, pendant qu'elle a ses lignes en base puis en partant, qu'aucune
# commune réelle n'a reçu de ligne (tests/outils/base_reelle.sh).
#
#   docker compose exec -T api npm run test:parametres
# =============================================================================

set -u
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
jour() { date -u -d "$1 days" +%Y-%m-%d; }
# Les avis « À vérifier » d'un domaine, pour la commune.
avis() { req GET "/communes/$COMMUNE/coherence" >/dev/null; val "[e['$2'] for e in d if e['domaine']=='$1']"; }

COMMUNE=test_parametres
AUTRE_COMMUNE=test_parametres_b
ESSAI="'$COMMUNE','$AUTRE_COMMUNE'"
. "$(dirname "$0")/outils/comptes_temporaires.sh"
. "$(dirname "$0")/outils/communes_essai.sh"
. "$(dirname "$0")/outils/base_reelle.sh"
T_FNCT=$(tok admin.national@siipi.tn)
# Un citoyen à soi : la campagne réglait jusqu'ici les préférences du compte de
# démonstration, et les remettait à vide au lieu de les rendre.
CIT_EMAIL="test-parametres-citoyen@example.test"
CIT_MDP="TEST-Citoyen-$$"

nettoyer() {
  $PSQL -c "DELETE FROM citoyens WHERE user_id IN (SELECT id FROM users WHERE email = '$CIT_EMAIL');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM users WHERE email = '$CIT_EMAIL';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM parametres_commune WHERE commune_id = '$COMMUNE';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM tickets WHERE title LIKE 'TEST-J7%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM actions_planifiees WHERE titre LIKE 'TEST-J7%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM plans_entretien WHERE vehicule_id IN (SELECT id FROM vehicules WHERE registration LIKE 'TEST-J7%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM vehicules WHERE registration LIKE 'TEST-J7%';" >/dev/null 2>&1
}
nettoyer
# Son nettoyage d'origine, puis tout ce que portent ses communes de test.
nettoyer_essai() {
  nettoyer
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
}
nettoyer_essai
trap 'nettoyer_essai; rm -rf "$T"' EXIT
releve_base_reelle
commune_essai "$COMMUNE" "TEST commune de la campagne parametres"
commune_essai "$AUTRE_COMMUNE" "TEST autre commune de la campagne parametres"
compte_temporaire admin_commune "$COMMUNE" "Directeur de la campagne"
DIR_EMAIL=$COMPTE_EMAIL; DIR_MDP=$COMPTE_MDP; DIR_ID=$COMPTE_ID
compte_temporaire admin_commune "$AUTRE_COMMUNE" "Directeur de l'autre commune"
AUTRE_EMAIL=$COMPTE_EMAIL; AUTRE_MDP=$COMPTE_MDP
compte_temporaire gestionnaire_prestataire "$COMMUNE" "Prestataire de la campagne"
PREST_EMAIL=$COMPTE_EMAIL; PREST_MDP=$COMPTE_MDP; PREST_USER=$COMPTE_ID
T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API, ou directeur de test non créé" >&2; exit 1; }

# -----------------------------------------------------------------------------
echo
echo "1. Les préférences de chacun"
chk "sans choix, les valeurs par défaut" "200|jj/mm/aaaa|t|m3|km2|None|information" \
    "$(req GET /comptes/moi/preferences)|$(val "d['formatDate']")|$(val "d['unites']['masse']")|$(val "d['unites']['volume']")|$(val "d['unites']['surface']")|$(val "d['langue']")|$(val "d['alertes']['graviteMin']")"
chk "choisir la date ISO et les kilogrammes" "200|aaaa-mm-jj|kg|m3" \
    "$(req PUT /comptes/moi/preferences '{"formatDate":"aaaa-mm-jj","unites":{"masse":"kg"}}')|$(val "d['formatDate']")|$(val "d['unites']['masse']")|$(val "d['unites']['volume']")"
chk "un changement partiel ne défait pas le reste" "kg|l|aaaa-mm-jj" \
    "$(req PUT /comptes/moi/preferences '{"unites":{"volume":"l"}}' >/dev/null; val "d['unites']['masse']")|$(val "d['unites']['volume']")|$(val "d['formatDate']")"
chk "un format inconnu est refusé" 400 "$(req PUT /comptes/moi/preferences '{"formatDate":"mm/jj/aaaa"}')"
chk "une clé inconnue est refusée" 400 "$(req PUT /comptes/moi/preferences '{"couleur":"rose"}')"
chk "un domaine d'alerte inconnu est refusé" 400 "$(req PUT /comptes/moi/preferences '{"alertes":{"domainesMasques":["meteo"]}}')"
req PUT /comptes/moi/preferences '{"langue":"ar","alertes":{"domainesMasques":["pesees"],"graviteMin":"avertissement"}}' >/dev/null
chk "la reprise de session les rend" "aaaa-mm-jj|ar|pesees" \
    "$(req GET /auth/me >/dev/null; val "d['preferences']['formatDate']")|$(val "d['preferences']['langue']")|$(val "','.join(d['preferences']['alertes']['domainesMasques'])")"
chk "la connexion aussi" "kg" \
    "$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$DIR_EMAIL\",\"password\":\"$DIR_MDP\"}" \
       | python3 -c "import sys,json;print(json.load(sys.stdin)['user']['preferences']['unites']['masse'])" 2>/dev/null)"
curl -s -o /dev/null -X POST "$API/citizens/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$CIT_EMAIL\",\"password\":\"$CIT_MDP\",\"fullName\":\"TEST Citoyen des paramètres\"}"
T_CIT=$(tok "$CIT_EMAIL" "$CIT_MDP")
chk "le citoyen d'essai se connecte" t "$([ -n "$T_CIT" ] && echo t || echo f)"
chk "un citoyen règle les siennes" "200|jj mois aaaa" \
    "$(req PUT /comptes/moi/preferences '{"formatDate":"jj mois aaaa"}' "$T_CIT")|$(val "d['formatDate']")"
chk "sans toucher à celles du cadre" "aaaa-mm-jj" "$(req GET /comptes/moi/preferences >/dev/null; val "d['formatDate']")"

echo
echo "2. Les seuils de la commune"
chk "jamais réglés : les défauts, et l'écran le sait" "200|7|1000|30|True|True" \
    "$(req GET "/communes/$COMMUNE/parametres")|$(val "d['delai_reclamation_jours']")|$(val "d['seuil_entretien_km']")|$(val "d['seuil_entretien_jours']")|$(val "d['alerter_actions_retard']")|$(val "d['par_defaut']")"
chk "un délai de 0 ou de 91 jours est refusé" "400|400" \
    "$(req PUT "/communes/$COMMUNE/parametres" '{"delaiReclamationJours":0}')|$(req PUT "/communes/$COMMUNE/parametres" '{"delaiReclamationJours":91}')"
chk "délai à 3 jours, préavis à 2 500 km" "200|3|2500|30|False" \
    "$(req PUT "/communes/$COMMUNE/parametres" '{"delaiReclamationJours":3,"seuilEntretienKm":2500}')|$(val "d['delai_reclamation_jours']")|$(val "d['seuil_entretien_km']")|$(val "d['seuil_entretien_jours']")|$(val "d['par_defaut']")"
chk "qui et quand sont gardés" "1|1" "$(val "1 if d['auteur'] else 0")|$(val "1 if d['updated_at'] else 0")"
chk "le changement entre au journal d'audit" 1 \
    "$(sql "SELECT count(*) > 0 FROM audit_log WHERE table_name='parametres_commune' AND commune_id='$COMMUNE'" | sed 's/t/1/;s/f/0/')"
# L'autre commune est la commune de test B, avec son directeur temporaire.
chk "une autre commune ne les lit ni ne les change" "403|403" \
    "$(req GET "/communes/$COMMUNE/parametres" "" "$(tok "$AUTRE_EMAIL" "$AUTRE_MDP")")|$(req PUT "/communes/$COMMUNE/parametres" '{"delaiReclamationJours":30}' "$(tok "$AUTRE_EMAIL" "$AUTRE_MDP")")"
# Le prestataire est le prestataire temporaire de la commune de test.
chk "un prestataire non plus" 403 "$(req GET "/communes/$COMMUNE/parametres" "" "$(tok "$PREST_EMAIL" "$PREST_MDP")")"
chk "la FNCT, si" 200 "$(req GET "/communes/$COMMUNE/parametres" "" "$T_FNCT")"

echo
echo "3. Un seuil déclenche une alerte"
$PSQL -c "INSERT INTO tickets (ticket_number, commune_id, category, title, status, created_at)
          VALUES ('TEST-J7-1', '$COMMUNE', 'point_noir', 'TEST-J7 réclamation ancienne', 'recu', now() - interval '4 days'),
                 ('TEST-J7-2', '$COMMUNE', 'point_noir', 'TEST-J7 réclamation récente', 'recu', now() - interval '1 day'),
                 ('TEST-J7-3', '$COMMUNE', 'point_noir', 'TEST-J7 réclamation résolue', 'resolu', now() - interval '20 days');" >/dev/null
chk "délai 3 jours : la réclamation de 4 jours remonte dans « À vérifier »" "1|1" \
    "$(avis reclamations constat | python3 -c "import sys;print(1 if 'plus de 3 jours' in sys.stdin.read() else 0)")|$(avis reclamations gravite | grep -c avertissement)"
chk "ni la récente ni la résolue ne sont comptées" 1 \
    "$(avis reclamations constat | grep -c "^\['1 réclamation")"
req PUT "/communes/$COMMUNE/parametres" '{"delaiReclamationJours":7}' >/dev/null
chk "délai allongé à 7 jours : l'alerte disparaît" "[]" "$(avis reclamations constat)"
req PUT "/communes/$COMMUNE/parametres" '{"delaiReclamationJours":1}' >/dev/null
chk "au triple du délai, elle devient bloquante" 1 "$(avis reclamations gravite | grep -c bloquant)"

$PSQL -c "INSERT INTO actions_planifiees (commune_id, titre, date_prevue) VALUES ('$COMMUNE', 'TEST-J7 action dépassée', CURRENT_DATE - 3);" >/dev/null
chk "une action planifiée dépassée remonte" 1 "$(avis points sujet | grep -c 'TEST-J7 action dépassée')"
req PUT "/communes/$COMMUNE/parametres" '{"alerterActionsRetard":false}' >/dev/null
chk "et se tait si la commune le décide" 0 "$(avis points sujet | grep -c 'TEST-J7 action dépassée')"

req POST "/trucks?communeId=$COMMUNE" '{"registration":"TEST-J7 001","type":"camion","etat":"en_service"}' >/dev/null
V=$(val "d['id']")
chk "le préavis par défaut de la commune s'applique au plan suivant" "201|2500|30" \
    "$(req POST /maintenance/plans "{\"vehiculeId\":\"$V\",\"type\":\"vidange\",\"intervalleJours\":180,\"referenceDate\":\"$(jour -200)\"}")|$(val "d['seuil_alerte_km']")|$(val "d['seuil_alerte_jours']")"
chk "un préavis précisé reste le sien" "201|500" \
    "$(req POST /maintenance/plans "{\"vehiculeId\":\"$V\",\"type\":\"revision\",\"intervalleJours\":365,\"seuilAlerteKm\":500}")|$(val "d['seuil_alerte_km']")"
chk "l'entretien en retard remonte au constat du matin" 1 \
    "$(avis parc constat | grep -c 'TEST-J7 001')"

echo
echo "Aucune commune réelle n'a reçu de ligne (JC-011)"
base_reelle_intacte "pendant la campagne"
nettoyer_essai
chk "ses communes de test et ses comptes temporaires sont effacés" "0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
