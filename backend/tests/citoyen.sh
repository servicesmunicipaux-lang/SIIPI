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
# validée (loi organique n° 2004-63, principe de minimisation).
#
#   docker compose run --rm api npm run test:citoyen
#
# ELLE NE TOUCHE QU'À SES CITOYENS (JC-005, docs/recette/JOURNAL_DES_CORRECTIONS.md).
# Jusqu'à la v0.15.47, elle remettait à zéro l'adresse de TOUS les citoyens de
# la base, au début et à la fin : sur une base portant de vrais habitants,
# chaque passage leur aurait retiré leurs horaires de collecte et le ciblage
# des notifications. Elle crée désormais son citoyen d'essai, et un citoyen
# « témoin » domicilié qu'elle ne doit pas toucher ; elle vérifie en partant
# que le témoin et tous les autres citoyens sont tels qu'elle les a trouvés.
#
# ELLE NE TOUCHE À AUCUNE COMMUNE RÉELLE (JC-009). Jusqu'à la v0.15.49, elle
# posait ses secteurs, ses circuits, ses annonces et ses signalements d'essai
# dans Houmt Souk, avec les comptes de démonstration de la commune ; et chaque
# secteur posé par la FNCT y figeait une version du découpage, dont la
# « version 1 » restait après elle dans l'historique de la commune. Elle
# travaille désormais dans sa commune de test, avec un directeur temporaire
# (tests/outils/directeur_temporaire.sh), et vérifie — pendant qu'elle a des
# lignes en base, puis en partant — qu'aucune annonce, aucun secteur, aucun
# circuit, aucune version de découpage ni aucun signalement n'a été ajouté,
# modifié ou retiré dans une autre commune.
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
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
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

# Les comptes de démonstration ne servent plus qu'à des REFUS (une autre
# commune, un prestataire) : ils n'écrivent rien. La FNCT pose les secteurs
# (le découpage se valide par elle depuis le Jalon 7), dans la commune de test.
T_MARSA=$(tok directeur.marsa@siipi.tn)
T_PREST=$(tok prestataire.houmtsouk@siipi.tn)
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_FNCT" ] && [ -n "$T_MARSA" ] && [ -n "$T_PREST" ] || { echo "API injoignable sur $API, ou compte de démonstration absent" >&2; exit 1; }

COMMUNE=test_citoyen
COMMUNE_DIR="$COMMUNE"
. "$(dirname "$0")/outils/directeur_temporaire.sh"
AUJOURDHUI=$(date -u +%F)
JOUR_SEMAINE=$(date -u +%u)          # 1 = lundi … 7 = dimanche
DANS_2J=$(date -u -d '+2 days' +%F)
DANS_7J=$(date -u -d '+7 days' +%F)

# Les citoyens de la campagne : celui qu'elle éprouve, et un témoin domicilié
# qu'elle ne doit jamais toucher. Le témoin est BÂTI : sans lui, le contrôle
# « les autres citoyens sont intacts » passerait à vide sur une base où aucun
# citoyen n'a d'adresse — précisément la base des campagnes.
CIT_EMAIL="test-citoyen-campagne@example.test"
TEM_EMAIL="test-citoyen-temoin@example.test"
CIT_MDP="TEST-Citoyen-$$"
NOS_CITOYENS="'$CIT_EMAIL','$TEM_EMAIL'"
# Ce qui identifie l'état d'un citoyen pour cette campagne : sa commune, son
# adresse, sa position et son secteur.
etat_citoyens() {  # $1 = filtre SQL sur u.email
  sql "SELECT coalesce(md5(string_agg(c.id::text||'|'||coalesce(c.commune_id,'')||'|'||coalesce(c.adresse,'')||'|'
                                      ||coalesce(ST_AsText(c.position),'')||'|'||coalesce(c.zone_id::text,''), ',' ORDER BY c.id)), 'aucun')
         FROM citoyens c JOIN users u ON u.id = c.user_id WHERE $1"
}

