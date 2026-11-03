#!/usr/bin/env bash
# =============================================================================
# v0.15.88 — un contrat échu ne donne plus ses circuits (migration 096).
# Suite de la v0.15.87, relevée par sa relecture adversariale.
#
# Un circuit confié à un prestataire (circuits.prestataire_id) — un prestataire
# rattaché en second par un contrat, depuis la migration 022 — lui restait
# acquis après la fin du contrat : il lisait le circuit, ses points, ses constats
# et ses déclarations, en déclarait de nouveaux passages, et le retrouvait dans la
# confrontation et la performance. L'auteur d'un incident, lui, le lisait et le
# modifiait sans condition de périmètre.
#
# Elle commence par ce qui doit être refusé, contrat échu hier à Tunis :
#   - par l'API, déclarer un passage sur le circuit (introuvable) ;
#   - en base, sous le rôle de l'application : le circuit, ses points, ses
#     constats, ses déclarations, l'incident déclaré par le prestataire, et ses
#     lignes de confrontation et de performance ; écrire une déclaration, modifier
#     l'incident.
# Puis le témoin, contrat en cours : tout cela lui est rendu. Enfin la commune,
# qui ne perd rien. Aucune ligne d'une commune réelle ne bouge.
#
# Et trois voies voisines, relevées par la relecture du lot : un incident rangé
# sous une autre commune que celle de son circuit (il s'affichait dans la
# confrontation de l'ancienne commune) ; la performance d'un prestataire qui
# additionnait ses réclamations de toutes ses communes ; le déposant d'un
# fichier qui le relisait hors de son périmètre.
#
#   docker compose exec -T api npm run test:circuits-fin-de-contrat
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_finctr_a
B=test_finctr_b
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
appel() { # méthode chemin jeton [corps] — code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" ${3:+-H "Authorization: Bearer $3"} \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}
contrat() { # [date_debut] [date_fin] — le contrat du prestataire avec A
  $PSQL -c "DELETE FROM utilisateur_communes WHERE user_id = '$PRE' AND commune_id = '$A';
            INSERT INTO utilisateur_communes (user_id, commune_id, contrat_reference, date_debut, date_fin)
            VALUES ('$PRE', '$A', 'TEST-CONTRAT-0002', ${1:-NULL}, ${2:-NULL});" >/dev/null
}
# Ce qu'un compte voit en base, sous le rôle de l'application : une valeur par
# objet, séparées par « | ».
vu() { # rôle commune utilisateur
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.commune_id', '$2', true), set_config('app.user_id', '$3', true);
            SET LOCAL ROLE siipi_app;
            SELECT 'vu:' || concat_ws('|',
              (SELECT count(*) FROM circuits WHERE id = '$C'),
              (SELECT count(*) FROM points_collecte WHERE circuit_id = '$C'),
              (SELECT count(*) FROM controles_terrain WHERE circuit_id = '$C'),
              (SELECT count(*) FROM declarations_passage WHERE circuit_id = '$C'),
              (SELECT count(*) FROM incidents WHERE id = '$I'),
              (SELECT (count(*) > 0)::int FROM app.confrontation_passages('$A', app.jour_tunis() - 7, app.jour_tunis()) WHERE circuit_id = '$C'),
              (SELECT (count(*) > 0)::int FROM app.performance_prestataires('$A', app.jour_tunis() - 7, app.jour_tunis()) WHERE prestataire_id = '$PRE'));
            ROLLBACK;" 2>&1 | grep -oE '^vu:.*' | cut -d: -f2
}
ecrit_pre() { # instruction SQL — lignes écrites par le prestataire, sous le rôle de l'application
  $PSQL -c "BEGIN; SELECT set_config('app.role', 'gestionnaire_prestataire', true), set_config('app.commune_id', '$B', true), set_config('app.user_id', '$PRE', true);
            SET LOCAL ROLE siipi_app;
            WITH e AS ($1 RETURNING 1) SELECT 'ecrit:' || count(*) FROM e; ROLLBACK;" 2>&1 | grep -oE '^ecrit:[0-9]+|permission denied|violates row-level security' | head -1 | sed 's/^ecrit://'
}

nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
  rm -rf "$T"
}
effacer_communes_essai "$ESSAI"
trap nettoyer EXIT
releve_base_reelle

