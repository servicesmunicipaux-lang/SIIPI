#!/usr/bin/env bash
# =============================================================================
# Test des circuits et du contrôle terrain (migration 019).
#
# Vérifie que le constat quotidien est bien la propriété de la commune et non
# du prestataire évalué, qu'un circuit ne fuit pas d'une commune à l'autre, et
# que les indicateurs de performance distinguent le taux de réalisation du taux
# de couverture du contrôle.
#
#   docker compose run --rm api npm run test:circuits
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
code() { curl -s -o /tmp/siipi_c.json -w '%{http_code}' "$@"; }
len()  { python3 -c "import json;d=json.load(open('/tmp/siipi_c.json'));print(len(d) if isinstance(d,list) else 'non-liste')" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

T_MARSA=$(tok directeur.marsa@siipi.tn)
T_SFAX=$(tok directeur.sfax@siipi.tn)
T_PREST=$(tok prestataire.marsa@siipi.tn)
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_MARSA" ] || { echo "API injoignable sur $API" >&2; exit 1; }

PRESTATAIRE=$(sql "SELECT id FROM users WHERE email='prestataire.marsa@siipi.tn'")

# Nettoyage préalable : une campagne interrompue en cours de route laisse ses
# données derrière elle et fausse la suivante. On repart d'un état connu plutôt
# que de compter sur le nettoyage final, qui peut ne jamais s'exécuter.
$PSQL -c "DELETE FROM incidents WHERE circuit_id IN (SELECT id FROM circuits WHERE nom = 'Circuit test corniche');
          DELETE FROM declarations_passage WHERE circuit_id IN (SELECT id FROM circuits WHERE nom = 'Circuit test corniche');
          DELETE FROM controles_terrain WHERE circuit_id IN (SELECT id FROM circuits WHERE nom = 'Circuit test corniche');
          DELETE FROM circuits WHERE nom = 'Circuit test corniche';" >/dev/null 2>&1

echo
echo "1. Création d'un circuit"
CODE=$(code -X POST "$API/circuits" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"tunis_la_marsa\",\"nom\":\"Circuit test corniche\",\"code\":\"TST-1\",\"prestataireId\":\"$PRESTATAIRE\",\"joursPassage\":[1,2,3,4,5,6],\"typeDechet\":\"menager\"}")
chk "la commune crée un circuit" 201 "$CODE"
CIRCUIT=$(python3 -c "import json;print(json.load(open('/tmp/siipi_c.json'))['id'])" 2>/dev/null)
chk "les jours de passage sont enregistrés" "{1,2,3,4,5,6}" "$(sql "SELECT jours_passage FROM circuits WHERE id='$CIRCUIT'")"

CODE=$(code -X POST "$API/circuits" -H "Authorization: Bearer $T_PREST" -H 'Content-Type: application/json' \
  -d '{"communeId":"tunis_la_marsa","nom":"Circuit crée par le prestataire","joursPassage":[1]}')
chk "un prestataire ne peut pas créer de circuit" 403 "$CODE"

echo
echo "2. Constat de terrain"
CODE=$(code -X POST "$API/circuits/controles" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"circuitId\":\"$CIRCUIT\",\"dateControle\":\"2026-09-01\",\"etat\":\"fait\"}")
chk "la commune enregistre un constat" 201 "$CODE"
CODE=$(code -X POST "$API/circuits/controles" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"circuitId\":\"$CIRCUIT\",\"dateControle\":\"2026-09-02\",\"etat\":\"non_fait\",\"remarque\":\"benne absente\"}")
chk "un second constat, autre jour" 201 "$CODE"
CODE=$(code -X POST "$API/circuits/controles" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"circuitId\":\"$CIRCUIT\",\"dateControle\":\"2026-09-03\",\"etat\":\"partiel\"}")
chk "un troisième constat, autre jour" 201 "$CODE"

# Le même circuit le même jour doit corriger, pas empiler : un tableau
# contractuel ne peut pas contenir deux vérités sur la même journée.
code -X POST "$API/circuits/controles" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"circuitId\":\"$CIRCUIT\",\"dateControle\":\"2026-09-01\",\"etat\":\"partiel\"}" >/dev/null
chk "un second constat le même jour corrige le premier" 3 \
    "$(sql "SELECT count(*) FROM controles_terrain WHERE circuit_id='$CIRCUIT'")"
chk "c'est bien la nouvelle valeur qui reste" "partiel" \
    "$(sql "SELECT etat FROM controles_terrain WHERE circuit_id='$CIRCUIT' AND date_controle='2026-09-01'")"

CODE=$(code -X POST "$API/circuits/controles" -H "Authorization: Bearer $T_PREST" -H 'Content-Type: application/json' \
  -d "{\"circuitId\":\"$CIRCUIT\",\"dateControle\":\"2026-09-04\",\"etat\":\"fait\"}")
chk "le prestataire évalué ne peut pas saisir son propre constat" 403 "$CODE"

echo
echo "3. Le prestataire voit ce qui le concerne, et rien d'autre"
CODE=$(code "$API/circuits?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_PREST")
chk "il voit les circuits qui lui sont confiés" 1 "$(len)"
CODE=$(code "$API/circuits/controles?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_PREST")
chk "il voit les constats qui le concernent (pour les contester)" 3 "$(len)"
CODE=$(code "$API/circuits?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_SFAX")
chk "une autre commune ne voit aucun circuit de La Marsa" 0 "$(len)"
CODE=$(code "$API/circuits/controles?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_SFAX")
chk "une autre commune ne voit aucun constat de La Marsa" 0 "$(len)"

echo
echo "4. Performance des prestataires"
CODE=$(code "$API/circuits/performance?communeId=tunis_la_marsa&depuis=2026-09-01&jusqua=2026-09-07" \
  -H "Authorization: Bearer $T_MARSA")
chk "la fiche de performance répond" 200 "$CODE"
chk "le prestataire y figure" 1 "$(len)"
chk "3 constats saisis" 3 "$(python3 -c "import json;print(json.load(open('/tmp/siipi_c.json'))[0]['controles_saisis'])")"
chk "1 passage non fait relevé" 1 "$(python3 -c "import json;print(json.load(open('/tmp/siipi_c.json'))[0]['controles_non_fait'])")"
# 1 fait + 2 partiels (dont la correction du 1er septembre) → (0 + 2/2) / 3 = 33,3 %
chk "le taux de réalisation compte un passage partiel pour moitié" "33.3" \
    "$(python3 -c "import json;print(json.load(open('/tmp/siipi_c.json'))[0]['taux_realisation'])")"
# 6 jours de passage prévus du 1er au 7 septembre (lundi à samedi), 3 contrôlés.
chk "le taux de couverture du contrôle est distinct du taux de réalisation" "50.0" \
    "$(python3 -c "import json;print(float(json.load(open('/tmp/siipi_c.json'))[0]['taux_couverture']))")"
chk "les indicateurs sortent en nombres, pas en texte" "t" \
    "$(python3 -c "import json;d=json.load(open('/tmp/siipi_c.json'))[0];print('t' if isinstance(d['taux_realisation'],(int,float)) else 'f')")"

CODE=$(code "$API/circuits/performance?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_SFAX")
chk "une autre commune ne voit pas cette performance" 0 "$(len)"

echo
echo "5. Suppression logique"
CODE=$(code -X DELETE "$API/circuits/$CIRCUIT" -H "Authorization: Bearer $T_MARSA")
chk "le circuit est supprimé" 204 "$CODE"
chk "le circuit et son historique restent en base" 1 "$(sql "SELECT count(*) FROM circuits WHERE id='$CIRCUIT'")"
chk "les constats sont conservés" 3 "$(sql "SELECT count(*) FROM controles_terrain WHERE circuit_id='$CIRCUIT'")"
CODE=$(code "$API/circuits?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_MARSA")
chk "il disparaît des écrans" 0 "$(len)"
chk "la suppression est au journal d'audit" "t" \
    "$([ "$(sql "SELECT count(*) FROM audit_log WHERE record_id='$CIRCUIT' AND 'deleted_at'=ANY(changed_fields)")" -ge 1 ] && echo t || echo f)"

$PSQL -c "DELETE FROM controles_terrain WHERE circuit_id='$CIRCUIT'; DELETE FROM circuits WHERE id='$CIRCUIT';" >/dev/null 2>&1

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
