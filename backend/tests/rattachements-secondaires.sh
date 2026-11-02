#!/usr/bin/env bash
# =============================================================================
# v0.15.87 — les rattachements secondaires, sur les réclamations et les secteurs.
# Constats de la relecture de la v0.15.86 (02/11/2026) ; migration 095.
#
# Le même défaut que la position des engins (v0.15.86) vivait sur deux autres
# domaines : les routes des réclamations (/tickets/:id/accept, refuse, assign,
# treat, notification/renvoyer) et des secteurs (PATCH et DELETE /zones/:id)
# doublaient la RLS d'un contrôle sur le rattachement PRINCIPAL du compte, et
# refusaient par un 403 un directeur rattaché à une seconde commune, à qui la
# base donnait ces lignes. L'affectation d'un prestataire (secteur, réclamation)
# exigeait sa commune principale : un prestataire sous contrat avec une seconde
# commune n'y était jamais affectable. Et app.mes_communes() bornait un
# rattachement par la date du serveur, pas celle de Tunis (règle 1.3).
#
# Elle commence par ce qui doit être refusé :
#   - un directeur sans rattachement, un rattachement qui ne commence que
#     demain, un rattachement échu : introuvable (404), jamais « refusé » ;
#   - l'affectation d'un prestataire sans contrat, au contrat échu, d'un compte
#     qui n'est pas prestataire, d'un compte inconnu (400) ;
#   - en base, app.prestataire_de_commune() ne répond pas à qui ne peut pas
#     écrire la commune (elle ne sert pas à sonder les comptes) ;
#   - et, sous deux fuseaux de session extrêmes, un rattachement échu la veille
#     à Tunis ou qui commence aujourd'hui à Tunis, lu au jour de Tunis.
# Puis ce qui doit marcher : le directeur rattaché en second traite les
# réclamations et modifie un secteur (la définition d'un secteur reste à la
# FNCT) ; le prestataire sous contrat est affecté à une réclamation et à un
# secteur, et traite la réclamation ; le prestataire de la commune principale
# reste affectable. Aucune ligne d'une commune réelle ne bouge.
#
#   docker compose exec -T api npm run test:rattachements-secondaires
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_rattache_a
B=test_rattache_b
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
champ() { python3 -c "import json;print(json.load(open('$T/r.json')).get('$1',''))" 2>/dev/null; }
statut() { sql "SELECT status FROM tickets WHERE id = '$1'"; }
rattacher() { # utilisateur commune [date_debut] [date_fin]
  $PSQL -c "DELETE FROM utilisateur_communes WHERE user_id = '$1' AND commune_id = '$2';
            INSERT INTO utilisateur_communes (user_id, commune_id, contrat_reference, date_debut, date_fin)
            VALUES ('$1', '$2', 'TEST-CONTRAT-0001', ${3:-NULL}, ${4:-NULL});" >/dev/null
}
ticket() { # numéro — identifiant d'une réclamation reçue de la commune A
  sql "INSERT INTO tickets (ticket_number, commune_id, category, title) VALUES ('TEST-RAT-$1-$$', '$A', 'point_noir', 'TEST réclamation $1') RETURNING id" | head -1
}

nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
  rm -rf "$T"
}
effacer_communes_essai "$ESSAI"
trap nettoyer EXIT
releve_base_reelle

# --- Le terrain : deux communes de test, des comptes, des réclamations, un secteur
commune_essai "$A" "TEST commune A des rattachements"
commune_essai "$B" "TEST commune B des rattachements"
compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); DIR_A=$COMPTE_ID
# Le directeur et le prestataire « secondaires » ont B pour commune principale.
compte_temporaire admin_commune "$B" "Directeur B"; T_D=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); DIR=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$B" "Prestataire sous contrat"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); PRE=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$A" "Prestataire de A"; PRE_A=$COMPTE_ID
[ -n "$T_A" ] && [ -n "$T_D" ] && [ -n "$T_P" ] || { echo "API injoignable sur $API, ou comptes non connectés." >&2; exit 1; }
K1=$(ticket 1); K2=$(ticket 2); K3=$(ticket 3); K4=$(ticket 4)
$PSQL -c "INSERT INTO zones_collecte (commune_id, name, geom) VALUES
            ('$A', 'TEST secteur des rattachements', ST_Multi(ST_MakeEnvelope(10.0, 36.0, 10.01, 36.01, 4326)));" >/dev/null
