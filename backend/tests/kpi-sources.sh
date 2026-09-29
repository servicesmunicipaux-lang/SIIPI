#!/usr/bin/env bash
# =============================================================================
# L'automatisation des sources KPI — Jalon 8, lot 2.
#
# LA RÈGLE VÉRIFIÉE, STRICTEMENT : MESURÉ > DÉCLARÉ > NON RENSEIGNÉ.
# Pour chaque indicateur que les nouveaux registres savent mesurer, la
# campagne vérifie les quatre temps :
#   1. rien : « non renseigné », sans source ;
#   2. une déclaration seule : elle est retenue, source « déclaré » ;
#   3. une mesure en plus : elle PRIME sur la déclaration, source « mesuré » ;
#   4. la mesure retirée : la déclaration reprend la main.
# Et ce qui ferait mentir une mesure : un registre vide n'est pas un zéro.
#
# Année d'essai : 2022, vierge, distincte de celle de la campagne kpi-5-axes.
#
#   docker compose exec -T api npm run test:kpi-sources
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
req() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer ${4:-$T_DIR}" \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}
AN=2022
axes() { req GET "/kpi/5-axes?communeId=$COMMUNE&annee=$AN" >/dev/null; }
# etat <code> → statut|source|valeur|note arrondie
etat() { axes; val "(lambda i: f\"{i['statut']}|{i['source']}|{i['valeur']}|{None if i['note'] is None else round(i['note'],3)}\")(next(i for i in d['indicateurs'] if i['code']=='$1'))"; }
declarer() { req PUT "/kpi/evaluations/$COMMUNE/$AN" "{\"valeurs\":$1}" >/dev/null; }

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")

nettoyer() {
  $PSQL -c "DELETE FROM evaluations_kpi WHERE annee = $AN AND commune_id = '$COMMUNE';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM actions_planifiees WHERE titre LIKE 'TEST-SRC%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM poi WHERE nom LIKE 'TEST-SRC%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM fins_de_poste WHERE observation = 'TEST-SRC';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM fuel_logs WHERE vehicule_id IN (SELECT id FROM vehicules WHERE registration LIKE 'TEST-SRC%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM fins_de_poste WHERE vehicule_id IN (SELECT id FROM vehicules WHERE registration LIKE 'TEST-SRC%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM vehicules WHERE registration LIKE 'TEST-SRC%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM dotations_epi WHERE personnel_id IN (SELECT id FROM personnel WHERE nom_complet LIKE 'TEST-SRC%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM incidents_travail WHERE description = 'TEST-SRC';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM personnel WHERE nom_complet LIKE 'TEST-SRC%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM conventions_commerciales WHERE observation = 'TEST-SRC';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM commerces WHERE nom LIKE 'TEST-SRC%';" >/dev/null 2>&1
  $PSQL -c "UPDATE parametres_commune SET objectif_balayage_ml_j = NULL WHERE commune_id = '$COMMUNE';" >/dev/null 2>&1
}
nettoyer

# Un registre tenu ailleurs dans la commune fausserait l'année d'essai : la
# campagne commence par vérifier qu'elle part de rien.
chk "l'année $AN est vierge pour la commune d'essai" "non_renseigne|None|None|None" "$(etat M1-9)"

# -----------------------------------------------------------------------------
echo
echo "1. Bâchage (M1-9) : les quatre temps de la règle"
declarer '{"M1-9":{"valeur":3,"cible":10}}'
chk "déclaré seul : retenu, source « déclaré »" "renseigne|declare|3|0.3" "$(etat M1-9)"
req POST "/trucks?communeId=$COMMUNE" '{"registration":"TEST-SRC 001","type":"benne_tasseuse","etat":"en_service"}' >/dev/null
V=$(val "d['id']")
chk "la fin de poste exige la réponse « benne bâchée »" 400 \
    "$(req POST /registres/fins-de-poste "{\"vehiculeId\":\"$V\",\"jour\":\"$AN-03-01\"}")"
chk "et refuse un jour à venir" 400 \
    "$(req POST /registres/fins-de-poste "{\"vehiculeId\":\"$V\",\"jour\":\"2099-01-01\",\"benneBachee\":true}")"
for b in true true true false; do
  req POST /registres/fins-de-poste "{\"vehiculeId\":\"$V\",\"jour\":\"$AN-03-01\",\"benneBachee\":$b,\"observation\":\"TEST-SRC\"}" >/dev/null
