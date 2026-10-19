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
# ELLE NE TOUCHE À AUCUNE COMMUNE RÉELLE (JC-014). Jusqu'à la v0.15.54, elle
# écrivait avec les comptes de démonstration (directeur.marsa) dans leurs
# communes réelles (La Marsa, Sfax), puis effaçait ses lignes : rien ne restait
# dans les tables, mais le journal d'audit gardait les écritures de la
# commune, et cela suffisait à la faire paraître « active » au tableau
# national. Elle travaille désormais dans des communes de test qui en tiennent
# le rôle, avec des comptes temporaires, et prouve, pendant qu'elle a ses
# lignes en base puis en partant, qu'aucune commune réelle n'a reçu de ligne.
#
#   docker compose run --rm api npm run test:intercommunal
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
code() { curl -s -o /tmp/siipi_ic.json -w '%{http_code}' "$@"; }
len()  { python3 -c "import json;d=json.load(open('/tmp/siipi_ic.json'));print(len(d) if isinstance(d,list) else 'non-liste')" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

A=test_intercommunal_marsa            # commune principale du directeur
B=test_intercommunal_sfax    # commune où on va le rattacher

# Les communes de test qui tiennent le rôle des communes réelles, et leurs
# comptes temporaires (JC-014).
ESSAI_C="'test_intercommunal_marsa','test_intercommunal_sfax'"
. "$(dirname "$0")/outils/comptes_temporaires.sh"
. "$(dirname "$0")/outils/communes_essai.sh"
. "$(dirname "$0")/outils/base_reelle.sh"
nettoyer_c() {
  effacer_communes_essai "$ESSAI_C"
  retirer_comptes_temporaires
  effacer_communes_essai "$ESSAI_C"
}
nettoyer_c
trap nettoyer_c EXIT
releve_base_reelle
commune_essai "test_intercommunal_marsa" "TEST commune La Marsa de la campagne intercommunal"
commune_essai "test_intercommunal_sfax" "TEST commune Sfax de la campagne intercommunal"
compte_temporaire admin_commune "test_intercommunal_marsa" "DIR_MARSA de la campagne"; EM_DIR_MARSA=$COMPTE_EMAIL; MDP_DIR_MARSA=$COMPTE_MDP

T_A=$(tok "$EM_DIR_MARSA" "$MDP_DIR_MARSA")
[ -n "$T_A" ] || { echo "API injoignable sur $API" >&2; exit 1; }
DIR_A=$(sql "SELECT id FROM users WHERE email='$EM_DIR_MARSA'")

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
T_A=$(tok "$EM_DIR_MARSA" "$MDP_DIR_MARSA")
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
T_A=$(tok "$EM_DIR_MARSA" "$MDP_DIR_MARSA")
chk "le circuit de $B redevient invisible" 0 "$(compter "$T_A")"
chk "et le panneau de cohérence de $B se referme" \
    403 "$(code "$API/communes/$B/coherence" -H "Authorization: Bearer $T_A")"

nettoyer

echo
echo "Aucune commune réelle n'a reçu de ligne (JC-014)"
base_reelle_intacte "pendant la campagne"
nettoyer_c
chk "ses communes de test et ses comptes temporaires sont effacés" "0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
