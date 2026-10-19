#!/usr/bin/env bash
# =============================================================================
# Test du journal d'audit et du journal des accès (migration 014).
#
# Vérifie que chaque écriture est journalisée avec son auteur et ses valeurs
# avant/après, que les données sensibles n'y entrent pas, que le bruit machine
# (remontées GPS) en est exclu, que les consultations de données citoyennes
# sont tracées, et que les journaux sont infalsifiables et cloisonnés.
#
# ELLE NE TOUCHE À AUCUNE COMMUNE RÉELLE (JC-011, JC-012). Jusqu'à la v0.15.51,
# elle travaillait à La Marsa avec les comptes de démonstration : chaque
# passage y laissait une réclamation, réécrivait le taux de recouvrement de la
# TCL de la fiche de la commune (63,5) et déplaçait un engin. Elle bâtit
# désormais deux communes de test — A (son directeur, un citoyen, un engin) et
# B (son directeur) — et prouve, pendant qu'elle a ses lignes en base puis en
# partant, qu'aucune commune réelle n'a reçu de ligne
# (tests/outils/base_reelle.sh).
#
#   docker compose run --rm api npm run test:audit
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="${ADMIN_PSQL:-psql -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}}"
# Variante silencieuse : sans -q, psql imprime BEGIN/SET/COMMIT et brouille
# la lecture du résultat d'un bloc multi-instructions.
PSQLQ="psql -q -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0

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
# Ce que voit un directeur, lu par la base sous ses droits (RLS).
vu_par() {  # $1 = commune, $2 = directeur, $3 = requête
  $PSQLQ 2>/dev/null <<SQLEOF | tail -1 | tr -d ' '
BEGIN;
SELECT set_config('app.role','admin_commune',true), set_config('app.commune_id','$1',true), set_config('app.user_id','$2',true);
SET LOCAL ROLE siipi_app;
$3;
COMMIT;
SQLEOF
}

A=test_audit_a
B=test_audit_b
ESSAI="'$A','$B'"
CIT_EMAIL="test-audit-citoyen@example.test"
CIT_MDP="TEST-Citoyen-$$"
PSQL_SAUF=$PSQL; PSQL=$PSQLQ
. "$(dirname "$0")/outils/comptes_temporaires.sh"
. "$(dirname "$0")/outils/base_reelle.sh"
PSQL=$PSQL_SAUF

nettoyer() {
  $PSQLQ -c "DELETE FROM notifications_citoyen WHERE commune_id IN ($ESSAI);" \
         -c "DELETE FROM tickets WHERE commune_id IN ($ESSAI);" \
         -c "DELETE FROM vehicules WHERE commune_id IN ($ESSAI);" \
         -c "DELETE FROM access_log WHERE commune_id IN ($ESSAI) OR communes_concernees && ARRAY[$ESSAI]::text[];" \
         -c "DELETE FROM audit_log WHERE commune_id IN ($ESSAI);" \
         -c "DELETE FROM citoyens WHERE user_id IN (SELECT id FROM users WHERE email = '$CIT_EMAIL');" \
         -c "DELETE FROM users WHERE email = '$CIT_EMAIL';" >/dev/null 2>&1
  PSQL=$PSQLQ retirer_comptes_temporaires
  $PSQLQ -c "DELETE FROM communes WHERE id IN ($ESSAI);" >/dev/null 2>&1
}
nettoyer
trap nettoyer EXIT
PSQL=$PSQLQ releve_base_reelle

# --- Le décor, bâti ---------------------------------------------------------
$PSQLQ -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES
             ('$A', 'TEST commune A de l''audit', 'TEST', 'TEST', 5000),
             ('$B', 'TEST commune B de l''audit', 'TEST', 'TEST', 5000);" \
       -c "INSERT INTO vehicules (id, registration, commune_id, type, lat, lng) VALUES
             ('test-audit-engin-1', 'TEST 0003', '$A', 'camion', 36.80, 10.30);" >/dev/null