done
chk "mesuré (3 bâchées sur 4 fins de poste) : PRIME sur le déclaré" "renseigne|mesure|3|0.75" "$(etat M1-9)"
chk "la cible mesurée est le nombre de fins de poste" "4" "$(val "next(i['cible'] for i in d['indicateurs'] if i['code']=='M1-9')")"
$PSQL -c "UPDATE fins_de_poste SET deleted_at = now() WHERE observation = 'TEST-SRC';" >/dev/null
chk "mesure retirée : la déclaration reprend la main" "renseigne|declare|3|0.3" "$(etat M1-9)"
declarer '{"M1-9":null}'
chk "ni l'une ni l'autre : non renseigné" "non_renseigne|None|None|None" "$(etat M1-9)"

echo
echo "2. Balayage (M1-1) : les mètres linéaires des nettoyages"
declarer '{"M1-1":{"valeur":8000,"cible":10000}}'
req POST "/poi?communeId=$COMMUNE" '{"nom":"TEST-SRC Centre-ville","type":"autre","lat":36.88,"lng":10.32}' >/dev/null
P_CV=$(val "d['id']")
req POST "/points/actions?communeId=$COMMUNE" "{\"titre\":\"TEST-SRC balayage\",\"type\":\"nettoyage\",\"poiId\":\"$P_CV\",\"datePrevue\":\"$AN-06-01\"}" >/dev/null
A_BAL=$(val "d['id']")
chk "un nettoyage planifié ne mesure rien : le déclaré reste" "renseigne|declare|8000|0.8" "$(etat M1-1)"
req PATCH "/points/actions/$A_BAL" '{"statut":"terminee","metresLineaires":30000}' >/dev/null
# 30 000 m du 1er juin au 31 décembre (214 jours) = 140,2 ml/j ; sans objectif
# de la commune, la cible déclarée (10 000) sert : 0,014.
chk "terminé avec 30 000 ml : mesuré 140,2 ml/j, sur la cible déclarée faute d'objectif" "renseigne|mesure|140.2|0.014" "$(etat M1-1)"
req PUT "/communes/$COMMUNE/parametres" '{"objectifBalayageMlJ":200}' >/dev/null
chk "avec l'objectif de la commune (200 ml/j) : 0,701" "renseigne|mesure|140.2|0.701" "$(etat M1-1)"

echo
echo "3. Lieux : marchés, abattoirs, cimetières"
chk "un lieu hors de Tunisie est refusé" 400 "$(req POST "/poi?communeId=$COMMUNE" '{"nom":"TEST-SRC Paris","type":"marche","lat":48.8,"lng":2.3}')"
req POST "/poi?communeId=$COMMUNE" '{"nom":"TEST-SRC Marché central","type":"marche","lat":36.881,"lng":10.321}' >/dev/null
P_MAR=$(val "d['id']")
chk "le lieu naît « non renseigné » : jamais nettoyé, rien de prévu" "non_renseigne" "$(val "d['etat']")"
req POST "/poi?communeId=$COMMUNE" '{"nom":"TEST-SRC Abattoir","type":"abattoir","lat":36.882,"lng":10.322}' >/dev/null
P_ABA=$(val "d['id']")
declarer '{"M2-4":{"valeur":90},"M2-5":{"valeur":90},"M2-3":{"valeur":85}}'
for j in 04-01 04-08; do
  req POST "/points/actions?communeId=$COMMUNE" "{\"titre\":\"TEST-SRC marché $j\",\"poiId\":\"$P_MAR\",\"datePrevue\":\"$AN-$j\"}" >/dev/null
done
A_MAR=$(val "d['id']")
req PATCH "/points/actions/$A_MAR" '{"statut":"terminee"}' >/dev/null
req POST "/points/actions?communeId=$COMMUNE" "{\"titre\":\"TEST-SRC abattoir\",\"poiId\":\"$P_ABA\",\"datePrevue\":\"$AN-05-01\"}" >/dev/null
req PATCH "/points/actions/$(val "d['id']")" '{"statut":"terminee"}' >/dev/null
chk "rattachée à un lieu, l'action est un nettoyage" "nettoyage" "$(val "d['type']")"
chk "marché : 1 nettoyage fait sur 2 échus = 50 %, mesuré, prime sur 90 % déclarés" "renseigne|mesure|50|0.5" "$(etat M2-4)"
chk "abattoir : 1 sur 1 = 100 %, mesuré" "renseigne|mesure|100|1" "$(etat M2-5)"
chk "cimetière sans nettoyage : le déclaré prend le relais" "renseigne|declare|85|0.85" "$(etat M2-3)"
chk "les nettoyages se filtrent par lieu" 2 "$(req GET "/points/actions?communeId=$COMMUNE&poiId=$P_MAR" >/dev/null; val "len(d)")"

