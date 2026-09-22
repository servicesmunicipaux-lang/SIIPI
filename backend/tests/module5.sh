#!/usr/bin/env bash
# =============================================================================
# Module 5 — Communication & relation citoyen.
#
# CE QUE CETTE CAMPAGNE VÉRIFIE D'ABORD. Avant les fonctionnalités, deux
# choses qui, mal faites, causent des dégâts qu'on ne rattrape pas :
#
#   1. Qu'un contenu marqué « exemple » ne puisse JAMAIS partir vers les
#      citoyens. Un sondage de démonstration pris pour une consultation réelle
#      n'est pas une gêne : les réponses données ne se reprennent pas.
#   2. Qu'aucune route ne rende la LISTE des citoyens d'un périmètre. Le
#      module en rend le nombre. La différence entre les deux est celle entre
#      un outil de ciblage et un fichier de destinataires.
#
#   docker compose run --rm api npm run test:module5
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
# Rend le message d'erreur de PostgreSQL : sert à vérifier qu'une garde a bien
# refusé, et laquelle.
refus() { $PSQL -c "$1" 2>&1 | grep -c "$2"; }
code() { curl -s -o /tmp/siipi_m5.json -w '%{http_code}' "$@"; }
val()  { python3 -c "import json;print(json.load(open('/tmp/siipi_m5.json'))$1)" 2>/dev/null || echo erreur; }
nb()   { python3 -c "import json;print(len(json.load(open('/tmp/siipi_m5.json'))))" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

COMMUNE=$(sql "SELECT id FROM communes WHERE name ILIKE '%Chaâbane%' OR name ILIKE '%Chaabane%' OR id LIKE '%dar_chaabane%' ORDER BY length(name) LIMIT 1")
[ -n "$COMMUNE" ] || { echo "Dar Chaabane absente. Lancer : npm run seed && npm run seed:dar-chaabane" >&2; exit 1; }

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id='$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
[ -n "$DIR_EMAIL" ] || DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }

AUTRE=$(sql "SELECT id FROM communes WHERE id <> '$COMMUNE' ORDER BY id LIMIT 1")

nettoyer() {
  $PSQL -c "DELETE FROM sondage_reponses WHERE publication_id IN (SELECT id FROM publications WHERE titre_fr LIKE 'TEST-M5%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM sondage_questions WHERE publication_id IN (SELECT id FROM publications WHERE titre_fr LIKE 'TEST-M5%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM envois_notification WHERE publication_id IN (SELECT id FROM publications WHERE titre_fr LIKE 'TEST-M5%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM publication_documents WHERE publication_id IN (SELECT id FROM publications WHERE titre_fr LIKE 'TEST-M5%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM publications WHERE titre_fr LIKE 'TEST-M5%';" >/dev/null 2>&1
}
nettoyer

# -----------------------------------------------------------------------------
echo
echo "1. Ce qui ne peut pas arriver aux citoyens"

# Un exemple publié est un incident : les réponses déjà données ne se reprennent pas.
chk "la base refuse de publier un contenu « exemple »" 1 \
    "$(refus "INSERT INTO publications (commune_id,type,titre_fr,statut,est_exemple) VALUES ('$COMMUNE','notification','TEST-M5 exemple','publiee',true);" PUBLICATION_EXEMPLE)"

chk "les exemples chargés sont tous en brouillon" 0 \
    "$(sql "SELECT count(*) FROM publications WHERE commune_id='$COMMUNE' AND est_exemple AND statut='publiee'")"

# Le contrat d'API ne doit rendre AUCUNE liste de citoyens.
chk "le contrat ne publie aucune liste de destinataires" 0 \
    "$(curl -s "$API/openapi.json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
s=d.get('components',{}).get('schemas',{}).get('Destinataires',{}).get('properties',{})
# Le schéma ne doit porter que des nombres, jamais un tableau ni un identifiant.
print(sum(1 for v in s.values() if v.get('type') not in ('integer','number')))" 2>/dev/null || echo erreur)"

chk "aucune route de communication ne rend citoyen_id" 0 \
    "$(curl -s "$API/openapi.json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
