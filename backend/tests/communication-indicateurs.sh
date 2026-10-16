#!/usr/bin/env bash
# =============================================================================
# Les indicateurs de communication (B5.5.4 : délai, volumétrie, taux).
#
# Elle commence par ce que la plateforme REFUSE : sans compte, un citoyen, un
# prestataire, le directeur d'une autre commune (introuvable, aussi en SQL
# direct), une période à l'envers ou mal écrite.
#
# Puis elle bâtit sa commune et un jeu complet — publications, envois, envois
# individuels par issue, réponses à un sondage, points proposés et décidés — et
# confronte la réponse aux valeurs d'un témoin (tests/donnees/
# communication_indicateurs.py) qui ne lit que le jeu et la définition des
# indicateurs. Le jeu met une publication une heure avant et une heure après la
# fin de la période, en heure de Tunis : un calcul en dates UTC se tromperait.
# Enfin : sur une période vide, aucun taux n'est 0, ils sont null ; et la
# réponse ne nomme aucun citoyen.
#
#   docker compose exec -T api npm run test:communication-indicateurs
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
JEU="tests/donnees/communication_indicateurs.py"

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
req() { curl -s -o "$T/r.json" -w '%{http_code}' -H "Authorization: Bearer ${2:-$T_DIR}" "$API$1"; }
# py <expression> : évaluée sur la réponse (d) et les valeurs attendues (A).
py() {
  python3 - "$T" "$1" <<'PYEOF' 2>/dev/null || echo erreur
import json, sys
t, expr = sys.argv[1], sys.argv[2]
d = json.load(open(f'{t}/r.json'))
A = json.load(open(f'{t}/attendus.json'))
print(eval(expr))
PYEOF
}

TC=test_communication_ind
PREFIXE=TEST-COMIND
COMMUNE_DIR="$TC"
. tests/outils/directeur_temporaire.sh
nettoyer() {
  $PSQL -c "DELETE FROM sondage_reponses WHERE publication_id IN (SELECT id FROM publications WHERE commune_id = '$TC');" \
        -c "DELETE FROM sondage_questions WHERE publication_id IN (SELECT id FROM publications WHERE commune_id = '$TC');" \
        -c "DELETE FROM notifications_citoyen WHERE commune_id = '$TC';" \
        -c "DELETE FROM envois_notification WHERE commune_id = '$TC';" \
        -c "DELETE FROM publications WHERE commune_id = '$TC';" \
        -c "DELETE FROM points_suggeres WHERE commune_id = '$TC';" \
        -c "DELETE FROM points_collecte WHERE commune_id = '$TC';" \
        -c "DELETE FROM circuits WHERE commune_id = '$TC';" \
        -c "DELETE FROM citoyens WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-comind-citoyen-%@example.test');" \
        -c "DELETE FROM users WHERE email LIKE 'test-comind-citoyen-%@example.test';" >/dev/null 2>&1
}
fin() {
  nettoyer
  retirer_directeur_temporaire
  $PSQL -c "DELETE FROM audit_log WHERE commune_id = '$TC';" -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
  rm -rf "$T"
}
nettoyer
$PSQL -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune de la communication', 'TEST', 'TEST', 5000);" >/dev/null
directeur_temporaire "$TC"
trap fin EXIT
T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
T_FNCT=$(tok admin.national@siipi.tn)
T_AUTRE=$(tok directeur.marsa@siipi.tn)
T_PREST=$(tok prestataire.marsa@siipi.tn)
T_CIT=$(tok citoyen.demo@siipi.tn)
[ -n "$T_DIR" ] && [ -n "$T_FNCT" ] && [ -n "$T_AUTRE" ] && [ -n "$T_PREST" ] && [ -n "$T_CIT" ] \
  || { echo "API injoignable sur $API, ou compte d'essai absent" >&2; exit 1; }
AUTRE_ID=$(sql "SELECT id FROM users WHERE email = 'directeur.marsa@siipi.tn'")
I="/communication/indicateurs?communeId=$TC"
P="&debut=2026-01-01&fin=2026-06-30"

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "sans compte : 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$API$I$P")"
chk "un citoyen, un prestataire : 403" "403|403" "$(req "$I$P" "$T_CIT")|$(req "$I$P" "$T_PREST")"
chk "le directeur d'une autre commune : introuvable (404)" 404 "$(req "$I$P" "$T_AUTRE")"
chk "… et la base le refuse aussi en SQL direct" t \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$AUTRE_ID', true);
                 SET LOCAL ROLE siipi_app; SELECT app.indicateurs_communication('$TC', '2026-01-01', '2026-06-30'); COMMIT;" 2>&1 \
       | grep -q 'COMMUNICATION_INTROUVABLE' && echo t || echo f)"
chk "une période à l'envers, une date mal écrite, une borne absente : 400" "400|400|400" \
    "$(req "$I&debut=2026-06-30&fin=2026-01-01")|$(req "$I&debut=2026-1-1&fin=2026-06-30")|$(req "$I&debut=2026-01-01")"
chk "une commune qui n'existe pas : 404" 404 "$(req "/communication/indicateurs?communeId=test_aucune$P" "$T_FNCT")"

