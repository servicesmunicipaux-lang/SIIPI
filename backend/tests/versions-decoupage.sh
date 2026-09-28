#!/usr/bin/env bash
# =============================================================================
# Le découpage validé et versionné — Jalon 7, lot 2 (C2.5 validation FNCT,
# C2.6 historique et retour à la version précédente).
#
# LE TEST DE VALIDATION. Houmt Souk propose son périmètre et deux secteurs ;
# rien ne change avant la décision ; la FNCT refuse, motif à l'appui, puis
# valide la proposition corrigée ; la commune redessine ensuite ses secteurs
# (l'un retiré, un autre qui déborde) ; puis elle demande le retour à la
# version précédente, que la FNCT valide — et l'état d'avant revient,
# identifiants des secteurs et circuits rattachés compris. Enfin la FNCT
# restaure directement l'état initial.
#
#   docker compose exec -T api npm run test:versions-decoupage
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
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer ${4:-$T_HS}" \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}
# Un rectangle GeoJSON : rect x1 y1 x2 y2
rect() { echo "{\"type\":\"Polygon\",\"coordinates\":[[[$1,$2],[$3,$2],[$3,$4],[$1,$4],[$1,$2]]]}"; }
# Les secteurs vivants de la commune, en « nom=id » triés.
secteurs() { $PSQL -c "SELECT string_agg(name, ',' ORDER BY name) FROM zones_collecte WHERE commune_id='$COMMUNE' AND deleted_at IS NULL AND name LIKE 'TEST-J7%'" 2>/dev/null; }
id_secteur() { sql "SELECT id FROM zones_collecte WHERE commune_id='$COMMUNE' AND name='$1' ORDER BY created_at DESC LIMIT 1"; }

COMMUNE=medenine_djerba_houmt_souk
T_HS=$(tok directeur.houmtsouk@siipi.tn)
T_FNCT=$(tok admin.national@siipi.tn)
T_MIDOUN=$(tok directeur.midoun@siipi.tn)
[ -n "$T_HS" ] && [ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }

# L'état de départ, pour le rendre à la fin : le périmètre, les secteurs, les
# versions déjà présentes.
$PSQL -c "SELECT id FROM versions_decoupage WHERE commune_id='$COMMUNE'" > "$T/versions-avant" 2>/dev/null
PERIMETRE_AVANT=$(sql "SELECT COALESCE(ST_AsText(boundary_geom), 'aucun') FROM communes WHERE id='$COMMUNE'" | cut -c1-40)
SECTEURS_AVANT=$(sql "SELECT count(*) FROM zones_collecte WHERE commune_id='$COMMUNE' AND deleted_at IS NULL")

nettoyer() {
  $PSQL -c "DELETE FROM circuits WHERE nom LIKE 'TEST-J7%';" >/dev/null 2>&1
  $PSQL -c "UPDATE versions_decoupage SET statut='retiree' WHERE commune_id='$COMMUNE' AND statut='soumise';" >/dev/null 2>&1
}
nettoyer