# Nettoyage : sa commune de test et tout ce qu'elle porte, ses deux citoyens,
# son directeur — rien d'autre. Chaque suppression est bornée à la commune de
# test : une ligne d'essai égarée dans une commune réelle reste où elle est, et
# les contrôles de la fin la voient. Un -c par ordre, dans l'ordre des clés
# étrangères, pour qu'un refus n'emporte pas les suivants.
nettoyer() {
  $PSQL -c "DELETE FROM annonces_collecte WHERE commune_id = '$COMMUNE';" \
        -c "DELETE FROM tickets WHERE commune_id = '$COMMUNE';" \
        -c "DELETE FROM circuits WHERE commune_id = '$COMMUNE';" \
        -c "DELETE FROM zones_collecte WHERE commune_id = '$COMMUNE';" \
        -c "DELETE FROM versions_decoupage WHERE commune_id = '$COMMUNE';" \
        -c "DELETE FROM citoyens WHERE user_id IN (SELECT id FROM users WHERE email IN ($NOS_CITOYENS));" \
        -c "DELETE FROM users WHERE email IN ($NOS_CITOYENS);" \
        -c "DELETE FROM audit_log WHERE commune_id = '$COMMUNE';" >/dev/null 2>&1
  retirer_directeur_temporaire
  $PSQL -c "DELETE FROM communes WHERE id = '$COMMUNE';" >/dev/null 2>&1
}
nettoyer
trap nettoyer EXIT

# Ce que la campagne écrit, table par table, et l'empreinte de ces tables HORS
# de sa commune de test : les identifiants de toutes les lignes, avec ce qui
# change quand une ligne est modifiée. Une ligne ajoutée, modifiée ou retirée
# dans une commune réelle change l'empreinte — même effacée ensuite, puisque le
# premier contrôle tombe pendant que la campagne a ses lignes en base.
TABLES_ECRITES="annonces_collecte tickets circuits zones_collecte versions_decoupage"
empreinte_reelles() {  # $1 = table
  case "$1" in
    annonces_collecte) cols="id::text||coalesce(message_fr,'')||coalesce(date_debut::text,'')||coalesce(type,'')" ;;
    tickets)           cols="id::text||coalesce(status,'')||coalesce(title,'')" ;;
    circuits)          cols="id::text||coalesce(nom,'')||coalesce(zone_id::text,'')" ;;
    zones_collecte)    cols="id::text||coalesce(name,'')||coalesce(ST_AsText(geom),'')" ;;
    versions_decoupage) cols="id::text||coalesce(numero::text,'')||statut" ;;
  esac
  sql "SELECT count(*)||':'||coalesce(md5(string_agg($cols, ',' ORDER BY id)), '-') FROM $1 WHERE commune_id <> '$COMMUNE'"
}
declare -A REELLES_AVANT
for t in $TABLES_ECRITES; do REELLES_AVANT[$t]=$(empreinte_reelles "$t"); done
# Les libellés des contrôles, l'annonce en tête : c'est elle que le citoyen lit.
declare -A LIBELLE=([annonces_collecte]="aucune annonce ajoutée, modifiée ou retirée"
                    [zones_collecte]="aucun secteur ajouté, modifié ou retiré"
                    [circuits]="aucun circuit ajouté, modifié ou retiré"
                    [versions_decoupage]="aucune version de découpage ajoutée, modifiée ou retirée"
                    [tickets]="aucun signalement ajouté, modifié ou retiré")
communes_reelles_intactes() {  # $1 = moment
  for t in annonces_collecte zones_collecte circuits versions_decoupage tickets; do
    chk "$1 : ${LIBELLE[$t]} hors de la commune de test" "${REELLES_AVANT[$t]}" "$(empreinte_reelles "$t")"
  done
}

$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$COMMUNE', 'TEST commune de l''espace citoyen', 'TEST', 'TEST', 5000);" >/dev/null
directeur_temporaire "$COMMUNE"
T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
[ -n "$T_DIR" ] || { echo "Le directeur temporaire ne se connecte pas." >&2; exit 1; }

# L'état de tous les AUTRES citoyens, avant que la campagne ne commence.
AUTRES_AVANT=$(etat_citoyens "u.email NOT IN ($NOS_CITOYENS)")

for e in "$CIT_EMAIL" "$TEM_EMAIL"; do
  code -X POST "$API/citizens/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$e\",\"password\":\"$CIT_MDP\",\"fullName\":\"TEST Citoyen de campagne\"}" >/dev/null
