#!/usr/bin/env bash
# =============================================================================
# Test de l'espace prestataire (migration 020).
#
# Vérifie que les deux registres restent indépendants — le prestataire ne peut
# pas réécrire le constat de la commune, la commune ne peut pas réécrire la
# déclaration du prestataire — et que leur confrontation qualifie correctement
# chaque situation.
#
# Vérifie aussi qu'un prestataire sous contrat avec plusieurs communes accède
# à chacune avec un seul compte, et à aucune autre.
#
#   docker compose run --rm api npm run test:prestataires
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
code() { curl -s -o /tmp/siipi_p.json -w '%{http_code}' "$@"; }
len()  { python3 -c "import json;d=json.load(open('/tmp/siipi_p.json'));print(len(d) if isinstance(d,list) else 'non-liste')" 2>/dev/null || echo erreur; }
val()  { python3 -c "import json;print(json.load(open('/tmp/siipi_p.json'))$1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

T_MARSA=$(tok directeur.marsa@siipi.tn)
T_SFAX=$(tok directeur.sfax@siipi.tn)
T_PREST=$(tok prestataire.marsa@siipi.tn)
[ -n "$T_MARSA" ] || { echo "API injoignable sur $API" >&2; exit 1; }

PRESTATAIRE=$(sql "SELECT id FROM users WHERE email='prestataire.marsa@siipi.tn'")

# Nettoyage préalable : une campagne interrompue en cours de route laisse ses
# données derrière elle et fausse la suivante. On repart d'un état connu plutôt
# que de compter sur le nettoyage final, qui peut ne jamais s'exécuter.
$PSQL -c "DELETE FROM incidents WHERE circuit_id IN (SELECT id FROM circuits WHERE nom = 'Circuit test passages');
          DELETE FROM declarations_passage WHERE circuit_id IN (SELECT id FROM circuits WHERE nom = 'Circuit test passages');
          DELETE FROM controles_terrain WHERE circuit_id IN (SELECT id FROM circuits WHERE nom = 'Circuit test passages');
          DELETE FROM circuits WHERE nom = 'Circuit test passages';" >/dev/null 2>&1

# Circuit de test : lundi à samedi, confié au prestataire de La Marsa.
code -X POST "$API/circuits" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"tunis_la_marsa\",\"nom\":\"Circuit test passages\",\"prestataireId\":\"$PRESTATAIRE\",\"joursPassage\":[1,2,3,4,5,6]}" >/dev/null
CIRCUIT=$(val "['id']")
[ -n "$CIRCUIT" ] || { echo "Impossible de créer le circuit de test." >&2; exit 1; }

echo
echo "1. Le prestataire tient son propre registre"
CODE=$(code -X POST "$API/passages" -H "Authorization: Bearer $T_PREST" -H 'Content-Type: application/json' \
  -d "{\"circuitId\":\"$CIRCUIT\",\"datePassage\":\"2026-09-01\",\"statut\":\"effectue\",\"modeSaisie\":\"terrain\",\"lat\":36.88,\"lng\":10.32,\"positionSource\":\"appareil\",\"agentNom\":\"Chauffeur A\"}")
chk "il déclare un passage" 201 "$CODE"
chk "la position relevée par l'appareil est conservée" "appareil" "$(val "['position_source']")"

# Une position annoncée comme relevée par l'appareil mais absente serait un
# mensonge silencieux dans une pièce qui sert de preuve.
CODE=$(code -X POST "$API/passages" -H "Authorization: Bearer $T_PREST" -H 'Content-Type: application/json' \
  -d "{\"circuitId\":\"$CIRCUIT\",\"datePassage\":\"2026-09-02\",\"statut\":\"effectue\",\"positionSource\":\"appareil\"}")
chk "une position annoncée mais absente est requalifiée" "absente" "$(val "['position_source']")"

CODE=$(code -X POST "$API/passages" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"circuitId\":\"$CIRCUIT\",\"datePassage\":\"2026-09-03\",\"statut\":\"effectue\"}")
chk "la commune ne peut pas écrire dans le registre du prestataire" 403 "$CODE"

echo
echo "2. Les deux registres restent indépendants"
code -X POST "$API/circuits/controles" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"circuitId\":\"$CIRCUIT\",\"dateControle\":\"2026-09-01\",\"etat\":\"fait\"}" >/dev/null
code -X POST "$API/circuits/controles" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"circuitId\":\"$CIRCUIT\",\"dateControle\":\"2026-09-02\",\"etat\":\"non_fait\"}" >/dev/null
CODE=$(code -X POST "$API/circuits/controles" -H "Authorization: Bearer $T_PREST" -H 'Content-Type: application/json' \
  -d "{\"circuitId\":\"$CIRCUIT\",\"dateControle\":\"2026-09-04\",\"etat\":\"fait\"}")
chk "le prestataire ne peut pas écrire le constat de la commune" 403 "$CODE"

echo
echo "3. Confrontation"
# Les dates sans heure doivent traverser JSON telles quelles. Transformées en
# horodatage, elles glissent d'un jour sur un serveur à l'heure de Tunis.
chk "une date de passage reste une date, pas un horodatage" "2026-09-01" \
    "$(sql "SELECT date_passage FROM declarations_passage WHERE circuit_id='$CIRCUIT' AND date_passage='2026-09-01'")"
CODE=$(code "$API/passages?communeId=tunis_la_marsa&depuis=2026-09-01" -H "Authorization: Bearer $T_MARSA")
chk "l'API renvoie la date sans décalage" "2026-09-01" \
    "$(python3 -c "
import json
d=[l for l in json.load(open('/tmp/siipi_p.json')) if l['circuit_id']=='$CIRCUIT' and l['date_passage'].startswith('2026-09-01')]
print(d[0]['date_passage'] if d else 'absent')" 2>/dev/null)"

CODE=$(code "$API/passages/confrontation?communeId=tunis_la_marsa&depuis=2026-09-01&jusqua=2026-09-05" \
  -H "Authorization: Bearer $T_MARSA")
chk "la confrontation répond" 200 "$CODE"
CONC=$(python3 -c "
import json
d=[l for l in json.load(open('/tmp/siipi_p.json')) if l['circuit_id']=='$CIRCUIT']
print(next((l['situation'] for l in d if l['jour']=='2026-09-01'),'absent'))" 2>/dev/null)
chk "déclaré fait + constaté fait = concordant" "concordant" "$CONC"
DIV=$(python3 -c "
import json
d=[l for l in json.load(open('/tmp/siipi_p.json')) if l['circuit_id']=='$CIRCUIT']
print(next((l['situation'] for l in d if l['jour']=='2026-09-02'),'absent'))" 2>/dev/null)
chk "déclaré fait + constaté non fait = divergent" "divergent" "$DIV"
SIL=$(python3 -c "
import json
d=[l for l in json.load(open('/tmp/siipi_p.json')) if l['circuit_id']=='$CIRCUIT']
print(next((l['situation'] for l in d if l['jour']=='2026-09-04'),'absent'))" 2>/dev/null)
chk "passage prévu dont personne ne parle = silence" "silence" "$SIL"

echo
echo "4. Incidents"
CODE=$(code -X POST "$API/passages/incidents" -H "Authorization: Bearer $T_PREST" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"tunis_la_marsa\",\"circuitId\":\"$CIRCUIT\",\"dateIncident\":\"2026-09-02\",\"type\":\"acces_bloque\",\"description\":\"rue barrée par des travaux\"}")
chk "le prestataire signale un incident" 201 "$CODE"
INCIDENT=$(val "['id']")
CODE=$(code "$API/passages/confrontation?communeId=tunis_la_marsa&depuis=2026-09-02&jusqua=2026-09-02" \
  -H "Authorization: Bearer $T_MARSA")
chk "l'incident apparaît face au constat du même jour" "acces_bloque" \
    "$(python3 -c "
import json
d=[l for l in json.load(open('/tmp/siipi_p.json')) if l['circuit_id']=='$CIRCUIT']
print(next((l['incident'] for l in d),'aucun'))" 2>/dev/null)"
CODE=$(code -X PATCH "$API/passages/incidents/$INCIDENT" -H "Authorization: Bearer $T_PREST" \
  -H 'Content-Type: application/json' -d '{"statut":"clos"}')
chk "le prestataire ne clôt pas lui-même son incident" 403 "$CODE"
CODE=$(code -X PATCH "$API/passages/incidents/$INCIDENT" -H "Authorization: Bearer $T_MARSA" \
  -H 'Content-Type: application/json' -d '{"statut":"pris_en_compte","reponseCommune":"travaux signalés, circuit dévié"}')
chk "la commune prend l'incident en charge" 200 "$CODE"

echo
echo "5. Cloisonnement"
CODE=$(code "$API/passages?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_SFAX")
chk "une autre commune ne voit aucune déclaration de La Marsa" 0 "$(len)"
CODE=$(code "$API/passages/incidents?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_SFAX")
chk "une autre commune ne voit aucun incident de La Marsa" 0 "$(len)"
CODE=$(code "$API/passages?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_PREST")
chk "le prestataire voit ses propres déclarations" 2 "$(len)"

echo
echo "6. Un compte, plusieurs communes"
chk "le rattachement existant a été repris" 1 \
    "$(sql "SELECT count(*) FROM utilisateur_communes WHERE user_id='$PRESTATAIRE' AND commune_id='tunis_la_marsa'")"
$PSQL -c "INSERT INTO utilisateur_communes (user_id, commune_id, contrat_reference) VALUES ('$PRESTATAIRE','sfax_sfax_ville_medina','CT-2026-07') ON CONFLICT DO NOTHING;" >/dev/null 2>&1
T_PREST=$(tok prestataire.marsa@siipi.tn)
CODE=$(code "$API/passages/mes-contrats" -H "Authorization: Bearer $T_PREST")
chk "il voit ses deux communes sous contrat" 2 "$(len)"
CODE=$(code "$API/containers?communeId=sfax_sfax_ville_medina" -H "Authorization: Bearer $T_PREST")
chk "il accède à la seconde commune avec le même compte" 200 "$CODE"
CODE=$(code "$API/containers?communeId=medenine_djerba_midoun" -H "Authorization: Bearer $T_PREST")
chk "il n'accède à aucune commune hors contrat" 0 "$(len)"

# Sans commune précisée, l'API retombait sur users.commune_id — le rattachement
# PRINCIPAL. Un prestataire sous contrat avec trois communes ne voyait donc que
# la première, et son écran de tournée cachait silencieusement les autres.
# C'est désormais le cloisonnement en base qui décide (app.mes_communes()).
CIRCUIT_SFAX=$($PSQL -tAc "INSERT INTO circuits (commune_id, nom, prestataire_id, jours_passage)
                           VALUES ('sfax_sfax_ville_medina', 'Circuit test Sfax', '$PRESTATAIRE', ARRAY[1,2,3,4,5,6,7]::smallint[])
                           RETURNING id" 2>/dev/null | tr -d ' ')
CODE=$(code "$API/circuits" -H "Authorization: Bearer $T_PREST")
chk "sans commune précisée, il voit les circuits de TOUTES ses communes" "t" \
    "$(python3 -c "
import json
d = json.load(open('/tmp/siipi_p.json'))
communes = {x['commune_id'] for x in d}
print('t' if {'tunis_la_marsa', 'sfax_sfax_ville_medina'} <= communes else 'f')" 2>/dev/null)"
chk "et le nom de la commune, pas son identifiant technique" "t" \
    "$(python3 -c "
import json
d = json.load(open('/tmp/siipi_p.json'))
print('t' if d and all(x.get('commune_nom') for x in d) else 'f')" 2>/dev/null)"
$PSQL -c "DELETE FROM circuits WHERE id='$CIRCUIT_SFAX'" >/dev/null 2>&1
$PSQL -c "UPDATE utilisateur_communes SET date_fin='2026-01-01' WHERE user_id='$PRESTATAIRE' AND commune_id='sfax_sfax_ville_medina';" >/dev/null 2>&1
T_PREST=$(tok prestataire.marsa@siipi.tn)
CODE=$(code "$API/containers?communeId=sfax_sfax_ville_medina" -H "Authorization: Bearer $T_PREST")
chk "un contrat échu ne donne plus accès à rien" 0 "$(len)"

$PSQL -c "DELETE FROM utilisateur_communes WHERE user_id='$PRESTATAIRE' AND commune_id='sfax_sfax_ville_medina';
          DELETE FROM incidents WHERE circuit_id='$CIRCUIT';
          DELETE FROM declarations_passage WHERE circuit_id='$CIRCUIT';
          DELETE FROM controles_terrain WHERE circuit_id='$CIRCUIT';
          DELETE FROM circuits WHERE id='$CIRCUIT';" >/dev/null 2>&1

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