P=$(rect 10.84 33.75 10.90 33.81)
NORD=$(rect 10.85 33.78 10.89 33.80)
SUD=$(rect 10.85 33.76 10.89 33.78)
# Les secteurs en vigueur au départ, gardés tels quels dans chaque proposition.
EXISTANTS=$(curl -s -H "Authorization: Bearer $T_HS" "$API/zones?communeId=$COMMUNE" | python3 -c "
import sys,json
print(','.join(json.dumps({'id':z['id'],'name':z['name'],'geometry':z['geometry']}) for z in json.load(sys.stdin)))")
virgule() { [ -n "$EXISTANTS" ] && echo "$EXISTANTS,"; }

# -----------------------------------------------------------------------------
echo
echo "1. La commune ne modifie plus son découpage directement"
chk "créer un secteur : refusé" 403 \
    "$(req POST /zones "{\"communeId\":\"$COMMUNE\",\"name\":\"TEST-J7 direct\",\"geometry\":$NORD}")"
chk "et la raison renvoie à la proposition" 1 "$(val "1 if 'proposition' in d['error'] else 0")"
ZONE_EXISTANTE=$(sql "SELECT id FROM zones_collecte WHERE commune_id='$COMMUNE' AND deleted_at IS NULL LIMIT 1")
if [ -n "$ZONE_EXISTANTE" ]; then
  chk "renommer ou redessiner un secteur : refusé" "403|403" \
      "$(req PATCH "/zones/$ZONE_EXISTANTE" '{"name":"TEST-J7 renommé"}')|$(req PATCH "/zones/$ZONE_EXISTANTE" "{\"geometry\":$NORD}")"
  COULEUR=$(sql "SELECT color FROM zones_collecte WHERE id='$ZONE_EXISTANTE'")
  chk "changer sa couleur de service : permis" 200 "$(req PATCH "/zones/$ZONE_EXISTANTE" '{"color":"#123456"}')"
  req PATCH "/zones/$ZONE_EXISTANTE" "{\"color\":\"$COULEUR\"}" >/dev/null
  chk "le retirer : refusé" 403 "$(req DELETE "/zones/$ZONE_EXISTANTE")"
fi

echo
echo "2. La proposition"
chk "une proposition vide est refusée" 400 "$(req POST "/decoupage/propositions" '{"note":"rien"}')"
chk "un secteur hors de Tunisie est refusé" 400 \
    "$(req POST "/decoupage/propositions" "{\"zones\":[{\"name\":\"TEST-J7 Paris\",\"geometry\":$(rect 2.30 48.80 2.40 48.90)}]}")"
chk "un secteur d'une autre commune ne se propose pas" 400 \
    "$(req POST "/decoupage/propositions" "{\"zones\":[{\"id\":\"$(sql "SELECT id FROM zones_collecte WHERE commune_id<>'$COMMUNE' LIMIT 1")\",\"name\":\"TEST-J7 volé\",\"geometry\":$NORD}]}")"
PROPOSITION="{\"perimetre\":$P,\"zones\":[$(virgule){\"name\":\"TEST-J7 Nord\",\"color\":\"#16a34a\",\"geometry\":$NORD},{\"name\":\"TEST-J7 Sud\",\"geometry\":$SUD}],\"note\":\"TEST-J7 deux secteurs\"}"
chk "Houmt Souk propose son périmètre et deux secteurs" "201|soumise|None" \
    "$(req POST "/decoupage/propositions" "$PROPOSITION")|$(val "d['statut']")|$(val "d['numero']")"
V1=$(val "d['id']")
chk "une seconde proposition attend la décision de la première" 409 "$(req POST "/decoupage/propositions" "$PROPOSITION")"
chk "rien ne change avant la décision" "|$SECTEURS_AVANT" \
    "$(secteurs)|$(sql "SELECT count(*) FROM zones_collecte WHERE commune_id='$COMMUNE' AND deleted_at IS NULL")"
# Les avertissements sont comptés sur les seuls secteurs de l'essai : ceux
# déjà en place à Houmt Souk peuvent déborder du rectangle d'essai.
chk "la FNCT voit l'écart : deux secteurs ajoutés, périmètre changé, rien à redire des nôtres" "200|2|0|True|0" \
    "$(req GET "/decoupage/versions/$V1" "" "$T_FNCT")|$(val "len(d['ajoutes'])")|$(val "len(d['retires'])")|$(val "d['perimetre_change']")|$(val "sum('TEST-J7' in a for a in d['avertissements'])")"
chk "elle la trouve dans sa liste à instruire" 1 \
    "$(req GET "/decoupage/versions?statut=soumise" "" "$T_FNCT" >/dev/null; val "sum(1 for v in d if v['id']=='$V1')")"

echo
echo "3. Seule la FNCT décide"
chk "la commune ne valide pas sa propre proposition" 403 "$(req POST "/decoupage/versions/$V1/valider")"
chk "même en SQL direct" 1 \
    "$($PSQL 2>&1 <<EOF | grep -c VALIDATION_RESERVEE_FNCT
BEGIN;
SELECT set_config('app.role','admin_commune',true), set_config('app.commune_id','$COMMUNE',true),
       set_config('app.user_id',(SELECT id::text FROM users WHERE email='directeur.houmtsouk@siipi.tn'),true);
SET LOCAL ROLE siipi_app;
SELECT app.valider_version_decoupage('$V1');
ROLLBACK;
EOF
)"
chk "un refus sans motif est refusé" 400 "$(req POST "/decoupage/versions/$V1/refuser" '{"motif":""}' "$T_FNCT")"
chk "la FNCT refuse, motif à l'appui" "200|refusee" \
    "$(req POST "/decoupage/versions/$V1/refuser" '{"motif":"TEST-J7 Le secteur Sud doit suivre la route de Midoun."}' "$T_FNCT")|$(val "d['statut']")"
