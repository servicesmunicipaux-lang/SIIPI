#!/usr/bin/env bash
# =============================================================================
# v0.15.75 — lot 17.4a : le connecteur GPS générique.
# DECISIONS_2026-10-20.md § 8 ; décisions du 23/10/2026 ; migration 085,
# services/gps.ts, routes/gps.routes.ts.
#
# Avec un FAUX FOURNISSEUR générique (tests/outils/faux_gps.py), sur une API à
# part (sa journalisation est lue), dans deux communes de test.
#
# Elle commence par ce que la décision veut voir REFUSÉ :
#   - le jeton relu en clair : ni par l'API, ni dans sa colonne, ni au journal
#     d'audit, ni dans les journaux de l'API ; la table des secrets illisible pour
#     le rôle de l'application ;
#   - un webhook non signé, mal signé, rejoué, d'un fournisseur inconnu ou éteint ;
#   - une position d'une autre commune (un boîtier sur un engin d'une autre commune) ;
#   - des coordonnées hors de Tunisie ; une position sans engin ;
#   - un horodatage illisible ou impossible (un fournisseur qui change son format de
#     date) : jamais tracé, toujours signalé ;
#   - la configuration lue par un prestataire ou une autre commune, écrite par la FNCT.
# Puis ce qui doit marcher : l'essai sans enregistrement, l'interrogation et ses
# doublons, la panne notée sans rien bloquer, le boîtier clos, le webhook signé et
# sa limite, la cadence du planificateur — et, d'un bout à l'autre, des circuits,
# des points relevés et des engins qui ne bougent pas.
#
#   docker compose exec -T api npm run test:gps
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
PORT_ESSAI=4013
API="http://localhost:$PORT_ESSAI"
PORT_FAUX=8092
FAUX="$T/faux"
A=test_gps_a
B=test_gps_b
JETON="TEST-jeton-gps-$$-$(date +%s)"
PID_FAUX=""
. tests/outils/instance_essai.sh
. tests/outils/communes_essai.sh
. tests/outils/comptes_temporaires.sh
fin() {
  [ -n "$PID_FAUX" ] && { kill "$PID_FAUX" 2>/dev/null; wait "$PID_FAUX" 2>/dev/null; }
  arreter_api_essai
  retirer_comptes_temporaires
  effacer_communes_essai "'$A','$B'"
  rm -rf "$T"
}
trap fin EXIT

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
sql() { $PSQL -c "$1" 2>&1 | tr -d ' '; }
appel() { # méthode chemin jeton [corps] — code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" ${3:+-H "Authorization: Bearer $3"} \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}
jq_() { jq -r "$1" "$T/r.json" 2>/dev/null; }
jeton_de() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jq -r '.token // empty'; }
ms() { echo $(( $(date +%s%3N) + ${1:-0} * 1000 )); }   # maintenant ± secondes, en millisecondes
pos() { # boîtier lat lng horodatage — une position du faux fournisseur
  printf '{"device":"%s","pos":{"lat":%s,"lng":%s},"ts":%s,"speed":32,"heading":90}' "$1" "$2" "$3" "$4"
}
poser_positions() { printf '{"data":{"positions":[%s]}}' "$1" > "$FAUX/positions.json"; }
nb() { sql "SELECT count(*) FROM $1 WHERE commune_id = '$A'${2:+ AND $2}"; }
empreinte_terrain() {
  sql "SELECT md5(coalesce((SELECT string_agg(c::text, '|' ORDER BY c.id) FROM circuits c), '') ||
                  coalesce((SELECT string_agg(p::text, '|' ORDER BY p.id) FROM points_collecte p), '') ||
                  coalesce((SELECT string_agg(v::text, '|' ORDER BY v.id) FROM vehicules v), ''))"
}
signe() { # secret horodatage fichier — la signature d'un envoi
  { printf '%s.' "$2"; cat "$3"; } | openssl dgst -sha256 -hmac "$1" -r | cut -d' ' -f1 | sed 's/^/sha256=/'
}
webhook() { # fichier [horodatage] [signature] [fournisseur] — code HTTP
  curl -s -o "$T/r.json" -w '%{http_code}' -X POST "$API/gps/webhook/${4:-$FOURNISSEUR}" -H 'Content-Type: application/json' \
    ${2:+-H "X-SIIPI-Horodatage: $2"} ${3:+-H "X-SIIPI-Signature: $3"} --data-binary @"$1"
}