mauvais=0
for chemin,ops in d.get('paths',{}).items():
    if not chemin.startswith('/communication'): continue
    if 'citoyen_id' in json.dumps(ops): mauvais+=1
print(mauvais)" 2>/dev/null || echo erreur)"

# -----------------------------------------------------------------------------
echo
echo "2. Le ciblage, sur le vrai découpage de la commune"

chk "GET /communication/apercu répond" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/communication/apercu?communeId=$COMMUNE&perimetreType=commune")"
chk "l'aperçu rend trois nombres, pas une liste" "3" \
    "$(python3 -c "import json;d=json.load(open('/tmp/siipi_m5.json'));print(len(d)) if isinstance(d,dict) else print('liste')" 2>/dev/null)"
chk "et ces trois-là précisément" "desabonnes,joignables,sans_adresse" \
    "$(python3 -c "import json;print(','.join(sorted(json.load(open('/tmp/siipi_m5.json')))))" 2>/dev/null)"

# Le nombre d'inscrits sans adresse est une donnée d'action : une commune qui
# croit toucher tout le monde décide sur un chiffre faux.
SANS_ADR=$(sql "SELECT count(*) FROM citoyens WHERE commune_id='$COMMUNE' AND deleted_at IS NULL AND zone_id IS NULL AND position IS NULL")
code -H "Authorization: Bearer $T_DIR" "$API/communication/apercu?communeId=$COMMUNE&perimetreType=zones&zoneIds=$(sql "SELECT id FROM zones_collecte WHERE commune_id='$COMMUNE' AND status='active' AND deleted_at IS NULL ORDER BY code LIMIT 1")" >/dev/null
chk "l'aperçu compte les inscrits sans adresse" "$SANS_ADR" "$(val "['sans_adresse']")"

# -----------------------------------------------------------------------------
echo
echo "3. Créer, publier, envoyer"

ZONE=$(sql "SELECT id FROM zones_collecte WHERE commune_id='$COMMUNE' AND status='active' AND deleted_at IS NULL ORDER BY code LIMIT 1")
if [ -n "$ZONE" ]; then
  CIBLAGE="\"perimetreType\":\"zones\",\"zoneIds\":[\"$ZONE\"]"
else
  CIBLAGE="\"perimetreType\":\"commune\""
fi

chk "création d'une notification ciblée" 201 \
    "$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"type\":\"notification\",\"titreFr\":\"TEST-M5 report de tournée\",\"titreAr\":\"تأجيل\",$CIBLAGE}" \
       "$API/communication?communeId=$COMMUNE")"
NOTIF=$(val "['id']")
chk "elle naît en brouillon" "brouillon" "$(val "['statut']")"
chk "et n'est pas marquée exemple" "False" "$(val "['est_exemple']")"

# Envoyer avant de publier n'a pas de sens : l'un rend visible, l'autre pousse.
chk "envoyer avant d'avoir publié est refusé" 400 \
    "$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' -d '{}' \
       "$API/communication/$NOTIF/envoyer")"

chk "publication" 200 \
    "$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' -d '{}' \
       "$API/communication/$NOTIF/publier")"
chk "la date de publication se pose seule" "True" \
    "$(python3 -c "import json;print(json.load(open('/tmp/siipi_m5.json'))['publiee_le'] is not None)" 2>/dev/null)"

# Un envoi vers zéro destinataire est un envoi raté : on refuse plutôt que
# d'inscrire « 0 » à l'historique et de laisser croire que c'est parti.
JOIGNABLES=$(sql "SELECT joignables FROM app.destinataires_publication('$NOTIF')")
CODE_ENVOI=$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' -d '{}' "$API/communication/$NOTIF/envoyer")
if [ "${JOIGNABLES:-0}" = "0" ]; then
  chk "un envoi sans destinataire est refusé" 400 "$CODE_ENVOI"
else
  chk "envoi enregistré" 201 "$CODE_ENVOI"
  chk "l'historique retient le nombre, pas les noms" 0 \
      "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name='envois_notification' AND column_name ~ 'citoyen|destinataire_id|liste'")"
fi

# -----------------------------------------------------------------------------
echo
echo "4. Le questionnaire"

