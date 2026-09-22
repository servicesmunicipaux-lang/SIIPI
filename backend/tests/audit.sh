#!/usr/bin/env bash
# =============================================================================
# Test de non-régression du journal d'audit (migration 014).
#
# Vérifie que toute écriture laisse une trace exploitable, que les
# consultations de données citoyennes sont tracées, que les journaux ne
# peuvent pas être falsifiés, et que le bruit machine n'y entre pas.
#
#   docker compose run --rm api npm run test:audit
#
# Note : l'API limite les tentatives de connexion à 20 par quart d'heure et par
# adresse IP (anti-bruteforce). Pour rejouer plusieurs campagnes d'affilée,
# démarrer l'API avec AUTH_RATE_LIMIT_MAX=200 — jamais en production.
#
# Variables : API_URL (défaut http://localhost:4000)
#             ADMIN_PSQL (commande psql d'administration, défaut ci-dessous)
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="${ADMIN_PSQL:-psql -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}}"
# Variante silencieuse : sans -q, psql imprime BEGIN/SET/COMMIT et brouille
# la lecture du résultat d'un bloc multi-instructions.
PSQLQ="psql -q -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
MDP="Siipi2026!"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$MDP\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

T_MARSA=$(tok directeur.marsa@siipi.tn)
T_CITOYEN=$(tok citoyen.demo@siipi.tn)
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_MARSA" ] || { echo "API injoignable sur $API" >&2; exit 1; }

MARSA_ID=$(sql "SELECT id FROM users WHERE email='directeur.marsa@siipi.tn'")

echo
echo "1. Traçabilité des écritures"
AVANT=$(sql "SELECT COALESCE(tcl_recovery_rate::text,'null') FROM communes WHERE id='tunis_la_marsa'")
curl -s -X PATCH "$API/communes/tunis_la_marsa" -H "Authorization: Bearer $T_MARSA" \
  -H 'Content-Type: application/json' -d '{"tclRecoveryRate":63.5}' -o /dev/null
chk "la modification d'une fiche commune est journalisée" 1 \
    "$(sql "SELECT count(*) FROM audit_log WHERE table_name='communes' AND record_id='tunis_la_marsa' AND operation='UPDATE' AND 'tcl_recovery_rate'=ANY(changed_fields)")"
chk "la valeur AVANT est conservée" "$AVANT" \
    "$(sql "SELECT old_data->>'tcl_recovery_rate' FROM audit_log WHERE table_name='communes' AND record_id='tunis_la_marsa' ORDER BY id DESC LIMIT 1")"
chk "la valeur APRÈS est conservée" "63.50" \
    "$(sql "SELECT new_data->>'tcl_recovery_rate' FROM audit_log WHERE table_name='communes' AND record_id='tunis_la_marsa' ORDER BY id DESC LIMIT 1")"
chk "l'auteur de la modification est identifié" "$MARSA_ID" \
    "$(sql "SELECT changed_by FROM audit_log WHERE table_name='communes' AND record_id='tunis_la_marsa' ORDER BY id DESC LIMIT 1")"
chk "l'entrée est rattachée à la commune" "tunis_la_marsa" \
    "$(sql "SELECT commune_id FROM audit_log WHERE table_name='communes' AND record_id='tunis_la_marsa' ORDER BY id DESC LIMIT 1")"

