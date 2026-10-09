#!/usr/bin/env bash
# =============================================================================
# Comptes et accès (migration 030).
#
# Ce module remplace la création de comptes par fichier de démarrage, qui ne
# tient pas à 350 communes. Il ferme aussi une élévation de privilège : la
# politique d'écriture sur « users » vérifiait la commune mais pas le RÔLE, si
# bien qu'un administrateur communal pouvait s'ouvrir un compte national et
# lire les 350 communes. Aucun test ne la cherchait.
#
#   docker compose run --rm api npm run test:comptes
# =============================================================================

set -u
# Depuis backend/ : la section 7 lance des migrations et une seconde API.
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
code() { curl -s -o /tmp/siipi_cp.json -w '%{http_code}' "$@"; }
val()  { python3 -c "import json;print(json.load(open('/tmp/siipi_cp.json'))$1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

COMMUNE=$(sql "SELECT id FROM communes WHERE activee ORDER BY id LIMIT 1")
DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id='$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
[ -n "$DIR_EMAIL" ] || DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")
FNCT_EMAIL=$(sql "SELECT email FROM users WHERE role='super_admin_fnct' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")

T_DIR=$(tok "$DIR_EMAIL" 'Siipi2026!')
T_FNCT=$(tok "$FNCT_EMAIL" 'Siipi2026!')
[ -n "$T_DIR" ] || { echo "API injoignable, ou mot de passe de démonstration modifié." >&2; exit 1; }

ESSAI="test.compte.$$@siipi.tn"
nettoyer() { $PSQL -c "DELETE FROM users WHERE email LIKE 'test.compte.%@siipi.tn' OR email='$ESSAI';" >/dev/null 2>&1; }
nettoyer
T=$(mktemp -d)
. tests/outils/instance_essai.sh
fin() {
  arreter_api_essai
  retirer_bases_essai
  nettoyer
  rm -rf "$T"
}
trap fin EXIT

echo
echo "1. L'administrateur national accède aux communes sans compte dédié"
# C'est le point de départ : ouvrir un compte par commune ne tient pas à 350.
chk "la FNCT n'a aucune commune de rattachement" "None" \
    "$(code "$API/auth/me" -H "Authorization: Bearer $T_FNCT" >/dev/null; val "['communeId']")"
CODE=$(code "$API/circuits?communeId=$COMMUNE" -H "Authorization: Bearer $T_FNCT")
chk "elle lit pourtant les circuits de la commune" 200 "$CODE"
CODE=$(code "$API/comptes?communeId=$COMMUNE" -H "Authorization: Bearer $T_FNCT")
chk "et la liste de ses comptes" 200 "$CODE"

echo
echo "2. La commune ouvre elle-même un compte, pour une adresse réelle"
CODE=$(code -X POST "$API/comptes" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ESSAI\",\"fullName\":\"Agent de démonstration\",\"role\":\"admin_commune\",\"communeId\":\"$COMMUNE\"}")
chk "le compte est ouvert" 201 "$CODE"
MDP=$(val "['motDePasseProvisoire']")
chk "un mot de passe provisoire est rendu" "t" "$(python3 -c "print('t' if len('$MDP') >= 10 else 'f')")"
chk "le compte est marqué provisoire" "True" "$(val "['mot_de_passe_provisoire']")"
chk "et rattaché à la commune" "$COMMUNE" "$(val "['commune_id']")"
NOUVEAU=$(val "['id']")
chk "l'auteur de l'ouverture est conservé" "t" \
    "$(sql "SELECT (cree_par IS NOT NULL) FROM users WHERE id='$NOUVEAU'")"

echo
echo "3. Le mot de passe provisoire barre l'accès jusqu'à son remplacement"
T_NOUVEAU=$(tok "$ESSAI" "$MDP")
chk "la personne peut se connecter avec" "t" "$(python3 -c "print('t' if len('$T_NOUVEAU') > 20 else 'f')")"
code "$API/auth/me" -H "Authorization: Bearer $T_NOUVEAU" >/dev/null
chk "et l'application sait qu'il est provisoire" "True" "$(val "['motDePasseProvisoire']")"
# D-FNCT-5 : la navigation est barrée PAR LE SERVEUR, pas seulement par l'écran.
CODE=$(code "$API/circuits?communeId=$COMMUNE" -H "Authorization: Bearer $T_NOUVEAU")
chk "toute autre route est refusée tant qu'il n'est pas remplacé (403)" 403 "$CODE"
chk "avec le message de la décision, mot pour mot" \
    "MOT_DE_PASSE_A_CHANGER|Vous devez changer votre mot de passe avant de continuer." \
    "$(val "['code']")|$(val "['error']")"
CODE=$(code "$API/comptes?communeId=$COMMUNE" -H "Authorization: Bearer $T_NOUVEAU")
chk "même une simple lecture" 403 "$CODE"
CODE=$(code -X PUT "$API/comptes/moi/preferences" -H "Authorization: Bearer $T_NOUVEAU" -H 'Content-Type: application/json' -d '{"langue":"ar"}')
chk "choisir sa langue reste possible" 200 "$CODE"
CODE=$(code -X POST "$API/comptes/moi/mot-de-passe" -H "Authorization: Bearer $T_NOUVEAU" -H 'Content-Type: application/json' \
  -d "{\"motDePasseActuel\":\"$MDP\",\"nouveauMotDePasse\":\"court\"}")
chk "un mot de passe trop court est refusé" 400 "$CODE"
CODE=$(code -X POST "$API/comptes/moi/mot-de-passe" -H "Authorization: Bearer $T_NOUVEAU" -H 'Content-Type: application/json' \
  -d "{\"motDePasseActuel\":\"faux-mot-de-passe\",\"nouveauMotDePasse\":\"MonNouveauMotDePasse2026\"}")
chk "le changement exige le mot de passe actuel" 401 "$CODE"
CODE=$(code -X POST "$API/comptes/moi/mot-de-passe" -H "Authorization: Bearer $T_NOUVEAU" -H 'Content-Type: application/json' \
  -d "{\"motDePasseActuel\":\"$MDP\",\"nouveauMotDePasse\":\"MonNouveauMotDePasse2026\"}")
chk "le remplacement est accepté" 200 "$CODE"
T_REMPLACE=$(val "['token']")
chk "la marque « provisoire » est levée" "f" \
    "$(sql "SELECT mot_de_passe_provisoire FROM users WHERE id='$NOUVEAU'")"
CODE=$(code "$API/circuits?communeId=$COMMUNE" -H "Authorization: Bearer $T_REMPLACE")
chk "le nouveau jeton rendu ouvre la plateforme" 200 "$CODE"
CODE=$(code "$API/circuits?communeId=$COMMUNE" -H "Authorization: Bearer $T_NOUVEAU")
chk "l'ancien jeton, lui, reste borné au changement" 403 "$CODE"
T_NOUVEAU=$(tok "$ESSAI" 'MonNouveauMotDePasse2026')
chk "et le nouveau mot de passe fonctionne" "t" "$(python3 -c "print('t' if len('$T_NOUVEAU') > 20 else 'f')")"

echo
echo "4. Nul ne s'octroie un rôle supérieur au sien"
# La faille d'origine : la politique d'écriture vérifiait la commune, pas le
# rôle. Le garde-fou est un déclencheur, donc il tient aussi en SQL direct.
CODE=$(code -X POST "$API/comptes" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"test.compte.national.$$@siipi.tn\",\"fullName\":\"Tentative nationale\",\"role\":\"super_admin_fnct\",\"communeId\":\"$COMMUNE\"}")
chk "l'API refuse le rôle national" 400 "$CODE"
DIR_ID=$(sql "SELECT id FROM users WHERE email='$DIR_EMAIL'")
ESCALADE=$($PSQL -c "
  BEGIN;
  SET LOCAL ROLE siipi_app;
  SET LOCAL app.role = 'admin_commune';
  SET LOCAL app.user_id = '$DIR_ID';
  SET LOCAL app.commune_id = '$COMMUNE';
  INSERT INTO users (email, password_hash, full_name, role, commune_id)
  VALUES ('test.compte.sql.$$@siipi.tn','x','Tentative SQL','super_admin_fnct','$COMMUNE');
  COMMIT;" 2>&1 | grep -c 'ROLE_RESERVE_FNCT')
chk "et la base le refuse aussi, en SQL direct" 1 "$ESCALADE"
chk "aucun compte national n'a été créé" 0 \
    "$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%' AND role='super_admin_fnct'")"

echo
echo "5. Un compte fermé ne se connecte plus"
CODE=$(code -X PATCH "$API/comptes/$NOUVEAU" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"isActive":false}')
chk "la commune désactive le compte" 200 "$CODE"
chk "la connexion est refusée" "" "$(tok "$ESSAI" 'MonNouveauMotDePasse2026')"
CODE=$(code -X PATCH "$API/comptes/$DIR_ID" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"isActive":false}')
# Se désactiver soi-même ferme la porte de l'intérieur.
chk "on ne peut pas désactiver son propre compte" 400 "$CODE"

echo
echo "6. Cloisonnement : une commune ne touche pas aux comptes d'une autre"
AUTRE=$(sql "SELECT id FROM communes WHERE activee AND id <> '$COMMUNE' ORDER BY id LIMIT 1")
if [ -n "$AUTRE" ]; then
  CODE=$(code -X POST "$API/comptes" -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
    -d "{\"email\":\"test.compte.ailleurs.$$@siipi.tn\",\"fullName\":\"Compte ailleurs\",\"role\":\"admin_commune\",\"communeId\":\"$AUTRE\"}")
  chk "ouvrir un compte dans une autre commune est refusé" 403 "$CODE"
else
  printf '  \033[33m•\033[0m une seule commune activée : cloisonnement non vérifiable ici\n'
fi

echo
echo "7. Production et formation (D-FNCT-5), sur des bases d'essai à part"
# Une base servie une fois en production le reste pour toujours : ces essais ne
# touchent jamais la base des campagnes (tests/outils/instance_essai.sh).
PORT_ESSAI=4002
PUBLIC='Siipi2026!'
connexion_essai() { # adresse mot-de-passe -> code ; corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X POST "http://localhost:$PORT_ESSAI/auth/login" \
    -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}
lu() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
nature_api() { curl -s "http://localhost:$PORT_ESSAI/instance" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['nature'], d['bandeauFormation'])" 2>/dev/null; }
comptes_essai() { # base : un compte de démonstration au mot de passe public, un autre au mot de passe changé, un compte réel
  psql_essai "$1" "INSERT INTO users (email, password_hash, full_name, role, compte_demonstration) VALUES
    ('admin.national@siipi.tn', crypt('$PUBLIC', gen_salt('bf', 10)), 'TEST démonstration FNCT', 'super_admin_fnct', true),
    ('citoyen.demo@siipi.tn', crypt('TEST-Autre-2026', gen_salt('bf', 10)), 'TEST démonstration citoyen', 'citoyen', true),
    ('test.fnct.reel@siipi.tn', crypt('TEST-Reel-2026', gen_salt('bf', 10)), 'TEST compte réel', 'super_admin_fnct', false);" >/dev/null
}

echo "   a. PRODUCTION=false : rien ne change"
base_essai siipi_essai_dev
comptes_essai siipi_essai_dev
api_essai $PORT_ESSAI siipi_essai_dev PRODUCTION=false; CODE=$?
chk "l'API démarre, instance de développement" "0|developpement False" "$CODE|$(nature_api)"
chk "un compte de démonstration se connecte avec le mot de passe publié" 200 "$(connexion_essai admin.national@siipi.tn "$PUBLIC")"
chk "la base reste une base de développement" developpement "$(psql_essai siipi_essai_dev "SELECT nature FROM instance_siipi")"
CODE=$(code "$API/instance")
chk "l'API des campagnes, elle aussi, sert en développement" "200|developpement" "$CODE|$(val "['nature']")"

echo "   b. PRODUCTION=true : les comptes de démonstration n'existent plus"
base_essai siipi_essai_production
comptes_essai siipi_essai_production
api_essai $PORT_ESSAI siipi_essai_production PRODUCTION=true; CODE=$?
chk "l'API démarre, instance de production" "0|production False" "$CODE|$(nature_api)"
chk "la base est désormais une base de production" production "$(psql_essai siipi_essai_production "SELECT nature FROM instance_siipi")"
chk "ses comptes de démonstration sont désactivés, le compte réel non" "0|1" \
    "$(psql_essai siipi_essai_production "SELECT count(*) FILTER (WHERE compte_demonstration AND is_active) || '|' || count(*) FILTER (WHERE NOT compte_demonstration AND is_active) FROM users")"
CODE=$(connexion_essai admin.national@siipi.tn "$PUBLIC")
chk "compte de démonstration, mot de passe publié : refusé (403)" "403|1" "$CODE|$(lu "int('aucun compte' in d['error'])")"
CODE=$(connexion_essai citoyen.demo@siipi.tn 'TEST-Autre-2026')
chk "compte de démonstration au mot de passe changé : refusé aussi (403), le message dit quoi faire" "403|1" \
    "$CODE|$(lu "int('compte:fnct:creer' in d['error'])")"
chk "aucun jeton n'est délivré" 0 "$(grep -c '"token"' "$T/r.json")"
chk "le compte réel se connecte" 200 "$(connexion_essai test.fnct.reel@siipi.tn 'TEST-Reel-2026')"
chk "la base refuse de réactiver un compte de démonstration" t \
    "$(psql_essai siipi_essai_production "UPDATE users SET is_active = true WHERE email = 'admin.national@siipi.tn';" | grep -q 'COMPTE_DEMONSTRATION_EN_PRODUCTION' && echo t || echo f)"
chk "la base refuse de redevenir une base de développement" t \
    "$(psql_essai siipi_essai_production "UPDATE instance_siipi SET nature = 'developpement';" | grep -q 'NATURE_INSTANCE_DEFINITIVE' && echo t || echo f)"
DATABASE_URL="$(url_essai siipi_essai_production)" npm run -s mot-de-passe:provisoire -- admin.national@siipi.tn >"$T/cli.txt" 2>&1; CODE=$?
chk "la commande serveur ne rouvre pas un compte de démonstration (code 1)" "1|1" "$CODE|$(grep -c 'compte de démonstration' "$T/cli.txt")"
DATABASE_URL="$(url_essai siipi_essai_production)" npm run -s compte:fnct:creer -- test.fnct.premier@siipi.tn "TEST Premier compte FNCT" >"$T/cli.txt" 2>&1; CODE=$?
PROVISOIRE=$(sed -n 's/^Mot de passe provisoire : //p' "$T/cli.txt")
chk "le premier compte réel de la FNCT se crée depuis le serveur (code 0)" "0|1" "$CODE|$(grep -c '^Mot de passe provisoire : ' "$T/cli.txt")"
CODE=$(connexion_essai test.fnct.premier@siipi.tn "$PROVISOIRE")
chk "il se connecte, mot de passe marqué provisoire" "200|True" "$CODE|$(lu "d['user']['motDePasseProvisoire']")"
JETON=$(lu "d['token']")
CODE=$(curl -s -o "$T/r.json" -w '%{http_code}' "http://localhost:$PORT_ESSAI/communes" -H "Authorization: Bearer $JETON")
chk "et ne va nulle part avant de l'avoir changé (403)" "403|MOT_DE_PASSE_A_CHANGER" "$CODE|$(lu "d['code']")"

echo "   c. Même par erreur de configuration"
api_essai $PORT_ESSAI siipi_essai_production; CODE=$?
chk "la base de production servie SANS PRODUCTION reste une instance de production" "0|production False" "$CODE|$(nature_api)"
chk "et le compte de démonstration y reste refusé" 403 "$(connexion_essai admin.national@siipi.tn "$PUBLIC")"
api_essai $PORT_ESSAI siipi_essai_production FORMATION=true; CODE=$?
chk "FORMATION=true sur la base de production : démarrage refusé" "1|1" \
    "$CODE|$(grep -c 'DÉMARRAGE REFUSÉ : FORMATION=true sur une base de PRODUCTION' "$T/api_$PORT_ESSAI.log")"
api_essai $PORT_ESSAI siipi_essai_dev FORMATION=true PRODUCTION=true; CODE=$?
chk "FORMATION=true et PRODUCTION=true ensemble : démarrage refusé" "1|1" \
    "$CODE|$(grep -c 'se contredisent' "$T/api_$PORT_ESSAI.log")"
chk "… sans rien avoir fixé dans la base" developpement "$(psql_essai siipi_essai_dev "SELECT nature FROM instance_siipi")"

echo "   d. FORMATION=true : base dédiée, comptes de démonstration, bandeau"
base_essai siipi_essai_formation
comptes_essai siipi_essai_formation
# NODE_ENV=production : l'image de production le pose toujours, et une
# instance de formation doit pouvoir en tourner (réponse du 9 octobre 2026).
api_essai $PORT_ESSAI siipi_essai_formation FORMATION=true NODE_ENV=production; CODE=$?
chk "l'API démarre, instance de formation, bandeau demandé" "0|formation True" "$CODE|$(nature_api)"
chk "la base est désormais une base de formation" formation "$(psql_essai siipi_essai_formation "SELECT nature FROM instance_siipi")"
chk "les comptes de démonstration s'y connectent" 200 "$(connexion_essai admin.national@siipi.tn "$PUBLIC")"
api_essai $PORT_ESSAI siipi_essai_formation PRODUCTION=true; CODE=$?
chk "la base de formation servie en production : démarrage refusé" "1|1" \
    "$CODE|$(grep -c 'DÉMARRAGE REFUSÉ : Base de FORMATION' "$T/api_$PORT_ESSAI.log")"
arreter_api_essai
retirer_bases_essai
chk "les bases d'essai sont effacées" 0 \
    "$(psql_essai postgres "SELECT count(*) FROM pg_database WHERE datname LIKE 'siipi_essai_%'")"

nettoyer

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
