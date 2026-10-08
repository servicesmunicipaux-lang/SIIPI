#!/usr/bin/env bash
# =============================================================================
# v0.15.15 — le mot de passe des comptes de démonstration est public.
# FEUILLE_DE_ROUTE § 8 ; src/motDePassePublic.ts.
#
# Il est écrit dans le dépôt, et l'image de production exécute le même seed :
# une instance jamais reprise aurait onze comptes, dont celui de la FNCT,
# ouverts à quiconque a lu le code.
#
# Elle commence par ce que la plateforme REFUSE :
#   - en production, toute connexion avec ce mot de passe, compte connu ou non
#     (même réponse : rien sur l'existence du compte) ;
#   - partout, le choisir comme nouveau mot de passe ;
#   - la commande serveur sans compte, ou pour un compte inconnu.
# Puis : la commande serveur attribue un mot de passe provisoire qui ouvre le
# compte en production ; le démarrage en production nomme les comptes exposés
# (nombre attendu calculé par la base, crypt() de pgcrypto, pas par l'API) ; le
# développement n'est pas touché.
#
# La production est éprouvée pour de vrai : la campagne démarre une seconde API,
# NODE_ENV=production, sur le port 4001 du même conteneur, et l'arrête en partant.
#
#   docker compose exec -T api npm run test:mot-de-passe-public
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PROD="http://localhost:4001"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
PUBLIC='Siipi2026!'
pass=0; fail=0
T=$(mktemp -d)
PID_PROD=""
ESSAI="test.mdp.$$@siipi.tn"
nettoyer() { $PSQL -c "DELETE FROM users WHERE email LIKE 'test.mdp.%@siipi.tn';" >/dev/null 2>&1; }
fin() {
  [ -n "$PID_PROD" ] && kill "$PID_PROD" 2>/dev/null
  nettoyer
  rm -rf "$T"
}
trap fin EXIT

sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
connexion() { # base adresse mot-de-passe -> code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X POST "$1/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$2\",\"password\":\"$3\"}"
}
appel() { # méthode chemin jeton [corps]
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3" \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}

nettoyer
CODE=$(connexion "$API" admin.national@siipi.tn "$PUBLIC")
[ "$CODE" = 200 ] || { echo "API de développement injoignable sur $API, ou mot de passe de démonstration modifié." >&2; exit 1; }
T_FNCT=$(val "d['token']")
DIR=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire AND commune_id IS NOT NULL ORDER BY created_at LIMIT 1")
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR'")
# Le nombre de comptes du seed qui gardent le mot de passe public, calculé par
# la base elle-même (pgcrypto lit les empreintes bcrypt) : le témoin ne doit
# rien à l'API qu'il contrôle.
LISTE=$(sed -n "/COMPTES_DE_DEMONSTRATION = \[/,/\]/p" src/motDePassePublic.ts | grep -o "'[^']*@[^']*'" | paste -sd, -)
EXPOSES=$(sql "SELECT count(*) FROM users WHERE email IN ($LISTE) AND is_active AND deleted_at IS NULL AND crypt('$PUBLIC', password_hash) = password_hash")

# La seconde API, en production. Secrets de test : la configuration refuse de
# démarrer en production avec les secrets de développement.
NODE_ENV=production PORT=4001 JWT_SECRET="test_jwt_$$_$(date +%s)" SIIPI_SECRET_IDENTITES="test_identites_$$_$(date +%s)" \
  npx tsx src/index.ts >"$T/prod.log" 2>&1 &
PID_PROD=$!
for _ in $(seq 1 60); do
  curl -s -o /dev/null -w '%{http_code}' "$PROD/health" 2>/dev/null | grep -q 200 && break
  sleep 1
done
for _ in $(seq 1 30); do grep -q "ATTENTION" "$T/prod.log" && break; sleep 1; done

# -----------------------------------------------------------------------------
echo
echo "1. En production, le mot de passe public n'ouvre aucun compte"
chk "la seconde API répond, en production" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$PROD/health")"
CODE=$(connexion "$PROD" admin.national@siipi.tn "$PUBLIC")
chk "le compte de la FNCT : refusé (403), le message dit quoi faire" "403|1" \
    "$CODE|$(val "int('mot-de-passe:provisoire' in d['error'])")"
REFUS_CONNU=$(val "d['error']")
CODE=$(connexion "$PROD" "inconnu.$$@siipi.tn" "$PUBLIC")
chk "un compte inconnu : même refus, même message — rien sur l'existence du compte" "403|1" \
    "$CODE|$(val "int(d['error'] == '''$REFUS_CONNU''')")"
CODE=$(connexion "$PROD" "$DIR" "$PUBLIC")
chk "un compte communal du seed : refusé (403)" 403 "$CODE"
CODE=$(connexion "$PROD" admin.national@siipi.tn "pas-le-bon-mot-de-passe")
chk "un mauvais mot de passe reste un 401 ordinaire" 401 "$CODE"
chk "… et ne délivre aucun jeton" 0 "$(grep -c '"token"' "$T/r.json")"

# -----------------------------------------------------------------------------
echo
echo "2. Partout, il ne se choisit pas comme nouveau mot de passe"
CODE=$(appel POST /comptes "$T_FNCT" "{\"email\":\"$ESSAI\",\"fullName\":\"Agent de test\",\"role\":\"admin_commune\",\"communeId\":\"$COMMUNE\"}")
MDP=$(val "d['motDePasseProvisoire']")
chk "un compte de test est ouvert, mot de passe provisoire" "201|True" "$CODE|$(val "d['mot_de_passe_provisoire']")"
CODE=$(connexion "$API" "$ESSAI" "$MDP")
T_ESSAI=$(val "d['token']")
chk "il se connecte avec son mot de passe provisoire" 200 "$CODE"
CODE=$(appel POST /comptes/moi/mot-de-passe "$T_ESSAI" "{\"motDePasseActuel\":\"$MDP\",\"nouveauMotDePasse\":\"$PUBLIC\"}")
chk "choisir le mot de passe public : refusé (400), même en développement" "400|1" "$CODE|$(val "int('public' in d['error'])")"
chk "… et le compte reste provisoire" t "$(sql "SELECT mot_de_passe_provisoire FROM users WHERE email='$ESSAI'")"

# -----------------------------------------------------------------------------
echo
echo "3. La commande serveur : refus d'abord"
npm run -s mot-de-passe:provisoire >"$T/cli.txt" 2>&1; CODE=$?
chk "sans adresse : refusée (code 2), l'usage est rappelé" "2|1" "$CODE|$(grep -c 'Usage' "$T/cli.txt")"
AVANT=$(sql "SELECT md5(string_agg(password_hash, ',' ORDER BY id)) FROM users")
npm run -s mot-de-passe:provisoire -- "inconnu.$$@siipi.tn" >"$T/cli.txt" 2>&1; CODE=$?
chk "adresse inconnue : refusée (code 1), aucun compte modifié" "1|1|$AVANT" \
    "$CODE|$(grep -c 'Aucun compte actif' "$T/cli.txt")|$(sql "SELECT md5(string_agg(password_hash, ',' ORDER BY id)) FROM users")"

# -----------------------------------------------------------------------------
echo
echo "4. La commande serveur rouvre un compte, en production"
npm run -s mot-de-passe:provisoire -- "$ESSAI" >"$T/cli.txt" 2>&1; CODE=$?
NOUVEAU=$(sed -n 's/^Mot de passe provisoire : //p' "$T/cli.txt")
chk "mot de passe provisoire attribué (code 0), affiché une fois" "0|1" "$CODE|$(grep -c '^Mot de passe provisoire : ' "$T/cli.txt")"
chk "la base n'en garde que l'empreinte, et elle lui correspond" "f|t|t" \
    "$(sql "SELECT (password_hash = '$NOUVEAU')||'|'||(crypt('$NOUVEAU', password_hash) = password_hash)||'|'||mot_de_passe_provisoire FROM users WHERE email='$ESSAI'" | sed 's/true/t/g;s/false/f/g')"
CODE=$(connexion "$PROD" "$ESSAI" "$NOUVEAU")
chk "il ouvre le compte en production, marqué provisoire" "200|True" "$CODE|$(val "d['user']['motDePasseProvisoire']")"
T_ESSAI=$(val "d['token']")
CODE=$(curl -s -o "$T/r.json" -w '%{http_code}' -X POST "$PROD/comptes/moi/mot-de-passe" -H "Authorization: Bearer $T_ESSAI" \
  -H 'Content-Type: application/json' -d "{\"motDePasseActuel\":\"$NOUVEAU\",\"nouveauMotDePasse\":\"TEST-Remplace-2026\"}")
chk "la personne le remplace" "204|f" "$CODE|$(sql "SELECT mot_de_passe_provisoire FROM users WHERE email='$ESSAI'" | sed 's/false/f/')"
CODE=$(connexion "$PROD" "$ESSAI" "$NOUVEAU")
chk "l'ancien provisoire ne sert plus" 401 "$CODE"

# -----------------------------------------------------------------------------
echo
echo "5. Le démarrage en production nomme les comptes exposés ; le développement n'est pas touché"
chk "le témoin trouve des comptes du seed au mot de passe public" t "$([ "${EXPOSES:-0}" -gt 0 ] && echo t || echo f)"
chk "le journal de démarrage en compte autant que la base ($EXPOSES)" 1 \
    "$(grep -c "ATTENTION : $EXPOSES compte(s) de démonstration" "$T/prod.log")"
chk "… et nomme celui de la FNCT" 1 "$(grep -c 'admin.national@siipi.tn' "$T/prod.log")"
CODE=$(connexion "$API" admin.national@siipi.tn "$PUBLIC")
chk "en développement, les comptes de démonstration s'ouvrent comme avant" 200 "$CODE"
chk "aucun compte du seed n'a été modifié par la campagne" "$EXPOSES" \
    "$(sql "SELECT count(*) FROM users WHERE email IN ($LISTE) AND is_active AND deleted_at IS NULL AND crypt('$PUBLIC', password_hash) = password_hash")"

kill "$PID_PROD" 2>/dev/null; wait "$PID_PROD" 2>/dev/null; PID_PROD=""
nettoyer
chk "la seconde API est arrêtée, le compte de test retiré" "000|0" \
    "$(curl -s -o /dev/null -w '%{http_code}' "$PROD/health")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.mdp.%@siipi.tn'")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