command -v openssl >/dev/null 2>&1 || apk add -q --no-cache openssl >/dev/null 2>&1

# --- Le terrain : deux communes de test, trois engins, des comptes -----------
commune_essai "$A" "TEST commune A du connecteur GPS"
commune_essai "$B" "TEST commune B du connecteur GPS"
sql "INSERT INTO vehicules (id, registration, commune_id, type) VALUES
       ('test-gps-a1-$$', 'TEST-GPS-A1-$$', '$A', 'benne_tasseuse'),
       ('test-gps-a2-$$', 'TEST-GPS-A2-$$', '$A', 'benne_tasseuse'),
       ('test-gps-b1-$$', 'TEST-GPS-B1-$$', '$B', 'benne_tasseuse');" >/dev/null
A1="test-gps-a1-$$"; B1="test-gps-b1-$$"
compte_temporaire admin_commune "$A" "Directeur A du GPS"; DIR_A_E=$COMPTE_EMAIL; DIR_A_M=$COMPTE_MDP
compte_temporaire admin_commune "$B" "Directeur B du GPS"; DIR_B_E=$COMPTE_EMAIL; DIR_B_M=$COMPTE_MDP
compte_temporaire gestionnaire_prestataire "$A" "Prestataire A du GPS"; PRE_E=$COMPTE_EMAIL; PRE_M=$COMPTE_MDP
compte_temporaire super_admin_fnct "" "Agent FNCT du GPS"; FN_E=$COMPTE_EMAIL; FN_M=$COMPTE_MDP

mkdir -p "$FAUX"
printf '%s' "$JETON" > "$FAUX/jeton"
poser_positions ''
python3 tests/outils/faux_gps.py "$PORT_FAUX" "$FAUX" > "$T/faux.log" 2>&1 &
PID_FAUX=$!
api_essai "$PORT_ESSAI" "${PGDATABASE:-siipi_national}" SIIPI_GPS_WEBHOOK_MAX=8; CODE=$?
[ "$CODE" = 0 ] || { echo "L'API d'essai n'a pas démarré (voir $T/api_$PORT_ESSAI.log)." >&2; exit 1; }
T_A=$(jeton_de "$DIR_A_E" "$DIR_A_M"); T_B=$(jeton_de "$DIR_B_E" "$DIR_B_M")
T_P=$(jeton_de "$PRE_E" "$PRE_M"); T_F=$(jeton_de "$FN_E" "$FN_M")
EMPREINTE=$(empreinte_terrain)

CONF_PULL=$(cat <<EOF
{"nom":"TEST fournisseur générique","mode":"pull","url":"http://127.0.0.1:$PORT_FAUX/positions","cadenceMinutes":1,
 "authentification":"bearer","jeton":"$JETON","actif":true,
 "correspondance":{"liste":"data.positions","boitier":"device","latitude":"pos.lat","longitude":"pos.lng",
                   "horodatage":"ts","format_horodatage":"epoch_ms","vitesse":"speed","cap":"heading"}}
EOF
)

echo "1. Ce qui est refusé"
chk "sans compte : refus" 401 "$(appel GET "/gps/configuration?communeId=$A")"
chk "un prestataire ne lit pas la configuration" 403 "$(appel GET "/gps/configuration?communeId=$A" "$T_P")"
chk "une autre commune ne la trouve pas" 404 "$(appel GET "/gps/configuration?communeId=$A" "$T_B")"
chk "la FNCT ne l'écrit pas (la commune seule)" 403 "$(appel PUT "/gps/configuration?communeId=$A" "$T_F" "$CONF_PULL")"
chk "un chemin de correspondance invalide : refus" 400 \
    "$(appel PUT "/gps/configuration?communeId=$A" "$T_A" "${CONF_PULL/data.positions/data positions}")"