PSQL=$PSQLQ compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); DIR_A_ID=$COMPTE_ID
PSQL=$PSQLQ compte_temporaire admin_commune "$B" "Directeur B"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); DIR_B_ID=$COMPTE_ID
T_FNCT=$(tok admin.national@siipi.tn)
curl -s -o /dev/null -X POST "$API/citizens/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$CIT_EMAIL\",\"password\":\"$CIT_MDP\",\"fullName\":\"TEST Citoyen de l'audit\"}"
T_CITOYEN=$(tok "$CIT_EMAIL" "$CIT_MDP")
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_FNCT" ] && [ -n "$T_CITOYEN" ] || { echo "API injoignable sur $API, ou compte d'essai non créé" >&2; exit 1; }
curl -s -o /dev/null -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_CITOYEN" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$A\",\"adresse\":\"TEST, rue de l'audit\"}"

echo
echo "1. Traçabilité des écritures"
AVANT=$(sql "SELECT COALESCE(tcl_recovery_rate::text,'null') FROM communes WHERE id='$A'")
curl -s -X PATCH "$API/communes/$A" -H "Authorization: Bearer $T_A" \
  -H 'Content-Type: application/json' -d '{"tclRecoveryRate":63.5}' -o /dev/null
chk "la modification d'une fiche commune est journalisée" 1 \
    "$(sql "SELECT count(*) FROM audit_log WHERE table_name='communes' AND record_id='$A' AND operation='UPDATE' AND 'tcl_recovery_rate'=ANY(changed_fields)")"
chk "la valeur AVANT est conservée" "$AVANT" \
    "$(sql "SELECT coalesce(old_data->>'tcl_recovery_rate','null') FROM audit_log WHERE table_name='communes' AND record_id='$A' ORDER BY id DESC LIMIT 1")"
chk "la valeur APRÈS est conservée" "63.50" \
    "$(sql "SELECT new_data->>'tcl_recovery_rate' FROM audit_log WHERE table_name='communes' AND record_id='$A' ORDER BY id DESC LIMIT 1")"
chk "l'auteur de la modification est identifié" "$DIR_A_ID" \
    "$(sql "SELECT changed_by FROM audit_log WHERE table_name='communes' AND record_id='$A' ORDER BY id DESC LIMIT 1")"
chk "l'entrée est rattachée à la commune" "$A" \
    "$(sql "SELECT commune_id FROM audit_log WHERE table_name='communes' AND record_id='$A' ORDER BY id DESC LIMIT 1")"

TICKET=$(curl -s -X POST "$API/tickets" -H "Authorization: Bearer $T_CITOYEN" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$A\",\"category\":\"point_noir\",\"title\":\"TEST réclamation de l'audit\",\"citizenName\":\"TEST Citoyen\",\"citizenPhone\":\"98000000\",\"lat\":36.88,\"lng\":10.32}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])" 2>/dev/null)
chk "le dépôt d'une réclamation est journalisé" 1 \
    "$(sql "SELECT count(*) FROM audit_log WHERE table_name='tickets' AND record_id='$TICKET' AND operation='INSERT'")"
curl -s -X PATCH "$API/tickets/$TICKET/accept" -H "Authorization: Bearer $T_A" \
  -H 'Content-Type: application/json' -d '{}' -o /dev/null
chk "le changement de statut est journalisé avec ses champs" 1 \
    "$(sql "SELECT count(*) FROM audit_log WHERE table_name='tickets' AND record_id='$TICKET' AND operation='UPDATE' AND 'status'=ANY(changed_fields)")"

echo
echo "2. Aucune donnée sensible dans le journal"
chk "aucun mot de passe haché n'est stocké" 0 \
    "$(sql "SELECT count(*) FROM audit_log WHERE new_data ? 'password_hash' OR old_data ? 'password_hash'")"

echo
echo "3. Bruit machine exclu"
AVANT_VEH=$(sql "SELECT count(*) FROM audit_log WHERE table_name='vehicules'")
for i in 1 2 3; do
  curl -s -X PATCH "$API/trucks/test-audit-engin-1/position" -H "Authorization: Bearer $T_A" \
    -H 'Content-Type: application/json' -d "{\"lat\":36.8$i,\"lng\":10.3$i,\"currentSpeedKmH\":$((20+i))}" -o /dev/null
done
chk "les 3 remontées GPS sont reçues (l'engin est à sa dernière position)" "36.83" "$(sql "SELECT lat FROM vehicules WHERE id='test-audit-engin-1'")"
chk "… et ne créent aucune ligne de journal" "$AVANT_VEH" \
    "$(sql "SELECT count(*) FROM audit_log WHERE table_name='vehicules'")"

