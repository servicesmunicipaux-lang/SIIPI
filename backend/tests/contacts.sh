#!/usr/bin/env bash
# =============================================================================
# Contacts — TDR §3.2.7 (C1.1 à C1.3).
#
# L'annuaire de travail d'une commune : des données personnelles de tiers.
# Cette campagne vérifie d'abord ce qui ne doit PAS se voir — ni d'une autre
# commune, ni du prestataire rattaché — puis le CRUD et le retrait logique.
#
#   docker compose exec -T api npm run test:contacts
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
compte() { python3 -c "
import json
print(sum(1 for x in json.load(open('$T/r.json')) if x['id']=='$1'))" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")

nettoyer() { $PSQL -c "DELETE FROM contacts WHERE nom_complet LIKE 'TEST-C%';" >/dev/null 2>&1; }
nettoyer

post() { code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' -d "$1" "$API/contacts?communeId=$COMMUNE"; }
patch() { code -X PATCH -H "Authorization: Bearer ${3:-$T_DIR}" -H 'Content-Type: application/json' -d "$2" "$API/contacts/$1"; }

# -----------------------------------------------------------------------------
echo
echo "1. Ajouter un contact (C1.2)"
CODE=$(post '{"nomComplet":"TEST-C Leila Ben Salah","organisation":"ANGeD","fonction":"Chargée de suivi","categorie":"administration","telephone":"+216 71 000 000","email":"leila@example.test"}')
chk "la fiche s'enregistre" 201 "$CODE"
C1=$(val "['id']")
chk "elle porte la catégorie et l'organisation" "administration|ANGeD" "$(val "['categorie']")|$(val "['organisation']")"
chk "sans téléphone ni courriel, refusé" 400 "$(post '{"nomComplet":"TEST-C Injoignable"}')"
chk "un courriel mal formé est refusé" 400 "$(post '{"nomComplet":"TEST-C Mauvais","email":"pas-un-courriel"}')"
chk "une catégorie inconnue est refusée" 400 "$(post '{"nomComplet":"TEST-C Cat","telephone":"1","categorie":"n_importe_quoi"}')"
chk "un courriel seul suffit" 201 "$(post '{"nomComplet":"TEST-C Association Quartier","categorie":"association","email":"asso@example.test"}')"
C2=$(val "['id']")

echo
echo "2. La liste, le filtre, la recherche (C1.1)"
chk "la liste répond" 200 "$(code -H "Authorization: Bearer $T_DIR" "$API/contacts?communeId=$COMMUNE")"
chk "les deux fiches y figurent" "1|1" "$(compte "$C1")|$(compte "$C2")"
code -H "Authorization: Bearer $T_DIR" "$API/contacts?communeId=$COMMUNE&categorie=association" >/dev/null
chk "le filtre par catégorie ne garde que l'association" "0|1" "$(compte "$C1")|$(compte "$C2")"
code -H "Authorization: Bearer $T_DIR" "$API/contacts?communeId=$COMMUNE&q=anged" >/dev/null
chk "la recherche trouve par organisation, sans tenir compte de la casse" "1|0" "$(compte "$C1")|$(compte "$C2")"

echo
echo "3. Modifier (C1.3)"
chk "la modification passe" 200 "$(patch "$C1" '{"fonction":"Responsable régionale","notes":"Joignable le matin"}')"
chk "les champs envoyés changent, les autres restent" "Responsable régionale|ANGeD|+216 71 000 000" \
    "$(val "['fonction']")|$(val "['organisation']")|$(val "['telephone']")"
patch "$C1" '{"notes":""}' >/dev/null
chk "un champ vidé s'efface" "None" "$(val "['notes']")"
chk "effacer le seul moyen de joindre la personne est refusé" 400 "$(patch "$C2" '{"email":null}')"
chk "la modification est au journal d'audit" 1 \
    "$(sql "SELECT (count(*) >= 1)::int FROM audit_log WHERE table_name='contacts' AND record_id='$C1' AND operation='UPDATE'")"

echo
echo "4. Cloisonnement : données personnelles de tiers"
AUTRE_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id <> '$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
if [ -n "$AUTRE_EMAIL" ]; then
  T_AUTRE=$(tok "$AUTRE_EMAIL")
  code -H "Authorization: Bearer $T_AUTRE" "$API/contacts?communeId=$COMMUNE" >/dev/null
  chk "une autre commune qui demande cette commune ne voit rien" 0 "$(compte "$C1")"
  chk "ni ne peut modifier la fiche" 404 "$(patch "$C1" '{"fonction":"Pirate"}' "$T_AUTRE")"
  chk "ni la retirer" 404 "$(code -X DELETE -H "Authorization: Bearer $T_AUTRE" "$API/contacts/$C1")"
fi
PREST_USER=$(sql "SELECT id FROM users WHERE role='gestionnaire_prestataire' AND deleted_at IS NULL ORDER BY created_at LIMIT 1")
if [ -n "$PREST_USER" ]; then
  # Émulé comme rattaché à CETTE commune : c'est le cas qui compte — un
  # prestataire qui lit les circuits de la commune ne lit pas son annuaire.
  # « 1| » : l'émulation lui ouvre bien la lecture de la commune (témoin) ;
  # « |0 » : l'annuaire, lui, reste fermé.
  chk "un prestataire rattaché lit la commune, mais pas son annuaire (RLS)" "1|0" \
      "$(sql "BEGIN; INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$PREST_USER', '$COMMUNE') ON CONFLICT DO NOTHING; SET LOCAL ROLE siipi_app; SET LOCAL app.role='gestionnaire_prestataire'; SET LOCAL app.user_id='$PREST_USER'; SELECT app.can_read_commune('$COMMUNE')::int || '|' || (SELECT count(*) FROM contacts WHERE id='$C1'); ROLLBACK;" | tail -1)"
  T_PREST=$(tok "$(sql "SELECT email FROM users WHERE id='$PREST_USER'")")
  chk "et la route le refuse d'emblée" 403 "$(code -H "Authorization: Bearer $T_PREST" "$API/contacts?communeId=$COMMUNE")"
fi
chk "sans jeton, rien" 401 "$(code "$API/contacts?communeId=$COMMUNE")"

echo
echo "5. Retrait logique"
chk "la commune retire la fiche" 204 "$(code -X DELETE -H "Authorization: Bearer $T_DIR" "$API/contacts/$C2")"
code -H "Authorization: Bearer $T_DIR" "$API/contacts?communeId=$COMMUNE" >/dev/null
chk "elle disparaît de l'annuaire" 0 "$(compte "$C2")"
chk "mais reste en base, datée et imputée" 1 \
    "$(sql "SELECT count(*) FROM contacts WHERE id='$C2' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL")"
chk "une fiche retirée ne se modifie plus" 404 "$(patch "$C2" '{"fonction":"X"}')"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