TICKET=$(curl -s -X POST "$API/tickets" -H "Authorization: Bearer $T_CITOYEN" -H 'Content-Type: application/json' \
  -d '{"communeId":"tunis_la_marsa","category":"point_noir","title":"Test audit","citizenName":"Yassine Belhadj","citizenPhone":"98123456","lat":36.88,"lng":10.32}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])" 2>/dev/null)
chk "le dépôt d'une réclamation est journalisé" 1 \
    "$(sql "SELECT count(*) FROM audit_log WHERE table_name='tickets' AND record_id='$TICKET' AND operation='INSERT'")"
curl -s -X PATCH "$API/tickets/$TICKET/accept" -H "Authorization: Bearer $T_MARSA" \
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
VEH=$(sql "SELECT id FROM vehicules WHERE commune_id='tunis_la_marsa' LIMIT 1")
for i in 1 2 3; do
  curl -s -X PATCH "$API/trucks/$VEH/position" -H "Authorization: Bearer $T_MARSA" \
    -H 'Content-Type: application/json' -d "{\"lat\":36.8$i,\"lng\":10.3$i,\"currentSpeedKmH\":$((20+i))}" -o /dev/null
done
chk "3 remontées GPS ne créent aucune ligne de journal" "$AVANT_VEH" \
    "$(sql "SELECT count(*) FROM audit_log WHERE table_name='vehicules'")"

echo
echo "4. Journal des consultations de données citoyennes"
AVANT_ACCES=$(sql "SELECT count(*) FROM access_log")
curl -s "$API/tickets?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_MARSA" -o /dev/null
chk "la consultation par un agent municipal est tracée" "$((AVANT_ACCES+1))" "$(sql "SELECT count(*) FROM access_log")"
chk "l'agent qui a consulté est identifié" "$MARSA_ID" "$(sql "SELECT user_id FROM access_log ORDER BY id DESC LIMIT 1")"
chk "les citoyens concernés sont identifiés" "t" \
    "$(sql "SELECT array_length(citizen_ids,1) > 0 FROM access_log ORDER BY id DESC LIMIT 1")"
AVANT_ACCES=$(sql "SELECT count(*) FROM access_log")
curl -s "$API/tickets" -H "Authorization: Bearer $T_CITOYEN" -o /dev/null
chk "un citoyen consultant ses propres données n'est pas tracé" "$AVANT_ACCES" "$(sql "SELECT count(*) FROM access_log")"

# La FNCT conserve l'accès complet aux données des communes (TDR §5). La
# contrepartie est que la commune doit pouvoir voir qu'une consultation
# nationale a eu lieu sur SES données.
curl -s "$API/tickets?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_FNCT" -o /dev/null
chk "une consultation nationale enregistre la commune concernée" "t" \
    "$(sql "SELECT 'tunis_la_marsa' = ANY(communes_concernees) FROM access_log WHERE user_role='super_admin_fnct' ORDER BY id DESC LIMIT 1")"
VU=$($PSQLQ 2>/dev/null <<'SQLEOF' | tail -1
BEGIN;
SELECT set_config('app.role','admin_commune',true),
       set_config('app.commune_id','tunis_la_marsa',true),
       set_config('app.user_id',(SELECT id::text FROM users WHERE email='directeur.marsa@siipi.tn'),true);
SET LOCAL ROLE siipi_app;
SELECT count(*) FROM access_log WHERE user_role = 'super_admin_fnct';
COMMIT;
SQLEOF
)
chk "la commune voit que la FNCT a consulté ses données" "t" \
    "$([ "$(echo "$VU" | tr -d ' ')" -ge 1 ] && echo t || echo f)"
VU_AUTRE=$($PSQLQ 2>/dev/null <<'SQLEOF' | tail -1
BEGIN;
SELECT set_config('app.role','admin_commune',true),
       set_config('app.commune_id','sfax_sfax_ville_medina',true),
       set_config('app.user_id',(SELECT id::text FROM users WHERE email='directeur.sfax@siipi.tn'),true);
SET LOCAL ROLE siipi_app;
SELECT count(*) FROM access_log WHERE 'tunis_la_marsa' = ANY(communes_concernees);
COMMIT;
SQLEOF
)
chk "une autre commune ne voit pas ces consultations" "0" "$(echo "$VU_AUTRE" | tr -d ' ')"
ADMIN="psql -q -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"

echo
echo "5. Journaux infalsifiables et cloisonnés"
ADMIN="psql -q -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
$ADMIN >/dev/null 2>&1 <<'EOF'
BEGIN;
SET LOCAL ROLE siipi_app;
UPDATE audit_log SET new_data = '{"falsifie":true}'::jsonb WHERE id = (SELECT min(id) FROM audit_log);
COMMIT;
EOF
chk "l'API ne peut pas modifier une entrée de journal" 0 "$(sql "SELECT count(*) FROM audit_log WHERE new_data ? 'falsifie'")"

$ADMIN >/dev/null 2>&1 <<'EOF'
BEGIN;
SET LOCAL ROLE siipi_app;
DELETE FROM audit_log WHERE id = (SELECT min(id) FROM audit_log);
COMMIT;
EOF
chk "l'API ne peut pas effacer une entrée de journal" "t" "$(sql "SELECT count(*) > 0 FROM audit_log")"

VU_PAR_SFAX=$($ADMIN 2>/dev/null <<'EOF' | tail -1
BEGIN;
SELECT set_config('app.role','admin_commune',true), set_config('app.commune_id','sfax_sfax_ville_medina',true),
       set_config('app.user_id',(SELECT id::text FROM users WHERE email='directeur.sfax@siipi.tn'),true);
SET LOCAL ROLE siipi_app;
SELECT count(*) FROM audit_log WHERE commune_id = 'tunis_la_marsa';
COMMIT;
EOF
)
chk "une commune ne voit pas l'historique d'une autre" 0 "$(echo "$VU_PAR_SFAX" | tr -d ' ')"

echo
echo "6. Paramètres de conservation"
chk "durée de conservation des écritures" "5years" "$(sql "SELECT valeur FROM app_parametres WHERE cle='audit.retention_ecritures'")"
chk "durée de conservation des accès" "1year" "$(sql "SELECT valeur FROM app_parametres WHERE cle='audit.retention_acces'")"
chk "la fonction de purge existe et s'exécute" "2" "$(sql "SELECT count(*) FROM app.purger_journaux()")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
