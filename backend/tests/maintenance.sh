#!/usr/bin/env bash
# =============================================================================
# La maintenance des engins — Jalon 5 (B2.2 carnet d'entretien, B2.3 alertes).
#
# LE TEST DE VALIDATION DE LA FEUILLE DE ROUTE : un engin dont l'entretien est
# dû est signalé AVANT l'échéance, et le signalement disparaît une fois
# l'intervention saisie. Puis ce qui rendrait une alerte trompeuse : un
# compteur qui recule, une échéance au kilomètre qu'on ne peut pas évaluer
# présentée comme « à jour », une panne inscrite sur l'engin d'une autre
# commune.
#
#   docker compose exec -T api npm run test:maintenance
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
val()  { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
# req <méthode> <chemin> [corps JSON] [jeton] — rend le code HTTP, corps dans $T/r.json.
req() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer ${4:-$T_DIR}" \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}
jour() { date -u -d "$1 days" +%Y-%m-%d; }
# Le statut d'un plan dans les échéances de la commune.
statut() { req GET "/maintenance/echeances?communeId=$COMMUNE" >/dev/null; val "next((e['statut'] for e in d if e['plan_id']=='$1'), 'absent')"; }
echeance() { req GET "/maintenance/echeances?communeId=$COMMUNE" >/dev/null; val "next((e['$2'] for e in d if e['plan_id']=='$1'), 'absent')"; }

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")

nettoyer() {
  $PSQL -c "DELETE FROM interventions_maintenance WHERE vehicule_id IN (SELECT id FROM vehicules WHERE registration LIKE 'TEST-M%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM plans_entretien WHERE vehicule_id IN (SELECT id FROM vehicules WHERE registration LIKE 'TEST-M%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM vehicules WHERE registration LIKE 'TEST-M%';" >/dev/null 2>&1
}
nettoyer

req POST "/trucks?communeId=$COMMUNE" '{"registration":"TEST-M 001","type":"benne_tasseuse","etat":"en_service"}' >/dev/null
V1=$(val "d['id']")
req POST "/trucks?communeId=$COMMUNE" '{"registration":"TEST-M 002","type":"camion","etat":"en_service"}' >/dev/null
V2=$(val "d['id']")

# -----------------------------------------------------------------------------
echo
echo "1. Le compteur"
chk "un premier relevé est accepté" "200|100000" "$(req PUT "/maintenance/engins/$V1/kilometrage" '{"kilometrage":100000}')|$(val "d['kilometrage']")"
chk "un relevé inférieur est refusé — le compteur ne recule pas" 400 "$(req PUT "/maintenance/engins/$V1/kilometrage" '{"kilometrage":90000}')"
chk "et la raison cite le dernier relevé" 1 "$(val "1 if '100000' in d['error'] else 0")"
chk "sauf compteur remplacé, explicitement confirmé" "200|90000" \
    "$(req PUT "/maintenance/engins/$V1/kilometrage" '{"kilometrage":90000,"forcer":true}')|$(val "d['kilometrage']")"
req PUT "/maintenance/engins/$V1/kilometrage" '{"kilometrage":100000}' >/dev/null
chk "un relevé daté de l'avenir est refusé" 400 "$(req PUT "/maintenance/engins/$V1/kilometrage" "{\"kilometrage\":100500,\"date\":\"$(jour 3)\"}")"

echo
echo "2. Un plan d'entretien"
chk "un plan sans aucun intervalle est refusé" 400 "$(req POST /maintenance/plans "{\"vehiculeId\":\"$V1\",\"type\":\"vidange\"}")"
# Vidange tous les 10 000 km ou 180 jours ; la dernière remonte à 170 jours,
# à 95 000 km. Échéance : dans 10 jours (seuil 30 j) ou à 105 000 km.
CODE=$(req POST /maintenance/plans "{\"vehiculeId\":\"$V1\",\"type\":\"vidange\",\"libelle\":\"Vidange moteur\",\"intervalleKm\":10000,\"intervalleJours\":180,\"referenceDate\":\"$(jour -170)\",\"referenceKm\":95000}")
chk "le plan de vidange s'enregistre" 201 "$CODE"
P_VIDANGE=$(val "d['id']")

echo
echo "3. LE TEST DE VALIDATION — signalé avant l'échéance, effacé par l'intervention"
chk "l'entretien est « à prévoir » alors que l'échéance n'est pas atteinte" "a_prevoir" "$(statut "$P_VIDANGE")"
chk "à 10 jours de l'échéance, et à 5 000 km" "10|5000|105000" \
    "$(echeance "$P_VIDANGE" jours_restants)|$(echeance "$P_VIDANGE" km_restants)|$(echeance "$P_VIDANGE" echeance_km)"
req GET "/maintenance/echeances?communeId=$COMMUNE&statut=a_prevoir" >/dev/null
chk "il figure dans la liste des entretiens à prévoir" 1 "$(val "sum(1 for e in d if e['plan_id']=='$P_VIDANGE')")"
CODE=$(req POST /maintenance/interventions "{\"vehiculeId\":\"$V1\",\"dateIntervention\":\"$(jour 0)\",\"type\":\"vidange\",\"nature\":\"preventive\",\"coutTnd\":350.5,\"kilometrage\":101000,\"prestataire\":\"Garage TEST\"}")
chk "la vidange est saisie" 201 "$CODE"
I_VIDANGE=$(val "d['id']")
chk "le signalement a disparu : le plan est « à jour »" "a_jour" "$(statut "$P_VIDANGE")"
req GET "/maintenance/echeances?communeId=$COMMUNE&statut=a_prevoir" >/dev/null
chk "et il ne figure plus parmi les entretiens à prévoir" 0 "$(val "sum(1 for e in d if e['plan_id']=='$P_VIDANGE')")"
chk "la prochaine échéance repart de cette vidange (+180 j, +10 000 km)" "$(jour 180)|111000" \
    "$(echeance "$P_VIDANGE" echeance_date)|$(echeance "$P_VIDANGE" echeance_km)"
chk "le compteur de l'engin a suivi l'intervention" 101000 "$(sql "SELECT kilometrage FROM vehicules WHERE id='$V1'")"

echo
echo "4. En retard, par la date ou par le kilomètre"
req POST /maintenance/plans "{\"vehiculeId\":\"$V1\",\"type\":\"revision\",\"intervalleJours\":30,\"referenceDate\":\"$(jour -40)\"}" >/dev/null
P_REVISION=$(val "d['id']")
chk "une révision mensuelle vieille de 40 jours est « en retard »" "en_retard|-10" "$(statut "$P_REVISION")|$(echeance "$P_REVISION" jours_restants)"
req POST /maintenance/plans "{\"vehiculeId\":\"$V1\",\"type\":\"pneumatiques\",\"intervalleKm\":5000,\"referenceKm\":94000}" >/dev/null
P_PNEUS=$(val "d['id']")
chk "des pneus dus à 99 000 km, compteur à 101 000 : « en retard » de 2 000 km" "en_retard|-2000" \
    "$(statut "$P_PNEUS")|$(echeance "$P_PNEUS" km_restants)"
req GET "/maintenance/echeances?communeId=$COMMUNE" >/dev/null
chk "les retards passent en tête de liste" "en_retard" "$(val "[e['statut'] for e in d if e['registration']=='TEST-M 001'][0]")"

echo
echo "5. Ce qui ne se dit pas « à jour » sans rien savoir"
req POST /maintenance/plans "{\"vehiculeId\":\"$V2\",\"type\":\"vidange\",\"intervalleKm\":10000}" >/dev/null
P_SANS_COMPTEUR=$(val "d['id']")
chk "un plan au kilomètre sur un engin sans relevé : « à vérifier », pas « à jour »" "a_verifier" "$(statut "$P_SANS_COMPTEUR")"
req POST /maintenance/interventions "{\"vehiculeId\":\"$V1\",\"dateIntervention\":\"$(jour 0)\",\"type\":\"pneumatiques\",\"coutTnd\":2400}" >/dev/null
chk "des pneus changés sans relever le kilométrage : échéance au km inconnue, « à vérifier »" "a_verifier|None" \
    "$(statut "$P_PNEUS")|$(echeance "$P_PNEUS" echeance_km)"

echo
echo "6. Le carnet d'entretien"
chk "une intervention datée de l'avenir est refusée" 400 \
    "$(req POST /maintenance/interventions "{\"vehiculeId\":\"$V1\",\"dateIntervention\":\"$(jour 2)\",\"type\":\"vidange\"}")"
chk "un coût négatif est refusé" 400 \
    "$(req POST /maintenance/interventions "{\"vehiculeId\":\"$V1\",\"dateIntervention\":\"$(jour 0)\",\"type\":\"vidange\",\"coutTnd\":-5}")"
chk "un type inconnu est refusé" 400 \
    "$(req POST /maintenance/interventions "{\"vehiculeId\":\"$V1\",\"dateIntervention\":\"$(jour 0)\",\"type\":\"lavage\"}")"
req POST /maintenance/interventions "{\"vehiculeId\":\"$V1\",\"dateIntervention\":\"$(jour -300)\",\"type\":\"freinage\",\"coutTnd\":900,\"kilometrage\":80000}" >/dev/null
chk "une intervention ancienne, saisie après coup, ne rajeunit pas le compteur" 101000 "$(sql "SELECT kilometrage FROM vehicules WHERE id='$V1'")"
req GET "/maintenance/interventions?communeId=$COMMUNE&vehiculeId=$V1" >/dev/null
chk "le carnet de l'engin : 3 interventions, la plus récente en tête" "3|$(jour 0)" "$(val "f\"{len(d)}|{d[0]['date_intervention']}\"")"
chk "le coût est gardé au millime" "350.500" "$(val "next(i['cout_tnd'] for i in d if i['type']=='vidange')")"
req GET "/maintenance/bilan?communeId=$COMMUNE" >/dev/null
chk "le bilan sur 12 mois : 3 interventions, 3 650,5 TND dont 3 300 correctifs" "3|3650.5|3300" \
    "$(val "next(f\"{b['interventions_12_mois']}|{b['cout_12_mois_tnd']}|{b['cout_correctif_12_mois_tnd']}\" for b in d if b['vehicule_id']=='$V1')")"