done
T_CIT=$(tok "$CIT_EMAIL" "$CIT_MDP")
T_TEM=$(tok "$TEM_EMAIL" "$CIT_MDP")
[ -n "$T_CIT" ] && [ -n "$T_TEM" ] || { echo "Les citoyens d'essai n'ont pas pu être créés." >&2; exit 1; }
code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_TEM" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"adresse\":\"TEST témoin, rue du témoin\",\"lat\":33.65,\"lng\":10.65}" >/dev/null
TEMOIN_AVANT=$(etat_citoyens "u.email = '$TEM_EMAIL'")
[ "$(sql "SELECT count(*) FROM citoyens c JOIN users u ON u.id = c.user_id WHERE u.email = '$TEM_EMAIL' AND c.adresse IS NOT NULL AND c.position IS NOT NULL")" = 1 ] \
  || { echo "Le citoyen témoin n'a pas pu déclarer son adresse." >&2; exit 1; }

echo
echo "1. Le décor : deux secteurs, deux circuits"
CODE=$(code -X POST "$API/zones" -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"name\":\"TEST zone citoyen A\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[10.60,33.60],[10.62,33.60],[10.62,33.62],[10.60,33.62],[10.60,33.60]]]}}")
chk "la FNCT pose le secteur A" 201 "$CODE"
ZONE_A=$(jq_ "d['id']")
CODE=$(code -X POST "$API/zones" -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"name\":\"TEST zone citoyen B\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[10.70,33.60],[10.72,33.60],[10.72,33.62],[10.70,33.62],[10.70,33.60]]]}}")
ZONE_B=$(jq_ "d['id']")

CODE=$(code -X POST "$API/circuits" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"nom\":\"TEST circuit citoyen A\",\"zoneId\":\"$ZONE_A\",\"joursPassage\":[$JOUR_SEMAINE],\"typeDechet\":\"menager\"}")
chk "un circuit hebdomadaire sur le secteur A" 201 "$CODE"
CIRCUIT_A=$(jq_ "d['id']")
code -X POST "$API/circuits" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
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

