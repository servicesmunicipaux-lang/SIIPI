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
CODE=$(code -X POST "$API/comptes/moi/mot-de-passe" -H "Authorization: Bearer $T_NOUVEAU" -H 'Content-Type: application/json' \
  -d "{\"motDePasseActuel\":\"$MDP\",\"nouveauMotDePasse\":\"court\"}")
chk "un mot de passe trop court est refusé" 400 "$CODE"
CODE=$(code -X POST "$API/comptes/moi/mot-de-passe" -H "Authorization: Bearer $T_NOUVEAU" -H 'Content-Type: application/json' \
  -d "{\"motDePasseActuel\":\"faux-mot-de-passe\",\"nouveauMotDePasse\":\"MonNouveauMotDePasse2026\"}")
chk "le changement exige le mot de passe actuel" 401 "$CODE"
CODE=$(code -X POST "$API/comptes/moi/mot-de-passe" -H "Authorization: Bearer $T_NOUVEAU" -H 'Content-Type: application/json' \
  -d "{\"motDePasseActuel\":\"$MDP\",\"nouveauMotDePasse\":\"MonNouveauMotDePasse2026\"}")
chk "le remplacement est accepté" 204 "$CODE"
chk "la marque « provisoire » est levée" "f" \
    "$(sql "SELECT mot_de_passe_provisoire FROM users WHERE id='$NOUVEAU'")"
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

nettoyer

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