echo
echo "4. La route publique des lieux"
chk "sans commune désignée, rien ne sort" 400 "$(curl -s -o /dev/null -w '%{http_code}' "$API/citoyen/lieux")"
curl -s "$API/citoyen/lieux?communeId=$COMMUNE" > "$T/r.json"
chk "sans authentification, le marché sort, avec son état" "1|1" \
    "$(val "sum(1 for l in d if l['id']=='$P_MAR')")|$(val "1 if all('etat' in l for l in d) else 0")"
chk "l'abattoir ne sort JAMAIS" 0 "$(val "sum(1 for l in d if l['type']=='abattoir' or l['id']=='$P_ABA')")"
chk "ni aucun autre type que marchés et cimetières" 0 "$(val "sum(1 for l in d if l['type'] not in ('marche','cimetiere'))")"
chk "le personnel de la commune, lui, voit l'abattoir" 1 "$(req GET "/poi?communeId=$COMMUNE" >/dev/null; val "sum(1 for l in d if l['id']=='$P_ABA')")"

echo
echo "5. EPI (M1-6) : un registre vide n'est pas « 0 % dotés »"
A1=$(sql "INSERT INTO personnel (commune_id, nom_complet, fonction) VALUES ('$COMMUNE', 'TEST-SRC Agent 1', 'agent') RETURNING id")
A2=$(sql "INSERT INTO personnel (commune_id, nom_complet, fonction) VALUES ('$COMMUNE', 'TEST-SRC Agent 2', 'agent_balayage') RETURNING id")
declarer '{"M1-6":{"valeur":40,"cible":50}}'
chk "registre vide : le déclaré tient (40 / 50)" "renseigne|declare|40|0.8" "$(etat M1-6)"
req POST /registres/epi "{\"personnelId\":\"$A1\",\"typeEpi\":\"kit_complet\",\"dateRemise\":\"$AN-01-10\"}" >/dev/null
TERRAIN=$(sql "SELECT count(*) FROM personnel WHERE commune_id='$COMMUNE' AND deleted_at IS NULL AND actif AND service='proprete' AND fonction IN ('chauffeur','agent','chef_equipe','agent_balayage','ripeur','tractoriste','jardinier','agent_hygiene','mecanicien')")
chk "registre tenu : 1 agent doté sur l'effectif de terrain ($TERRAIN), mesuré" \
    "renseigne|mesure|1|$(python3 -c "print(round(1/$TERRAIN,3))")" "$(etat M1-6)"
chk "une dotation dont le renouvellement précède la remise est refusée" 400 \
    "$(req POST /registres/epi "{\"personnelId\":\"$A2\",\"typeEpi\":\"gants\",\"dateRemise\":\"$AN-02-01\",\"dateRenouvellement\":\"$AN-01-01\"}")"

