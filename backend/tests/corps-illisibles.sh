#!/usr/bin/env bash
# =============================================================================
# Les corps de requête illisibles (JC-006, docs/recette/JOURNAL_DES_CORRECTIONS.md).
#
# Un JSON mal formé, un corps trop gros, un jeu de caractères ou une
# compression que l'API ne lit pas : c'est la requête qui est en faute. Jusqu'à
# la v0.15.48 l'API répondait « Erreur interne du serveur » (500) — le client
# croyait à une panne et réessayait, et le journal se remplissait de fausses
# erreurs internes. Elle répond désormais 400, 413 ou 415, en disant quoi
# corriger.
#
# Toute la campagne est faite de refus. Elle éprouve des routes publiques et
# des routes sous compte, dont /fichiers, qui a son propre lecteur (70 Mo).
#
# SA PROPRE API. Pour lire le journal (aucune fausse erreur interne), elle
# démarre une seconde API, en développement, sur le port 4007, contre la base
# des campagnes (tests/outils/instance_essai.sh). Elle n'y crée aucune ligne :
# tous ses corps sont refusés avant d'atteindre une route, hors une
# localisation qui ne s'écrit nulle part et une connexion du compte FNCT.
#
#   docker compose exec -T api npm run test:corps-illisibles
# =============================================================================

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1
pass=0; fail=0
T=$(mktemp -d)
PORT_ESSAI=4007
. tests/outils/instance_essai.sh
API="http://localhost:$PORT_ESSAI"
BASE="${PGDATABASE:-siipi_national}"

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
# envoyer <route> <fichier du corps> [en-tête supplémentaire] → code HTTP ; réponse dans $T/r.json
envoyer() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X POST "$API$1" -H 'Content-Type: application/json' \
       ${JETON:+-H "Authorization: Bearer $JETON"} ${3:+-H "$3"} --data-binary "@$2"
}
message() { python3 -c "import json;print(json.load(open('$T/r.json')).get('error',''))" 2>/dev/null || echo illisible; }
fin() {
  arreter_api_essai
  rm -rf "$T"
}
trap fin EXIT

api_essai "$PORT_ESSAI" "$BASE" \
  || { echo "L'API d'essai n'a pas démarré (voir le journal)." >&2; tail -20 "$T/api_$PORT_ESSAI.log" >&2; exit 1; }
JETON=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
          -d '{"email":"admin.national@siipi.tn","password":"Siipi2026!"}' \
        | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
[ -n "$JETON" ] || { echo "Le compte FNCT de démonstration ne se connecte pas à l'API d'essai." >&2; exit 1; }

# Les corps éprouvés.
printf '{"email": "x@exemple.test", "password": ' > "$T/tronque.json"
printf "{'lat': 35, 'lng': 9}" > "$T/apostrophes.json"
printf '{"lat": 35, "lng": 9,}' > "$T/virgule.json"
printf '{"lat": 35, "lng": 9}' > "$T/correct.json"
# 13 Mo : au-delà de la limite générale (12 Mo), en deçà de celle de /fichiers (70 Mo).
python3 -c "import json;json.dump({'contenu': 'x' * (13 * 1024 * 1024)}, open('$T/gros.json', 'w'))"

# -----------------------------------------------------------------------------
echo
echo "1. Un JSON mal formé : 400, et le message dit quoi corriger"
JETON_SAUF=$JETON; JETON=""
chk "route publique /auth/login, corps tronqué" 400 "$(envoyer /auth/login "$T/tronque.json")"
chk "… le message nomme le JSON mal formé" t "$(message | grep -q 'JSON est mal formé' && echo t || echo f)"
chk "route publique /citizens/register, apostrophes au lieu de guillemets" 400 "$(envoyer /citizens/register "$T/apostrophes.json")"
JETON=$JETON_SAUF
chk "route sous compte /communes/localiser, virgule finale" 400 "$(envoyer /communes/localiser "$T/virgule.json")"
chk "route sous compte /citoyen/adresse" 400 "$(envoyer /citoyen/adresse "$T/tronque.json")"
chk "/fichiers, qui a son propre lecteur" 400 "$(envoyer /fichiers "$T/apostrophes.json")"
chk "la réponse reste du JSON, avec son champ « error »" t \
    "$(python3 -c "import json;d=json.load(open('$T/r.json'));print('t' if isinstance(d.get('error'), str) and d['error'] else 'f')" 2>/dev/null || echo f)"

echo
echo "2. Un corps trop gros : 413 — sauf là où la limite est plus haute"
chk "13 Mo sur /communes/localiser (limite générale 12 Mo)" 413 "$(envoyer /communes/localiser "$T/gros.json")"
chk "… le message dit de réduire le corps et où déposer un fichier" t "$(message | grep -q '/fichiers' && echo t || echo f)"
JETON=""
chk "les mêmes 13 Mo sur /fichiers sont lus (refus pour défaut de compte, pas de taille)" 401 "$(envoyer /fichiers "$T/gros.json")"
JETON=$JETON_SAUF

echo
echo "3. Un jeu de caractères ou une compression que l'API ne lit pas : 415"
chk "jeu de caractères latin9" 415 \
    "$(curl -s -o "$T/r.json" -w '%{http_code}' -X POST "$API/communes/localiser" -H "Authorization: Bearer $JETON" \
         -H 'Content-Type: application/json; charset=latin9' --data-binary "@$T/correct.json")"
chk "… le message demande de l'UTF-8" t "$(message | grep -q 'UTF-8' && echo t || echo f)"
chk "compression inconnue" 415 "$(envoyer /communes/localiser "$T/correct.json" 'Content-Encoding: zz')"

echo
echo "4. Une requête bien formée passe toujours"
chk "le même corps, bien formé, est lu (200)" 200 "$(envoyer /communes/localiser "$T/correct.json")"
JETON=""
chk "un mot de passe faux reste un refus d'identification (401), pas une requête illisible" 401 \
    "$(curl -s -o "$T/r.json" -w '%{http_code}' -X POST "$API/auth/login" -H 'Content-Type: application/json' \
         -d '{"email":"admin.national@siipi.tn","password":"TEST-pas-le-bon"}')"

echo
echo "5. Aucune fausse erreur interne"
# Le journal des requêtes est coloré en développement : on retire les codes de
# couleur avant de lire les statuts.
sed 's/\x1b\[[0-9;]*m//g' "$T/api_$PORT_ESSAI.log" > "$T/journal.txt"
chk "le journal consigne les 8 refus — 5 × 400, 1 × 413, 2 × 415 (sinon les deux contrôles suivants passeraient à vide)" "5|1|2" \
    "$(grep -cE 'POST [^ ]+ 400 ' "$T/journal.txt")|$(grep -cE 'POST [^ ]+ 413 ' "$T/journal.txt")|$(grep -cE 'POST [^ ]+ 415 ' "$T/journal.txt")"
chk "il ne porte aucune « [error] »" 0 "$(grep -c '\[error\]' "$T/journal.txt")"
chk "… ni aucune réponse 500" 0 "$(grep -cE '(POST|GET) [^ ]+ 500 ' "$T/journal.txt")"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