chk "la commune lit le motif" 1 "$(req GET "/decoupage/versions/$V1" >/dev/null; val "1 if 'route de Midoun' in d['motif_refus'] else 0")"
chk "une décision ne se prend qu'une fois" 409 "$(req POST "/decoupage/versions/$V1/valider" "" "$T_FNCT")"

req POST "/decoupage/propositions" "$PROPOSITION" >/dev/null
V2=$(val "d['id']")
chk "la proposition corrigée est validée" "200|validee|True" \
    "$(req POST "/decoupage/versions/$V2/valider" "" "$T_FNCT")|$(val "d['statut']")|$(val "d['en_vigueur']")"
N2=$(val "d['numero']")
chk "le découpage en vigueur a changé" "TEST-J7 Nord,TEST-J7 Sud" "$(secteurs)"
chk "le périmètre aussi (≈ 37 km²)" 1 \
    "$(sql "SELECT (area_km2 BETWEEN 34 AND 40)::int FROM communes WHERE id='$COMMUNE'")"
chk "l'état d'avant a été figé en version initiale" 1 \
    "$(sql "SELECT count(*) FROM versions_decoupage WHERE commune_id='$COMMUNE' AND origine='initiale' AND statut='validee'")"
ID_SUD=$(id_secteur 'TEST-J7 Sud')
req POST /circuits "{\"communeId\":\"$COMMUNE\",\"nom\":\"TEST-J7 circuit Sud\",\"zoneId\":\"$ID_SUD\",\"joursPassage\":[1]}" >/dev/null

echo
echo "4. Un redécoupage : le Sud retiré, le Nord agrandi, un secteur qui déborde"
ID_NORD=$(id_secteur 'TEST-J7 Nord')
req POST "/decoupage/propositions" "{\"zones\":[$(virgule){\"id\":\"$ID_NORD\",\"name\":\"TEST-J7 Nord\",\"geometry\":$(rect 10.85 33.77 10.89 33.80)},{\"name\":\"TEST-J7 Hors\",\"geometry\":$(rect 10.88 33.79 10.95 33.81)}]}" >/dev/null
V3=$(val "d['id']")
chk "l'écart : un ajouté, un modifié, un retiré" "1|1|1" \
    "$(req GET "/decoupage/versions/$V3" "" "$T_FNCT" >/dev/null; val "len(d['ajoutes'])")|$(val "len(d['modifies'])")|$(val "len(d['retires'])")"
chk "et deux avertissements : « Hors » déborde, et chevauche le Nord" "1|1" \
    "$(val "sum('« TEST-J7 Hors » déborde' in a for a in d['avertissements'])")|$(val "sum('TEST-J7 Hors' in a and 'TEST-J7 Nord' in a and 'chevauchent' in a for a in d['avertissements'])")"
req POST "/decoupage/versions/$V3/valider" "" "$T_FNCT" >/dev/null
chk "validé : le Sud n'est plus en vigueur" "TEST-J7 Hors,TEST-J7 Nord" "$(secteurs)"
chk "mais il n'est pas effacé, et son circuit le désigne encore" "1|$ID_SUD" \
    "$(sql "SELECT count(*) FROM zones_collecte WHERE id='$ID_SUD'")|$(sql "SELECT zone_id FROM circuits WHERE nom='TEST-J7 circuit Sud'")"

echo
echo "5. LE RETOUR À LA VERSION PRÉCÉDENTE"
chk "restaurer la version en vigueur n'a pas de sens" 400 "$(req POST "/decoupage/versions/$V3/restaurer" '{}')"
chk "la commune demande le retour à la version $N2" "201|soumise|restauration|$N2" \
    "$(req POST "/decoupage/versions/$V2/restaurer" '{"note":"TEST-J7 retour"}')|$(val "d['statut']")|$(val "d['origine']")|$(val "d['restaure_de_numero']")"
V4=$(val "d['id']")
chk "la FNCT valide la restauration" "200|validee|True" \
    "$(req POST "/decoupage/versions/$V4/valider" "" "$T_FNCT")|$(val "d['statut']")|$(val "d['en_vigueur']")"
