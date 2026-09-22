#!/usr/bin/env bash
# =============================================================================
# Test du rattachement multi-communes (migration 027).
#
# La mutualisation — un agent, un marché, plusieurs communes — est l'objet même
# de SIIPI. Sept politiques de cloisonnement la contredisaient pourtant : elles
# comparaient la commune de la ligne à la commune PRINCIPALE de l'agent. Un
# directeur rattaché à deux communes pouvait choisir la seconde dans
# l'interface et obtenait un écran vide : pas un refus, pas une erreur — rien.
#
# Ce test vérifie les deux moitiés, indissociables : l'agent rattaché LIT sa
# seconde commune, et l'agent non rattaché n'en lit rien.
#
# Il couvre aussi, depuis la correction n° 14, le garde APPLICATIF
# (requireCommuneAccess) et non plus seulement les politiques RLS. Les deux
# doivent répondre pareil : quand la base accorde et que le middleware refuse,
# l'utilisateur reçoit un 403 sur un écran dont il voit les données partout
# ailleurs — et n'a aucun moyen de comprendre pourquoi.
#
#   docker compose run --rm api npm run test:intercommunal
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Siipi2026!\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
code() { curl -s -o /tmp/siipi_ic.json -w '%{http_code}' "$@"; }
len()  { python3 -c "import json;d=json.load(open('/tmp/siipi_ic.json'));print(len(d) if isinstance(d,list) else 'non-liste')" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

A=tunis_la_marsa            # commune principale du directeur
B=sfax_sfax_ville_medina    # commune où on va le rattacher

T_A=$(tok directeur.marsa@siipi.tn)
[ -n "$T_A" ] || { echo "API injoignable sur $API" >&2; exit 1; }
DIR_A=$(sql "SELECT id FROM users WHERE email='directeur.marsa@siipi.tn'")

nettoyer() {
  $PSQL -c "DELETE FROM circuits WHERE nom = 'TEST intercommunal';
            DELETE FROM utilisateur_communes WHERE user_id='$DIR_A' AND commune_id='$B';" >/dev/null 2>&1
}
nettoyer
$PSQL -c "INSERT INTO circuits (commune_id, nom, jours_passage) VALUES ('$B','TEST intercommunal',ARRAY[1]::smallint[]);" >/dev/null 2>&1

compter() {
  code "$API/circuits?communeId=$B" -H "Authorization: Bearer $1" >/dev/null
  python3 -c "
import json
d = json.load(open('/tmp/siipi_ic.json'))
print(sum(1 for x in d if x.get('nom') == 'TEST intercommunal') if isinstance(d, list) else 'non-liste')" 2>/dev/null
}

echo
echo "1. Sans rattachement, la seconde commune reste fermée"
chk "le directeur de $A ne voit pas les circuits de $B" 0 "$(compter "$T_A")"
chk "le panneau de cohérence de $B lui est refusé" \
    403 "$(code "$API/communes/$B/coherence" -H "Authorization: Bearer $T_A")"

echo
echo "2. Rattaché, il y accède — c'est tout l'objet de la mutualisation"
$PSQL -c "INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$DIR_A','$B');" >/dev/null 2>&1
T_A=$(tok directeur.marsa@siipi.tn)
chk "il voit le circuit de sa seconde commune" 1 "$(compter "$T_A")"
# Le défaut d'origine rendait 0 ici : l'écran restait vide sans rien dire.
CODE=$(code "$API/tickets?communeId=$B" -H "Authorization: Bearer $T_A")
chk "et les réclamations de cette commune lui sont accessibles" 200 "$CODE"
# Le garde applicatif ne consultait que la commune principale portée par le
# jeton : il rendait 403 ici alors que les deux lignes précédentes passaient.
chk "le panneau de cohérence de $B s'ouvre" \
    200 "$(code "$API/communes/$B/coherence" -H "Authorization: Bearer $T_A")"

echo
echo "3. Sa commune principale reste lisible"
code "$API/circuits?communeId=$A" -H "Authorization: Bearer $T_A" >/dev/null
chk "les circuits de $A répondent toujours" 200 "$(code "$API/circuits?communeId=$A" -H "Authorization: Bearer $T_A")"

echo
echo "4. Un rattachement échu referme la porte"
$PSQL -c "UPDATE utilisateur_communes SET date_fin='2026-01-01' WHERE user_id='$DIR_A' AND commune_id='$B';" >/dev/null 2>&1
T_A=$(tok directeur.marsa@siipi.tn)
chk "le circuit de $B redevient invisible" 0 "$(compter "$T_A")"
chk "et le panneau de cohérence de $B se referme" \
    403 "$(code "$API/communes/$B/coherence" -H "Authorization: Bearer $T_A")"

nettoyer

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