# --- Le terrain : deux communes, un prestataire de B sous contrat avec A, un
# circuit de A qui lui est confié, avec un point, un constat, une déclaration
# et un incident.
commune_essai "$A" "TEST commune A de la fin de contrat"
commune_essai "$B" "TEST commune B de la fin de contrat"
compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); DIR_A=$COMPTE_ID
compte_temporaire admin_commune "$B" "Directeur B"; DIR_B=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$B" "Prestataire sous contrat"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); PRE=$COMPTE_ID
[ -n "$T_A" ] && [ -n "$T_P" ] || { echo "API injoignable sur $API, ou comptes non connectés." >&2; exit 1; }
HIER="(app.jour_tunis() - 1)"
C=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage, actif, date_debut, prestataire_id)
         VALUES ('$A', 'TEST circuit confié', ARRAY[1,2,3,4,5,6,7]::smallint[], true, app.jour_tunis() - 10, '$PRE') RETURNING id" | head -1)
$PSQL -c "INSERT INTO points_collecte (circuit_id, commune_id, ordre, nom, type, geom)
            VALUES ('$C', '$A', 1, 'TEST point', 'point_de_collecte', ST_SetSRID(ST_MakePoint(10.0, 36.0), 4326));
          INSERT INTO controles_terrain (circuit_id, commune_id, date_controle, etat) VALUES ('$C', '$A', $HIER, 'fait');
          INSERT INTO declarations_passage (circuit_id, commune_id, date_passage, statut, declare_par)
            VALUES ('$C', '$A', $HIER, 'effectue', '$PRE');" >/dev/null
I=$(sql "INSERT INTO incidents (commune_id, circuit_id, date_incident, type, declare_par) VALUES ('$A', '$C', $HIER, 'acces_bloque', '$PRE') RETURNING id" | head -1)
# Le prestataire a aussi un circuit dans sa commune principale B, et une
# réclamation de A lui a été transférée : sa performance a une ligne par commune.
CB=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage, actif, date_debut, prestataire_id)
          VALUES ('$B', 'TEST circuit de B', ARRAY[1,2,3,4,5,6,7]::smallint[], true, app.jour_tunis() - 10, '$PRE') RETURNING id" | head -1)
$PSQL -c "INSERT INTO tickets (ticket_number, commune_id, category, title, status, assigned_prestataire_id)
            VALUES ('TEST-FINCTR-$$', '$A', 'point_noir', 'TEST réclamation de A', 'assigne', '$PRE');
          INSERT INTO fichiers (commune_id, nom_original, type_mime, taille_octets, sha256, chemin_relatif, televerse_par)
            VALUES ('$A', 'TEST.jpg', 'image/jpeg', 1, repeat('0', 64), 'test/finctr-$$.jpg', '$DIR_B');" >/dev/null
[ -n "$C" ] && [ -n "$I" ] && [ -n "$CB" ] || { echo "Impossible de poser les circuits ou l'incident de test." >&2; exit 1; }
AUJOURDHUI=$(sql "SELECT app.jour_tunis()")
# La date est donnée : le passage du jour ne doit jamais tomber sur celui d'hier.
DECLARER="{\"circuitId\":\"$C\",\"statut\":\"effectue\",\"datePassage\":\"$AUJOURDHUI\"}"
INCIDENT_SOUS_B="{\"communeId\":\"$B\",\"circuitId\":\"$C\",\"type\":\"acces_bloque\"}"
INCIDENT_SOUS_A="{\"communeId\":\"$A\",\"circuitId\":\"$C\",\"type\":\"acces_bloque\"}"
# Les réclamations transférées que la performance attribue au prestataire, ligne
# de la commune $1, lue par le compte $2 (rôle $3, commune principale $4).
reclamations_de() {
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$3', true), set_config('app.commune_id', '$4', true), set_config('app.user_id', '$2', true);
            SET LOCAL ROLE siipi_app;
            SELECT 'n:' || coalesce((SELECT reclamations_transferees FROM app.performance_prestataires('$1', app.jour_tunis() - 7, app.jour_tunis())
                                       WHERE prestataire_id = '$PRE' AND commune_id = '$1')::text, 'aucune ligne');
            ROLLBACK;" 2>&1 | grep -oE '^n:.*' | cut -d: -f2
}
fichier_vu() { # utilisateur commune principale
  $PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.commune_id', '$2', true), set_config('app.user_id', '$1', true);
            SET LOCAL ROLE siipi_app; SELECT 'n:' || count(*) FROM fichiers WHERE chemin_relatif = 'test/finctr-$$.jpg'; ROLLBACK;" 2>&1 | grep -oE '^n:[0-9]+' | cut -d: -f2
}

