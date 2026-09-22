#!/usr/bin/env bash
# =============================================================================
# Module 2 — Gestion des circuits. Tests sur les données réelles de
# Dar Chaabane El Fehri (registre communal 2024 + relevés GPS de mai 2024).
#
# Les deux vérifications explicitement demandées au cahier des charges ouvrent
# la campagne, parce qu'elles portent sur des défauts déjà constatés en
# production :
#   1. un circuit créé aujourd'hui n'affiche aucun passage manquant antérieur
#      à sa date de début ;
#   2. un circuit en régie n'apparaît pas dans la vue d'un prestataire.
#
# Suivent les règles propres au module : voyages, points de collecte, import.
#
#   docker compose run --rm api npm run test:module2
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Siipi2026!\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
code() { curl -s -o /tmp/siipi_m2.json -w '%{http_code}' "$@"; }
val()  { python3 -c "import json;print(json.load(open('/tmp/siipi_m2.json'))$1)" 2>/dev/null || echo erreur; }
len()  { python3 -c "import json;d=json.load(open('/tmp/siipi_m2.json'));print(len(d) if isinstance(d,list) else 'non-liste')" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

COMMUNE=$(sql "SELECT id FROM communes WHERE name ILIKE '%Chaâbane%' OR name ILIKE '%Chaabane%' OR id LIKE '%dar_chaabane%' ORDER BY length(name) LIMIT 1")
if [ -z "$COMMUNE" ]; then
  echo "Dar Chaabane absente du référentiel. Lancer d'abord : npm run seed && npm run seed:dar-chaabane" >&2
  exit 1
fi

# Le directeur de la commune pilote. À défaut, on rattache le directeur de
# démonstration : le test doit pouvoir tourner sur une base fraîche.
DIR_EMAIL=$(sql "SELECT email FROM users WHERE commune_id='$COMMUNE' AND role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
[ -n "$DIR_EMAIL" ] || DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
DIR_ID=$(sql "SELECT id FROM users WHERE email='$DIR_EMAIL'")
$PSQL -c "INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$DIR_ID','$COMMUNE') ON CONFLICT DO NOTHING;" >/dev/null 2>&1

PREST_EMAIL=$(sql "SELECT email FROM users WHERE role='gestionnaire_prestataire' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
PREST_ID=$(sql "SELECT id FROM users WHERE email='$PREST_EMAIL'")
$PSQL -c "INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$PREST_ID','$COMMUNE') ON CONFLICT DO NOTHING;" >/dev/null 2>&1

T_DIR=$(tok "$DIR_EMAIL")
T_PREST=$(tok "$PREST_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }

nettoyer() {
  $PSQL -c "DELETE FROM points_collecte WHERE circuit_id IN (SELECT id FROM circuits WHERE nom LIKE 'TEST M2%');
            DELETE FROM circuit_equipe  WHERE circuit_id IN (SELECT id FROM circuits WHERE nom LIKE 'TEST M2%');
            DELETE FROM circuits WHERE nom LIKE 'TEST M2%';" >/dev/null 2>&1
}
nettoyer

jours() {
  curl -s "$API/passages/confrontation?communeId=$COMMUNE" -H "Authorization: Bearer $1" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(sum(1 for x in d if x.get('circuit_nom') == '$2'))" 2>/dev/null || echo erreur
}

echo
echo "1. Un circuit créé aujourd'hui n'a pas de passages manquants antérieurs"
CODE=$(code -X POST "$API/circuits" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"nom\":\"TEST M2 neuf\",\"prestataireId\":\"$PREST_ID\",\"joursPassage\":[1,2,3,4,5,6,7]}")
chk "le circuit est créé" 201 "$CODE"
C_NEUF=$(val "['id']")
chk "sa date de début est aujourd'hui" "$(date +%F)" "$(val "['date_debut']" | cut -c1-10)"
chk "un seul passage attendu : aujourd'hui, pas les 30 jours écoulés" 1 "$(jours "$T_DIR" 'TEST M2 neuf')"

echo
echo "2. Un circuit en régie n'apparaît pas dans la vue d'un prestataire"
code -X POST "$API/circuits" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"nom\":\"TEST M2 regie\",\"joursPassage\":[1,2,3,4,5,6,7]}" >/dev/null
C_REGIE=$(val "['id']")
chk "l'exécutant par défaut est la régie communale" "None" "$(val "['prestataire_id']")"
chk "la commune voit son circuit en régie" 1 "$(jours "$T_DIR" 'TEST M2 regie')"
chk "le prestataire ne le voit pas" 0 "$(jours "$T_PREST" 'TEST M2 regie')"
chk "mais il voit bien celui qui lui est confié" 1 "$(jours "$T_PREST" 'TEST M2 neuf')"

echo
echo "3. Les voyages : deux rotations par jour font deux passages attendus"
code -X POST "$API/circuits" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"nom\":\"TEST M2 deux voyages\",\"prestataireId\":\"$PREST_ID\",\"joursPassage\":[1,2,3,4,5,6,7],\"voyagesParJour\":2,\"modeCollecte\":\"porte_a_porte\"}" >/dev/null
C_DEUX=$(val "['id']")
chk "le circuit enregistre ses deux voyages" 2 "$(val "['voyages_par_jour']")"
# Le défaut évité : compter un seul passage aurait affiché ce prestataire à
# 50 % de service rendu alors qu'il fait l'intégralité de sa tournée.
chk "la confrontation attend deux passages aujourd'hui" 2 "$(jours "$T_DIR" 'TEST M2 deux voyages')"
VOYAGES=$(curl -s "$API/passages/confrontation?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(sorted(x['voyage'] for x in d if x.get('circuit_nom') == 'TEST M2 deux voyages'))" 2>/dev/null)
chk "et les numérote 1 et 2" "[1, 2]" "$VOYAGES"

echo
echo "4. Le registre communal de Dar Chaabane est chargé tel qu'il est écrit"
CODE=$(code "$API/circuits?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR")
chk "les circuits de la commune répondent" 200 "$CODE"
chk "les 6 circuits tractés font deux voyages" 6 \
    "$(sql "SELECT count(*) FROM circuits WHERE commune_id='$COMMUNE' AND code LIKE 'LEVEE-%' AND voyages_par_jour=2 AND deleted_at IS NULL")"
chk "les 2 bennes tasseuses en font un" 2 \
    "$(sql "SELECT count(*) FROM circuits WHERE commune_id='$COMMUNE' AND code LIKE 'LEVEE-%' AND voyages_par_jour=1 AND deleted_at IS NULL")"
chk "six circuits sont en porte-à-porte" 6 \
    "$(sql "SELECT count(*) FROM circuits WHERE commune_id='$COMMUNE' AND code LIKE 'LEVEE-%' AND mode_collecte='porte_a_porte' AND deleted_at IS NULL")"
chk "deux circuits sont en conteneurs" 2 \
    "$(sql "SELECT count(*) FROM circuits WHERE commune_id='$COMMUNE' AND code LIKE 'LEVEE-%' AND mode_collecte='conteneurs' AND deleted_at IS NULL")"
chk "la longueur déclarée du circuit 2 est celle du registre" "60.00" \
    "$(sql "SELECT longueur_declaree_km FROM circuits WHERE commune_id='$COMMUNE' AND code='LEVEE-2'")"

echo
echo "5. Aucune donnée personnelle réelle dans le personnel importé"
# Le dossier de la commune contient les noms des agents et leur masse
# salariale. Le jeu de démarrage doit être entièrement fictif.
chk "aucune colonne CIN, téléphone ou salaire sur la table personnel" 0 \
    "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name='personnel' AND (column_name ILIKE '%cin%' OR column_name ILIKE '%tel%' OR column_name ILIKE '%phone%' OR column_name ILIKE '%salaire%' OR column_name ILIKE '%salary%')")"
chk "des agents sont bien affectés aux circuits" "t" \
    "$(sql "SELECT (count(*) > 0) FROM circuit_equipe ce JOIN circuits c ON c.id=ce.circuit_id WHERE c.commune_id='$COMMUNE'")"

echo
echo "6. Points de collecte : saisie, ordre et cloisonnement"
CODE=$(code -X POST "$API/circuits/$C_NEUF/points" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"nom":"Place du marché","type":"point_de_collecte","lat":36.4661,"lng":10.7435}')
chk "l'administrateur ajoute un point" 201 "$CODE"
chk "le premier point prend le rang 1" 1 "$(val "['ordre']")"
P1=$(val "['id']")
code -X POST "$API/circuits/$C_NEUF/points" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"nom":"Rue de la République","lat":36.4670,"lng":10.7440}' >/dev/null
chk "le suivant prend le rang 2 sans qu'on le précise" 2 "$(val "['ordre']")"
chk "et son type par défaut est le porte-à-porte" "porte_a_porte" "$(val "['type']")"
CODE=$(code "$API/circuits/$C_NEUF/points" -H "Authorization: Bearer $T_DIR")
chk "les deux points sont listés" 2 "$(len)"
CODE=$(code -X POST "$API/circuits/$C_REGIE/points" -H "Authorization: Bearer $T_PREST" -H 'Content-Type: application/json' \
  -d '{"nom":"Intrusion","lat":36.46,"lng":10.74}')
chk "un prestataire ne peut pas créer de point" 403 "$CODE"
CODE=$(code -X PATCH "$API/circuits/$C_NEUF/points/$P1" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"heureEstimee":"07:30"}')
chk "l'heure de passage estimée se corrige à la main" 200 "$CODE"
chk "et elle n'écrase pas l'heure observée, qui reste vide" "None" "$(val "['heure_observee']")"

echo
echo "7. Import KML — l'aperçu n'écrit rien"
# Fichier minimal reproduisant la structure réelle des relevés de la commune :
# Folder Waypoints, ExtendedData/tags, horodatage en heure locale suffixée Z.
KML=$(python3 - <<'PY'
import base64
pts = [("WPT 01","début collecte","07:31:39","10.74653362,36.46831195","3.79"),
       ("WPT 02","porte à porte","07:32:07","10.74656485,36.46827219","3.79"),
       ("WPT 03","point de collecte","07:35:00","10.74709618,36.46755591","6.72"),
       ("WPT 04","fin collecte","08:39:29","10.74800000,36.46700000","4.10"),
       ("WPT 05","centre de transfert","08:59:05","10.75000000,36.45900000","3.90")]
c = ['<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Essai</name><Folder><name>Waypoints</name>']
for n,t,h,xy,a in pts:
    c.append(f'<Placemark><name>{n}</name><TimeStamp><when>2024-05-21T{h}Z</when></TimeStamp>'
             f'<Point><coordinates>{xy}</coordinates></Point><ExtendedData>'
             f'<Data name="accuracy"><value>{a}</value></Data>'
             f'<Data name="provider"><value>gps</value></Data>'
             f'<Data name="tags"><value>{t}</value></Data></ExtendedData></Placemark>')
c.append('</Folder></Document></kml>')
print(base64.b64encode(''.join(c).encode()).decode())
PY
)
CODE=$(code -X POST "$API/circuits/$C_REGIE/import-kml" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"nomFichier\":\"essai.kml\",\"contenu\":\"$KML\"}")
chk "l'aperçu répond" 200 "$CODE"
chk "il reconnaît un relevé de waypoints" "waypoints" "$(val "['famille']")"
chk "il retient les 4 points compris entre début et fin de collecte" 4 "$(val "['nbPoints']")"
chk "il écarte le passage au centre de transfert, hors collecte" "t" \
    "$(python3 -c "
import json
d = json.load(open('/tmp/siipi_m2.json'))
print('t' if all(p['type'] != 'centre_transfert' for p in d['points']) else 'f')" 2>/dev/null)"
chk "rien n'a été écrit en base" "False" "$(val "['ecrit']")"
chk "aucun point n'existe encore sur ce circuit" 0 \
    "$(sql "SELECT count(*) FROM points_collecte WHERE circuit_id='$C_REGIE' AND deleted_at IS NULL")"

echo
echo "8. Import KML — la validation écrit, avec les heures relevées"
CODE=$(code -X POST "$API/circuits/$C_REGIE/import-kml" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"nomFichier\":\"essai.kml\",\"contenu\":\"$KML\",\"valider\":true}")
chk "la validation répond" 201 "$CODE"
chk "quatre points ont été créés" 4 "$(val "['crees']")"
# Le piège du fuseau : l'application écrit « Z » sur une heure locale. Lue
# comme de l'UTC, 07:31 deviendrait 08:31 — une heure de décalage sur toutes
# les heures de passage de la plateforme.
chk "l'heure du premier arrêt est bien 07:31, non décalée d'une heure" "07:31:39" \
    "$(sql "SELECT heure_observee FROM points_collecte WHERE circuit_id='$C_REGIE' AND ordre=1 AND deleted_at IS NULL")"
chk "les points importés portent leur provenance" "import_kml" \
    "$(sql "SELECT DISTINCT source FROM points_collecte WHERE circuit_id='$C_REGIE' AND deleted_at IS NULL")"
chk "la précision du relevé est conservée" "3.79" \
    "$(sql "SELECT precision_m FROM points_collecte WHERE circuit_id='$C_REGIE' AND ordre=1 AND deleted_at IS NULL")"
# Réimporter ne doit pas empiler deux fois les mêmes arrêts.
code -X POST "$API/circuits/$C_REGIE/import-kml" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"nomFichier\":\"essai.kml\",\"contenu\":\"$KML\",\"valider\":true,\"remplacer\":true}" >/dev/null
chk "un réimport remplace au lieu d'empiler" 4 \
    "$(sql "SELECT count(*) FROM points_collecte WHERE circuit_id='$C_REGIE' AND deleted_at IS NULL")"

echo
echo "9. Historique des modifications"
code -X PATCH "$API/circuits/$C_NEUF" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"nom":"TEST M2 neuf renommé"}' >/dev/null
chk "la modification est tracée au journal" "t" \
    "$(sql "SELECT (count(*) > 0) FROM audit_log WHERE table_name='circuits' AND record_id='$C_NEUF' AND operation='UPDATE'")"
chk "le journal retient le champ modifié" "t" \
    "$(sql "SELECT ('nom' = ANY(changed_fields)) FROM audit_log WHERE table_name='circuits' AND record_id='$C_NEUF' AND operation='UPDATE' ORDER BY changed_at DESC LIMIT 1")"

echo
echo "10. Les autres formats de relevé : GPX et GeoJSON"
# Un GPX horodate en temps universel VÉRITABLE, contrairement aux relevés
# « GPS Waypoints » qui écrivent l'heure locale suffixée Z. Les deux
# traitements sont donc opposés, et c'est exactement ce qu'on vérifie ici.
GPX=$(python3 -c "
import base64
pts = [('Debut', '36.46831195', '10.74653362', '06:31:39'),
       ('WPT 02', '36.46827219', '10.74656485', '06:32:07'),
       ('Fin collecte', '36.46700000', '10.74800000', '07:39:29')]
c = ['<?xml version=\"1.0\"?><gpx version=\"1.1\" xmlns=\"http://www.topografix.com/GPX/1/1\">',
     '<metadata><name>Essai GPX</name></metadata>']
for n, lat, lon, h in pts:
    c.append('<wpt lat=\"%s\" lon=\"%s\"><name>%s</name><time>2024-05-21T%sZ</time></wpt>' % (lat, lon, n, h))
c.append('<trk><trkseg><trkpt lat=\"36.468\" lon=\"10.746\"/><trkpt lat=\"36.469\" lon=\"10.747\"/></trkseg></trk></gpx>')
print(base64.b64encode(''.join(c).encode()).decode())
")
CODE=$(code -X POST "$API/circuits/$C_NEUF/import-kml" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"nomFichier\":\"essai.gpx\",\"contenu\":\"$GPX\"}")
chk "un GPX est reconnu" 200 "$CODE"
chk "comme une trace GPX" "gpx" "$(val "['famille']")"
chk "ses trois points sont lus" 3 "$(val "['nbPoints']")"
# 06:31:39 UTC devient 07:31:39 en Tunisie (UTC+1). Ne PAS convertir ici
# décalerait toutes les heures d'une heure — dans l'autre sens que le piège
# des fichiers Waypoints, où il ne faut justement PAS convertir.
chk "l'heure UTC est convertie en heure locale" "07:31:39" "$(val "['points'][0]['heureObservee']")"
chk "et « Fin collecte » est reconnu dans le libellé" "fin_collecte" "$(val "['points'][2]['type']")"

GEO=$(python3 -c "
import base64, json
d = {'type': 'FeatureCollection', 'features': [
  {'type': 'Feature', 'properties': {'nom': 'Marche', 'type': 'point de collecte'},
   'geometry': {'type': 'Point', 'coordinates': [10.7435, 36.4661]}},
  {'type': 'Feature', 'properties': {'nom': 'Depot sauvage', 'tags': 'point noir'},
   'geometry': {'type': 'Point', 'coordinates': [10.7440, 36.4670]}},
  {'type': 'Feature', 'properties': {'nom': 'secteur'},
   'geometry': {'type': 'Polygon', 'coordinates': [[[10.74,36.46],[10.75,36.46],[10.75,36.47],[10.74,36.46]]]}}]}
print(base64.b64encode(json.dumps(d).encode()).decode())
")
CODE=$(code -X POST "$API/circuits/$C_NEUF/import-kml" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"nomFichier\":\"essai.geojson\",\"contenu\":\"$GEO\"}")
chk "un GeoJSON est reconnu" 200 "$CODE"
chk "comme une couche GeoJSON" "geojson" "$(val "['famille']")"
# Le polygone décrit un secteur, pas une tournée : il est écarté, et on le dit.
chk "les deux points sont retenus, le polygone écarté" 2 "$(val "['nbPoints']")"
chk "la propriété « type » est comprise" "point_de_collecte" "$(val "['points'][0]['type']")"
chk "et la propriété « tags » aussi" "point_noir" "$(val "['points'][1]['type']")"
chk "l'écart sur les polygones est signalé" "t" \
    "$(python3 -c "
import json
d = json.load(open('/tmp/siipi_m2.json'))
print('t' if any('polygone' in a for a in d['avertissements']) else 'f')" 2>/dev/null)"

echo
echo "11. Tous les arrêts d'une commune, pour la carte communale"
code -X POST "$API/circuits/$C_NEUF/import-kml" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"nomFichier\":\"essai.geojson\",\"contenu\":\"$GEO\",\"valider\":true}" >/dev/null
CODE=$(code "$API/circuits/points?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR")
chk "la carte obtient les arrêts de la commune" 200 "$CODE"
# La route est déclarée AVANT « /:id/points » : sans cela, « points » serait
# pris pour un identifiant de circuit et la base refuserait la requête.
chk "et ils portent le nom de leur circuit" "t" \
    "$(python3 -c "
import json
d = json.load(open('/tmp/siipi_m2.json'))
print('t' if isinstance(d, list) and d and all('circuit_nom' in x for x in d) else 'f')" 2>/dev/null)"

echo
echo "12. Fiche d'identité du circuit — tous les champs facultatifs"
CODE=$(code -X POST "$API/circuits" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"nom\":\"TEST M2 fiche\",\"joursPassage\":[1],\"secteurCode\":\"S01\",\"secteurNom\":\"Cité Gharbi\",\"poste\":\"jour\",\"heureDepart\":\"07:29\",\"heureFin\":\"11:37\",\"lieuDechargement\":\"Centre de transfert\",\"vehiculeCode\":\"BB1\",\"vehiculeImmat\":\"02-220610\",\"enginAppuiCode\":\"BT1\",\"etudeDate\":\"2024-05-21\",\"etudeTempsCollecteMin\":161,\"etudeDistanceCollecteKm\":19.3,\"etudeTonnageT\":6.1}")
chk "un circuit se crée avec sa fiche complète" 201 "$CODE"
C_FICHE=$(val "['id']")
chk "le code de secteur est conservé" "S01" "$(val "['secteur_code']")"
chk "et son nom de quartier aussi" "Cité Gharbi" "$(val "['secteur_nom']")"
chk "le poste est enregistré" "jour" "$(val "['poste']")"
chk "les horaires sont des heures, pas du texte" "07:29:00" "$(val "['heure_depart']")"
# Le relevé d'affectation distingue l'engin qui ramasse de celui qui évacue :
# n'en retenir qu'un perdrait la moitié de l'organisation.
chk "l’engin de collecte et son remplaçant sont distingués" "BB1/BT1" "$(val "['vehicule_code']")/$(val "['engin_appui_code']")"
chk "la mesure de campagne est datée" "2024-05-21" "$(val "['etude_date']" | cut -c1-10)"
# Un circuit sans fiche reste parfaitement utilisable : c'est la condition
# pour qu'une commune sans étude d'optimisation puisse s'en servir.
code -X POST "$API/circuits" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"nom\":\"TEST M2 sans fiche\",\"joursPassage\":[1]}" >/dev/null
chk "un circuit sans fiche se crée quand même" "None" "$(val "['secteur_code']")"
# Effacer un champ à l'écran doit l'effacer en base, pas le laisser intact.
CODE=$(code -X PATCH "$API/circuits/$C_FICHE" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"secteurNom":null}')
chk "vider un champ le vide réellement" "None" "$(val "['secteur_nom']")"

echo
echo "13. Itinéraire et arrêts se déposent séparément"
TRACE=$(python3 -c "
import base64
c = '<?xml version=\"1.0\"?><kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document><Placemark><name>Itineraire</name>'
c += '<LineString><coordinates>10.7465,36.4683 10.7470,36.4690 10.7480,36.4695</coordinates></LineString>'
c += '</Placemark></Document></kml>'
print(base64.b64encode(c.encode()).decode())
")
CODE=$(code -X POST "$API/circuits/$C_FICHE/import-kml" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"nomFichier\":\"itineraire.kml\",\"contenu\":\"$TRACE\",\"cible\":\"trace\",\"valider\":true}")
chk "un itinéraire seul s'importe" 201 "$CODE"
chk "il pose bien le tracé" "True" "$(val "['poseraTrace']")"
chk "et aucun arrêt" 0 "$(val "['crees']")"
chk "la provenance du tracé est conservée" "itineraire.kml" \
    "$(sql "SELECT trace_fichier FROM circuits WHERE id='$C_FICHE'")"
# Le même fichier demandé comme arrêts : il n'en contient pas, et la réponse
# doit le dire au lieu d'écrire un tracé qu'on n'a pas demandé.
CODE=$(code -X POST "$API/circuits/$C_FICHE/import-kml" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"nomFichier\":\"itineraire.kml\",\"contenu\":\"$TRACE\",\"cible\":\"points\",\"valider\":true}")
chk "demandé comme arrêts, il est refusé" 400 "$CODE"
chk "aucun arrêt n'a été créé" 0 \
    "$(sql "SELECT count(*) FROM points_collecte WHERE circuit_id='$C_FICHE' AND deleted_at IS NULL")"

# Un relevé qui porte À LA FOIS des arrêts et une trace : demander les arrêts
# ne doit pas écraser l'itinéraire déjà posé. C'est le défaut que la cible
# corrige — l'import unique devinait, et sa devinette remplaçait l'itinéraire
# prévu par le trajet suivi un matin donné.
MIXTE=$(python3 -c "
import base64
c = ['<?xml version=\"1.0\"?><kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document>']
c.append('<Placemark><name>trace</name><LineString><coordinates>10.80,36.50 10.81,36.51</coordinates></LineString></Placemark>')
for i, (n, t) in enumerate([('Debut','début collecte'), ('A','porte à porte'), ('Fin','fin collecte')]):
    c.append(f'<Placemark><name>{n}</name><Point><coordinates>10.74{i},36.46{i}</coordinates></Point>'
             f'<ExtendedData><Data name=\"tags\"><value>{t}</value></Data></ExtendedData></Placemark>')
c.append('</Document></kml>')
print(base64.b64encode(''.join(c).encode()).decode())
")
CODE=$(code -X POST "$API/circuits/$C_FICHE/import-kml" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"nomFichier\":\"mixte.kml\",\"contenu\":\"$MIXTE\",\"cible\":\"points\",\"valider\":true}")
chk "un fichier mixte déposé comme arrêts les crée" 201 "$CODE"
chk "trois arrêts sont posés" 3 "$(val "['crees']")"
chk "et l'itinéraire précédent n'a PAS été écrasé" "itineraire.kml" \
    "$(sql "SELECT trace_fichier FROM circuits WHERE id='$C_FICHE'")"
chk "la provenance des arrêts est notée à part" "mixte.kml" \
    "$(sql "SELECT points_fichier FROM circuits WHERE id='$C_FICHE'")"

nettoyer
$PSQL -c "DELETE FROM utilisateur_communes WHERE user_id='$PREST_ID' AND commune_id='$COMMUNE';" >/dev/null 2>&1

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
