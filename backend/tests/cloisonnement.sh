#!/usr/bin/env bash
# =============================================================================
# Test de non-régression du cloisonnement entre communes (migration 013).
#
# Ce script vérifie, contre une API réellement démarrée et une base réellement
# peuplée, que chaque fuite identifiée avant la mise en place du Row-Level
# Security reste fermée, et que ce qui doit rester accessible l'est toujours.
#
# Il ne teste PAS le code des routes : il teste ce que la base accepte de
# montrer. Une route à qui on retirerait son filtre par commune doit continuer
# à ne rien laisser passer.
#
# ELLE NE TOUCHE À AUCUNE COMMUNE RÉELLE (JC-011, JC-012). Jusqu'à la v0.15.51,
# elle travaillait à La Marsa, Sfax et Houmt Souk avec les comptes de
# démonstration : chaque passage laissait à La Marsa une réclamation résolue,
# sa notification, une ligne de score, et réécrivait les notes de la fiche de
# la commune. Elle bâtit désormais trois communes de test — A (avec deux
# engins, un conteneur, un secteur, son directeur, un prestataire sans secteur
# et un citoyen), B (son directeur), C (un secteur et son prestataire) — et
# prouve, pendant qu'elle a ses lignes en base puis en partant, qu'aucune
# commune réelle n'a reçu de ligne (tests/outils/base_reelle.sh).
#
#   docker compose run --rm api npm run test:cloisonnement
#
# Note : l'API limite les tentatives de connexion à 20 par quart d'heure et par
# adresse IP (anti-bruteforce). Pour rejouer plusieurs campagnes d'affilée,
# démarrer l'API avec AUTH_RATE_LIMIT_MAX=200 — jamais en production.
#
# Variables : API_URL (défaut http://localhost:4000)
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
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
code() { curl -s -o /tmp/siipi_test_body.json -w '%{http_code}' "$@"; }
len()  { python3 -c "import json;d=json.load(open('/tmp/siipi_test_body.json'));print(len(d) if isinstance(d,list) else 'non-liste')" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

A=test_cloison_a
B=test_cloison_b
C=test_cloison_c
ESSAI="'$A','$B','$C'"
CIT_EMAIL="test-cloisonnement-citoyen@example.test"
CIT_MDP="TEST-Citoyen-$$"
. "$(dirname "$0")/outils/comptes_temporaires.sh"
. "$(dirname "$0")/outils/base_reelle.sh"

# Ses trois communes de test et tout ce qu'elles portent, ses comptes, son
# citoyen — rien d'autre. Un -c par ordre, dans l'ordre des clés étrangères.
nettoyer() {
  $PSQL -c "DELETE FROM notifications_citoyen WHERE commune_id IN ($ESSAI);" \
        -c "DELETE FROM tickets WHERE commune_id IN ($ESSAI);" \
        -c "DELETE FROM five_axis_scores WHERE commune_id IN ($ESSAI);" \
        -c "DELETE FROM conteneurs WHERE commune_id IN ($ESSAI);" \
        -c "DELETE FROM vehicules WHERE commune_id IN ($ESSAI);" \
        -c "DELETE FROM versions_decoupage WHERE commune_id IN ($ESSAI);" \
        -c "DELETE FROM zones_collecte WHERE commune_id IN ($ESSAI);" \
        -c "DELETE FROM access_log WHERE commune_id IN ($ESSAI);" \
        -c "DELETE FROM audit_log WHERE commune_id IN ($ESSAI);" \
        -c "DELETE FROM citoyens WHERE user_id IN (SELECT id FROM users WHERE email = '$CIT_EMAIL');" \
        -c "DELETE FROM users WHERE email = '$CIT_EMAIL';" >/dev/null 2>&1
  retirer_comptes_temporaires
  $PSQL -c "DELETE FROM communes WHERE id IN ($ESSAI);" >/dev/null 2>&1
}
nettoyer
trap nettoyer EXIT
releve_base_reelle

# --- Le décor, bâti ---------------------------------------------------------
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES
            ('$A', 'TEST commune A du cloisonnement', 'TEST', 'TEST', 5000),
            ('$B', 'TEST commune B du cloisonnement', 'TEST', 'TEST', 5000),
            ('$C', 'TEST commune C du cloisonnement', 'TEST', 'TEST', 5000);" \
      -c "INSERT INTO vehicules (id, registration, commune_id, type) VALUES
            ('test-cloison-engin-1', 'TEST 0001', '$A', 'camion'), ('test-cloison-engin-2', 'TEST 0002', '$A', 'camion');" \
      -c "INSERT INTO conteneurs (id, code, commune_id, type) VALUES ('test-cloison-bac-1', 'TEST-BAC-1', '$A', 'om_menagers');" >/dev/null
compte_temporaire admin_commune "$A" "Directeur A";             T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$B" "Directeur B";             T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); DIR_B_ID=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$A" "Prestataire A"; T_PREST_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); PREST_A_ID=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$C" "Prestataire C"; T_PREST_C=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); PREST_C_ID=$COMPTE_ID
# La FNCT pose les secteurs (Jalon 7) : dans les communes de test, jamais ailleurs.
T_FNCT=$(tok admin.national@siipi.tn)
curl -s -o /dev/null -X POST "$API/citizens/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$CIT_EMAIL\",\"password\":\"$CIT_MDP\",\"fullName\":\"TEST Citoyen du cloisonnement\"}"
T_CITOYEN=$(tok "$CIT_EMAIL" "$CIT_MDP")
if [ -z "$T_FNCT" ] || [ -z "$T_A" ] || [ -z "$T_B" ] || [ -z "$T_PREST_A" ] || [ -z "$T_PREST_C" ] || [ -z "$T_CITOYEN" ]; then
  echo "Impossible de se connecter à $API, ou un compte d'essai n'a pas pu être créé." >&2
  exit 1
