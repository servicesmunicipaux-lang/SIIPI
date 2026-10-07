#!/usr/bin/env bash
# =============================================================================
# Lot 16.4 — le dossier de déclassement (migration 059). Référentiel du dépôt
# municipal, diapos 83 à 85.
#
# Elle commence par ce que la plateforme REFUSE : la FNCT qui propose à la
# place de la commune ; un dossier sans motif, sans rapport, daté dans
# l'avenir, en double, ou sur un engin réformé ; deux immobilisations qui se
# chevauchent ; une étape du circuit avant celle qui la fonde, ou après la
# clôture ; un dossier engagé qu'on réécrit ; une pièce d'une autre commune.
# Puis le constat recalculé à la main : cumul des dépenses et seuil de 80 %
# (atteint, non atteint, indéterminé, non calculable) ; une source non tenue
# rend null, jamais 0 ; jours d'immobilisation bornés à l'année, jours
# travaillés au carnet de bord, rapport de rendement ; le constat figé au jour
# de la proposition. Enfin le circuit complet jusqu'à l'adjudication, et
# « À vérifier », qui constate sans rien corriger.
#
# Les années de contrôle sont l'an dernier et l'an d'avant : entièrement
# passées, elles donnent les mêmes chiffres quel que soit le jour du passage.
# La campagne travaille dans deux communes de test qu'elle crée et efface.
#
#   docker compose exec -T api npm run test:declassement
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
# Une requête jouée avec les droits de la FNCT (les fonctions de constat
# vérifient le droit de l'appelant).
fnct() { $PSQL -c "SET app.role = 'super_admin_fnct';" -c "$1" 2>/dev/null; }
# 1 si l'erreur attendue figure dans le message, 0 sinon.
refus() { $PSQL -c "$1" >"$T/err.txt" 2>&1; if grep -q "$2" "$T/err.txt"; then echo 1; else echo 0; fi; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
appel() { # méthode chemin jeton [corps] -> code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3" \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}

T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
DIR_A=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire AND commune_id IS NOT NULL ORDER BY created_at LIMIT 1")
ID_A=$(sql "SELECT id FROM users WHERE email='$DIR_A'")
TC=test_declassement_164      # la commune de test, rattachée à l'admin
TX=test_declassement_164_x    # une autre commune, que l'admin ne voit pas
RACINE="${SIIPI_FICHIERS_DIR:-/var/siipi/fichiers}"

nettoyer() {
  $PSQL -c "DELETE FROM communes WHERE id IN ('$TC', '$TX');" >/dev/null 2>&1
  # Les octets des pièces déposées : sous <racine>/<commune>/.
  rm -rf "${RACINE:?}/$TC" "${RACINE:?}/$TX" 2>/dev/null
}
nettoyer

J=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date")
Y=${J:0:4}; A1=$((Y - 1)); A2=$((Y - 2))
jour() { sql "SELECT ((now() AT TIME ZONE 'Africa/Tunis')::date - $1)"; }

$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES
            ('$TC', 'TEST commune déclassement', 'TEST', 'TEST', 1), ('$TX', 'TEST autre commune', 'TEST', 'TEST', 1);
          INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$ID_A', '$TC');
          INSERT INTO vehicules (id, registration, commune_id, type, categorie, valeur_achat_tnd, date_premiere_circulation, etat) VALUES
            ('test-164-v1', 'TEST 164 001', '$TC', 'benne_tasseuse', 'poids_lourd', 50000, '2010-07-01', 'en_service'),
            ('test-164-v2', 'TEST 164 002', '$TC', 'chargeuse', 'engin_lourd', NULL, NULL, 'en_service'),
            ('test-164-v3', 'TEST 164 003', '$TC', 'camion', 'poids_lourd', 20000, '2015-01-01', 'en_service'),
            ('test-164-v4', 'TEST 164 004', '$TC', 'tracteur', 'tracteur', 15000, '1995-01-01', 'a_reformer'),
            ('test-164-v5', 'TEST 164 005', '$TC', 'camion', 'poids_lourd', 30000, '2000-01-01', 'reforme'),
            ('test-164-v6', 'TEST 164 006', '$TC', 'camion', 'poids_lourd', 100000, '2020-01-01', 'en_service'),
            ('test-164-vx', 'TEST 164 099', '$TX', 'camion', 'poids_lourd', 40000, '2012-01-01', 'en_service');" >/dev/null
T_A=$(tok "$DIR_A")
Q="?communeId=$TC"
constat() { # annee -> réponse dans $T/r.json
  appel GET "/declassement/constat$Q&annee=$1" "$T_A"
}
ligne() { val "[e for e in d['engins'] if e['vehicule_id']=='$1'][0]['$2']"; }
intervention() { # véhicule date coût|null nature
  appel POST "/maintenance/interventions$Q" "$T_A" \
    "{\"vehiculeId\":\"$1\",\"dateIntervention\":\"$2\",\"type\":\"reparation\",\"coutTnd\":$3,\"nature\":\"${4:-corrective}\"}" >/dev/null
}

# -----------------------------------------------------------------------------
echo
echo "1. Une source non tenue n'est pas un zéro"
constat "$A1" >/dev/null
chk "aucune intervention à la commune : cumul null, seuil non calculable (pas 0, pas « non atteint »)" "None|non_calculable" \
    "$(ligne test-164-v1 cumul_depenses_tnd)|$(ligne test-164-v1 seuil_80)"
chk "aucune période d'immobilisation, aucun carnet : jours null, rapport null" "None|None|None" \
    "$(ligne test-164-v1 jours_immobilisation)|$(ligne test-164-v1 jours_travailles)|$(ligne test-164-v1 rapport_rendement)"
chk "un engin réformé ne figure plus au constat" 0 "$(val "sum(1 for e in d['engins'] if e['vehicule_id']=='test-164-v5')")"
chk "l'engin d'une autre commune non plus" 0 "$(val "sum(1 for e in d['engins'] if e['vehicule_id']=='test-164-vx')")"

# -----------------------------------------------------------------------------
echo
echo "2. Les immobilisations : ce que la base refuse, ce qu'elle compte"
im() { appel POST "/declassement/immobilisations$Q" "$T_A" "{\"vehiculeId\":\"$1\",\"debut\":\"$2\"${3:+,\"fin\":\"$3\"}}"; }
chk "une fin avant le début : refusée" 400 "$(im test-164-v1 "$A1-03-10" "$A1-03-01")"
chk "un début dans l'avenir : refusé" 400 "$(im test-164-v1 "$((Y + 1))-01-01")"
chk "un engin d'une autre commune : introuvable (404)" 404 "$(im test-164-vx "$A1-03-01" "$A1-03-02")"
chk "du 1er au 10 mars de l'an dernier : 10 jours" "201|10|saisie" "$(im test-164-v1 "$A1-03-01" "$A1-03-10")|$(val "d['jours']")|$(val "d['origine']")"
chk "une période qui chevauche la précédente : refusée (409)" 409 "$(im test-164-v1 "$A1-03-05" "$A1-03-06")"
chk "… et refusée par la base" 1 \
    "$(refus "INSERT INTO immobilisations_engins (commune_id, vehicule_id, debut, fin) VALUES ('$TC', 'test-164-v1', '$A1-03-10', '$A1-03-12');" IMMOBILISATION_CHEVAUCHEMENT)"
im test-164-v1 "$A2-12-25" "$A1-01-04" >/dev/null
CODE=$(im test-164-v3 "$A2-08-01")
IM3=$(val "d['id']")
chk "une période encore ouverte" "201|None" "$CODE|$(val "d['fin']")"
CODE=$(appel PATCH "/declassement/immobilisations/$IM3/fin" "$T_A" "{\"fin\":\"$A2-08-10\"}")
chk "… se ferme : 10 jours" "200|10" "$CODE|$(val "d['jours']")"

# L'état de l'engin tient le registre : en panne il y a 5 jours, remis en
# service il y a 2 jours → immobilisé de J-5 à J-3.
appel PATCH "/trucks/test-164-v6" "$T_A" "{\"etat\":\"en_panne\",\"etatDepuis\":\"$(jour 5)\",\"motifImmobilisation\":\"TEST attente de pièces\"}" >/dev/null
chk "l'engin passe en panne : une période s'ouvre d'elle-même, datée" "$(jour 5)||etat_engin|TEST attente de pièces" \
    "$($PSQL -c "SELECT debut||'|'||COALESCE(fin::text,'')||'|'||origine||'|'||motif FROM immobilisations_engins WHERE vehicule_id='test-164-v6' AND deleted_at IS NULL")"
appel PATCH "/trucks/test-164-v6" "$T_A" "{\"etat\":\"en_service\",\"etatDepuis\":\"$(jour 2)\"}" >/dev/null
chk "remis en service : la période se ferme la veille" "$(jour 3)" \
    "$(sql "SELECT fin FROM immobilisations_engins WHERE vehicule_id='test-164-v6' AND deleted_at IS NULL")"
chk "un engin créé « à réformer » sans date n'ouvre aucune période : on n'invente pas son début" 0 \
    "$(sql "SELECT count(*) FROM immobilisations_engins WHERE vehicule_id='test-164-v4'")"

# -----------------------------------------------------------------------------
echo
echo "3. Le constat, recalculé à la main"
# Engin 1 : valeur d'achat 50 000 TND. Dépenses : 30 000 (panne, il y a plus
# d'un an), 12 000 (préventif), 0 (panne du mois dernier) = 42 000 → 84,0 % :
# seuil atteint ; une panne dans les 12 derniers mois.
intervention test-164-v1 "$A2-02-10" 30000
intervention test-164-v1 "$A2-06-01" 12000 preventive
intervention test-164-v1 "$(jour 30)" 0
# Engin 3 : 5 000 TND sur 20 000, et une intervention sans coût → 25,0 %,
# indéterminé (le cumul réel peut être plus haut).
intervention test-164-v3 "$A2-03-01" 5000
intervention test-164-v3 "$A2-04-01" null
# Engin 6 : 1 000 sur 100 000 → 1,0 %, non atteint.
intervention test-164-v6 "$A2-03-01" 1000
# Carnet de bord de l'an dernier, engin 1 : 20 jours distincts du 1er au 20
# mai (le 1er, deux séances), et une sortie de l'an d'avant, hors année.
$PSQL -c "INSERT INTO carnets_de_bord (commune_id, vehicule_id, jour, seance, compteur_sortie, compteur_retour)
          SELECT '$TC', 'test-164-v1', d::date, 'matin', 1000 + 100 * n, 1050 + 100 * n
            FROM generate_series('$A1-05-01'::date, '$A1-05-20'::date, '1 day') WITH ORDINALITY AS g(d, n);
          INSERT INTO carnets_de_bord (commune_id, vehicule_id, jour, seance, compteur_sortie, compteur_retour)
          VALUES ('$TC', 'test-164-v1', '$A1-05-01', 'apres_midi', 1150, 1160),
                 ('$TC', 'test-164-v1', '$A2-05-05', 'matin', 500, 600);" >/dev/null
AGE=$(python3 -c "
from datetime import date; from decimal import Decimal, ROUND_HALF_UP
j = date.fromisoformat('$J'); print(Decimal((j - date(2010, 7, 1)).days) / Decimal('365.25'))" \
  | python3 -c "import sys; from decimal import Decimal, ROUND_HALF_UP; x = float(Decimal(sys.stdin.read().strip()).quantize(Decimal('0.1'), ROUND_HALF_UP)); print(int(x) if x.is_integer() else x)")
constat "$A1" >/dev/null
chk "engin 1 : âge $AGE ans (depuis le 01/07/2010, années décimales)" "$AGE" "$(ligne test-164-v1 age_annees)"
chk "engin 1 : 42 000 TND, 3 interventions, 84,0 % — seuil atteint" "42000|3|84|atteint" \
    "$(ligne test-164-v1 cumul_depenses_tnd)|$(ligne test-164-v1 interventions)|$(ligne test-164-v1 part_depenses_pct)|$(ligne test-164-v1 seuil_80)"
chk "engin 1 : une panne dans les 12 derniers mois" 1 "$(ligne test-164-v1 pannes_12_mois)"
chk "engin 3 : 5 000 sur 20 000 (25,0 %) mais une intervention sans coût — indéterminé" "5000|1|25|indetermine" \
    "$(ligne test-164-v3 cumul_depenses_tnd)|$(ligne test-164-v3 interventions_sans_cout)|$(ligne test-164-v3 part_depenses_pct)|$(ligne test-164-v3 seuil_80)"
chk "engin 6 : 1,0 % — non atteint" "1|non_atteint" "$(ligne test-164-v6 part_depenses_pct)|$(ligne test-164-v6 seuil_80)"
chk "engin 2 : carnet tenu, aucune dépense → 0 (pas null) ; sans valeur d'achat → non calculable" "0|0|None|non_calculable" \
    "$(ligne test-164-v2 cumul_depenses_tnd)|$(ligne test-164-v2 interventions)|$(ligne test-164-v2 part_depenses_pct)|$(ligne test-164-v2 seuil_80)"
chk "engin 1 : 10 + 4 jours d'immobilisation dans l'année (la période à cheval est bornée au 1er janvier)" 14 "$(ligne test-164-v1 jours_immobilisation)"
chk "engin 1 : 20 jours travaillés (jours distincts, l'an d'avant exclu) → rendement 0,70" "20|0.7" \
    "$(ligne test-164-v1 jours_travailles)|$(ligne test-164-v1 rapport_rendement)"
chk "engin 3 : registres tenus, aucune immobilisation l'an dernier ni aucune sortie → 0 et 0, pas de rapport" "0|0|None" \
    "$(ligne test-164-v3 jours_immobilisation)|$(ligne test-164-v3 jours_travailles)|$(ligne test-164-v3 rapport_rendement)"
chk "engin 4 : « à réformer » sans début connu → jours null, signalé comme inconnu" "None|True" \
    "$(ligne test-164-v4 jours_immobilisation)|$(ligne test-164-v4 debut_immobilisation_inconnu)"
constat "$A2" >/dev/null
chk "l'an d'avant : 7 jours d'immobilisation (25 au 31 décembre), 1 jour travaillé" "7|1" \
    "$(ligne test-164-v1 jours_immobilisation)|$(ligne test-164-v1 jours_travailles)"

# -----------------------------------------------------------------------------
echo
echo "4. Le dossier : ce qui est refusé"
EXPOSE="TEST — pannes répétées du système hydraulique, dépenses au-delà du seuil."
dossier() { # véhicule motifs-json [jeton] [champs en plus]
  appel POST "/declassement/dossiers$Q" "${3:-$T_A}" \
    "{\"vehiculeId\":\"$1\",\"motifs\":$2,\"expose\":\"$EXPOSE\",\"anneeRendement\":$A1${4:+,$4}}"
}
chk "la FNCT ne propose pas un engin à la place de la commune" 403 "$(dossier test-164-v1 '["depenses_80"]' "$T_FNCT")"
chk "un dossier sans motif : refusé" 400 "$(dossier test-164-v1 '[]')"
chk "un motif hors des cinq conditions du référentiel : refusé" 400 "$(dossier test-164-v1 '["vetuste"]')"
CODE=$(appel POST "/declassement/dossiers$Q" "$T_A" '{"vehiculeId":"test-164-v1","motifs":["mauvais_usage"],"expose":"trop court"}')
chk "un rapport détaillé trop court : refusé" 400 "$CODE"
chk "… et refusé par la base" 1 \
    "$(refus "SET app.role='super_admin_fnct'; INSERT INTO dossiers_declassement (commune_id, vehicule_id, motifs, expose) VALUES ('$TC', 'test-164-v1', ARRAY['mauvais_usage'], 'court');" dossiers_expose_renseigne)"
chk "une proposition datée dans l'avenir : refusée" 400 "$(dossier test-164-v1 '["mauvais_usage"]' "$T_A" "\"dateProposition\":\"$((Y + 1))-01-01\"")"
chk "un engin réformé : refusé (409)" 409 "$(dossier test-164-v5 '["mauvais_usage"]')"
chk "un engin d'une autre commune : introuvable (404)" 404 "$(dossier test-164-vx '["mauvais_usage"]')"

# -----------------------------------------------------------------------------
echo
echo "5. Le dossier ouvert : un constat figé, des pièces, un circuit"
CODE=$(dossier test-164-v1 '["depenses_80","pannes_repetees"]' "$T_A" '"coutReparationEstimeTnd":9000')
D1=$(val "d['id']")
chk "dossier ouvert, en cours" "201|en_cours|$A1" "$CODE|$(val "d['statut']")|$(val "d['annee_rendement']")"
chk "le constat figé : 84,0 %, atteint, 14 jours immobilisés pour 20 travaillés (0,70)" "84|atteint|14|20|0.7" \
    "$(val "d['constat']['part_depenses_pct']")|$(val "d['constat']['seuil_80']")|$(val "d['constat']['jours_immobilisation']")|$(val "d['constat']['jours_travailles']")|$(val "d['constat']['rapport_rendement']")"
chk "pièces obligatoires : facture manquante, inventaire et rendement calculés, coût renseigné" \
    "manquante|calculee|calculee|renseignee" "$(val "'|'.join(c['statut'] for c in d['completude'])")"
chk "l'inventaire des dépenses : les 3 interventions de l'engin" 3 "$(val "len(d['depenses'])")"
chk "première étape possible : l'accord de la commune (ou l'abandon)" "accord_commune,sans_suite" "$(val "','.join(d['etapes_possibles'])")"
chk "un second dossier en cours pour le même engin : refusé (409)" 409 "$(dossier test-164-v1 '["mauvais_usage"]')"
intervention test-164-v1 "$(jour 10)" 5000
appel GET "/declassement/dossiers/$D1" "$T_A" >/dev/null
chk "une facture arrivée ensuite : le constat figé ne bouge pas (84,0), celui du jour suit (94,0)" "84|94" \
    "$(val "d['constat']['part_depenses_pct']")|$(val "d['constat_du_jour']['part_depenses_pct']")"
chk "le constat ne se réécrit pas, même en base" 1 "$(refus "UPDATE dossiers_declassement SET constat = '{}' WHERE id = '$D1';" DOSSIER_FIGE)"
CODE=$(appel PATCH "/declassement/dossiers/$D1" "$T_A" '{"coutReparationEstimeTnd":9500}')
chk "avant toute étape, le coût estimatif se corrige" "200|9500" "$CODE|$(val "d['cout_reparation_estime_tnd']")"

# Une pièce : déposée par /fichiers, puis jointe.
python3 -c "import base64;print(base64.b64encode(b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n').decode())" >"$T/pdf.b64"
depot() { # commune jeton -> id du fichier
  appel POST "/fichiers?communeId=$1" "$2" "{\"nomFichier\":\"TEST-facture.pdf\",\"usage\":\"declassement\",\"contenu\":\"$(cat "$T/pdf.b64")\"}" >/dev/null
  val "d['id']"
}
F1=$(depot "$TC" "$T_A")
FX=$(depot "$TX" "$T_FNCT")
piece() { appel POST "/declassement/dossiers/$D1/pieces" "${3:-$T_A}" "{\"fichierId\":\"$1\",\"nature\":\"$2\"}"; }
chk "la FNCT ne joint pas de pièce" 403 "$(piece "$F1" facture_acquisition "$T_FNCT")"
chk "un fichier d'une autre commune : refusé" 400 "$(piece "$FX" facture_acquisition)"
CODE=$(piece "$F1" facture_acquisition)
P1=$(val "[p['id'] for p in d['pieces']][0]")
chk "la facture d'acquisition jointe : la pièce n'est plus manquante" "201|jointe|/fichiers/$F1" \
    "$CODE|$(val "d['completude'][0]['statut']")|$(val "d['pieces'][0]['url']")"
chk "le même fichier deux fois : refusé (409)" 409 "$(piece "$F1" facture_acquisition)"
chk "le fichier d'une pièce ne se retire pas par /fichiers (409)" 409 "$(appel DELETE "/fichiers/$F1" "$T_A")"

# -----------------------------------------------------------------------------
echo
echo "6. Le circuit d'autorisation, dans son ordre"
etape() { appel POST "/declassement/dossiers/${2:-$D1}/etapes" "$T_A" "$1"; }
chk "la publicité légale avant les avis : refusée (409)" "409|1" \
    "$(etape "{\"etape\":\"publicite_legale\",\"dateEtape\":\"$J\"}")|$(val "int('avis favorables' in d['error'])")"
chk "un avis avant l'accord de la commune : refusé" 409 "$(etape "{\"etape\":\"avis_domaines\",\"dateEtape\":\"$J\",\"sens\":\"favorable\"}")"
chk "un accord sans son sens : refusé" 400 "$(etape "{\"etape\":\"accord_commune\",\"dateEtape\":\"$J\"}")"
chk "une étape antérieure à la proposition : refusée" 400 "$(etape "{\"etape\":\"accord_commune\",\"dateEtape\":\"$(jour 1)\",\"sens\":\"favorable\"}")"
chk "une étape dans l'avenir : refusée" 400 "$(etape "{\"etape\":\"accord_commune\",\"dateEtape\":\"$((Y + 1))-01-01\",\"sens\":\"favorable\"}")"
CODE=$(etape "{\"etape\":\"accord_commune\",\"dateEtape\":\"$J\",\"sens\":\"favorable\",\"reference\":\"TEST-DEC-001\"}")
ACC=$(val "[e['id'] for e in d['etapes'] if e['etape']=='accord_commune'][0]")
chk "l'accord favorable de la commune : les deux avis s'ouvrent" "201|avis_domaines,avis_controle_technique,sans_suite" \
    "$CODE|$(val "','.join(d['etapes_possibles'])")"
chk "le même accord deux fois : refusé (409)" 409 "$(etape "{\"etape\":\"accord_commune\",\"dateEtape\":\"$J\",\"sens\":\"favorable\"}")"
chk "le dossier engagé ne se réécrit plus (409)" 409 "$(appel PATCH "/declassement/dossiers/$D1" "$T_A" '{"expose":"TEST — un autre rapport, réécrit après coup."}')"
etape "{\"etape\":\"avis_domaines\",\"dateEtape\":\"$J\",\"sens\":\"favorable\"}" >/dev/null
CODE=$(etape "{\"etape\":\"avis_controle_technique\",\"dateEtape\":\"$J\",\"sens\":\"defavorable\"}")
ACT=$(val "[e['id'] for e in d['etapes'] if e['etape']=='avis_controle_technique'][0]")
chk "un avis défavorable : la publicité n'est pas possible" "201|0" "$CODE|$(val "int('publicite_legale' in d['etapes_possibles'])")"
chk "… et refusée" 409 "$(etape "{\"etape\":\"publicite_legale\",\"dateEtape\":\"$J\"}")"
chk "l'accord ne se retire pas : les avis s'appuient sur lui (409)" 409 "$(appel DELETE "/declassement/dossiers/$D1/etapes/$ACC" "$T_A")"
chk "une étape ne se modifie pas, même en base" 1 "$(refus "UPDATE etapes_declassement SET sens = 'favorable' WHERE id = '$ACT';" ETAPE_FIGEE)"
CODE=$(appel DELETE "/declassement/dossiers/$D1/etapes/$ACT" "$T_A")
chk "l'avis saisi à tort se retire" "200|0" "$CODE|$(val "sum(1 for e in d['etapes'] if e['etape']=='avis_controle_technique')")"
etape "{\"etape\":\"avis_controle_technique\",\"dateEtape\":\"$J\",\"sens\":\"favorable\"}" >/dev/null
chk "deux avis favorables : la publicité légale" 201 "$(etape "{\"etape\":\"publicite_legale\",\"dateEtape\":\"$J\",\"reference\":\"TEST-PUB-001\"}")"
chk "une adjudication sans son mode : refusée" 400 "$(etape "{\"etape\":\"adjudication\",\"dateEtape\":\"$J\"}")"
CODE=$(etape "{\"etape\":\"adjudication\",\"dateEtape\":\"$J\",\"modeAdjudication\":\"enchere_publique\",\"montantAdjugeTnd\":3200}")
chk "l'adjudication clôt le dossier" "201|adjuge|0" "$CODE|$(val "d['statut']")|$(val "len(d['etapes_possibles'])")"
chk "plus aucune étape ne s'ajoute (409)" 409 "$(etape "{\"etape\":\"sans_suite\",\"dateEtape\":\"$J\",\"observation\":\"TEST après coup\"}")"
chk "plus aucune pièce ne se retire (409)" 409 "$(appel DELETE "/declassement/dossiers/$D1/pieces/$P1" "$T_A")"
chk "l'engin n'est pas réformé par la plateforme : la commune le fera" en_service "$(sql "SELECT etat FROM vehicules WHERE id='test-164-v1'")"

# -----------------------------------------------------------------------------
echo
echo "7. Abandon, liste de proposition, cloisonnement"
CODE=$(dossier test-164-v6 '["depenses_80"]')
D6=$(val "d['id']")
chk "un dossier sur un engin à 1,0 % qui invoque « 80 % » : ouvert — la commune propose, la plateforme constate" 201 "$CODE"
chk "un abandon sans motif : refusé" 400 "$(etape '{"etape":"sans_suite","dateEtape":"'"$J"'"}' "$D6")"
alertes() { fnct "SELECT gravite||'|'||domaine||'|'||sujet||'|'||constat FROM app.incoherences_commune('$TC');" >"$T/alertes.txt"; }
alertes
chk "« À vérifier » : l'adjugé encore au parc, le motif 80 % contredit, l'engin à réformer sans dossier" "1|1|1" \
    "$(grep -c '^avertissement|declassement|TEST 164 001|Adjugé le' "$T/alertes.txt")|$(grep -c '^information|declassement|TEST 164 006|.*le cumul enregistré est de 1.0 %' "$T/alertes.txt")|$(grep -c '^information|declassement|TEST 164 004|' "$T/alertes.txt")"
CODE=$(etape '{"etape":"sans_suite","dateEtape":"'"$J"'","observation":"TEST — réparation finalement engagée"}' "$D6")
chk "l'abandon motivé clôt le dossier" "201|sans_suite" "$CODE|$(val "d['statut']")"
chk "un engin dont le dossier est resté sans suite peut être proposé de nouveau" 201 "$(dossier test-164-v6 '["pannes_repetees"]')"
appel PATCH "/trucks/test-164-v1" "$T_A" '{"etat":"reforme"}' >/dev/null
alertes
chk "l'engin adjugé passé « réformé » : l'avertissement s'éteint ; le motif contredit aussi (dossier clos)" "0|0" \
    "$(grep -c '^avertissement|declassement' "$T/alertes.txt")|$(grep -c 'le cumul enregistré est de' "$T/alertes.txt")"
chk "un engin adjugé ne se repropose pas" 409 "$(dossier test-164-v1 '["mauvais_usage"]')"
CODE=$(appel GET "/declassement/dossiers$Q" "$T_A")
chk "la liste de proposition : 3 dossiers, avec l'âge à la proposition et la dernière étape" "200|3|$AGE|adjudication" \
    "$CODE|$(val "len(d)")|$(val "[x for x in d if x['id']=='$D1'][0]['age_annees']")|$(val "[x for x in d if x['id']=='$D1'][0]['derniere_etape']")"
CODE=$(appel GET "/declassement/dossiers/$D1" "$T_FNCT")
chk "la FNCT lit le dossier" "200|adjuge" "$CODE|$(val "d['statut']")"
DX=$(fnct "INSERT INTO dossiers_declassement (commune_id, vehicule_id, motifs, expose) VALUES ('$TX', 'test-164-vx', ARRAY['mauvais_usage'], '$EXPOSE') RETURNING id;" | head -1)
chk "le dossier d'une autre commune : introuvable (404), jamais « refusé »" 404 "$(appel GET "/declassement/dossiers/$DX" "$T_A")"
chk "… et absent de la liste de l'admin" 0 "$(appel GET "/declassement/dossiers?communeId=$TX" "$T_A" >/dev/null; val "len(d)")"

nettoyer
chk "les communes de test et leurs dossiers sont retirés" "0|0" \
    "$(sql "SELECT (SELECT count(*) FROM communes WHERE id IN ('$TC','$TX'))||'|'||(SELECT count(*) FROM dossiers_declassement WHERE commune_id IN ('$TC','$TX'))")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