# -----------------------------------------------------------------------------
echo
echo "2. Une période sans rien : des comptes à 0, des taux null — jamais 0"
chk "le directeur lit ses indicateurs : 200" 200 "$(req "$I&debut=2020-01-01&fin=2020-12-31")"
cp "$T/r.json" "$T/vide.json"
echo '{}' > "$T/attendus.json"
chk "aucun envoi, aucune publication, aucun point" "0|0|0" \
    "$(py "f\"{d['volumetrie']['envois']}|{sum(d['volumetrie']['publications'].values())}|{d['volumetrie']['suggestions_recues']}\"")"
chk "les cinq taux sont null" "[None, None, None, None, None]" "$(py "[d['taux'][k]['valeur'] for k in ('livraison', 'lecture', 'portee', 'validation_suggestions', 'participation_sondages')]")"
chk "le délai de décision aussi" None "$(py "d['delais']['decision_suggestion_h']['mediane']")"

# -----------------------------------------------------------------------------
echo
echo "3. Le jeu d'essai : chaque indicateur est celui du témoin"
python3 "$JEU" sql "$TC" "$PREFIXE" > "$T/jeu.sql"
python3 "$JEU" attendus > "$T/attendus.json"
$PSQL -v ON_ERROR_STOP=1 -f "$T/jeu.sql" >/dev/null 2>"$T/jeu.err"
chk "le jeu est bâti (6 publications, 5 envois, 54 envois push, 10 courriels, 4 réponses, 6 points)" "6|5|54|10|4|6" \
    "$(sql "SELECT (SELECT count(*) FROM publications WHERE commune_id = '$TC') || '|' || (SELECT count(*) FROM envois_notification WHERE commune_id = '$TC')
              || '|' || (SELECT count(*) FROM notifications_citoyen WHERE commune_id = '$TC' AND canal = 'push')
              || '|' || (SELECT count(*) FROM notifications_citoyen WHERE commune_id = '$TC' AND canal = 'email')
              || '|' || (SELECT count(*) FROM sondage_reponses r JOIN publications p ON p.id = r.publication_id WHERE p.commune_id = '$TC')
              || '|' || (SELECT count(*) FROM points_suggeres WHERE commune_id = '$TC')")"
chk "le directeur : 200" 200 "$(req "$I$P")"
chk "la volumétrie est celle du témoin" True "$(py "d['volumetrie'] == A['volumetrie']")"
chk "les courriels sont comptés à part : 7 dans la période, dont 4 acceptés, 1 en échec, 2 non partis" "7|4|1|2" \
    "$(py "'|'.join(str(d['volumetrie']['courriels'][k]) for k in ('total', 'envoye', 'echec', 'non_configure'))")"
chk "… et ne comptent pas parmi les envois push (44 dans la période, 30 livrés)" "44|30" \
    "$(py "f\"{d['volumetrie']['envois_individuels']['total']}|{d['volumetrie']['envois_individuels']['livre']}\"")"
chk "… dont la publication de 23 h 30 le 30 juin, et pas celle de 0 h 30 le 1er juillet (heure de Tunis)" 1 \
    "$(py "d['volumetrie']['publications']['projet']")"
chk "le délai médian de décision sur un point proposé : 48 h, sur 3 décisions" "48.0|3" \
    "$(py "f\"{float(d['delais']['decision_suggestion_h']['mediane'])}|{d['delais']['decision_suggestion_h']['decisions']}\"")"
chk "… égal à celui du témoin" True "$(py "d['delais']['decision_suggestion_h'] == A['delais']['decision_suggestion_h']")"
chk "un point en attente (le point retiré ne compte pas), le plus ancien depuis le 1er mai" "1|$(sql "SELECT extract(day FROM now() - '2026-05-01 08:00+01'::timestamptz)::int")" \
    "$(py "f\"{d['delais']['suggestions_en_attente']['nombre']}|{d['delais']['suggestions_en_attente']['plus_ancienne_jours']}\"")"
for k in livraison lecture portee validation_suggestions participation_sondages; do
  chk "taux de $k : celui du témoin ($(python3 -c "import json;a=json.load(open('$T/attendus.json'))['taux']['$k'];print(f\"{a['numerateur']}/{a['denominateur']}\")"))" True \
      "$(py "d['taux']['$k'] == A['taux']['$k']")"
done
chk "la FNCT lit les mêmes chiffres" True "$(cp "$T/r.json" "$T/dir.json"; req "$I$P" "$T_FNCT" >/dev/null; py "d == json.load(open('$T/dir.json'))")"

# -----------------------------------------------------------------------------
echo
echo "4. Rien de nominatif"
CITS=$($PSQL -c "SELECT string_agg(c.id::text, ' ') FROM citoyens c JOIN users u ON u.id = c.user_id WHERE u.email LIKE 'test-comind-citoyen-%@example.test'" 2>/dev/null)
chk "quatre citoyens d'essai existent" 4 "$(echo "$CITS" | wc -w | tr -d ' ')"
chk "la réponse ne contient ni identifiant ni courriel de citoyen" 0 \
    "$(n=0; for c in $CITS; do grep -q "$c" "$T/r.json" && n=$((n+1)); done; grep -q 'example.test' "$T/r.json" && n=$((n+1)); echo $n)"
chk "elle ne porte que des comptes, des taux et des délais (aucune liste)" 0 \
    "$(py "sum(1 for x in json.dumps(d) if x == '[')")"
[ -s "$T/jeu.err" ] && { echo "  Le jeu n'a pas pu être bâti :"; head -5 "$T/jeu.err"; }

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