fi
curl -s -o /dev/null -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_CITOYEN" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$A\",\"adresse\":\"TEST, rue du cloisonnement\"}"
for z in "$A|10.30" "$C|10.60"; do
  curl -s -o /dev/null -X POST "$API/zones" -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' \
    -d "{\"communeId\":\"${z%|*}\",\"name\":\"TEST secteur du cloisonnement\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[${z#*|},33.60],[$(python3 -c "print(round(${z#*|}+0.02,2))"),33.60],[$(python3 -c "print(round(${z#*|}+0.02,2))"),33.62],[${z#*|},33.62],[${z#*|},33.60]]]}}"
done
chk "le décor est bâti : 2 engins et 1 conteneur dans A, 1 secteur dans A et dans C, le citoyen domicilié dans A" "2|1|1|1|$A" \
    "$(sql "SELECT count(*) FROM vehicules WHERE commune_id='$A'")|$(sql "SELECT count(*) FROM conteneurs WHERE commune_id='$A'")|$(sql "SELECT count(*) FROM zones_collecte WHERE commune_id='$A'")|$(sql "SELECT count(*) FROM zones_collecte WHERE commune_id='$C'")|$(sql "SELECT c.commune_id FROM citoyens c JOIN users u ON u.id=c.user_id WHERE u.email='$CIT_EMAIL'")"

echo
echo "Préparation : dépôt d'une réclamation citoyenne dans la commune A"
TICKET=$(curl -s -X POST "$API/tickets" -H "Authorization: Bearer $T_CITOYEN" \
  -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$A\",\"category\":\"point_noir\",\"title\":\"TEST réclamation du cloisonnement\",\"lat\":33.61,\"lng\":10.31}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$TICKET" ] || { echo "Échec de la création de la réclamation de test." >&2; exit 1; }

# Les compteurs sont relevés avant : ce sont les ÉCARTS qui sont vérifiés.
PREST_AVANT=$(code "$API/tickets?assignedToMe=true" -H "Authorization: Bearer $T_PREST_A" >/dev/null; len)
PREST_COMMUNE_AVANT=$(code "$API/tickets?communeId=$A" -H "Authorization: Bearer $T_PREST_A" >/dev/null; len)

echo
echo "1. Étanchéité entre communes"
c=$(code "$API/tickets?communeId=$A" -H "Authorization: Bearer $T_B")
chk "B ne voit aucune réclamation de A" 0 "$(len)"
c=$(code "$API/trucks?communeId=$A" -H "Authorization: Bearer $T_B")
chk "B ne voit aucun engin de A" 0 "$(len)"
c=$(code "$API/containers?communeId=$A" -H "Authorization: Bearer $T_B")
chk "B ne voit aucun conteneur de A" 0 "$(len)"
c=$(code "$API/zones?communeId=$C" -H "Authorization: Bearer $T_A")
chk "A ne voit pas le découpage de C" 0 "$(len)"
c=$(code -X PATCH "$API/communes/$B" -H "Authorization: Bearer $T_A" \
      -H 'Content-Type: application/json' -d '{"notes":"intrusion"}')
chk "A ne peut pas modifier la fiche de B" 403 "$c"
c=$(code -X POST "$API/kpi/five-axis" -H "Authorization: Bearer $T_A" -H 'Content-Type: application/json' \
      -d "{\"communeId\":\"$B\",\"efficaciteOperationnelle\":10,\"qualiteService\":10,\"performanceEnvironnementale\":10,\"performanceEconomique\":10,\"securiteRh\":10}")
chk "A ne peut pas noter la commune B" 403 "$c"

echo
echo "2. Périmètre des prestataires privés (TDR §3.2.11)"
c=$(code "$API/tickets?communeId=$A" -H "Authorization: Bearer $T_PREST_A")
chk "un prestataire ne voit pas la réclamation qu'on vient de déposer" "$PREST_COMMUNE_AVANT" "$(len)"
c=$(code "$API/trucks?communeId=$A" -H "Authorization: Bearer $T_PREST_A")
chk "un prestataire sans zone ne voit aucun engin" 0 "$(len)"
c=$(code "$API/zones?communeId=$C" -H "Authorization: Bearer $T_PREST_C")
chk "un prestataire voit le découpage de sa commune" 1 "$(len)"
c=$(code "$API/zones?communeId=$A" -H "Authorization: Bearer $T_PREST_C")
chk "un prestataire ne voit pas le découpage d'une autre commune" 0 "$(len)"