Z=$(sql "SELECT id FROM zones_collecte WHERE commune_id = '$A'")
[ -n "$K1" ] && [ -n "$K4" ] && [ -n "$Z" ] || { echo "Impossible de poser les réclamations ou le secteur de test." >&2; exit 1; }
HIER="(app.jour_tunis() - 1)"; AUJOURDHUI="app.jour_tunis()"; DEMAIN="(app.jour_tunis() + 1)"

echo "1. Hors du périmètre : introuvable, jamais « refusé »"
chk "le directeur de B, sans rattachement à A : réclamation introuvable (accepter, refuser, traiter)" "404|404|404" \
    "$(appel PATCH "/tickets/$K1/accept" "$T_D")|$(appel PATCH "/tickets/$K1/refuse" "$T_D" '{"reason":"TEST motif"}')|$(appel PATCH "/tickets/$K1/treat" "$T_D" '{"status":"en_cours"}')"
chk "… secteur introuvable (modifier, retirer)" "404|404" \
    "$(appel PATCH "/zones/$Z" "$T_D" '{"description":"TEST"}')|$(appel DELETE "/zones/$Z" "$T_D")"
rattacher "$DIR" "$A" "$DEMAIN"
chk "un rattachement qui ne commence que demain : toujours introuvable" "404|404" \
    "$(appel PATCH "/tickets/$K1/accept" "$T_D")|$(appel PATCH "/zones/$Z" "$T_D" '{"description":"TEST"}')"
rattacher "$DIR" "$A" NULL "$HIER"
chk "un rattachement échu hier : introuvable" "404|404" \
    "$(appel PATCH "/tickets/$K1/accept" "$T_D")|$(appel PATCH "/zones/$Z" "$T_D" '{"description":"TEST"}')"
chk "… et la réclamation n'a pas bougé" recu "$(statut "$K1")"

echo
echo "2. Ce qu'on ne peut pas affecter"
chk "un prestataire sans contrat avec A : ni à une réclamation, ni à un secteur (400)" "400|400" \
    "$(appel PATCH "/tickets/$K3/assign" "$T_A" "{\"prestataireUserId\":\"$PRE\"}")|$(appel PATCH "/zones/$Z" "$T_A" "{\"assignedPrestataireId\":\"$PRE\"}")"
chk "… le message dit ce qui est attendu" 1 "$(grep -c 'contrat en cours' "$T/r.json")"
rattacher "$PRE" "$A" NULL "$HIER"
chk "un prestataire au contrat échu hier : refusé" "400|400" \
    "$(appel PATCH "/tickets/$K3/assign" "$T_A" "{\"prestataireUserId\":\"$PRE\"}")|$(appel PATCH "/zones/$Z" "$T_A" "{\"assignedPrestataireId\":\"$PRE\"}")"
rattacher "$PRE" "$A" "$DEMAIN"
chk "un contrat qui ne commence que demain : refusé" 400 "$(appel PATCH "/tickets/$K3/assign" "$T_A" "{\"prestataireUserId\":\"$PRE\"}")"
chk "un compte qui n'est pas prestataire (un directeur), un compte inconnu : refusés" "400|400" \
    "$(appel PATCH "/tickets/$K3/assign" "$T_A" "{\"prestataireUserId\":\"$DIR\"}")|$(appel PATCH "/tickets/$K3/assign" "$T_A" "{\"prestataireUserId\":\"00000000-0000-4000-8000-000000000000\"}")"
chk "… la réclamation et le secteur n'ont pas bougé" "recu|" \
    "$(statut "$K3")|$(sql "SELECT assigned_prestataire_id FROM zones_collecte WHERE id = '$Z'")"

echo
echo "3. En base"
rattacher "$PRE" "$A"
sonde() { # rôle commune utilisateur — lignes rendues par app.prestataire_de_commune
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.commune_id', '$2', true), set_config('app.user_id', '$3', true);
            SET LOCAL ROLE siipi_app; SELECT 'lignes:' || count(*) FROM app.prestataire_de_commune('$PRE', '$A'); ROLLBACK;" 2>&1 | grep -oE '^lignes:[0-9]+' | cut -d: -f2
}
chk "app.prestataire_de_commune ne répond pas à qui ne peut pas écrire A (directeur de B, prestataire) ; répond au directeur de A (témoin)" "0|0|1" \
    "$(sonde admin_commune "$B" "$DIR")|$(sonde gestionnaire_prestataire "$B" "$PRE")|$(sonde admin_commune "$A" "$DIR_A")"