chk "l'état d'avant est revenu" "TEST-J7 Nord,TEST-J7 Sud" "$(secteurs)"
chk "le Sud revient sous son identifiant : son circuit le retrouve" "$ID_SUD|1" \
    "$(id_secteur 'TEST-J7 Sud')|$(sql "SELECT count(*) FROM circuits c JOIN zones_collecte z ON z.id=c.zone_id AND z.deleted_at IS NULL WHERE c.nom='TEST-J7 circuit Sud'")"
chk "le Nord reprend son tracé d'alors" 1 \
    "$(sql "SELECT ST_Equals(geom, ST_Multi(ST_GeomFromGeoJSON('$NORD'))) FROM zones_collecte WHERE id='$ID_NORD'" | sed 's/t/1/;s/f/0/')"
chk "l'historique ne s'est pas réécrit : la version $N2 reste, la restauration est une version nouvelle" "validee|False|True" \
    "$(req GET "/decoupage/versions/$V2" >/dev/null; val "d['statut']")|$(val "d['en_vigueur']")|$(req GET "/decoupage/versions/$V4" >/dev/null; val "d['numero'] > $N2")"

echo
echo "6. La FNCT restaure directement l'état initial"
V_INIT=$(sql "SELECT id FROM versions_decoupage WHERE commune_id='$COMMUNE' AND origine='initiale' LIMIT 1")
chk "appliquée aussitôt" "201|validee|True" \
    "$(req POST "/decoupage/versions/$V_INIT/restaurer" '{}' "$T_FNCT")|$(val "d['statut']")|$(val "d['directe']")"
chk "les secteurs de l'essai sont retirés, ceux de départ sont là" "|$SECTEURS_AVANT" \
    "$(secteurs)|$(sql "SELECT count(*) FROM zones_collecte WHERE commune_id='$COMMUNE' AND deleted_at IS NULL")"
chk "le périmètre de départ aussi" "$PERIMETRE_AVANT" \
    "$(sql "SELECT COALESCE(ST_AsText(boundary_geom), 'aucun') FROM communes WHERE id='$COMMUNE'" | cut -c1-40)"
chk "une correction directe de la FNCT entre aussi dans l'historique" "201|1" \
    "$(req POST /zones "{\"communeId\":\"$COMMUNE\",\"name\":\"TEST-J7 FNCT\",\"geometry\":$NORD}" "$T_FNCT")|$(sql "SELECT count(*) FROM versions_decoupage WHERE commune_id='$COMMUNE' AND origine='correction_fnct' AND zones::text LIKE '%TEST-J7 FNCT%'")"
req DELETE "/zones/$(val "d['id']")" "" "$T_FNCT" >/dev/null

echo
echo "7. Cloisonnement"
req POST "/decoupage/propositions" "{\"zones\":[$(virgule){\"name\":\"TEST-J7 attente\",\"geometry\":$NORD}]}" >/dev/null
V5=$(val "d['id']")
chk "une autre commune ne voit pas ces versions" "404|0" \
    "$(req GET "/decoupage/versions/$V5" "" "$T_MIDOUN")|$(req GET "/decoupage/versions?communeId=$COMMUNE" "" "$T_MIDOUN" >/dev/null; val "sum(1 for v in d if v['commune_id']=='$COMMUNE')")"
chk "ni ne retire leur proposition" 404 "$(req POST "/decoupage/versions/$V5/retirer" "" "$T_MIDOUN")"
PREST=$(tok prestataire.houmtsouk@siipi.tn)
[ -n "$PREST" ] && chk "un prestataire ne voit ni propositions ni historique" 403 "$(req GET "/decoupage/versions?communeId=$COMMUNE" "" "$PREST")"
chk "la commune retire sa proposition" "200|retiree" "$(req POST "/decoupage/versions/$V5/retirer")|$(val "d['statut']")"
chk "une version validée ne se retire pas" 409 "$(req POST "/decoupage/versions/$V2/retirer")"

# Rendre la base comme on l'a trouvée : les secteurs de l'essai et ses versions.
nettoyer
$PSQL -c "DELETE FROM versions_decoupage WHERE commune_id='$COMMUNE' AND id::text NOT IN (SELECT unnest(string_to_array('$(tr '\n' ',' < "$T/versions-avant")', ',')));" >/dev/null 2>&1
$PSQL -c "DELETE FROM zones_collecte WHERE commune_id='$COMMUNE' AND name LIKE 'TEST-J7%';" >/dev/null 2>&1

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