chk "la commune paramètre son fournisseur" 200 "$(appel PUT "/gps/configuration?communeId=$A" "$T_A" "$CONF_PULL")"
FOURNISSEUR=$(jq_ .id)
chk "… la réponse dit que le jeton est enregistré, sans le rendre" "t|0" \
    "$([ "$(jq_ .jeton_enregistre_le)" != null ] && echo t || echo f)|$(grep -c "$JETON" "$T/r.json")"
chk "la FNCT lit la configuration, sans le jeton" "200|0" "$(appel GET "/gps/configuration?communeId=$A" "$T_F")|$(grep -c "$JETON" "$T/r.json")"
chk "en base, le jeton est chiffré : il ne figure pas dans sa colonne" "1|0" \
    "$(sql "SELECT count(*) FROM gps_secrets WHERE fournisseur_id = '$FOURNISSEUR' AND nature = 'jeton'")|$(sql "SELECT count(*) FROM gps_secrets WHERE position(convert_to('$JETON', 'UTF8') in valeur) > 0")"
chk "le rôle de l'application ne peut pas lire la table des secrets" 1 \
    "$($PSQL -c "SET ROLE siipi_app; SELECT count(*) FROM gps_secrets" 2>&1 | grep -c 'permission denied')"
chk "le journal d'audit ne recopie pas le jeton" 0 "$(sql "SELECT count(*) FROM audit_log WHERE coalesce(new_data::text, '') LIKE '%$JETON%' OR coalesce(old_data::text, '') LIKE '%$JETON%'")"
chk "un boîtier sur un engin d'une autre commune : refus" 400 \
    "$(appel POST "/gps/boitiers?communeId=$A" "$T_A" "{\"identifiant\":\"BX-B\",\"vehiculeId\":\"$B1\"}")"
chk "la FNCT ne rattache pas de boîtier" 403 \
    "$(appel POST "/gps/boitiers?communeId=$A" "$T_F" "{\"identifiant\":\"BX-1\",\"vehiculeId\":\"$A1\"}")"
DEBUT=$(date -u -d '-2 hours' +%Y-%m-%dT%H:%M:%SZ)
chk "la commune rattache le boîtier BX-1 à son engin, depuis deux heures" 201 \
    "$(appel POST "/gps/boitiers?communeId=$A" "$T_A" "{\"identifiant\":\"BX-1\",\"vehiculeId\":\"$A1\",\"dateDebut\":\"$DEBUT\"}")"
BOITIER=$(jq_ .id)
chk "un boîtier déjà en service ne se rattache pas une seconde fois" 409 \
    "$(appel POST "/gps/boitiers?communeId=$A" "$T_A" "{\"identifiant\":\"BX-1\",\"vehiculeId\":\"test-gps-a2-$$\"}")"

echo "2. L'essai, sans rien enregistrer"
poser_positions "$(pos BX-1 36.80 10.18 "$(ms -600)"),$(pos BX-1 36.81 10.19 "$(ms -540)")"
chk "l'essai lit les positions selon la correspondance" "200|essai|2|36.8|10.18" \
    "$(appel POST "/gps/configuration/essai?communeId=$A" "$T_A" '{}')|$(jq_ .statut)|$(jq_ .lues)|$(jq_ '.apercu[0].lat')|$(jq_ '.apercu[0].lng')"
chk "… le jeton déchiffré est bien envoyé au fournisseur" "Bearer $JETON" "$(cat "$FAUX/derniere_autorisation")"
chk "… et rien n'est enregistré" "0|0" "$(nb traces_engins)|$(nb gps_positions_non_rattachees)"
exemple() { # horodatage (JSON) — l'horodatage lu dans un exemple collé, ou « illisible »
  appel POST "/gps/configuration/essai?communeId=$A" "$T_A" \
    "{\"exemple\":{\"data\":{\"positions\":[{\"device\":\"X\",\"pos\":{\"lat\":36.8,\"lng\":10.1},\"ts\":$1}]}}}" >/dev/null
  jq -r '.apercu[0].horodatage // "illisible"' "$T/r.json"
}
chk "un fournisseur qui passe à des dates ISO sans prévenir : sa date est illisible, pas « maintenant »" illisible \
    "$(exemple '"2026-10-23T10:00:00+01:00"')"