chk "création d'un sondage" 201 \
    "$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"type\":\"sondage\",\"titreFr\":\"TEST-M5 satisfaction\"}" "$API/communication?communeId=$COMMUNE")"
SONDAGE=$(val "['id']")

chk "questionnaire enregistré" 200 \
    "$(code -X PUT -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d '[{"libelleFr":"Le passage est-il régulier ?","libelleAr":"هل الرفع منتظم؟","type":"choix_unique","optionsFr":["Toujours","Rarement"],"optionsAr":["دائما","نادرا"]},{"libelleFr":"Note","type":"note"}]' \
       "$API/communication/$SONDAGE/questions")"
chk "deux questions" 2 "$(nb)"

# Deux langues, deux listes de même longueur : décalées, l'arabophone ne coche
# pas ce qu'il croit cocher et le dépouillement est faux sans qu'on le voie.
# La contrainte est en base : l'API doit la traduire en 400, pas en 500.
chk "options FR et AR de longueurs différentes : refusé proprement" 400 \
    "$(code -X PUT -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d '[{"libelleFr":"Q","type":"choix_unique","optionsFr":["a","b","c"],"optionsAr":["أ","ب"]}]' \
       "$API/communication/$SONDAGE/questions")"

chk "une question à choix avec une seule option : refusé" 1 \
    "$(refus "INSERT INTO sondage_questions (publication_id,libelle_fr,type,options_fr) VALUES ('$SONDAGE','Q','choix_unique',ARRAY['seul']);" options_coherentes)"

chk "GET /depouillement répond" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/communication/$SONDAGE/depouillement")"

# -----------------------------------------------------------------------------
echo
echo "5. L'ordre des routes et les erreurs"

chk "« apercu » n'est pas pris pour un identifiant" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/communication/apercu?communeId=$COMMUNE")"
chk "« envois » non plus" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/communication/envois?communeId=$COMMUNE")"
chk "« coherence » non plus" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/communication/coherence?communeId=$COMMUNE")"
chk "un identifiant inconnu rend 404" 404 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/communication/00000000-0000-0000-0000-000000000000")"
chk "un identifiant mal formé rend 400, pas 500" 400 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/communication/pas-un-uuid")"
chk "sans jeton, 401" 401 "$(code "$API/communication?communeId=$COMMUNE")"

# -----------------------------------------------------------------------------
echo
echo "6. Cloisonnement"

if [ -n "$AUTRE" ]; then
  ZONE_AUTRE=$(sql "SELECT id FROM zones_collecte WHERE commune_id='$AUTRE' AND deleted_at IS NULL LIMIT 1")
  if [ -n "$ZONE_AUTRE" ]; then
    chk "cibler le secteur d'une autre commune est refusé" 1 \
        "$(refus "INSERT INTO publications (commune_id,type,titre_fr,perimetre_type,zone_ids) VALUES ('$COMMUNE','notification','TEST-M5 fuite','zones',ARRAY['$ZONE_AUTRE']::uuid[]);" ZONE_HORS_COMMUNE)"
  fi
  code -H "Authorization: Bearer $T_DIR" "$API/communication?communeId=$AUTRE" >/dev/null
  chk "les publications d'une autre commune ne sont pas lisibles" 0 "$(nb)"
fi

chk "un compte anonyme ne voit aucune publication (base)" 0 \
    "$(sql "BEGIN; SET LOCAL ROLE siipi_app; SET LOCAL app.role='anonyme'; SELECT count(*) FROM publications; ROLLBACK;" | tail -1)"
chk "un compte anonyme ne voit aucun envoi (base)" 0 \
    "$(sql "BEGIN; SET LOCAL ROLE siipi_app; SET LOCAL app.role='anonyme'; SELECT count(*) FROM envois_notification; ROLLBACK;" | tail -1)"

# Le citoyen ne doit pas lire la table : il y verrait les brouillons de sa
# commune. Il lit la fonction, qui applique le ciblage.
chk "un citoyen ne lit pas la table des publications (base)" 0 \
    "$(sql "BEGIN; SET LOCAL ROLE siipi_app; SET LOCAL app.role='citoyen'; SELECT count(*) FROM publications; ROLLBACK;" | tail -1)"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