echo
echo "4. Journal des consultations de données citoyennes"
AVANT_ACCES=$(sql "SELECT count(*) FROM access_log")
curl -s "$API/tickets?communeId=$A" -H "Authorization: Bearer $T_A" -o /dev/null
chk "la consultation par un agent municipal est tracée" "$((AVANT_ACCES+1))" "$(sql "SELECT count(*) FROM access_log")"
chk "l'agent qui a consulté est identifié" "$DIR_A_ID" "$(sql "SELECT user_id FROM access_log ORDER BY id DESC LIMIT 1")"
chk "les citoyens concernés sont identifiés" "t" \
    "$(sql "SELECT array_length(citizen_ids,1) > 0 FROM access_log ORDER BY id DESC LIMIT 1")"
AVANT_ACCES=$(sql "SELECT count(*) FROM access_log")
curl -s "$API/tickets" -H "Authorization: Bearer $T_CITOYEN" -o /dev/null
chk "un citoyen consultant ses propres données n'est pas tracé" "$AVANT_ACCES" "$(sql "SELECT count(*) FROM access_log")"

# La FNCT conserve l'accès complet aux données des communes (TDR §5). La
# contrepartie est que la commune doit pouvoir voir qu'une consultation
# nationale a eu lieu sur SES données.
curl -s "$API/tickets?communeId=$A" -H "Authorization: Bearer $T_FNCT" -o /dev/null
chk "une consultation nationale enregistre la commune concernée" "t" \
    "$(sql "SELECT '$A' = ANY(communes_concernees) FROM access_log WHERE user_role='super_admin_fnct' ORDER BY id DESC LIMIT 1")"
chk "la commune voit que la FNCT a consulté ses données" "t" \
    "$([ "$(vu_par "$A" "$DIR_A_ID" "SELECT count(*) FROM access_log WHERE user_role = 'super_admin_fnct' AND '$A' = ANY(communes_concernees)")" -ge 1 ] 2>/dev/null && echo t || echo f)"
chk "une autre commune ne voit pas ces consultations" "0" \
    "$(vu_par "$B" "$DIR_B_ID" "SELECT count(*) FROM access_log WHERE '$A' = ANY(communes_concernees)")"

echo
echo "5. Journaux infalsifiables et cloisonnés"
$PSQLQ >/dev/null 2>&1 <<'EOF'
BEGIN;
SET LOCAL ROLE siipi_app;
UPDATE audit_log SET new_data = '{"falsifie":true}'::jsonb WHERE id = (SELECT min(id) FROM audit_log);
COMMIT;
EOF
chk "l'API ne peut pas modifier une entrée de journal" 0 "$(sql "SELECT count(*) FROM audit_log WHERE new_data ? 'falsifie'")"

$PSQLQ >/dev/null 2>&1 <<'EOF'
BEGIN;
SET LOCAL ROLE siipi_app;
DELETE FROM audit_log WHERE id = (SELECT min(id) FROM audit_log);
COMMIT;
EOF
chk "l'API ne peut pas effacer une entrée de journal" "t" "$(sql "SELECT count(*) > 0 FROM audit_log")"
chk "la commune A a bien un historique à cacher" "t" "$([ "$(sql "SELECT count(*) FROM audit_log WHERE commune_id = '$A'")" -ge 1 ] && echo t || echo f)"
chk "une commune ne voit pas l'historique d'une autre" 0 \
    "$(vu_par "$B" "$DIR_B_ID" "SELECT count(*) FROM audit_log WHERE commune_id = '$A'")"

echo
echo "6. Paramètres de conservation"
chk "durée de conservation des écritures" "5years" "$(sql "SELECT valeur FROM app_parametres WHERE cle='audit.retention_ecritures'")"
chk "durée de conservation des accès" "1year" "$(sql "SELECT valeur FROM app_parametres WHERE cle='audit.retention_acces'")"
chk "la fonction de purge existe et s'exécute" "2" "$(sql "SELECT count(*) FROM app.purger_journaux()")"

echo
echo "7. Aucune commune réelle n'a reçu de ligne (JC-011, JC-012)"
PSQL=$PSQLQ base_reelle_intacte "pendant la campagne"
nettoyer
chk "ses communes de test, leurs lignes, ses comptes et son citoyen sont effacés" "0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM tickets WHERE id='$TICKET'")|$(sql "SELECT count(*) FROM users WHERE email = '$CIT_EMAIL' OR email LIKE 'test.compte.%@siipi.tn'")"
PSQL=$PSQLQ base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