chk "une correction de l'intervention passe" "200|380.000" \
    "$(req PATCH "/maintenance/interventions/$I_VIDANGE" '{"coutTnd":380}')|$(val "d['cout_tnd']")"

echo
echo "7. Retirer l'intervention fait revenir l'alerte"
chk "la vidange est retirée" 204 "$(req DELETE "/maintenance/interventions/$I_VIDANGE")"
chk "le plan redevient « à prévoir » : l'échéance n'était pas stockée" "a_prevoir" "$(statut "$P_VIDANGE")"
chk "l'intervention reste en base, datée et imputée" 1 \
    "$(sql "SELECT count(*) FROM interventions_maintenance WHERE id='$I_VIDANGE' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL")"
chk "le compteur, lui, ne recule pas" 101000 "$(sql "SELECT kilometrage FROM vehicules WHERE id='$V1'")"

echo
echo "8. Cloisonnement : des coûts et des pannes"
AUTRE_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id <> '$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
if [ -n "$AUTRE_EMAIL" ]; then
  T_AUTRE=$(tok "$AUTRE_EMAIL")
  AUTRE_COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$AUTRE_EMAIL'")
  req GET "/maintenance/echeances?communeId=$COMMUNE" "" "$T_AUTRE" >/dev/null
  chk "une autre commune ne voit pas ces échéances" 0 "$(val "sum(1 for e in d if e['vehicule_id']=='$V1')")"
  chk "ni ne peut inscrire une intervention sur cet engin (introuvable, pas « interdit »)" 404 \
      "$(req POST /maintenance/interventions "{\"vehiculeId\":\"$V1\",\"dateIntervention\":\"$(jour 0)\",\"type\":\"vidange\"}" "$T_AUTRE")"
  chk "ni relever son compteur" 404 "$(req PUT "/maintenance/engins/$V1/kilometrage" '{"kilometrage":999999}' "$T_AUTRE")"
  chk "ni retirer un plan" 404 "$(req DELETE "/maintenance/plans/$P_VIDANGE" "" "$T_AUTRE")"
  chk "même en SQL direct, la base refuse une panne rattachée à une autre commune" 1 \
      "$($PSQL -c "INSERT INTO interventions_maintenance (commune_id, vehicule_id, date_intervention, type) VALUES ('$AUTRE_COMMUNE', '$V1', CURRENT_DATE, 'vidange')" 2>&1 | grep -c ENGIN_AUTRE_COMMUNE)"