appel PUT "/gps/configuration?communeId=$A" "$T_A" "$(echo "$CONF_PULL" | sed 's/"epoch_ms"/"iso"/')" >/dev/null
chk "en ISO, une date sans fuseau est lue à l'heure de Tunis" "2026-10-23T09:00:00.000Z" "$(exemple '"2026-10-23 10:00:00"')"
chk "… une date de calendrier impossible est illisible, jamais « corrigée »" "illisible|illisible" \
    "$(exemple '"2026-13-45T10:00:00Z"')|$(exemple '"2026-02-30T10:00:00Z"')"
appel PUT "/gps/configuration?communeId=$A" "$T_A" "$CONF_PULL" >/dev/null

echo "3. L'interrogation : ce qui est tracé, ce qui est signalé"
poser_positions "$(pos BX-1 36.80 10.18 "$(ms -600)"),$(pos BX-1 36.81 10.19 "$(ms -540)"),$(pos BX-1 36.82 10.20 "$(ms -480)"),$(pos BX-9 36.80 10.18 "$(ms -600)"),$(pos BX-1 48.85 2.35 "$(ms -420)"),$(pos BX-1 36.80 10.18 '"hier"'),$(pos BX-1 36.80 10.18 946684800000),$(pos BX-1 36.80 10.18 "$(ms 172800)")"
chk "une interrogation : huit reçues, trois tracées, cinq signalées" "200|ok|8|3|0|5" \
    "$(appel POST "/gps/configuration/interroger?communeId=$A" "$T_A")|$(jq_ .statut)|$(jq_ .recues)|$(jq_ .enregistrees)|$(jq_ .doublons)|$(jq_ .signalees)"
chk "les trois traces sont celles de l'engin du boîtier, provenance « GPS fournisseur », brutes" "3|3|3" \
    "$(nb traces_engins "vehicule_id = '$A1'")|$(nb traces_engins "provenance = 'gps_fournisseur'")|$(nb traces_engins 'agregee_le IS NULL')"
chk "un boîtier sans engin : signalé, jamais rattaché" 1 "$(nb gps_positions_non_rattachees "motif = 'boitier_inconnu' AND boitier = 'BX-9'")"
chk "une position hors de Tunisie : signalée" 1 "$(nb gps_positions_non_rattachees "motif = 'hors_tunisie'")"
chk "un horodatage illisible, d'avant 2020 ou dans deux jours : signalé, jamais tracé" "3|0" \
    "$(nb gps_positions_non_rattachees "motif = 'horodatage_invalide'")|$(nb traces_engins "horodatage < '2020-01-01' OR horodatage > now() + interval '10 minutes'")"
chk "… l'horodatage illisible est gardé tel qu'il est arrivé" 1 "$(nb gps_positions_non_rattachees "horodatage_brut = 'hier'")"
chk "la commune voit les positions signalées, par boîtier et par motif" "200|t" \
    "$(appel GET "/gps/non-rattachees?communeId=$A" "$T_A")|$([ "$(jq_ 'length')" -ge 3 ] && echo t || echo f)"
chk "la même interrogation, rejouée : trois doublons, aucune trace de plus" "0|3|3" \
    "$(appel POST "/gps/configuration/interroger?communeId=$A" "$T_A" >/dev/null; jq_ .enregistrees)|$(jq_ .doublons)|$(nb traces_engins)"
chk "la dernière position de chaque engin" "200|36.82" \
    "$(appel GET "/gps/traces?communeId=$A" "$T_A")|$(jq_ '.dernieres[0].lat')"
chk "le prestataire ne lit pas les traces" 403 "$(appel GET "/gps/traces?communeId=$A" "$T_P")"