# Règle 1.3. Sous UTC−12 et sous UTC+14, la date de la session diffère de celle
# de Tunis, à toute heure, pour l'un des deux fuseaux au moins : une borne lue à
# la date de la session se tromperait sous l'un d'eux.
communes_vues() { # fuseau — A est-il dans app.mes_communes() du directeur de B ?
  $PSQL -c "BEGIN; SET LOCAL TIME ZONE '$1';
            SELECT set_config('app.role', 'admin_commune', true), set_config('app.commune_id', '$B', true), set_config('app.user_id', '$DIR', true);
            SELECT 'vu:' || ('$A' = ANY (app.mes_communes())); ROLLBACK;" 2>&1 | grep -oE '^vu:(true|false)' | cut -d: -f2
}
rattacher "$DIR" "$A" NULL "$HIER"
chk "un rattachement échu hier à Tunis ne donne rien, sous UTC−12 comme sous UTC+14" "false|false" "$(communes_vues 'Etc/GMT+12')|$(communes_vues 'Etc/GMT-14')"
rattacher "$DIR" "$A" "$AUJOURDHUI" "$AUJOURDHUI"
chk "un rattachement d'aujourd'hui seulement, à Tunis, donne A, sous UTC−12 comme sous UTC+14" "true|true" "$(communes_vues 'Etc/GMT+12')|$(communes_vues 'Etc/GMT-14')"

echo
echo "4. Le directeur rattaché en second"
rattacher "$DIR" "$A"
chk "il accepte une réclamation de A" "200|en_cours" "$(appel PATCH "/tickets/$K1/accept" "$T_D")|$(statut "$K1")"
chk "il en refuse une, avec son motif" "200|rejete" "$(appel PATCH "/tickets/$K2/refuse" "$T_D" '{"reason":"TEST motif du refus"}')|$(statut "$K2")"
chk "il en traite une" "200|en_cours" "$(appel PATCH "/tickets/$K4/treat" "$T_D" '{"status":"en_cours"}')|$(statut "$K4")"
chk "la relance d'une notification passe le périmètre (il n'y a rien à relancer)" "404|1" \
    "$(appel PATCH "/tickets/$K1/notification/renvoyer" "$T_D")|$(grep -c 'Aucune notification' "$T/r.json")"
chk "il modifie la description d'un secteur de A" "200|TEST-modifie" \
    "$(appel PATCH "/zones/$Z" "$T_D" '{"description":"TEST-modifie"}')|$(sql "SELECT description FROM zones_collecte WHERE id = '$Z'")"
chk "la définition d'un secteur (nom) et son retrait restent à la FNCT (403, sur proposition)" "403|403" \
    "$(appel PATCH "/zones/$Z" "$T_D" '{"name":"TEST autre nom"}')|$(appel DELETE "/zones/$Z" "$T_D")"

echo
echo "5. Le prestataire sous contrat"
chk "le directeur de A lui transfère une réclamation, à son nom" "200|assigne|TEST Prestataire sous contrat" \
    "$(appel PATCH "/tickets/$K3/assign" "$T_A" "{\"prestataireUserId\":\"$PRE\"}")|$(statut "$K3")|$(champ assigned_team)"
chk "il la traite" "200|resolu" "$(appel PATCH "/tickets/$K3/treat" "$T_P" '{"status":"resolu"}')|$(statut "$K3")"
chk "le directeur rattaché en second l'affecte à un secteur de A" "200|$PRE" \
    "$(appel PATCH "/zones/$Z" "$T_D" "{\"assignedPrestataireId\":\"$PRE\"}")|$(sql "SELECT assigned_prestataire_id FROM zones_collecte WHERE id = '$Z'")"
chk "le prestataire dont A est la commune principale reste affectable" "200|$PRE_A" \
    "$(appel PATCH "/zones/$Z" "$T_A" "{\"assignedPrestataireId\":\"$PRE_A\"}")|$(sql "SELECT assigned_prestataire_id FROM zones_collecte WHERE id = '$Z'")"
rattacher "$DIR" "$A" NULL "$HIER"
chk "le rattachement échu, le directeur de B ne trouve plus rien" "404|404" \
    "$(appel PATCH "/tickets/$K4/treat" "$T_D" '{"status":"resolu"}')|$(appel PATCH "/zones/$Z" "$T_D" '{"description":"TEST"}')"

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
