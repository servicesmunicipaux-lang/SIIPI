#!/usr/bin/env bash
# =============================================================================
# Test de l'espace citoyen (migration 021).
#
# Vérifie les trois choses que le citoyen attend du service, dans l'ordre où
# il les attend :
#   1. quand passe-t-on chez moi (adresse → zone → circuit → prochain passage)
#   2. et si ça change (annonces de suppression et de report)
#   3. ce que deviennent les signalements (carte publique)
#
# Vérifie surtout ce que la carte publique NE doit PAS laisser sortir : ni nom,
# ni téléphone, ni description libre, ni coordonnée exacte, ni photo non
# validée (décret-loi n° 2022-54, principe de minimisation).
#
#   docker compose run --rm api npm run test:citoyen
#
# Note : l'API limite les connexions à 20 par quart d'heure et par adresse IP.
# Pour enchaîner les campagnes, démarrer l'API avec AUTH_RATE_LIMIT_MAX=200.
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Siipi2026!\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
code() { curl -s -o /tmp/siipi_k.json -w '%{http_code}' "$@"; }
len()  { python3 -c "import json;d=json.load(open('/tmp/siipi_k.json'));print(len(d) if isinstance(d,list) else 'non-liste')" 2>/dev/null || echo erreur; }
# Ne compte que les lignes créées par cette campagne : une commune de recette
# a ses propres circuits, et un test qui compte tout échoue dès la première
# saisie réelle.
lenTest() { python3 -c "
import json
d = json.load(open('/tmp/siipi_k.json'))
print(sum(1 for x in d if str(x.get('$1') or '').startswith('TEST')))" 2>/dev/null || echo erreur; }
jq_()  { python3 -c "import json,sys;d=json.load(open('/tmp/siipi_k.json'));print($1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

T_HS=$(tok directeur.houmtsouk@siipi.tn)
T_MARSA=$(tok directeur.marsa@siipi.tn)
T_CIT=$(tok citoyen.demo@siipi.tn)
T_PREST=$(tok prestataire.houmtsouk@siipi.tn)
[ -n "$T_HS" ] || { echo "API injoignable sur $API" >&2; exit 1; }

COMMUNE=medenine_djerba_houmt_souk
AUJOURDHUI=$(date -u +%F)
JOUR_SEMAINE=$(date -u +%u)          # 1 = lundi … 7 = dimanche
DANS_2J=$(date -u -d '+2 days' +%F)
DANS_7J=$(date -u -d '+7 days' +%F)

# Nettoyage préalable : une campagne interrompue laisse ses données derrière
# elle et fausse la suivante.
$PSQL -c "DELETE FROM annonces_collecte WHERE message_fr LIKE 'TEST %';
          DELETE FROM circuits WHERE nom LIKE 'TEST circuit citoyen%';
          DELETE FROM zones_collecte WHERE name LIKE 'TEST zone citoyen%';
          DELETE FROM tickets WHERE title LIKE 'TEST signalement%';
          UPDATE citoyens SET commune_id = NULL, adresse = NULL, position = NULL, zone_id = NULL;" >/dev/null 2>&1

echo
echo "1. Le décor : deux secteurs, deux circuits"
CODE=$(code -X POST "$API/zones" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"name\":\"TEST zone citoyen A\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[10.60,33.60],[10.62,33.60],[10.62,33.62],[10.60,33.62],[10.60,33.60]]]}}")
chk "la commune crée le secteur A" 201 "$CODE"
ZONE_A=$(jq_ "d['id']")
CODE=$(code -X POST "$API/zones" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"name\":\"TEST zone citoyen B\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[10.70,33.60],[10.72,33.60],[10.72,33.62],[10.70,33.62],[10.70,33.60]]]}}")
ZONE_B=$(jq_ "d['id']")

CODE=$(code -X POST "$API/circuits" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"nom\":\"TEST circuit citoyen A\",\"zoneId\":\"$ZONE_A\",\"joursPassage\":[$JOUR_SEMAINE],\"typeDechet\":\"menager\"}")
chk "un circuit hebdomadaire sur le secteur A" 201 "$CODE"
CIRCUIT_A=$(jq_ "d['id']")
code -X POST "$API/circuits" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"nom\":\"TEST circuit citoyen B\",\"zoneId\":\"$ZONE_B\",\"joursPassage\":[$JOUR_SEMAINE]}" >/dev/null
CIRCUIT_B=$(jq_ "d['id']")

echo
echo "2. Sans adresse, pas d'horaire — et c'est la bonne réponse"
CODE=$(code "$API/citoyen/horaires" -H "Authorization: Bearer $T_CIT")
chk "la route répond" 200 "$CODE"
chk "aucun horaire tant que l'adresse est inconnue" 0 "$(len)"

echo
echo "3. L'adresse, lien manquant entre un compte et un circuit"
CODE=$(code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"adresse\":\"12 rue de test, secteur A\",\"lat\":33.61,\"lng\":10.61}")
chk "le citoyen déclare son domicile" 200 "$CODE"
chk "le secteur est résolu automatiquement" "$ZONE_A" "$(jq_ "d['zone_id']")"

CODE=$(code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d '{"communeId":"commune_qui_nexiste_pas","adresse":"nulle part","lat":33.6,"lng":10.6}')
chk "une commune inconnue est refusée" 404 "$CODE"

CODE=$(code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"adresse\":\"la mairie\"}")
chk "un directeur de propreté n'a pas d'adresse citoyenne" 403 "$CODE"

echo
echo "4. « Quand passe-t-on chez moi ? »"
CODE=$(code "$API/citoyen/horaires" -H "Authorization: Bearer $T_CIT")
chk "un seul circuit : celui du secteur A" 1 "$(lenTest circuit_nom)"
chk "c'est bien le circuit A" "TEST circuit citoyen A" "$(jq_ "d[0]['circuit_nom']")"
chk "la précision annoncée est celle du secteur" "zone" "$(jq_ "d[0]['precision_source']")"
chk "le prochain passage est aujourd'hui" "$AUJOURDHUI" "$(jq_ "d[0]['prochain_passage']")"
chk "les jours de passage sortent en nombres, pas en texte" "t" \
    "$(jq_ "'t' if all(isinstance(x,int) for x in d[0]['jours_passage']) else 'f'")"

echo
echo "5. Une adresse hors de tout secteur : répondre, mais le dire"
code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"adresse\":\"hameau isolé\",\"lat\":33.50,\"lng\":10.50}" >/dev/null
CODE=$(code "$API/citoyen/horaires" -H "Authorization: Bearer $T_CIT")
chk "tous les circuits de la commune sont listés" 2 "$(lenTest circuit_nom)"
chk "et la réponse avoue son imprécision" "commune" "$(jq_ "d[0]['precision_source']")"

# Retour dans le secteur A pour la suite.
code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"adresse\":\"12 rue de test, secteur A\",\"lat\":33.61,\"lng\":10.61}" >/dev/null

echo
echo "6. Les annonces : quand la réalité dément le calendrier"
CODE=$(code -X POST "$API/citoyen/annonces" -H "Authorization: Bearer $T_PREST" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"type\":\"information\",\"dateDebut\":\"$AUJOURDHUI\",\"dateFin\":\"$AUJOURDHUI\",\"messageFr\":\"TEST intrusion prestataire\"}")
chk "un prestataire n'annonce rien au nom de la commune" 403 "$CODE"

CODE=$(code -X POST "$API/citoyen/annonces" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"type\":\"information\",\"dateDebut\":\"$AUJOURDHUI\",\"dateFin\":\"$AUJOURDHUI\",\"messageFr\":\"TEST intrusion commune voisine\"}")
chk "une autre commune non plus (refus de la base, pas panne)" 403 "$CODE"

CODE=$(code -X POST "$API/citoyen/annonces" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"type\":\"report\",\"dateDebut\":\"$AUJOURDHUI\",\"dateFin\":\"$AUJOURDHUI\",\"messageFr\":\"TEST report sans date\"}")
chk "un report sans date de report est refusé" 400 "$CODE"

CODE=$(code -X POST "$API/citoyen/annonces" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"circuitId\":\"$CIRCUIT_A\",\"type\":\"suppression\",\"dateDebut\":\"$AUJOURDHUI\",\"dateFin\":\"$AUJOURDHUI\",\"messageFr\":\"TEST jour férié, pas de collecte\",\"messageAr\":\"اختبار\"}")
chk "la commune annonce une suppression" 201 "$CODE"
ANNONCE=$(jq_ "d['id']")

CODE=$(code "$API/citoyen/horaires" -H "Authorization: Bearer $T_CIT")
chk "le passage supprimé disparaît du calendrier" "$DANS_7J" "$(jq_ "d[0]['prochain_passage']")"
chk "et le citoyen voit pourquoi" "suppression" "$(jq_ "d[0]['annonce_type']")"
chk "le message lui est remonté" "TEST jour férié, pas de collecte" "$(jq_ "d[0]['annonce_message']")"

CODE=$(code -X PATCH "$API/citoyen/annonces/$ANNONCE" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d "{\"type\":\"report\",\"dateReport\":\"$DANS_2J\",\"messageFr\":\"TEST collecte reportée\"}")
chk "la commune corrige : ce n'est pas supprimé, c'est reporté" 200 "$CODE"
CODE=$(code "$API/citoyen/horaires" -H "Authorization: Bearer $T_CIT")
chk "le passage réapparaît à la date de report" "$DANS_2J" "$(jq_ "d[0]['prochain_passage']")"

echo
echo "7. Un brouillon reste chez la commune"
CODE=$(code -X POST "$API/citoyen/annonces" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"type\":\"information\",\"dateDebut\":\"$AUJOURDHUI\",\"dateFin\":\"$DANS_7J\",\"messageFr\":\"TEST brouillon non publié\",\"publiee\":false}")
chk "la commune rédige un brouillon" 201 "$CODE"
BROUILLON=$(jq_ "d['id']")
CODE=$(code "$API/citoyen/annonces?communeId=$COMMUNE" -H "Authorization: Bearer $T_HS")
chk "elle le voit" "t" "$(jq_ "'t' if any(x['id']=='$BROUILLON' for x in d) else 'f'")"
CODE=$(code "$API/citoyen/annonces?communeId=$COMMUNE" -H "Authorization: Bearer $T_CIT")
chk "le citoyen ne le voit pas" "f" "$(jq_ "'t' if any(x['id']=='$BROUILLON' for x in d) else 'f'")"
chk "mais il voit l'annonce publiée" "t" "$(jq_ "'t' if any(x['id']=='$ANNONCE' for x in d) else 'f'")"

echo
echo "8. La carte publique : couverture complète, identification nulle"
CODE=$(code -X POST "$API/tickets" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"category\":\"point_noir\",\"title\":\"TEST signalement carte\",\"description\":\"devant la maison de M. Ben Salah, au 12\",\"citizenName\":\"Amira Ben Salah\",\"citizenPhone\":\"98123456\",\"lat\":33.6123456,\"lng\":10.6187654,\"photoUrl\":\"https://exemple.tn/photo.jpg\"}")
chk "un citoyen dépose un signalement géolocalisé" 201 "$CODE"
TICKET=$(jq_ "d['id']")

CODE=$(code "$API/citoyen/carte?communeId=$COMMUNE")
chk "la carte s'ouvre sans être connecté" 200 "$CODE"
chk "le signalement y figure" "t" "$(jq_ "'t' if any(x['id']=='$TICKET' for x in d) else 'f'")"
chk "aucun nom ne sort" "f" "$(jq_ "'t' if any('name' in k or 'nom' in k or 'phone' in k for x in d for k in x) else 'f'")"
chk "aucune description libre ne sort" "f" "$(jq_ "'t' if any('description' in k for x in d for k in x) else 'f'")"
# 33,6123456 arrondi au pas de 0,001 → 33,612. La précision restante vaut ~110 m.
chk "la position est arrondie à la grille de 110 m" "33.612" \
    "$(jq_ "[str(round(x['lat'],6)) for x in d if x['id']=='$TICKET'][0]")"
chk "la photo n'est pas publiée sans validation" "None" \
    "$(jq_ "[x['photo_url'] for x in d if x['id']=='$TICKET'][0]")"

CODE=$(code -X PATCH "$API/citoyen/signalements/$TICKET/photo" -H "Authorization: Bearer $T_CIT" \
  -H 'Content-Type: application/json' -d '{"photoPublique":true}')
chk "le citoyen ne publie pas sa photo lui-même" 403 "$CODE"

CODE=$(code -X PATCH "$API/citoyen/signalements/$TICKET/photo" -H "Authorization: Bearer $T_HS" \
  -H 'Content-Type: application/json' -d '{"photoPublique":true}')
chk "la commune valide la photo" 200 "$CODE"
CODE=$(code "$API/citoyen/carte?communeId=$COMMUNE")
chk "elle apparaît alors sur la carte" "https://exemple.tn/photo.jpg" \
    "$(jq_ "[x['photo_url'] for x in d if x['id']=='$TICKET'][0]")"
chk "la validation est datée et signée" 1 \
    "$(sql "SELECT count(*) FROM tickets WHERE id='$TICKET' AND photo_validee_par IS NOT NULL AND photo_validee_le IS NOT NULL")"

CODE=$(code -X PATCH "$API/citoyen/signalements/$TICKET/photo" -H "Authorization: Bearer $T_HS" \
  -H 'Content-Type: application/json' -d '{"photoPublique":false}')
CODE=$(code "$API/citoyen/carte?communeId=$COMMUNE")
chk "la commune peut la dépublier" "None" \
    "$(jq_ "[x['photo_url'] for x in d if x['id']=='$TICKET'][0]")"

echo
echo "9. Suppression logique d'une annonce"
CODE=$(code -X DELETE "$API/citoyen/annonces/$BROUILLON" -H "Authorization: Bearer $T_HS")
chk "l'annonce est retirée" 204 "$CODE"
chk "elle reste en base" 1 "$(sql "SELECT count(*) FROM annonces_collecte WHERE id='$BROUILLON'")"
chk "et au journal d'audit" "t" \
    "$([ "$(sql "SELECT count(*) FROM audit_log WHERE record_id='$BROUILLON'")" -ge 1 ] && echo t || echo f)"

$PSQL -c "DELETE FROM annonces_collecte WHERE message_fr LIKE 'TEST %';
          DELETE FROM tickets WHERE title LIKE 'TEST signalement%';
          DELETE FROM circuits WHERE nom LIKE 'TEST circuit citoyen%';
          DELETE FROM zones_collecte WHERE name LIKE 'TEST zone citoyen%';
          UPDATE citoyens SET commune_id = NULL, adresse = NULL, position = NULL, zone_id = NULL;" >/dev/null 2>&1

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