echo "4. Un fournisseur en panne : noté, rien ne bloque"
RECU=$(sql "SELECT dernier_releve_recu_le FROM gps_fournisseurs WHERE id = '$FOURNISSEUR'")
echo 500 > "$FAUX/mode"
chk "il répond 500 : échec noté, et dit" "echec|1" "$(appel POST "/gps/configuration/interroger?communeId=$A" "$T_A" >/dev/null; jq_ .statut)|$(jq_ .message | grep -c 'répondu 500')"
echo casse > "$FAUX/mode"
chk "il répond autre chose que du JSON : échec, et dit" 1 "$(appel POST "/gps/configuration/interroger?communeId=$A" "$T_A" >/dev/null; jq_ .message | grep -c 'pas du JSON')"
echo lent > "$FAUX/mode"
chk "il ne répond pas : échec en 10 secondes" 1 "$(appel POST "/gps/configuration/interroger?communeId=$A" "$T_A" >/dev/null; jq_ .message | grep -c '10 secondes')"
echo ok > "$FAUX/mode"
printf 'autre' > "$FAUX/jeton"
chk "il refuse le jeton (401) : échec, et le message ne montre pas le jeton" "1|0" \
    "$(appel POST "/gps/configuration/interroger?communeId=$A" "$T_A" >/dev/null; jq_ .message | grep -c 'répondu 401')|$(grep -c "$JETON" "$T/r.json")"
printf '%s' "$JETON" > "$FAUX/jeton"
chk "l'écran garde la date du dernier relevé reçu et montre le dernier échec" "200|$RECU|t" \
    "$(appel GET "/gps/configuration?communeId=$A" "$T_A")|$(sql "SELECT dernier_releve_recu_le FROM gps_fournisseurs WHERE id = '$FOURNISSEUR'")|$([ "$(jq_ .dernier_echec_le)" != null ] && echo t || echo f)"
chk "le dernier échec ne contient pas le jeton" 0 "$(sql "SELECT count(*) FROM gps_fournisseurs WHERE dernier_echec_message LIKE '%$JETON%'")"

echo "5. Le boîtier clos : la trace d'avant garde son engin"
FIN=$(date -u -d '-60 seconds' +%Y-%m-%dT%H:%M:%SZ)
chk "la commune clôt la correspondance de BX-1" 200 "$(appel POST "/gps/boitiers/$BOITIER/cloture" "$T_A" "{\"dateFin\":\"$FIN\"}")"
poser_positions "$(pos BX-1 36.83 10.21 "$(ms -900)"),$(pos BX-1 36.84 10.22 "$(ms -20)")"
appel POST "/gps/configuration/interroger?communeId=$A" "$T_A" >/dev/null
chk "une position d'avant la clôture est tracée, une d'après est signalée" "1|1" "$(jq_ .enregistrees)|$(jq_ .signalees)"
chk "la correspondance close est gardée, pas effacée" "1|0" \
    "$(sql "SELECT count(*) FROM gps_boitiers WHERE id = '$BOITIER' AND date_fin IS NOT NULL")|$(sql "SELECT count(*) FROM gps_boitiers WHERE commune_id = '$A' AND date_fin IS NULL")"
# Le même boîtier reprend du service à la fin de l'ancienne correspondance (pour le webhook ci-dessous).
appel POST "/gps/boitiers?communeId=$A" "$T_A" "{\"identifiant\":\"BX-1\",\"vehiculeId\":\"$A1\",\"dateDebut\":\"$FIN\"}" >/dev/null

echo "6. Le webhook : signé, ou refusé"
chk "la commune passe son fournisseur en envoi (push)" 200 \
    "$(appel PUT "/gps/configuration?communeId=$A" "$T_A" "$(echo "$CONF_PULL" | sed 's/"mode":"pull"/"mode":"push"/')")"
chk "le secret du webhook est montré une fois" "201|64" "$(appel POST "/gps/configuration/secret-webhook?communeId=$A" "$T_A")|$(jq_ '.secret | length')"
SECRET=$(jq_ .secret)
chk "… puis jamais plus" "200|0|t" \
    "$(appel GET "/gps/configuration?communeId=$A" "$T_A")|$(grep -c "$SECRET" "$T/r.json")|$([ "$(jq_ .secret_webhook_enregistre_le)" != null ] && echo t || echo f)"