CODE=$(code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
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

CODE=$(code -X POST "$API/citoyen/annonces" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"type\":\"report\",\"dateDebut\":\"$AUJOURDHUI\",\"dateFin\":\"$AUJOURDHUI\",\"messageFr\":\"TEST report sans date\"}")
chk "un report sans date de report est refusé" 400 "$CODE"

CODE=$(code -X POST "$API/citoyen/annonces" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"circuitId\":\"$CIRCUIT_A\",\"type\":\"suppression\",\"dateDebut\":\"$AUJOURDHUI\",\"dateFin\":\"$AUJOURDHUI\",\"messageFr\":\"TEST jour férié, pas de collecte\",\"messageAr\":\"اختبار\"}")
chk "la commune annonce une suppression" 201 "$CODE"
ANNONCE=$(jq_ "d['id']")

CODE=$(code "$API/citoyen/horaires" -H "Authorization: Bearer $T_CIT")
chk "le passage supprimé disparaît du calendrier" "$DANS_7J" "$(jq_ "d[0]['prochain_passage']")"
chk "et le citoyen voit pourquoi" "suppression" "$(jq_ "d[0]['annonce_type']")"
chk "le message lui est remonté" "TEST jour férié, pas de collecte" "$(jq_ "d[0]['annonce_message']")"

CODE=$(code -X PATCH "$API/citoyen/annonces/$ANNONCE" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"type\":\"report\",\"dateReport\":\"$DANS_2J\",\"messageFr\":\"TEST collecte reportée\"}")
chk "la commune corrige : ce n'est pas supprimé, c'est reporté" 200 "$CODE"
CODE=$(code "$API/citoyen/horaires" -H "Authorization: Bearer $T_CIT")
chk "le passage réapparaît à la date de report" "$DANS_2J" "$(jq_ "d[0]['prochain_passage']")"

echo
echo "7. Un brouillon reste chez la commune"
CODE=$(code -X POST "$API/citoyen/annonces" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"type\":\"information\",\"dateDebut\":\"$AUJOURDHUI\",\"dateFin\":\"$DANS_7J\",\"messageFr\":\"TEST brouillon non publié\",\"publiee\":false}")
chk "la commune rédige un brouillon" 201 "$CODE"
BROUILLON=$(jq_ "d['id']")
CODE=$(code "$API/citoyen/annonces?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR")
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

CODE=$(code -X PATCH "$API/citoyen/signalements/$TICKET/photo" -H "Authorization: Bearer $T_DIR" \
  -H 'Content-Type: application/json' -d '{"photoPublique":true}')
chk "la commune valide la photo" 200 "$CODE"
CODE=$(code "$API/citoyen/carte?communeId=$COMMUNE")
chk "elle apparaît alors sur la carte" "https://exemple.tn/photo.jpg" \
    "$(jq_ "[x['photo_url'] for x in d if x['id']=='$TICKET'][0]")"
chk "la validation est datée et signée" 1 \
    "$(sql "SELECT count(*) FROM tickets WHERE id='$TICKET' AND photo_validee_par IS NOT NULL AND photo_validee_le IS NOT NULL")"

CODE=$(code -X PATCH "$API/citoyen/signalements/$TICKET/photo" -H "Authorization: Bearer $T_DIR" \
  -H 'Content-Type: application/json' -d '{"photoPublique":false}')
CODE=$(code "$API/citoyen/carte?communeId=$COMMUNE")
chk "la commune peut la dépublier" "None" \
    "$(jq_ "[x['photo_url'] for x in d if x['id']=='$TICKET'][0]")"

echo
echo "9. Suppression logique d'une annonce"
CODE=$(code -X DELETE "$API/citoyen/annonces/$BROUILLON" -H "Authorization: Bearer $T_DIR")
chk "l'annonce est retirée" 204 "$CODE"
chk "elle reste en base" 1 "$(sql "SELECT count(*) FROM annonces_collecte WHERE id='$BROUILLON'")"
chk "et au journal d'audit" "t" \
    "$([ "$(sql "SELECT count(*) FROM audit_log WHERE record_id='$BROUILLON'")" -ge 1 ] && echo t || echo f)"

echo
echo "9 bis. Pendant qu'elle a ses lignes en base, aucune commune réelle n'en a reçu (JC-009)"
chk "la commune de test porte bien les lignes de la campagne (2 annonces, 2 secteurs, 2 circuits, 1 signalement, des versions)" "2|2|2|1|t" \
    "$(sql "SELECT count(*) FROM annonces_collecte WHERE commune_id = '$COMMUNE'")|$(sql "SELECT count(*) FROM zones_collecte WHERE commune_id = '$COMMUNE'")|$(sql "SELECT count(*) FROM circuits WHERE commune_id = '$COMMUNE'")|$(sql "SELECT count(*) FROM tickets WHERE commune_id = '$COMMUNE'")|$([ "$(sql "SELECT count(*) FROM versions_decoupage WHERE commune_id = '$COMMUNE'")" -ge 1 ] && echo t || echo f)"
communes_reelles_intactes "pendant la campagne"

echo
echo "10. Trouver sa commune : la position d'abord, le choix en deux étapes à défaut (D-FNCT-1)"
# Les positions sont prises DANS les contours par la base elle-même
# (ST_PointOnSurface) : le témoin ne doit rien à la route qu'il contrôle.
point() { sql "SELECT ST_Y(p)||','||ST_X(p) FROM (SELECT ST_PointOnSurface(boundary_geom) p FROM communes WHERE id='$1') x"; }
localiser() { # « lat,lng » [jeton] -> code HTTP, réponse dans /tmp/siipi_k.json
  code -X POST "$API/communes/localiser" -H "Authorization: Bearer ${2:-$T_CIT}" -H 'Content-Type: application/json' \
    -d "{\"lat\":${1%,*},\"lng\":${1#*,}}"
}
P_KASSERINE=$(point kasserine_ennour)
P_SFAX=$(point sfax_ennour)
chk "sans jeton, rien" 401 "$(code -X POST "$API/communes/localiser" -H 'Content-Type: application/json' -d '{"lat":35,"lng":9}')"
chk "une latitude impossible est refusée" 400 "$(localiser "200,9")"
chk "un champ inconnu est refusé" 400 \
    "$(code -X POST "$API/communes/localiser" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' -d '{"lat":35,"lng":9,"adresse":"x"}')"
AUDIT_AVANT=$(sql "SELECT count(*) FROM audit_log")
CITOYEN_AVANT=$(etat_citoyens "u.email = '$CIT_EMAIL'")
CODE=$(localiser "$P_KASSERINE")
chk "localisé dans l'Ennour de Kasserine : c'est elle qui est proposée" "200|True|kasserine_ennour|Kasserine" \
    "$CODE|$(jq_ "d['trouvee']")|$(jq_ "d['commune']['id']")|$(jq_ "d['commune']['gouvernorat']")"
CODE=$(localiser "$P_SFAX")
chk "dans l'Ennour de Sfax : la position distingue les homonymes" "200|sfax_ennour|Sfax" \
    "$CODE|$(jq_ "d['commune']['id']")|$(jq_ "d['commune']['gouvernorat']")"
chk "… avec son nom arabe, pour l'écran en arabe" "النور" "$(jq_ "d['commune']['name_ar']")"
CODE=$(localiser "36.5,12.5")
chk "en mer, hors de toute commune : non trouvée, et la raison est dite" "200|False|hors_commune" \
    "$CODE|$(jq_ "d['trouvee']")|$(jq_ "d['raison']")"
chk "la position n'est écrite nulle part : ni au journal, ni sur la fiche du citoyen" "$AUDIT_AVANT|$CITOYEN_AVANT" \
    "$(sql "SELECT count(*) FROM audit_log")|$(etat_citoyens "u.email = '$CIT_EMAIL'")"

# Le choix manuel : gouvernorat, puis commune, affichée « Nom (Gouvernorat) ».
code "$API/communes" -H "Authorization: Bearer $T_CIT" >/dev/null
# La commune de test de la campagne figure dans la liste ; elle n'est pas un gouvernorat.
chk "les 24 gouvernorats sont proposés à la première étape" 24 \
    "$(jq_ "len({c['gouvernorat'] for c in d if c.get('gouvernorat') and c['id'] != '$COMMUNE'})")"
chk "deux noms au moins sont portés par deux communes (Ennour, Ezzouhour)…" "Ennour,Ezzouhour" \
    "$(jq_ "','.join(sorted(n for n in {c['name'] for c in d} if sum(1 for x in d if x['name']==n) > 1))")"
chk "… mais « Nom (Gouvernorat) » n'est jamais porté deux fois" 0 \
    "$(jq_ "len(d) - len({(c['name'], c['gouvernorat']) for c in d})")"
code "$API/communes?gouvernorat=Kasserine" -H "Authorization: Bearer $T_CIT" >/dev/null
chk "la seconde étape ne propose que les communes du gouvernorat choisi" "True|True|False" \
    "$(jq_ "all(c['gouvernorat']=='Kasserine' for c in d)")|$(jq_ "any(c['id']=='kasserine_ennour' for c in d)")|$(jq_ "any(c['id']=='sfax_ennour' for c in d)")"
CODE=$(code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d '{"communeId":"kasserine_ennour","adresse":"TEST adresse, Ennour de Kasserine"}')
code "$API/citoyen/adresse" -H "Authorization: Bearer $T_CIT" >/dev/null
chk "le choix manuel est enregistré : l'Ennour de Kasserine, pas celle de Sfax" "200|kasserine_ennour" "$CODE|$(jq_ "d['commune_id']")"

echo
echo "11. En partant, elle n'a touché qu'à ses citoyens et à sa commune de test (JC-005, JC-009)"
chk "le citoyen témoin garde sa commune, son adresse, sa position et son secteur" "$TEMOIN_AVANT" \
    "$(etat_citoyens "u.email = '$TEM_EMAIL'")"
nettoyer
chk "sa commune de test, ses deux citoyens et son directeur sont effacés" "0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id = '$COMMUNE'")|$(sql "SELECT count(*) FROM users WHERE email IN ($NOS_CITOYENS)")|$(sql "SELECT count(*) FROM users WHERE email = '$DIR_EMAIL'")"
chk "tous les autres citoyens de la base sont tels qu'elle les a trouvés" "$AUTRES_AVANT" \
    "$(etat_citoyens "u.email NOT IN ($NOS_CITOYENS)")"
communes_reelles_intactes "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
