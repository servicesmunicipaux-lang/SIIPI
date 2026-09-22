#!/usr/bin/env bash
# =============================================================================
# Module 3 — Parc matériel. Tests sur l'inventaire réel de Dar Chaabane
# El Fehri, arrêté au 19 avril 2024 par le chef du magasin municipal.
#
# Ce que ce module corrige : la table « vehicules » connaissait un « status »
# — en tournée, au dépôt, en maintenance — qui dit OÙ se trouve un engin, pas
# S'IL PEUT SERVIR. Un engin en panne depuis huit mois était « au dépôt »,
# exactement comme celui qui repart demain, et les treize engins immobilisés
# de Dar Chaabane disparaissaient du décompte.
#
#   docker compose run --rm api npm run test:module3
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
code() { curl -s -o /tmp/siipi_m3.json -w '%{http_code}' "$@"; }
val()  { python3 -c "import json;print(json.load(open('/tmp/siipi_m3.json'))$1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

COMMUNE=$(sql "SELECT id FROM communes WHERE name ILIKE '%Chaâbane%' OR name ILIKE '%Chaabane%' OR id LIKE '%dar_chaabane%' ORDER BY length(name) LIMIT 1")
if [ -z "$COMMUNE" ]; then
  echo "Dar Chaabane absente. Lancer : npm run seed && npm run seed:dar-chaabane && npm run seed:parc" >&2
  exit 1
fi
if [ "$(sql "SELECT count(*) FROM vehicules WHERE commune_id='$COMMUNE' AND id LIKE 'dcef-%'")" = "0" ]; then
  echo "Parc non chargé. Lancer : npm run seed:parc" >&2
  exit 1
fi

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id='$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
[ -n "$DIR_EMAIL" ] || DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }
PREST_EMAIL=$(sql "SELECT email FROM users WHERE role='gestionnaire_prestataire' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_PREST=$(tok "$PREST_EMAIL")

nettoyer() { $PSQL -c "DELETE FROM vehicules WHERE registration LIKE 'TEST-M3%';" >/dev/null 2>&1; }
nettoyer

echo
echo "1. L'inventaire réel est chargé tel qu'il est écrit"
chk "vingt-neuf engins recensés" 29 \
    "$(sql "SELECT count(*) FROM vehicules WHERE commune_id='$COMMUNE' AND id LIKE 'dcef-%'")"
chk "seize en service" 16 \
    "$(sql "SELECT count(*) FROM vehicules WHERE commune_id='$COMMUNE' AND id LIKE 'dcef-%' AND etat='en_service'")"
chk "dix en panne" 10 \
    "$(sql "SELECT count(*) FROM vehicules WHERE commune_id='$COMMUNE' AND id LIKE 'dcef-%' AND etat='en_panne'")"
# « معطب للتفويت » n'est pas « معطب » : le premier reviendra, le second non.
chk "trois à réformer, distingués des simples pannes" 3 \
    "$(sql "SELECT count(*) FROM vehicules WHERE commune_id='$COMMUNE' AND id LIKE 'dcef-%' AND etat='a_reformer'")"
chk "le plus ancien tracteur date de 1994" "1994-06-28" \
    "$(sql "SELECT min(date_premiere_circulation) FROM vehicules WHERE commune_id='$COMMUNE' AND id LIKE 'dcef-%'")"
chk "la date d'inventaire est conservée" "2024-04-19" \
    "$(sql "SELECT DISTINCT inventaire_le FROM vehicules WHERE commune_id='$COMMUNE' AND id LIKE 'dcef-%'")"
# Le fichier est un instantané : il ne dit jamais depuis quand un engin est en
# panne. L'inventer fabriquerait le chiffre le plus sensible du module.
chk "l'ancienneté des pannes n'est PAS inventée" 0 \
    "$(sql "SELECT count(*) FROM vehicules WHERE commune_id='$COMMUNE' AND id LIKE 'dcef-%' AND etat_depuis IS NOT NULL")"

echo
echo "2. L'état du parc, en un appel"
CODE=$(code "$API/trucks/etat?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR")
chk "l'état répond" 200 "$CODE"
chk "vingt-neuf engins" 29 "$(val "['total']")"
chk "seize en service" 16 "$(val "['en_service']")"
# Le chiffre mérite qu'on s'y arrête. Les six remorques sont TOUTES en
# service : sur les seize engins disponibles, six ne roulent pas seuls. Il
# reste donc dix engins motorisés en état, sur vingt-trois — 43,5 %, et non
# les 55 % qu'un décompte brut afficherait. Les remorques gonflent la santé
# apparente du parc, et c'est pour cela qu'on les écarte du taux.
chk "la disponibilité écarte les remorques" 43.5 "$(val "['taux_disponibilite']")"
chk "dix engins motorisés seulement sont en état" 10 \
    "$(sql "SELECT count(*) FROM vehicules WHERE commune_id='$COMMUNE' AND etat='en_service' AND categorie <> 'remorque'")"
chk "et les six remorques sont toutes en service" 6 \
    "$(sql "SELECT count(*) FROM vehicules WHERE commune_id='$COMMUNE' AND etat='en_service' AND categorie='remorque'")"
chk "six remorques sont recensées à part" 6 "$(val "['remorques']")"
chk "l'état porte sa date d'inventaire" "2024-04-19" "$(val "['inventaire_le']" | cut -c1-10)"
# Un engin arrêté dont personne n'a écrit pourquoi ne sera jamais réparé.
chk "la balayeuse immobilisée sans motif est signalée" 1 "$(val "['immobilises_sans_motif']")"

echo
echo "3. Position et état sont deux choses différentes"
# C'est le défaut corrigé : « au dépôt » ne dit pas si l'engin peut rouler.
PANNE=$(sql "SELECT id FROM vehicules WHERE commune_id='$COMMUNE' AND etat='en_panne' ORDER BY id LIMIT 1")
chk "un engin en panne garde une position propre" "au_depot" \
    "$(sql "SELECT status FROM vehicules WHERE id='$PANNE'")"
chk "et son état dit qu'il ne peut pas servir" "en_panne" \
    "$(sql "SELECT etat FROM vehicules WHERE id='$PANNE'")"

echo
echo "4. Le motif est ce qui rend le chiffre actionnable"
chk "les engins en attente de marché sont identifiables" "t" \
    "$(sql "SELECT (count(*) >= 3) FROM vehicules WHERE commune_id='$COMMUNE' AND motif_immobilisation ILIKE '%marché%'")"
# Les mutations portent sur un engin CRÉÉ POUR LE TEST, jamais sur
# l'inventaire réel : sans cela chaque passage abîmait un peu plus le jeu de
# référence, et les vérifications suivantes tombaient au bout de trois essais.
code -X POST "$API/trucks?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"registration":"TEST-M3-MUT","type":"camion","categorie":"poids_lourd","marque":"Essai","etat":"en_panne"}' >/dev/null
MUTABLE=$(val "['id']")
CODE=$(code -X PATCH "$API/trucks/$MUTABLE" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"motifImmobilisation":"Pièce commandée le 12 mai"}')
chk "la commune corrige un motif" 200 "$CODE"
chk "et il est enregistré" "Pièce commandée le 12 mai" "$(val "['motif_immobilisation']")"

echo
echo "5. Changer d'état pose la date, pour qu'on sache depuis quand"
AVANT=$(sql "SELECT count(*) FROM vehicules WHERE commune_id='$COMMUNE' AND etat='en_service'")
CODE=$(code -X PATCH "$API/trucks/$MUTABLE" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"etat":"en_service"}')
chk "l'engin repasse en service" "en_service" "$(val "['etat']")"
# Sans date, un parc ne se pilote pas : on ignore si la panne date d'hier ou
# de deux ans. L'agent saisit au moment où il constate.
chk "la date du jour est posée automatiquement" "$(date +%F)" "$(val "['etat_depuis']" | cut -c1-10)"
chk "l'état du parc suit immédiatement" "$((AVANT + 1))" \
    "$(code "$API/trucks/etat?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR" >/dev/null; val "['en_service']")"
code -X PATCH "$API/trucks/$MUTABLE" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"etat":"en_panne","etatDepuis":"2024-04-19"}' >/dev/null
chk "une date fournie n'est pas écrasée" "2024-04-19" "$(val "['etat_depuis']" | cut -c1-10)"

