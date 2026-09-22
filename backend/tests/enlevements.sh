#!/usr/bin/env bash
# =============================================================================
# Test des flux occasionnels : déchets verts, DDC, encombrants
# (migration 023).
#
# Ce module existe parce que l'interdiction du collecteur informel ne tient
# que si l'alternative légale est visible. Les tests vérifient donc en premier
# lieu que cette alternative est bien accessible au citoyen — y compris depuis
# une commune qui n'a pas encore fait son annuaire — et ensuite seulement que
# le cloisonnement des demandes tient.
#
#   docker compose run --rm api npm run test:enlevements
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
code() { curl -s -o /tmp/siipi_e.json -w '%{http_code}' "$@"; }
len()  { python3 -c "import json;d=json.load(open('/tmp/siipi_e.json'));print(len(d) if isinstance(d,list) else 'non-liste')" 2>/dev/null || echo erreur; }
# Ne compte que les lignes créées par cette campagne. Un banc d'essai qui
# suppose une base vide ne peut pas tourner sur une base de recette alimentée.
lenTest() { python3 -c "
import json
d = json.load(open('/tmp/siipi_e.json'))
champ = '$1'
print(sum(1 for x in d if str(x.get(champ) or '').startswith('TEST')))" 2>/dev/null || echo erreur; }
jq_()  { python3 -c "import json,sys;d=json.load(open('/tmp/siipi_e.json'));print($1)" 2>/dev/null || echo erreur; }
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
DANS_3J=$(date -u -d '+3 days' +%F)

$PSQL -c "DELETE FROM demandes_enlevement WHERE description LIKE 'TEST %';
          DELETE FROM collecteurs_agrees WHERE raison_sociale LIKE 'TEST %';
          UPDATE citoyens SET commune_id = NULL, adresse = NULL, position = NULL, zone_id = NULL;" >/dev/null 2>&1

echo
echo "1. L'annuaire des collecteurs agréés"
CODE=$(code -X POST "$API/enlevements/collecteurs" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d '{"communeId":"medenine_djerba_houmt_souk","raisonSociale":"TEST Verts de Djerba","agrementAnged":"ANGeD-2026-014","typesDechets":["vert"],"telephone":"75123456"}')
chk "la commune inscrit un collecteur de déchets verts" 201 "$CODE"
COLL_VERT=$(jq_ "d['id']")
CODE=$(code -X POST "$API/enlevements/collecteurs" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d '{"communeId":"medenine_djerba_houmt_souk","raisonSociale":"TEST DDC Sud","typesDechets":["ddc","metal"],"telephone":"75987654"}')
chk "et un collecteur de DDC" 201 "$CODE"
chk "un collecteur sans numéro d'agrément est accepté" "None" "$(jq_ "d['agrement_anged']")"

CODE=$(code -X POST "$API/enlevements/collecteurs" -H "Authorization: Bearer $T_PREST" -H 'Content-Type: application/json' \
  -d '{"communeId":"medenine_djerba_houmt_souk","raisonSociale":"TEST intrusion","typesDechets":["vert"]}')
chk "un prestataire n'inscrit personne" 403 "$CODE"
CODE=$(code -X POST "$API/enlevements/collecteurs" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d '{"communeId":"medenine_djerba_houmt_souk","raisonSociale":"TEST commune voisine","typesDechets":["vert"]}')
chk "une autre commune non plus" 403 "$CODE"

CODE=$(code -X POST "$API/enlevements/collecteurs" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d '{"communeId":"medenine_djerba_houmt_souk","raisonSociale":"TEST type inventé","typesDechets":["nucleaire"]}')
chk "un type de déchet hors nomenclature est refusé" 400 "$CODE"

echo
echo "2. Le citoyen trouve l'alternative légale"
CODE=$(code "$API/enlevements/collecteurs?communeId=$COMMUNE" -H "Authorization: Bearer $T_CIT")
chk "il voit les collecteurs de sa commune" 2 "$(lenTest raison_sociale)"
CODE=$(code "$API/enlevements/collecteurs?communeId=$COMMUNE&type=vert" -H "Authorization: Bearer $T_CIT")
chk "filtrés par type, il ne voit que ceux qui le concernent" 1 "$(lenTest raison_sociale)"
chk "avec le téléphone, qui est tout l'intérêt" "75123456" \
    "$(jq_ "[x['telephone'] for x in d if str(x['raison_sociale']).startswith('TEST')][0]")"

# Une commune voisine doit pouvoir consulter l'annuaire d'à côté : c'est ainsi
# que les 350 annuaires se rempliront, par imitation.
CODE=$(code "$API/enlevements/collecteurs?communeId=$COMMUNE" -H "Authorization: Bearer $T_MARSA")
chk "une autre commune peut s'en inspirer" 2 "$(lenTest raison_sociale)"

CODE=$(code -X PATCH "$API/enlevements/collecteurs/$COLL_VERT" -H "Authorization: Bearer $T_HS" \
  -H 'Content-Type: application/json' -d '{"actif":false}')
chk "la commune désactive un collecteur" 200 "$CODE"
CODE=$(code "$API/enlevements/collecteurs?communeId=$COMMUNE" -H "Authorization: Bearer $T_CIT")
chk "il disparaît de la vue du citoyen" 1 "$(lenTest raison_sociale)"
CODE=$(code "$API/enlevements/collecteurs?communeId=$COMMUNE" -H "Authorization: Bearer $T_HS")
chk "mais la commune le garde sous les yeux" 2 "$(lenTest raison_sociale)"
code -X PATCH "$API/enlevements/collecteurs/$COLL_VERT" -H "Authorization: Bearer $T_HS" \
  -H 'Content-Type: application/json' -d '{"actif":true}' >/dev/null

echo
echo "3. La demande d'enlèvement"
CODE=$(code -X POST "$API/enlevements" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d '{"typeDechet":"ddc","volumeM3":3,"description":"TEST DDC de salle de bain"}')
chk "sans adresse déclarée, la demande est refusée et on dit pourquoi" 400 "$CODE"

code -X POST "$API/citoyen/adresse" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"$COMMUNE\",\"adresse\":\"Rue de test, Houmt Souk\",\"lat\":33.875,\"lng\":10.857}" >/dev/null

CODE=$(code -X POST "$API/enlevements" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d "{\"typeDechet\":\"ddc\",\"volumeM3\":3,\"description\":\"TEST DDC de salle de bain\",\"acces\":\"rue\",\"dateSouhaitee\":\"$DANS_3J\"}")
chk "avec une adresse, elle est enregistrée" 201 "$CODE"
DEMANDE=$(jq_ "d['id']")
chk "elle porte un numéro citable au guichet" "t" "$(jq_ "'t' if d['numero'].startswith('ENL-') else 'f'")"
chk "elle est rattachée à la commune du domicile" "$COMMUNE" "$(jq_ "d['commune_id']")"
chk "l'adresse du domicile est reprise par défaut" "t" \
    "$($PSQL -c "SELECT adresse FROM demandes_enlevement WHERE id='$DEMANDE'" 2>/dev/null | grep -q 'Rue de test' && echo t || echo f)"
CODE=$(code "$API/enlevements" -H "Authorization: Bearer $T_CIT")
chk "le volume sort en nombre, pas en texte" "t" \
    "$(jq_ "'t' if isinstance(d[0]['volume_estime_m3'], (int, float)) else 'f'")"
CODE=$(code -X POST "$API/enlevements" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d '{"typeDechet":"ddc","volumeM3":500,"description":"TEST volume aberrant"}')
chk "un volume aberrant est refusé" 400 "$CODE"

echo
echo "4. La commune répond"
CODE=$(code "$API/enlevements?communeId=$COMMUNE" -H "Authorization: Bearer $T_HS")
chk "la commune voit la demande" 1 "$(lenTest description)"
CODE=$(code "$API/enlevements?communeId=$COMMUNE" -H "Authorization: Bearer $T_MARSA")
chk "une autre commune ne la voit pas" 0 "$(lenTest description)"
CODE=$(code "$API/enlevements?communeId=$COMMUNE" -H "Authorization: Bearer $T_PREST")
chk "un prestataire non plus" 0 "$(lenTest description)"

CODE=$(code -X PATCH "$API/enlevements/$DEMANDE" -H "Authorization: Bearer $T_CIT" \
  -H 'Content-Type: application/json' -d '{"statut":"realisee"}')
chk "le citoyen ne clôt pas sa propre demande" 403 "$CODE"

CODE=$(code -X PATCH "$API/enlevements/$DEMANDE" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d "{\"statut\":\"planifiee\",\"datePrevue\":\"$DANS_3J\",\"montantDt\":45,\"paiementStatut\":\"du\",\"reponseCommune\":\"Camion-benne, matinée\"}")
chk "la commune planifie et annonce un montant" 200 "$CODE"
chk "le montant sort en nombre" "t" "$(jq_ "'t' if isinstance(d['montant_dt'],(int,float)) else 'f'")"

CODE=$(code "$API/enlevements" -H "Authorization: Bearer $T_CIT")
chk "le citoyen voit la réponse" 1 "$(lenTest description)"
chk "avec le montant à payer" "45.0" "$(jq_ "float(d[0]['montant_dt'])")"

echo
echo "5. Orientation vers un collecteur agréé"
CODE=$(code -X POST "$API/enlevements" -H "Authorization: Bearer $T_CIT" -H 'Content-Type: application/json' \
  -d '{"typeDechet":"vert","volumeM3":1,"description":"TEST taille de haie"}')
DEMANDE2=$(jq_ "d['id']")
CODE=$(code -X PATCH "$API/enlevements/$DEMANDE2" -H "Authorization: Bearer $T_HS" \
  -H 'Content-Type: application/json' -d '{"statut":"orientee_collecteur"}')
chk "orienter sans désigner de collecteur est refusé" 400 "$CODE"
CODE=$(code -X PATCH "$API/enlevements/$DEMANDE2" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d "{\"statut\":\"orientee_collecteur\",\"collecteurId\":\"$COLL_VERT\",\"reponseCommune\":\"La commune ne collecte pas les déchets verts.\"}")
chk "avec un collecteur, l'orientation passe" 200 "$CODE"
CODE=$(code "$API/enlevements" -H "Authorization: Bearer $T_CIT")
chk "le citoyen reçoit le nom du collecteur" "TEST Verts de Djerba" \
    "$(jq_ "[x['collecteur_nom'] for x in d if x['id']=='$DEMANDE2'][0]")"
chk "et son téléphone, sans avoir à le chercher" "75123456" \
    "$(jq_ "[x['collecteur_telephone'] for x in d if x['id']=='$DEMANDE2'][0]")"

echo
echo "6. Le paiement, tracé mais hors plateforme"
CODE=$(code -X PATCH "$API/enlevements/$DEMANDE" -H "Authorization: Bearer $T_HS" -H 'Content-Type: application/json' \
  -d '{"statut":"realisee","paiementStatut":"regle","paiementMode":"espece","paiementReference":"REC-0012"}')
chk "la commune constate le règlement" 200 "$CODE"
chk "la date d'encaissement est posée par le serveur" "t" \
    "$([ -n "$(sql "SELECT paiement_le FROM demandes_enlevement WHERE id='$DEMANDE' AND paiement_le IS NOT NULL")" ] && echo t || echo f)"
# Un règlement sans montant annoncé, c'est de l'argent encaissé sans trace de
# ce qui le justifiait : la base doit le refuser, pas seulement l'API.
chk "un règlement sans montant est impossible en base" "t" \
    "$($PSQL -c "UPDATE demandes_enlevement SET montant_dt = NULL WHERE id='$DEMANDE'" 2>&1 | grep -qi "demandes_paiement_coherent" && echo t || echo f)"

echo
echo "7. Journal et suppression"
chk "les demandes sont au journal d'audit" "t" \
    "$([ "$(sql "SELECT count(*) FROM audit_log WHERE record_id='$DEMANDE'")" -ge 1 ] && echo t || echo f)"
CODE=$(code -X DELETE "$API/enlevements/collecteurs/$COLL_VERT" -H "Authorization: Bearer $T_HS")
chk "un collecteur est retiré de l'annuaire" 204 "$CODE"
chk "sa fiche reste en base" 1 "$(sql "SELECT count(*) FROM collecteurs_agrees WHERE id='$COLL_VERT'")"
CODE=$(code "$API/enlevements/collecteurs?communeId=$COMMUNE" -H "Authorization: Bearer $T_CIT")
chk "il disparaît de l'annuaire citoyen" 1 "$(lenTest raison_sociale)"

$PSQL -c "DELETE FROM demandes_enlevement WHERE description LIKE 'TEST %';
          DELETE FROM collecteurs_agrees WHERE raison_sociale LIKE 'TEST %';
          UPDATE citoyens SET commune_id = NULL, adresse = NULL, position = NULL, zone_id = NULL;" >/dev/null 2>&1

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