echo
echo "6. Conventions (M2-2), carburant, accidents"
req POST "/registres/commerces?communeId=$COMMUNE" '{"nom":"TEST-SRC Boulangerie"}' >/dev/null
C1=$(val "d['id']")
req POST "/registres/commerces?communeId=$COMMUNE" '{"nom":"TEST-SRC Lycée","categorie":"institution"}' >/dev/null
req POST /registres/conventions "{\"commerceId\":\"$C1\",\"type\":\"collecte\",\"dateDebut\":\"$AN-01-01\",\"dateFin\":\"$AN-12-31\",\"tonnageEstime\":1.5,\"observation\":\"TEST-SRC\"}" >/dev/null
NCOM=$(sql "SELECT count(*) FROM commerces WHERE commune_id='$COMMUNE' AND deleted_at IS NULL AND actif")
chk "conventions : 1 commerce conventionné sur $NCOM, mesuré" "renseigne|mesure|1|$(python3 -c "print(round(1/$NCOM,3))")" "$(etat M2-2)"
declarer '{"ECO-CARBURANT":{"valeur":99999}}'
chk "carburant déclaré seul" "renseigne|declare|99999" "$(etat ECO-CARBURANT | cut -d'|' -f1-3)"
req POST /registres/carburant "{\"vehiculeId\":\"$V\",\"datePlein\":\"$AN-02-01\",\"litres\":100,\"montantTnd\":215.5,\"kilometrage\":120000}" >/dev/null
req POST /registres/carburant "{\"vehiculeId\":\"$V\",\"datePlein\":\"$AN-02-15\",\"litres\":80,\"montantTnd\":172.4}" >/dev/null
chk "deux pleins : 387,9 TND mesurés, priment sur le déclaré" "renseigne|mesure|387.9" "$(etat ECO-CARBURANT | cut -d'|' -f1-3)"
chk "le plein a relevé le compteur de l'engin" 120000 "$(sql "SELECT kilometrage FROM vehicules WHERE id='$V'")"
declarer '{"RH-ACCIDENTS":{"valeur":5}}'
chk "accidents : journal vide, les 5 déclarés tiennent" "renseigne|declare|5" "$(etat RH-ACCIDENTS | cut -d'|' -f1-3)"
req POST "/registres/incidents?communeId=$COMMUNE" "{\"personnelId\":\"$A1\",\"dateIncident\":\"$AN-07-01\",\"type\":\"presque_accident\",\"gravite\":\"benin\",\"description\":\"TEST-SRC\"}" >/dev/null
chk "journal tenu, un presque-accident : « 0 accident » mesuré, qui prime" "renseigne|mesure|0" "$(etat RH-ACCIDENTS | cut -d'|' -f1-3)"

echo
echo "7. Le badge de source, pour chaque indicateur"
axes
chk "tout indicateur renseigné a une source ; aucun non renseigné n'en a" "0|0" \
    "$(val "sum(1 for i in d['indicateurs'] if i['statut']=='renseigne' and i['source'] not in ('mesure','declare'))")|$(val "sum(1 for i in d['indicateurs'] if i['statut']!='renseigne' and i['source'] is not None)")"
chk "un indicateur calculé depuis toujours est « mesuré » quand il est renseigné" 0 \
    "$(val "sum(1 for i in d['indicateurs'] if i['mode']=='calcule' and i['statut']=='renseigne' and i['source']!='mesure')")"

echo
echo "8. Cloisonnement"
T_AUTRE=$(tok "$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id <> '$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")")
chk "une autre commune ne voit pas ces lieux" 0 "$(req GET "/poi?communeId=$COMMUNE" "" "$T_AUTRE" >/dev/null; val "sum(1 for l in d if l['nom'].startswith('TEST-SRC'))")"
chk "ni ne les modifie ni ne les retire (404)" "404|404" \
    "$(req PATCH "/poi/$P_MAR" '{"nom":"pirate"}' "$T_AUTRE")|$(req DELETE "/poi/$P_MAR" "" "$T_AUTRE")"
chk "ni ne planifie un nettoyage sur l'un d'eux" 404 \
    "$(req POST /points/actions "{\"titre\":\"TEST-SRC pirate\",\"poiId\":\"$P_MAR\",\"datePrevue\":\"$AN-01-01\"}" "$T_AUTRE")"
chk "ni ne saisit un plein ou une fin de poste sur ses engins" "404|404" \
    "$(req POST /registres/carburant "{\"vehiculeId\":\"$V\",\"datePlein\":\"$AN-02-01\",\"litres\":1,\"montantTnd\":1}" "$T_AUTRE")|$(req POST /registres/fins-de-poste "{\"vehiculeId\":\"$V\",\"jour\":\"$AN-02-01\",\"benneBachee\":true}" "$T_AUTRE")"
chk "ni ne lit ses registres" 0 "$(req GET "/registres/epi?communeId=$COMMUNE" "" "$T_AUTRE" >/dev/null; val "len(d)")"
chk "même en SQL direct, un nettoyage ne se rattache pas au lieu d'une autre commune" 1 \
    "$($PSQL -c "INSERT INTO actions_planifiees (commune_id, titre, date_prevue, poi_id) SELECT id, 'TEST-SRC sql', '$AN-01-01', '$P_MAR' FROM communes WHERE id <> '$COMMUNE' LIMIT 1" 2>&1 | grep -c LIEU_AUTRE_COMMUNE)"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