echo "6. L'attelage : une remorque ne roule pas seule"
chk "la remorque du camion est attelée" "02 216 543" \
    "$(code "$API/trucks?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR" >/dev/null; python3 -c "
import json
d = json.load(open('/tmp/siipi_m3.json'))
v = next((x for x in d if x['registration'] == '02 216 542'), None)
print(v['attele_a_immat'] if v else 'introuvable')" 2>/dev/null)"
# Les six autres remorques restent libres : le fichier ne dit pas à quel
# tracteur elles vont, et le supposer serait inventer l'organisation.
chk "les autres remorques restent non affectées" 5 \
    "$(sql "SELECT count(*) FROM vehicules WHERE commune_id='$COMMUNE' AND categorie='remorque' AND attele_a IS NULL")"

echo
echo "7. Saisie d'un engin depuis l'interface, et cloisonnement"
CODE=$(code -X POST "$API/trucks?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"registration":"TEST-M3-001","type":"benne_tasseuse","categorie":"poids_lourd","marque":"Iveco","datePremiereCirculation":"2020-01-15","valeurAchatTnd":250000,"chargeUtileT":8}')
chk "l'administrateur enregistre un engin" 201 "$CODE"
NOUVEAU=$(val "['id']")
chk "son âge est calculé" "t" "$(python3 -c "
import json
d = json.load(open('/tmp/siipi_m3.json'))
print('t' if isinstance(d.get('age_annees'), int) and d['age_annees'] >= 5 else 'f')" 2>/dev/null)"
chk "il est en service par défaut" "en_service" "$(val "['etat']")"
CODE=$(code -X POST "$API/trucks?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"registration":"TEST-M3-001","type":"camion"}')
chk "une immatriculation en double est refusée" 409 "$CODE"
if [ -n "$T_PREST" ]; then
  CODE=$(code -X POST "$API/trucks?communeId=$COMMUNE" -H "Authorization: Bearer $T_PREST" -H 'Content-Type: application/json' \
    -d '{"registration":"TEST-M3-002","type":"camion"}')
  chk "un prestataire ne peut pas enregistrer d'engin" 403 "$CODE"
fi
# Les types du parc réel dépassent les quatre prévus avant d'avoir vu un
# inventaire : une niveleuse n'est pas un camion de collecte mais relève du
# même magasin et du même budget.
CODE=$(code -X POST "$API/trucks?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"registration":"TEST-M3-003","type":"niveleuse","categorie":"engin_lourd"}')
chk "les engins de terrassement sont acceptés" 201 "$CODE"

echo
echo "8. Retirer un engin de l'inventaire"
# À ne pas confondre avec « réformer » : réformé est un ÉTAT du parc, qui se
# déclare et se lit au tableau du matériel. Cette route sert à l'autre cas —
# la ligne saisie par erreur, le doublon d'immatriculation. Sans elle, une
# commune ne pouvait que « désactiver » un engin, ce qui dit tout autre chose.
$PSQL -c "UPDATE circuits SET vehicule_id='$NOUVEAU' WHERE commune_id='$COMMUNE' AND code='LEVEE-1';" >/dev/null 2>&1
chk "un engin qui assure un circuit ne peut être retiré" 409 \
    "$(code -X DELETE "$API/trucks/$NOUVEAU" -H "Authorization: Bearer $T_DIR")"
chk "et le refus nomme le circuit" 1 \
    "$(python3 -c "
import json
print(1 if 'circuit' in json.load(open('/tmp/siipi_m3.json')).get('error','').lower() else 0)" 2>/dev/null || echo erreur)"
$PSQL -c "UPDATE circuits SET vehicule_id=NULL WHERE commune_id='$COMMUNE' AND code='LEVEE-1';" >/dev/null 2>&1
chk "libéré, il est retiré" 204 \
    "$(code -X DELETE "$API/trucks/$NOUVEAU" -H "Authorization: Bearer $T_DIR")"
chk "il ne figure plus à l'inventaire" 0 \
    "$(sql "SELECT count(*) FROM vehicules WHERE id='$NOUVEAU' AND deleted_at IS NULL")"
chk "le retirer une seconde fois rend 404" 404 \
    "$(code -X DELETE "$API/trucks/$NOUVEAU" -H "Authorization: Bearer $T_DIR")"
if [ -n "$T_PREST" ]; then
  chk "un prestataire ne peut retirer aucun engin" 403 \
      "$(code -X DELETE "$API/trucks/$NOUVEAU" -H "Authorization: Bearer $T_PREST")"
fi

echo
echo "9. Recoupement du registre des circuits et de l'inventaire du parc"
# Le croisement à la main des deux documents de Dar Chaabane fait apparaître en
# quelques minutes des écarts que personne ne cherche : huit circuits contre
# vingt-neuf engins, dans deux classeurs, en deux langues.
CODE=$(code "$API/communes/$COMMUNE/coherence" -H "Authorization: Bearer $T_DIR")
chk "le recoupement répond" 200 "$CODE"

# Un circuit confié à un engin en panne : la tournée est censée passer
# aujourd'hui, et l'engin ne roule pas. C'est bloquant.
EN_PANNE=$(sql "SELECT id FROM vehicules WHERE commune_id='$COMMUNE' AND etat='en_panne' ORDER BY id LIMIT 1")
CIRCUIT=$(sql "SELECT id FROM circuits WHERE commune_id='$COMMUNE' AND code='LEVEE-1'")
$PSQL -c "UPDATE circuits SET vehicule_id='$EN_PANNE' WHERE id='$CIRCUIT';" >/dev/null 2>&1
code "$API/communes/$COMMUNE/coherence" -H "Authorization: Bearer $T_DIR" >/dev/null
chk "un circuit confié à un engin en panne est bloquant" "t" \
    "$(python3 -c "
import json
d = json.load(open('/tmp/siipi_m3.json'))
print('t' if any(x['gravite'] == 'bloquant' and 'en panne' in x['constat'] for x in d) else 'f')" 2>/dev/null)"
$PSQL -c "UPDATE circuits SET vehicule_id=NULL WHERE id='$CIRCUIT';" >/dev/null 2>&1

# Une immatriculation citée par un circuit et introuvable au parc : un chiffre
# a sauté dans l'un des deux documents, et l'on ne sait pas lequel.
$PSQL -c "UPDATE circuits SET vehicule_immat='02-220610' WHERE id='$CIRCUIT';" >/dev/null 2>&1
code "$API/communes/$COMMUNE/coherence" -H "Authorization: Bearer $T_DIR" >/dev/null
chk "une immatriculation inconnue du parc est signalée" "t" \
    "$(python3 -c "
import json
d = json.load(open('/tmp/siipi_m3.json'))
print('t' if any('02-220610' in x['constat'] for x in d) else 'f')" 2>/dev/null)"

# La comparaison ignore la ponctuation : « 02-214147 », « 02 214 147 » et
# « 02214147 » désignent le même engin, et trois services les écrivent de trois
# façons. Sans cela, le contrôle crierait au loup sur chaque circuit.
$PSQL -c "UPDATE circuits SET vehicule_immat='02214147' WHERE id='$CIRCUIT';" >/dev/null 2>&1
code "$API/communes/$COMMUNE/coherence" -H "Authorization: Bearer $T_DIR" >/dev/null
chk "une immatriculation écrite autrement est reconnue" "f" \
    "$(python3 -c "
import json
d = json.load(open('/tmp/siipi_m3.json'))
print('t' if any('02214147' in x['constat'] for x in d) else 'f')" 2>/dev/null)"
$PSQL -c "UPDATE circuits SET vehicule_immat=NULL WHERE id='$CIRCUIT';" >/dev/null 2>&1

# Un engin créé pour l'occasion, immobilisé et sans motif : on ne touche pas à
# l'inventaire réel, et le résultat ne dépend plus de ce qu'une section
# précédente a modifié.
code -X POST "$API/trucks?communeId=$COMMUNE" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"registration":"TEST-M3-SANSMOTIF","type":"balayeuse","categorie":"poids_lourd","etat":"en_panne"}' >/dev/null
chk "un engin immobilisé sans motif est remonté" "t" \
    "$(code "$API/communes/$COMMUNE/coherence" -H "Authorization: Bearer $T_DIR" >/dev/null; python3 -c "
import json
d = json.load(open('/tmp/siipi_m3.json'))
print('t' if any(x['domaine'] == 'parc' and 'sans motif' in x['constat'] for x in d) else 'f')" 2>/dev/null)"
# Chaque écart dit ce qu'il y a à faire. Un constat sans suite est un constat
# qu'on relit chaque matin sans jamais le traiter.
chk "chaque écart indique ce qu'il y a à faire" "t" \
    "$(python3 -c "
import json
d = json.load(open('/tmp/siipi_m3.json'))
print('t' if d and all(x.get('quoi_faire') for x in d) else 'f')" 2>/dev/null)"
# Le recoupement porte sur les données de la commune : il ne doit pas ouvrir
# une fenêtre sur celles d'une autre.
AUTRE=$(sql "SELECT id FROM communes WHERE activee AND id <> '$COMMUNE' ORDER BY id LIMIT 1")
if [ -n "$AUTRE" ]; then
  CODE=$(code "$API/communes/$AUTRE/coherence" -H "Authorization: Bearer $T_DIR")
  chk "le recoupement d'une autre commune est refusé" 403 "$CODE"
fi

# Le nettoyage n'a rien à restaurer : aucune ligne de l'inventaire réel n'a
# été modifiée. Seuls les engins « TEST-M3… » disparaissent.
nettoyer
$PSQL -c "UPDATE circuits SET vehicule_id=NULL, vehicule_immat=NULL WHERE commune_id='$COMMUNE' AND code='LEVEE-1';" >/dev/null 2>&1

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