printf '{"data":{"positions":[%s]}}' "$(pos BX-1 36.85 10.23 "$(ms -30)")" > "$T/envoi.json"
H=$(date +%s)
chk "un envoi sans signature : refusé" 401 "$(webhook "$T/envoi.json")"
chk "un envoi mal signé : refusé" 401 "$(webhook "$T/envoi.json" "$H" "sha256=$(printf '0%.0s' $(seq 64))")"
H_VIEUX=$(( H - 600 ))
chk "un envoi rejoué dix minutes plus tard : refusé" 401 "$(webhook "$T/envoi.json" "$H_VIEUX" "$(signe "$SECRET" "$H_VIEUX" "$T/envoi.json")")"
chk "un fournisseur inconnu : introuvable" 404 "$(webhook "$T/envoi.json" "$H" "$(signe "$SECRET" "$H" "$T/envoi.json")" 00000000-0000-0000-0000-000000000000)"
chk "un envoi bien signé : reçu et tracé" "200|1|1" \
    "$(webhook "$T/envoi.json" "$H" "$(signe "$SECRET" "$H" "$T/envoi.json")")|$(jq_ .recues)|$(jq_ .enregistrees)"
printf 'pas du json' > "$T/casse.json"
chk "un envoi signé mais illisible : 400" 400 "$(webhook "$T/casse.json" "$H" "$(signe "$SECRET" "$H" "$T/casse.json")")"
CODES=''
for _ in $(seq 1 8); do CODES="$CODES$(webhook "$T/envoi.json" "$H" "$(signe "$SECRET" "$H" "$T/envoi.json")") "; done
chk "au-delà de la limite d'envois par minute : 429" t "$(echo "$CODES" | grep -q 429 && echo t || echo f)"

echo "7. Les lignes rouges, d'un bout à l'autre"
chk "aucune colonne des tables GPS ne mène à une personne (engins seulement)" 0 \
    "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('gps_fournisseurs','gps_boitiers','traces_engins','gps_positions_non_rattachees','gps_secrets') AND column_name ~ '(personnel|agent|chauffeur|employe)'")"
chk "toutes les traces portent la provenance « GPS fournisseur »" 0 "$(sql "SELECT count(*) FROM traces_engins WHERE provenance <> 'gps_fournisseur'")"
chk "les circuits, les points relevés et les engins n'ont pas bougé" "$EMPREINTE" "$(empreinte_terrain)"
chk "les journaux de l'API ne contiennent ni le jeton ni le secret du webhook" "0|0" \
    "$(grep -c "$JETON" "$T/api_$PORT_ESSAI.log")|$(grep -c "$SECRET" "$T/api_$PORT_ESSAI.log")"

echo "8. Le planificateur et sa cadence"
appel PUT "/gps/configuration?communeId=$A" "$T_A" "$CONF_PULL" >/dev/null
sql "UPDATE gps_fournisseurs SET derniere_interrogation_le = NULL WHERE id = '$FOURNISSEUR'" >/dev/null
echo 0 > "$FAUX/appels"
api_essai "$PORT_ESSAI" "${PGDATABASE:-siipi_national}" SIIPI_GPS_PLANIFICATEUR=active SIIPI_GPS_TIC_S=1 >/dev/null; CODE=$?
for _ in $(seq 1 15); do [ "$(cat "$FAUX/appels")" -ge 1 ] && break; sleep 1; done
chk "le planificateur interroge un fournisseur dû" 1 "$(cat "$FAUX/appels")"
sleep 5
chk "… puis attend sa cadence (une minute) avant de recommencer" 1 "$(cat "$FAUX/appels")"
chk "le planificateur le dit à son démarrage" 1 "$(grep -c 'Planificateur des interrogations actif' "$T/api_$PORT_ESSAI.log")"

echo "9. En partant"
arreter_api_essai
retirer_comptes_temporaires
effacer_communes_essai "'$A','$B'"
chk "les communes de test, leurs engins et leurs traces sont retirés" "0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ('$A','$B')")|$(sql "SELECT count(*) FROM vehicules WHERE id LIKE 'test-gps-%'")|$(sql "SELECT count(*) FROM gps_fournisseurs WHERE commune_id IN ('$A','$B')")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