echo "1. Contrat échu hier à Tunis : plus rien"
contrat NULL "$HIER"
chk "déclarer un passage sur le circuit : introuvable (404)" 404 "$(appel POST /passages "$T_P" "$DECLARER")"
chk "en base : ni le circuit, ni ses points, constats, déclarations, ni son incident, ni ses lignes de confrontation ou de performance" \
    "0|0|0|0|0|0|0" "$(vu gestionnaire_prestataire "$B" "$PRE")"
chk "en base : il n'écrit pas de déclaration sur le circuit (refus de la RLS)" "violates row-level security" \
    "$(ecrit_pre "INSERT INTO declarations_passage (circuit_id, commune_id, date_passage, statut, declare_par) VALUES ('$C', '$A', app.jour_tunis(), 'effectue', '$PRE')")"
chk "en base : il ne modifie pas l'incident qu'il avait déclaré" 0 \
    "$(ecrit_pre "UPDATE incidents SET description = 'TEST réécrit' WHERE id = '$I'")"
chk "… et rien n'a bougé : une seule déclaration, l'incident sans description" "1|" \
    "$(sql "SELECT count(*) FROM declarations_passage WHERE circuit_id = '$C'")|$(sql "SELECT description FROM incidents WHERE id = '$I'")"
chk "un incident sur le circuit de A rangé sous sa commune principale B : introuvable par l'API (404)" 404 \
    "$(appel POST /passages/incidents "$T_P" "$INCIDENT_SOUS_B")"
chk "… et refusé en base (le circuit n'est ni visible ni de la commune de l'incident)" "violates row-level security" \
    "$(ecrit_pre "INSERT INTO incidents (commune_id, circuit_id, type, declare_par) VALUES ('$B', '$C', 'acces_bloque', '$PRE')")"
chk "… aucun incident n'a été écrit" 1 "$(sql "SELECT count(*) FROM incidents WHERE circuit_id = '$C'")"
contrat "(app.jour_tunis() + 1)"
chk "un contrat qui ne commence que demain : rien non plus" "0|0|0|0|0|0|0" "$(vu gestionnaire_prestataire "$B" "$PRE")"

echo
echo "2. Contrat en cours (témoin)"
contrat
chk "en base : tout lui est rendu" "1|1|1|1|1|1|1" "$(vu gestionnaire_prestataire "$B" "$PRE")"
chk "il déclare un passage sur le circuit" 201 "$(appel POST /passages "$T_P" "$DECLARER")"
chk "il modifie l'incident qu'il a déclaré (en base)" 1 "$(ecrit_pre "UPDATE incidents SET description = 'TEST précisé' WHERE id = '$I'")"
chk "un incident sur le circuit de A rangé sous B : refusé, avec ce qu'il faut corriger (400)" "400|1" \
    "$(appel POST /passages/incidents "$T_P" "$INCIDENT_SOUS_B")|$(grep -c 'commune du circuit' "$T/r.json")"
chk "le même incident, dans la commune du circuit : accepté" 201 "$(appel POST /passages/incidents "$T_P" "$INCIDENT_SOUS_A")"
chk "sa performance : la réclamation de A compte dans sa ligne de A, jamais dans celle de B (directeur de B)" "1|0" \
    "$(reclamations_de "$A" "$DIR_A" admin_commune "$A")|$(reclamations_de "$B" "$DIR_B" admin_commune "$B")"

echo
echo "3. La commune ne perd rien"
contrat NULL "$HIER"
chk "contrat échu : le directeur de A voit toujours tout" "1|1|1|2|1|1|1" "$(vu admin_commune "$A" "$DIR_A")"


echo
echo "4. Les gardes d'écriture et le déposant d'un fichier"
chk "incidents_update porte la condition de périmètre dans USING et WITH CHECK, et la cohérence du circuit ; incidents_insert aussi" "t|t|t|t" \
    "$(sql "SELECT qual ~ 'mes_communes' FROM pg_policies WHERE policyname = 'incidents_update'")|$(sql "SELECT with_check ~ 'mes_communes' AND with_check ~ 'circuits' FROM pg_policies WHERE policyname = 'incidents_update'")|$(sql "SELECT with_check ~ 'circuits' FROM pg_policies WHERE policyname = 'incidents_insert'")|$(sql "SELECT prosrc ~ 'x.commune_id = a.commune_id' FROM pg_proc WHERE proname = 'confrontation_passages'")"
chk "un directeur ne relit pas le fichier qu'il a déposé dans une commune qui n'est pas la sienne" 0 "$(fichier_vu "$DIR_B" "$B")"
$PSQL -c "INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$DIR_B', '$A');" >/dev/null
chk "… il le relit tant qu'il y est rattaché (témoin)" 1 "$(fichier_vu "$DIR_B" "$B")"

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
