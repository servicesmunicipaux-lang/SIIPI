#!/usr/bin/env bash
# =============================================================================
# v0.15.86 — la position d'un engin (PATCH /trucks/:id/position).
# Constat E6 de docs/specs_metier/SPEC_F_releve_terrain.md (02/11/2026).
#
# La route doublait la RLS de `vehicules` d'un contrôle à elle, sur le
# rattachement PRINCIPAL du compte (`users.commune_id`). La RLS rendait déjà
# introuvable un engin hors du périmètre : ce contrôle ne refusait donc que des
# comptes légitimes — un directeur rattaché à une seconde commune, un prestataire
# dont la zone est ailleurs que sa commune principale — et il le faisait par un
# 403, qui dit que l'engin existe (CLAUDE.md § 1.2 et § 5).
#
# Elle commence par ce qui doit être refusé :
#   - sans compte ; une autre commune ; un prestataire hors de ses zones ; un
#     rattachement échu ; un engin retiré ; un engin inconnu — tous introuvables
#     (404), jamais « refusés » (403) ;
#   - une position hors de Tunisie, un niveau de carburant au-delà de 100 %, une
#     vitesse ou un poids négatifs, un état inconnu (400) ;
#   - et, en base, sous le rôle de l'application, l'écriture d'un prestataire hors
#     de ses zones.
# Puis ce qui doit marcher : le directeur, la FNCT, le directeur par son
# rattachement secondaire, le prestataire dans sa zone ailleurs que dans sa
# commune principale ; un champ absent garde sa valeur ; le journal d'audit ne
# reçoit aucune position. Aucune ligne d'une commune réelle ne bouge.
#
#   docker compose exec -T api npm run test:position-engins
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_position_a
B=test_position_b
ESSAI="'$A','$B'"
. tests/outils/communes_essai.sh
. tests/outils/comptes_temporaires.sh
. tests/outils/base_reelle.sh

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
sql() { $PSQL -c "$1" 2>&1 | tr -d ' '; }
tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
position() { # engin jeton corps — code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X PATCH "$API/trucks/$1/position" \
    ${2:+-H "Authorization: Bearer $2"} -H 'Content-Type: application/json' -d "$3"
}
# L'état d'un engin, tel que la route l'écrit : ce qui ne doit pas bouger quand
# une écriture est refusée.
etat() { sql "SELECT concat_ws('|', lat, lng, current_speed_kmh, fuel_level_percent, current_weight_tons, status, completed_stops) FROM vehicules WHERE id = '$1'"; }

nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
  rm -rf "$T"
}
nettoyer_debut() { effacer_communes_essai "$ESSAI"; }
nettoyer_debut
trap nettoyer EXIT
releve_base_reelle

# --- Le terrain : deux communes de test, quatre engins, des comptes ----------
commune_essai "$A" "TEST commune A de la position des engins"
commune_essai "$B" "TEST commune B de la position des engins"
VA="test-pos-a1-$$"; VA2="test-pos-a2-$$"; VB="test-pos-b1-$$"; VR="test-pos-retire-$$"
$PSQL -c "INSERT INTO zones_collecte (commune_id, name, geom) VALUES
            ('$A', 'TEST zone du prestataire', ST_Multi(ST_MakeEnvelope(10.0, 36.0, 10.01, 36.01, 4326))),
            ('$A', 'TEST zone sans prestataire', ST_Multi(ST_MakeEnvelope(10.02, 36.0, 10.03, 36.01, 4326)));" >/dev/null
ZP=$(sql "SELECT id FROM zones_collecte WHERE commune_id = '$A' AND name = 'TEST zone du prestataire'")
ZL=$(sql "SELECT id FROM zones_collecte WHERE commune_id = '$A' AND name = 'TEST zone sans prestataire'")
$PSQL -c "INSERT INTO vehicules (id, registration, commune_id, type, zone_id, lat, lng, fuel_level_percent, status) VALUES
            ('$VA',  'TEST-POS-A1-$$', '$A', 'benne_tasseuse', '$ZP', 36.005, 10.005, 40, 'au_depot'),
            ('$VA2', 'TEST-POS-A2-$$', '$A', 'benne_tasseuse', '$ZL', 36.005, 10.025, 40, 'au_depot'),
            ('$VB',  'TEST-POS-B1-$$', '$B', 'benne_tasseuse', NULL,  36.5,   10.5,   40, 'au_depot'),
            ('$VR',  'TEST-POS-R-$$',  '$A', 'benne_tasseuse', '$ZP', 36.005, 10.005, 40, 'au_depot');" >/dev/null

compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$B" "Directeur B"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); DIR_B=$COMPTE_ID
compte_temporaire super_admin_fnct "" "Agent FNCT"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
# Le prestataire a pour commune principale B, et sa zone dans A : c'est ce que
# l'ancien contrôle refusait à tort. Depuis la v0.15.87 (095), une zone ne donne
# ses engins que dans le périmètre réel du prestataire : il lui faut un contrat
# en cours avec A, posé après le refus qui le prouve (section 1).
compte_temporaire gestionnaire_prestataire "$B" "Prestataire"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); PRE=$COMPTE_ID
$PSQL -c "UPDATE zones_collecte SET assigned_prestataire_id = '$PRE' WHERE id = '$ZP';
          UPDATE vehicules SET deleted_at = now() WHERE id = '$VR';" >/dev/null
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_F" ] && [ -n "$T_P" ] || { echo "API injoignable sur $API, ou comptes non connectés." >&2; exit 1; }

ICI='{"lat":36.006,"lng":10.006}'
AVANT_VA=$(etat "$VA"); AVANT_VA2=$(etat "$VA2"); AVANT_VB=$(etat "$VB")
AUDIT_MAX=$(sql "SELECT coalesce(max(id), 0) FROM audit_log")

echo "1. Ce qui est introuvable, et ce qui ne bouge pas"
chk "sans compte : refus" 401 "$(position "$VA" "" "$ICI")"
chk "le directeur d'une autre commune : introuvable (404), jamais « refusé »" 404 "$(position "$VA" "$T_B" "$ICI")"
chk "le prestataire, sur un engin de la commune hors de ses zones : introuvable" 404 "$(position "$VA2" "$T_P" "$ICI")"
chk "le prestataire, sur un engin sans zone d'une commune où il n'a rien : introuvable" 404 "$(position "$VB" "$T_P" "$ICI")"
chk "un engin retiré de l'inventaire : introuvable, pour la FNCT aussi" "404|404" \
    "$(position "$VR" "$T_A" "$ICI")|$(position "$VR" "$T_F" "$ICI")"
chk "un engin inconnu : introuvable" 404 "$(position "test-pos-inconnu-$$" "$T_F" "$ICI")"
chk "… le message dit que l'engin est introuvable, sans dire s'il existe" "Engin introuvable." \
    "$(python3 -c "import json;print(json.load(open('$T/r.json')).get('error',''))" 2>/dev/null)"
chk "le prestataire sans contrat avec A, même sur l'engin de sa zone : introuvable (095)" 404 "$(position "$VA" "$T_P" "$ICI")"
chk "aucun des engins visés n'a bougé" "$AVANT_VA|$AVANT_VA2|$AVANT_VB" "$(etat "$VA")|$(etat "$VA2")|$(etat "$VB")"
$PSQL -c "INSERT INTO utilisateur_communes (user_id, commune_id, contrat_reference) VALUES ('$PRE', '$A', 'TEST-CONTRAT-0003');" >/dev/null

echo
echo "2. Ce qui est refusé dans le corps"
chk "une latitude hors de Tunisie, longitude en Tunisie : refus" 400 "$(position "$VA" "$T_A" '{"lat":45.0,"lng":10.0}')"
chk "une longitude hors de Tunisie, latitude en Tunisie : refus" 400 "$(position "$VA" "$T_A" '{"lat":36.0,"lng":12.5}')"
chk "… le message nomme l'emprise attendue" 1 "$(grep -c 'Tunisie' "$T/r.json")"
chk "un niveau de carburant au-delà de 100 % : refus" 400 "$(position "$VA" "$T_A" '{"lat":36.0,"lng":10.0,"fuelLevelPercent":150}')"
chk "un niveau de carburant négatif : refus" 400 "$(position "$VA" "$T_A" '{"lat":36.0,"lng":10.0,"fuelLevelPercent":-1}')"
chk "une vitesse négative : refus" 400 "$(position "$VA" "$T_A" '{"lat":36.0,"lng":10.0,"currentSpeedKmH":-5}')"
chk "une vitesse que la colonne ne tient pas : refus, pas une erreur du serveur" 400 \
    "$(position "$VA" "$T_A" '{"lat":36.0,"lng":10.0,"currentSpeedKmH":5000}')"
chk "un poids négatif : refus" 400 "$(position "$VA" "$T_A" '{"lat":36.0,"lng":10.0,"currentWeightTons":-1}')"
chk "un poids que la colonne ne tient pas : refus, pas une erreur du serveur" 400 \
    "$(position "$VA" "$T_A" '{"lat":36.0,"lng":10.0,"currentWeightTons":20000}')"
