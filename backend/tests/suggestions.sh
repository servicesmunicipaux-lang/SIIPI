#!/usr/bin/env bash
# =============================================================================
# Points de collecte proposés par les citoyens — TDR M3.1 / sous-module 5.5.2.
#
# CE QUE CETTE CAMPAGNE VÉRIFIE VRAIMENT. Pas qu'une proposition s'enregistre :
# qu'elle se TERMINE. Une demande qui reste « en attente » indéfiniment est
# pire qu'un formulaire absent — elle a coûté à quelqu'un le temps de sortir
# son téléphone et de photographier sa rue. Les vérifications portent donc sur
# les trois sorties : retenue, refusée avec motif lisible, ou visible du
# citoyen tant qu'elle attend.
#
#   docker compose exec -T api npm run test:suggestions
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
code() { curl -s -o "$T/r.json" -w '%{http_code}' "$@"; }
val()  { python3 -c "import json;print(json.load(open('$T/r.json'))$1)" 2>/dev/null || echo erreur; }
nb()   { python3 -c "import json;print(len(json.load(open('$T/r.json'))))" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")

CIT_EMAIL=$(sql "SELECT u.email FROM users u JOIN citoyens c ON c.user_id=u.id WHERE u.role='citoyen' AND u.commune_id='$COMMUNE' AND u.deleted_at IS NULL AND u.is_active ORDER BY u.created_at LIMIT 1")
if [ -z "$CIT_EMAIL" ]; then
  echo "Aucun compte citoyen sur $COMMUNE — campagne sans objet." >&2
  exit 0
fi
T_CIT=$(tok "$CIT_EMAIL")
CIT_ID=$(sql "SELECT c.id FROM users u JOIN citoyens c ON c.user_id=u.id WHERE u.email='$CIT_EMAIL'")

nettoyer() {
  $PSQL -c "DELETE FROM points_collecte WHERE observation LIKE '%TEST-SUG%' OR nom LIKE 'TEST-SUG%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM points_suggeres WHERE nom LIKE 'TEST-SUG%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM circuits WHERE nom = 'TEST-SUG circuit';" >/dev/null 2>&1
}
nettoyer

# Un circuit à soi, avec trois arrêts alignés d'ouest en est. Travailler sur un
# circuit réel abîmerait le jeu de Dar Chaabane à chaque passage — le défaut
# n° 6 du journal, qu'on ne refait pas.
CIRCUIT=$(sql "INSERT INTO circuits (commune_id, nom, actif, jours_passage)
                VALUES ('$COMMUNE','TEST-SUG circuit', true, ARRAY[1]::smallint[]) RETURNING id")
$PSQL -c "INSERT INTO points_collecte (circuit_id, commune_id, voyage, ordre, nom, geom, source) VALUES
   ('$CIRCUIT','$COMMUNE',1,1,'TEST-SUG ouest',  ST_SetSRID(ST_MakePoint(10.7300, 36.4560),4326),'saisie'),
   ('$CIRCUIT','$COMMUNE',1,2,'TEST-SUG centre', ST_SetSRID(ST_MakePoint(10.7400, 36.4560),4326),'saisie'),
   ('$CIRCUIT','$COMMUNE',1,3,'TEST-SUG est',    ST_SetSRID(ST_MakePoint(10.7500, 36.4560),4326),'saisie');" >/dev/null 2>&1

# -----------------------------------------------------------------------------
echo
echo "1. Le citoyen propose"
CODE=$(code -X POST -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"nom\":\"TEST-SUG en face de l'école\",\"lat\":36.4560,\"lng\":10.7402,\"precisionM\":8}" \
  "$API/citoyen/points-suggeres")
chk "la proposition est enregistrée" 201 "$CODE"
SUG=$(val "['id']")
chk "elle naît « en attente »" "en_attente" "$(val "['statut']")"
# Le chiffre qui fait tout le travail : le citoyen ne voit pas la tournée, il
# ne peut pas savoir qu'un arrêt existe à dix-huit mètres.
chk "la distance au point voisin est calculée" 1 \
    "$(python3 -c "
import json
d=json.load(open('$T/r.json'))
print(1 if d.get('voisin_distance_m') is not None and float(d['voisin_distance_m']) < 40 else 0)" 2>/dev/null || echo erreur)"
chk "et le voisin est nommé" "TEST-SUG centre" "$(val "['voisin_nom']")"

echo
echo "2. Chacun voit ce qui le regarde"
chk "le citoyen retrouve sa proposition" 200 \
    "$(code -H "Authorization: Bearer $T_CIT" "$API/citoyen/points-suggeres")"
chk "elle figure bien dans sa liste" 1 \
    "$(python3 -c "
import json
print(sum(1 for x in json.load(open('$T/r.json')) if x['id']=='$SUG'))" 2>/dev/null || echo erreur)"
chk "la commune la voit à instruire" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/points-suggeres?communeId=$COMMUNE&statut=en_attente")"
chk "elle y figure" 1 \
    "$(python3 -c "
import json
print(sum(1 for x in json.load(open('$T/r.json')) if x['id']=='$SUG'))" 2>/dev/null || echo erreur)"
chk "un citoyen ne peut pas ouvrir la liste de la commune" 403 \
    "$(code -H "Authorization: Bearer $T_CIT" "$API/points-suggeres?communeId=$COMMUNE")"

echo
echo "3. Le refus exige un motif"
SUG2=$(sql "INSERT INTO points_suggeres (commune_id, citoyen_id, nom, geom)
            VALUES ('$COMMUNE','$CIT_ID','TEST-SUG à refuser', ST_SetSRID(ST_MakePoint(10.7301,36.4561),4326))
            RETURNING id")
chk "un refus sans motif est rejeté" 400 \
    "$(code -X PATCH -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d '{"motif":""}' "$API/points-suggeres/$SUG2/refuser")"
chk "un refus motivé passe" 200 \
    "$(code -X PATCH -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d '{"motif":"Un conteneur est déjà posé à quinze mètres."}' "$API/points-suggeres/$SUG2/refuser")"
chk "et le motif est lisible par son auteur" 1 \
    "$(code -H "Authorization: Bearer $T_CIT" "$API/citoyen/points-suggeres" >/dev/null; python3 -c "
import json
print(sum(1 for x in json.load(open('$T/r.json'))
          if x['id']=='$SUG2' and (x.get('motif_refus') or '').startswith('Un conteneur')))" 2>/dev/null || echo erreur)"
chk "une proposition déjà instruite ne se refuse pas deux fois" 409 \
    "$(code -X PATCH -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d '{"motif":"Encore un motif."}' "$API/points-suggeres/$SUG2/refuser")"

echo
echo "4. La validation crée un arrêt, à un rang déduit"
CODE=$(code -X PATCH -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"circuitId\":\"$CIRCUIT\"}" "$API/points-suggeres/$SUG/valider")
chk "la proposition est retenue" 200 "$CODE"
chk "elle passe à « valide »" "valide" "$(val "['statut']")"
POINT=$(val "['point_collecte_id']")
chk "et désigne le point créé" 1 "$(python3 -c "print(1 if '$POINT' not in ('None','erreur','') else 0)")"
# Le point proposé est à 10.7402, juste à l'est du centre (rang 2) : il doit
# s'insérer au rang 3, DERRIÈRE son voisin — et non en queue de tournée, ce qui
# prétendrait que le camion y passe en dernier.
chk "le rang est déduit du voisin le plus proche" 3 \
    "$(sql "SELECT ordre FROM points_collecte WHERE id='$POINT'")"
chk "et la déduction est signalée à la réponse" "True" "$(val "['ordreDeduit']")"
chk "elle est aussi écrite sur l'arrêt" 1 \
    "$(sql "SELECT count(*) FROM points_collecte WHERE id='$POINT' AND observation LIKE '%à confirmer%'")"
# La provenance : un arrêt proposé par un habitant n'a pas la même valeur de
# preuve qu'un relevé GPS du service.
chk "la provenance est inscrite" "suggestion_citoyen" \
    "$(sql "SELECT source FROM points_collecte WHERE id='$POINT'")"
chk "les arrêts suivants ont été décalés" 4 \
    "$(sql "SELECT ordre FROM points_collecte WHERE circuit_id='$CIRCUIT' AND nom='TEST-SUG est' AND deleted_at IS NULL")"
chk "aucun rang n'est en double" 0 \
    "$(sql "SELECT count(*) FROM (SELECT ordre FROM points_collecte WHERE circuit_id='$CIRCUIT' AND voyage=1 AND deleted_at IS NULL GROUP BY ordre HAVING count(*)>1) x")"
chk "valider deux fois est refusé" 409 \
    "$(code -X PATCH -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"circuitId\":\"$CIRCUIT\"}" "$API/points-suggeres/$SUG/valider")"
chk "le citoyen voit que sa proposition a abouti" 1 \
    "$(code -H "Authorization: Bearer $T_CIT" "$API/citoyen/points-suggeres" >/dev/null; python3 -c "
import json
print(sum(1 for x in json.load(open('$T/r.json')) if x['id']=='$SUG' and x['statut']=='valide'))" 2>/dev/null || echo erreur)"

echo
echo "5. Cloisonnement"
AUTRE=$(sql "SELECT id FROM communes WHERE id <> '$COMMUNE' ORDER BY id LIMIT 1")
AUTRE_CIRCUIT=''
[ -n "$AUTRE" ] && AUTRE_CIRCUIT=$(sql "SELECT id FROM circuits WHERE commune_id='$AUTRE' AND deleted_at IS NULL LIMIT 1")
if [ -n "$AUTRE_CIRCUIT" ]; then
  SUG3=$(sql "INSERT INTO points_suggeres (commune_id, citoyen_id, nom, geom)
              VALUES ('$COMMUNE','$CIT_ID','TEST-SUG hors commune', ST_SetSRID(ST_MakePoint(10.73,36.45),4326))
              RETURNING id")
  # Rattacher une proposition au circuit d'une autre commune créerait un arrêt
  # que personne ne dessert, dans une tournée qui ne le connaît pas.
  chk "un circuit d'une autre commune est refusé" 400 \
      "$(code -X PATCH -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
         -d "{\"circuitId\":\"$AUTRE_CIRCUIT\"}" "$API/points-suggeres/$SUG3/valider")"
fi
chk "un identifiant inconnu rend 404" 404 \
    "$(code -X PATCH -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d '{"motif":"peu importe"}' "$API/points-suggeres/00000000-0000-0000-0000-000000000000/refuser")"
chk "sans jeton, rien" 401 "$(code "$API/points-suggeres?communeId=$COMMUNE")"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
