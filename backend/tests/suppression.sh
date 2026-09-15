#!/usr/bin/env bash
# =============================================================================
# Test de la suppression logique (migration 015).
#
# Vérifie que rien n'est jamais effacé de la base, que ce qui est supprimé
# disparaît bien des écrans, que l'opération est tracée et attribuée, et que
# la commune concernée peut retrouver ce qu'elle a supprimé.
#
#   docker compose run --rm api npm run test:suppression
# Note : l'API limite les tentatives de connexion à 20 par quart d'heure et par
# adresse IP (anti-bruteforce). Pour rejouer plusieurs campagnes d'affilée,
# démarrer l'API avec AUTH_RATE_LIMIT_MAX=200 — jamais en production.
#
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
MDP="Siipi2026!"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$MDP\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql() { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
nb()  { curl -s "$1" -H "Authorization: Bearer $2" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

T_HS=$(tok directeur.houmtsouk@siipi.tn)
T_MIDOUN=$(tok directeur.midoun@siipi.tn)
[ -n "$T_HS" ] || { echo "API injoignable sur $API" >&2; exit 1; }

ZONES_URL="$API/zones?communeId=medenine_djerba_houmt_souk"

# Le test crée son propre secteur plutôt que d'emprunter un secteur du seed :
# il peut ainsi être rejoué autant de fois que voulu sans abîmer le jeu de
# données de démonstration ni les autres campagnes.
ZID=$(curl -s -X POST "$API/zones" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d '{"communeId":"medenine_djerba_houmt_souk","name":"Secteur temporaire de test","code":"TMP-TEST","color":"#888888","geometry":{"type":"Polygon","coordinates":[[[10.85,33.87],[10.87,33.87],[10.87,33.89],[10.85,33.89],[10.85,33.87]]]}}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$ZID" ] || { echo "Impossible de créer le secteur de test." >&2; exit 1; }
AVANT=$(nb "$ZONES_URL" "$T_HS")

echo
echo "1. Suppression d'un secteur de collecte"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/zones/$ZID" -H "Authorization: Bearer $T_HS")
chk "la suppression est acceptée" 204 "$CODE"
chk "le secteur disparaît des écrans de la commune" "$((AVANT-1))" "$(nb "$ZONES_URL" "$T_HS")"

echo
echo "2. Rien n'est effacé"
chk "la ligne est conservée en base" 1 "$(sql "SELECT count(*) FROM zones_collecte WHERE id='$ZID'")"
chk "la date de suppression est enregistrée" "t" "$(sql "SELECT deleted_at IS NOT NULL FROM zones_collecte WHERE id='$ZID'")"
chk "l'auteur de la suppression est enregistré" "t" "$(sql "SELECT deleted_by IS NOT NULL FROM zones_collecte WHERE id='$ZID'")"
chk "l'opération figure au journal d'audit" 1 \
    "$(sql "SELECT count(*) FROM audit_log WHERE record_id='$ZID' AND 'deleted_at'=ANY(changed_fields)")"

echo
echo "3. L'API ne peut plus effacer"
$PSQL >/dev/null 2>&1 <<EOF
BEGIN; SET LOCAL ROLE siipi_app; DELETE FROM zones_collecte WHERE id='$ZID'; COMMIT;
EOF
chk "un DELETE émis par l'API est refusé par la base" 1 "$(sql "SELECT count(*) FROM zones_collecte WHERE id='$ZID'")"

echo
echo "4. Une ligne supprimée n'est plus modifiable"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/zones/$ZID" -H "Authorization: Bearer $T_HS" \
       -H 'Content-Type: application/json' -d '{"name":"tentative de modification"}')
chk "la modification d'un secteur supprimé échoue" "t" "$([ "$CODE" != "200" ] && echo t || echo f)"

echo
echo "5. Cloisonnement de la suppression"
ZID_MIDOUN=$(curl -s -X POST "$API/zones" -H "Authorization: Bearer $T_MIDOUN" -H 'Content-Type: application/json' \
  -d '{"communeId":"medenine_djerba_midoun","name":"Secteur temporaire Midoun","code":"TMP-MID","color":"#999999","geometry":{"type":"Polygon","coordinates":[[[10.95,33.80],[10.97,33.80],[10.97,33.82],[10.95,33.82],[10.95,33.80]]]}}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/zones/$ZID_MIDOUN" -H "Authorization: Bearer $T_HS")
# 404 et non 403 : le cloisonnement rend la ressource invisible avant même le
# contrôle de droit, ce qui évite de révéler qu'un secteur existe ailleurs.
chk "Houmt Souk ne peut pas supprimer un secteur de Midoun" 404 "$CODE"

VU_PAR_HS=$($PSQL 2>/dev/null <<'EOF' | tail -1
BEGIN;
SELECT set_config('app.role','admin_commune',true),
       set_config('app.commune_id','medenine_djerba_houmt_souk',true),
       set_config('app.user_id',(SELECT id::text FROM users WHERE email='directeur.houmtsouk@siipi.tn'),true);
SET LOCAL ROLE siipi_app;
SELECT count(*) FROM app.lignes_supprimees();
COMMIT;
EOF
)
chk "la commune retrouve ce qu'elle a supprimé" "t" "$([ "$(echo "$VU_PAR_HS" | tr -d ' ')" -ge 1 ] && echo t || echo f)"

VU_PAR_MIDOUN=$($PSQL 2>/dev/null <<'EOF' | tail -1
BEGIN;
SELECT set_config('app.role','admin_commune',true),
       set_config('app.commune_id','medenine_djerba_midoun',true),
       set_config('app.user_id',(SELECT id::text FROM users WHERE email='directeur.midoun@siipi.tn'),true);
SET LOCAL ROLE siipi_app;
SELECT count(*) FROM app.lignes_supprimees();
COMMIT;
EOF
)
chk "une autre commune ne voit pas les suppressions de Houmt Souk" "t" "$([ "$(echo "$VU_PAR_MIDOUN" | tr -d ' ')" = "0" ] && echo t || echo f)"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