fi
PREST_EMAIL=$(sql "SELECT email FROM users WHERE role='gestionnaire_prestataire' AND deleted_at IS NULL AND is_active ORDER BY created_at LIMIT 1")
[ -n "$PREST_EMAIL" ] && chk "un prestataire n'accède pas au carnet d'entretien" 403 \
    "$(req GET "/maintenance/interventions?communeId=$COMMUNE" "" "$(tok "$PREST_EMAIL")")"
chk "sans jeton, rien" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$API/maintenance/echeances?communeId=$COMMUNE")"

echo
echo "9. Un engin réformé ne réclame plus d'entretien"
req PATCH "/trucks/$V2" '{"etat":"reforme"}' >/dev/null
chk "son plan sort des échéances" "absent" "$(statut "$P_SANS_COMPTEUR")"

echo
echo "10. Exports (service du Jalon 4)"
chk "les échéances s'exportent en Excel" 200 \
    "$(curl -s -o "$T/e.xlsx" -w '%{http_code}' -H "Authorization: Bearer $T_DIR" "$API/maintenance/echeances?communeId=$COMMUNE&format=xlsx")"
chk "et c'est bien une archive XLSX" 1 "$(python3 -c "import zipfile;print(1 if 'xl/worksheets/sheet1.xml' in zipfile.ZipFile('$T/e.xlsx').namelist() else 0)" 2>/dev/null || echo 0)"
curl -s -o "$T/i.csv" -H "Authorization: Bearer $T_DIR" "$API/maintenance/interventions?communeId=$COMMUNE&vehiculeId=$V1&format=csv"
chk "le carnet s'exporte en CSV, libellés et virgule décimale" 1 \
    "$(python3 -c "t=open('$T/i.csv',encoding='utf-8-sig').read();print(1 if 'Pneumatiques' in t and '2400' in t and 'Freinage' in t else 0)")"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