chk "un nombre d'arrêts négatif : refus" 400 "$(position "$VA" "$T_A" '{"lat":36.0,"lng":10.0,"completedStops":-1}')"
chk "un état inconnu : refus" 400 "$(position "$VA" "$T_A" '{"lat":36.0,"lng":10.0,"status":"envole"}')"
chk "sans position : refus" 400 "$(position "$VA" "$T_A" '{"fuelLevelPercent":50}')"
chk "l'engin n'a pas bougé" "$AVANT_VA" "$(etat "$VA")"

echo
echo "3. En base, sous le rôle de l'application"
ecrit_en_base() { # rôle commune utilisateur engin — lignes écrites
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.commune_id', '$2', true), set_config('app.user_id', '$3', true);
            SET LOCAL ROLE siipi_app;
            WITH ecrit AS (UPDATE vehicules SET lat = 36.009 WHERE id = '$4' RETURNING 1) SELECT 'ecrit:' || count(*) FROM ecrit;
            ROLLBACK;" 2>&1 | grep -oE '^ecrit:[0-9]+' | cut -d: -f2
}
chk "le prestataire n'écrit pas un engin hors de ses zones, le directeur B pas un engin de A ; le prestataire écrit celui de sa zone (témoin)" "0|0|1" \
    "$(ecrit_en_base gestionnaire_prestataire "$B" "$PRE" "$VA2")|$(ecrit_en_base admin_commune "$B" "$DIR_B" "$VA")|$(ecrit_en_base gestionnaire_prestataire "$B" "$PRE" "$VA")"
chk "la RLS de vehicules est activée et forcée" "t|t" \
    "$(sql "SELECT relrowsecurity FROM pg_class WHERE relname = 'vehicules'")|$(sql "SELECT relforcerowsecurity FROM pg_class WHERE relname = 'vehicules'")"

echo
echo "4. Ce qui doit marcher"
chk "le directeur remonte la position de son engin" 200 "$(position "$VA" "$T_A" '{"lat":36.006,"lng":10.006,"currentSpeedKmH":32}')"
chk "… la position est écrite, un champ absent garde sa valeur (carburant à 40, état au dépôt)" "36.006|10.006|32.00|40.00|au_depot" \
    "$(sql "SELECT concat_ws('|', lat, lng, current_speed_kmh, fuel_level_percent, status) FROM vehicules WHERE id = '$VA'")"
chk "la FNCT remonte une position" 200 "$(position "$VB" "$T_F" '{"lat":36.51,"lng":10.51}')"
chk "le prestataire, dans sa zone, sous contrat avec A alors que sa commune principale est une autre" 200 \
    "$(position "$VA" "$T_P" '{"lat":36.007,"lng":10.007,"status":"en_tournee"}')"
chk "le directeur B, rattaché à A en second : refusé avant le rattachement (introuvable)" 404 "$(position "$VA" "$T_B" "$ICI")"
$PSQL -c "INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$DIR_B', '$A');" >/dev/null
chk "… accepté une fois rattaché, sans rien changer à son rattachement principal" 200 "$(position "$VA" "$T_B" "$ICI")"
# Deux jours et non un : app.mes_communes() compare la fin du rattachement à la
# date du serveur, qui n'est pas encore celle de Tunis entre minuit et une heure.
$PSQL -c "UPDATE utilisateur_communes SET date_fin = (app.jour_tunis() - 2) WHERE user_id = '$DIR_B' AND commune_id = '$A';" >/dev/null
chk "… et de nouveau introuvable quand le rattachement est échu" 404 "$(position "$VA" "$T_B" "$ICI")"
NOUVEAU="table_name = 'vehicules' AND record_id IN ('$VA','$VA2','$VB') AND id > $AUDIT_MAX"
chk "le journal d'audit : une remontée de position seule n'y entre pas ; le passage « en tournée » y entre, sans la position (094)" \
    "1|{status}|0" \
    "$(sql "SELECT count(*) FROM audit_log WHERE $NOUVEAU")|$(sql "SELECT string_agg(changed_fields::text, ',') FROM audit_log WHERE $NOUVEAU")|$(sql "SELECT count(*) FROM audit_log WHERE $NOUVEAU AND (old_data ?| ARRAY['lat','lng','geom','fuel_level_percent'] OR new_data ?| ARRAY['lat','lng','geom','fuel_level_percent'])")"
CREES="table_name = 'vehicules' AND operation = 'INSERT' AND record_id IN ('$VA','$VA2','$VB','$VR')"
chk "les créations des quatre engins sont au journal, sans leur position (094)" "4|0" \
    "$(sql "SELECT count(*) FROM audit_log WHERE $CREES")|$(sql "SELECT count(*) FROM audit_log WHERE $CREES AND new_data ?| ARRAY['lat','lng','geom','fuel_level_percent']")"

echo
base_reelle_intacte "pendant la campagne"
nettoyer
T=$(mktemp -d)
chk "en partant : les communes de test et les comptes temporaires sont effacés" "0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