echo
echo "3. Données citoyennes"
c=$(code "$API/zones?communeId=$C" -H "Authorization: Bearer $T_CITOYEN")
chk "un citoyen ne voit aucun découpage communal" 0 "$(len)"
c=$(code "$API/trucks?communeId=$A" -H "Authorization: Bearer $T_CITOYEN")
chk "un citoyen ne voit aucune flotte municipale" 0 "$(len)"
c=$(code -X PATCH "$API/tickets/$TICKET/accept" -H "Authorization: Bearer $T_CITOYEN" \
      -H 'Content-Type: application/json' -d '{}')
chk "un citoyen ne peut pas instruire une réclamation" 403 "$c"

echo
echo "4. Aucun accès sans authentification"
for ep in /communes /communes/stats /communes/boundaries /trucks /tickets /kpi/five-axis/$A; do
  c=$(code "$API$ep"); chk "GET $ep refusé sans jeton" 401 "$c"
done

echo
echo "5. Ce qui doit rester accessible"
c=$(code "$API/communes" -H "Authorization: Bearer $T_B")
chk "l'annuaire montre à toute commune les 350 communes réelles, et les 3 communes de test de la campagne" 353 "$(len)"
c=$(code "$API/communes/stats" -H "Authorization: Bearer $T_A")
chk "statistiques nationales" 200 "$c"
c=$(code -X POST "$API/kpi/five-axis" -H "Authorization: Bearer $T_A" -H 'Content-Type: application/json' \
      -d "{\"communeId\":\"$A\",\"efficaciteOperationnelle\":82,\"qualiteService\":75,\"performanceEnvironnementale\":60,\"performanceEconomique\":70,\"securiteRh\":88}")
chk "une commune note sa propre performance" 201 "$c"
c=$(code "$API/kpi/five-axis/$A" -H "Authorization: Bearer $T_B")
chk "une commune consulte le score d'une autre (émulation)" 200 "$c"
c=$(code "$API/trucks?communeId=$A" -H "Authorization: Bearer $T_A")
chk "une commune voit sa propre flotte" 2 "$(len)"
c=$(code -X PATCH "$API/communes/$A" -H "Authorization: Bearer $T_A" \
      -H 'Content-Type: application/json' -d '{"notes":"TEST mise a jour legitime"}')
chk "une commune met à jour sa propre fiche" 200 "$c"
c=$(code "$API/auth/me" -H "Authorization: Bearer $T_A")
chk "/auth/me reste appelable (pas de limitation de débit)" 200 "$c"

echo
echo "6. Workflow complet d'une réclamation"
c=$(code -X PATCH "$API/tickets/$TICKET/accept" -H "Authorization: Bearer $T_A" \
      -H 'Content-Type: application/json' -d '{}')
chk "la commune accepte la réclamation" 200 "$c"
PRESTATAIRE=$(curl -s "$API/communes/$A/prestataires" -H "Authorization: Bearer $T_A" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null)
chk "le prestataire de la commune est proposé" "$PREST_A_ID" "$PRESTATAIRE"
c=$(code -X PATCH "$API/tickets/$TICKET/assign" -H "Authorization: Bearer $T_A" \
      -H 'Content-Type: application/json' -d "{\"prestataireUserId\":\"$PRESTATAIRE\"}")
chk "transfert au prestataire" 200 "$c"
c=$(code "$API/tickets?assignedToMe=true" -H "Authorization: Bearer $T_PREST_A")
chk "le prestataire voit la réclamation qui lui est transférée" "$((PREST_AVANT+1))" "$(len)"
c=$(code -X PATCH "$API/tickets/$TICKET/treat" -H "Authorization: Bearer $T_PREST_A" \
      -H 'Content-Type: application/json' -d '{"status":"resolu","resolutionNote":"traite par test automatise"}')
chk "le prestataire traite la réclamation" 200 "$c"

echo
echo "7. Aucune commune réelle n'a reçu de ligne (JC-011, JC-012)"
chk "les communes de test portent bien les gestes de la campagne (réclamation résolue, score, notification, notes)" "resolu|1|1|TEST mise a jour legitime" \
    "$(sql "SELECT status FROM tickets WHERE id='$TICKET'")|$(sql "SELECT count(*) FROM five_axis_scores WHERE commune_id='$A'")|$(sql "SELECT count(*) FROM notifications_citoyen WHERE commune_id='$A'")|$($PSQL -c "SELECT notes FROM communes WHERE id='$A'")"
base_reelle_intacte "pendant la campagne"
nettoyer
chk "ses communes de test, leurs lignes, ses comptes et son citoyen sont effacés" "0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM tickets WHERE id='$TICKET'")|$(sql "SELECT count(*) FROM users WHERE email = '$CIT_EMAIL' OR email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"
  exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"
  exit 1
fi
