#!/usr/bin/env bash
# =============================================================================
# Test de la suppression logique (migration 015).
#
# Vérifie que rien n'est jamais effacé de la base, que ce qui est supprimé
# disparaît bien des écrans, que l'opération est tracée et attribuée, et que
# la commune concernée peut retrouver ce qu'elle a supprimé.
#
# ELLE NE TOUCHE À AUCUNE COMMUNE RÉELLE (JC-010). Jusqu'à la v0.15.50, elle
# posait et retirait ses secteurs d'essai dans Houmt Souk et Midoun : chaque
# secteur posé par la FNCT y figeait une « version 1 » du découpage qui restait
# après elle, et chaque passage laissait un « Secteur temporaire » de plus dans
# la liste de ce que ces communes ont supprimé. Elle travaille désormais dans
# deux communes de test, chacune avec son directeur temporaire, et prouve —
# pendant qu'elle a ses lignes en base, puis en partant — que le découpage des
# communes réelles n'a pas bougé (tests/outils/communes_reelles.sh).
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
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql() { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
nb()  { curl -s "$1" -H "Authorization: Bearer $2" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

COMMUNE_A=test_suppression_a
COMMUNE_B=test_suppression_b
COMMUNES_ESSAI="'$COMMUNE_A','$COMMUNE_B'"
COMMUNE_DIR="$COMMUNE_A"
. "$(dirname "$0")/outils/directeur_temporaire.sh"
. "$(dirname "$0")/outils/communes_reelles.sh"

# Tout ce que la campagne a posé, dans ses deux communes de test, et rien
# d'autre. Ses secteurs ont été supprimés LOGIQUEMENT — c'est ce qu'elle
# éprouve — puis effacés ici pour de bon : ce sont des lignes d'essai dans des
# communes d'essai, qui disparaissent avec elles. Un -c par ordre, pour qu'un
# refus n'emporte pas les suivants.
nettoyer() {
  $PSQL -c "DELETE FROM versions_decoupage WHERE commune_id IN ($COMMUNES_ESSAI);" \
        -c "DELETE FROM zones_collecte WHERE commune_id IN ($COMMUNES_ESSAI);" \
        -c "DELETE FROM audit_log WHERE commune_id IN ($COMMUNES_ESSAI);" \
        -c "DELETE FROM users WHERE email = '${DIR_B_EMAIL:-aucun}';" >/dev/null 2>&1
  retirer_directeur_temporaire
  $PSQL -c "DELETE FROM communes WHERE id IN ($COMMUNES_ESSAI);" >/dev/null 2>&1
}
nettoyer
trap nettoyer EXIT

# L'état du découpage réel, avant le premier geste.
releve_communes_reelles

$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES
            ('$COMMUNE_A', 'TEST commune A de la suppression', 'TEST', 'TEST', 5000),
            ('$COMMUNE_B', 'TEST commune B de la suppression', 'TEST', 'TEST', 5000);" >/dev/null
directeur_temporaire "$COMMUNE_A"
DIR_A_ID=$DIR_ID
T_A=$(tok "$DIR_EMAIL" "$DIR_MDP")
# Le directeur de la commune B, créé comme le premier (bcrypt par pgcrypto),
# sous le même motif d'adresse : une campagne interrompue le laisse orphelin,
# et le prochain directeur temporaire l'emporte.
DIR_B_EMAIL="test.directeur.$$.b.$(date +%s)@siipi.tn"
DIR_B_MDP="TEST-Directeur-B-$$"
DIR_B_ID=$($PSQL -c "INSERT INTO users (email, password_hash, full_name, role, commune_id)
                     VALUES ('$DIR_B_EMAIL', crypt('$DIR_B_MDP', gen_salt('bf', 10)), 'TEST Directeur B de campagne', 'admin_commune', '$COMMUNE_B')
                     RETURNING id;" 2>/dev/null | head -1 | tr -d ' ')
T_B=$(tok "$DIR_B_EMAIL" "$DIR_B_MDP")
# Depuis le Jalon 7, créer ou retirer un secteur relève du découpage validé :
# la FNCT le fait directement, la commune le propose.
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_FNCT" ] || { echo "API injoignable sur $API, ou directeur de test non créé" >&2; exit 1; }

ZONES_URL="$API/zones?communeId=$COMMUNE_A"

ZID=$(curl -s -X POST "$API/zones" -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE_A\",\"name\":\"TEST secteur temporaire A\",\"code\":\"TMP-TEST\",\"color\":\"#888888\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[10.85,33.87],[10.87,33.87],[10.87,33.89],[10.85,33.89],[10.85,33.87]]]}}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$ZID" ] || { echo "Impossible de créer le secteur de test." >&2; exit 1; }
AVANT=$(nb "$ZONES_URL" "$T_A")

echo
echo "1. Suppression d'un secteur de collecte"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/zones/$ZID" -H "Authorization: Bearer $T_A")
chk "la commune ne retire plus un secteur directement : elle le propose" 403 "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/zones/$ZID" -H "Authorization: Bearer $T_FNCT")
chk "la suppression par la FNCT est acceptée" 204 "$CODE"
chk "le secteur disparaît des écrans de la commune" "$((AVANT-1))" "$(nb "$ZONES_URL" "$T_A")"

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
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/zones/$ZID" -H "Authorization: Bearer $T_A" \
       -H 'Content-Type: application/json' -d '{"name":"tentative de modification"}')
chk "la modification d'un secteur supprimé échoue" "t" "$([ "$CODE" != "200" ] && echo t || echo f)"

echo
echo "5. Cloisonnement de la suppression"
ZID_B=$(curl -s -X POST "$API/zones" -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE_B\",\"name\":\"TEST secteur temporaire B\",\"code\":\"TMP-B\",\"color\":\"#999999\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[10.95,33.80],[10.97,33.80],[10.97,33.82],[10.95,33.82],[10.95,33.80]]]}}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
chk "la FNCT pose un secteur dans la commune B" t "$(echo "$ZID_B" | grep -Eq '^[0-9a-f-]{36}$' && echo t || echo f)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/zones/$ZID_B" -H "Authorization: Bearer $T_A")
# 404 et non 403 : le cloisonnement rend la ressource invisible avant même le
# contrôle de droit, ce qui évite de révéler qu'un secteur existe ailleurs.
chk "la commune A ne peut pas supprimer un secteur de la commune B" 404 "$CODE"

lignes_supprimees_vues_par() {  # $1 = commune, $2 = directeur
  $PSQL 2>/dev/null <<EOF | tail -1 | tr -d ' '
BEGIN;
SELECT set_config('app.role','admin_commune',true),
       set_config('app.commune_id','$1',true),
       set_config('app.user_id','$2',true);
SET LOCAL ROLE siipi_app;
SELECT count(*) FROM app.lignes_supprimees();
COMMIT;
EOF
}
VU_PAR_A=$(lignes_supprimees_vues_par "$COMMUNE_A" "$DIR_A_ID")
chk "la commune retrouve ce qu'elle a supprimé" "t" "$([ "${VU_PAR_A:-0}" -ge 1 ] 2>/dev/null && echo t || echo f)"
chk "une autre commune ne voit pas les suppressions de la commune A" "0" "$(lignes_supprimees_vues_par "$COMMUNE_B" "$DIR_B_ID")"

echo
echo "6. Le découpage des communes réelles n'a pas bougé (JC-010)"
chk "les communes de test portent bien les gestes de la campagne (2 secteurs, des versions dans chacune)" "2|t|t" \
    "$(sql "SELECT count(*) FROM zones_collecte WHERE commune_id IN ($COMMUNES_ESSAI)")|$([ "$(sql "SELECT count(*) FROM versions_decoupage WHERE commune_id = '$COMMUNE_A'")" -ge 1 ] && echo t || echo f)|$([ "$(sql "SELECT count(*) FROM versions_decoupage WHERE commune_id = '$COMMUNE_B'")" -ge 1 ] && echo t || echo f)"
communes_reelles_intactes "pendant la campagne"
nettoyer
chk "ses communes de test, leurs secteurs, leurs versions et ses deux directeurs sont effacés" "0|0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($COMMUNES_ESSAI)")|$(sql "SELECT count(*) FROM zones_collecte WHERE commune_id IN ($COMMUNES_ESSAI)")|$(sql "SELECT count(*) FROM versions_decoupage WHERE commune_id IN ($COMMUNES_ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email IN ('$DIR_EMAIL', '$DIR_B_EMAIL')")"
communes_reelles_intactes "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
