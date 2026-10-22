#!/usr/bin/env bash
# =============================================================================
# « À vérifier » en arabe (v0.15.67 ; services/avisAr.ts).
#
# Les fonctions app.incoherences_* écrivent leurs constats en français. L'API les rend aussi en
# arabe (constat_ar, quoi_faire_ar, sujet_ar) en reconnaissant le texte exact que la base a écrit.
# Un avis qui n'a pas de traduction resterait en français dans l'écran arabe — sans que personne
# ne le voie avant la recette. Cette campagne le rend impossible :
#
#   1. COMPLÉTUDE. Elle lit la définition des fonctions de la base, en retire chacun des textes
#      qu'elles écrivent, et exige un modèle pour chacun ; et, à l'inverse, qu'aucun modèle ne
#      reste sans texte (une traduction orpheline : la phrase française a changé, l'arabe est resté).
#   2. DE BOUT EN BOUT. Dans une commune de test, des avis réels — un circuit en régie sans agent,
#      un engin en panne confié à un circuit, un bâchage sous le seuil — passent par les trois
#      routes qui les rendent : chacun porte son arabe, les valeurs (immatriculation, pourcentage)
#      passent telles quelles, les mots d'un vocabulaire fermé (l'état de l'engin) sont traduits.
#   3. LE FRANÇAIS NE BOUGE PAS. Les textes français sont ceux que la base écrit, mot pour mot.
#
# Tout se passe dans une commune de test, avec un compte temporaire ; la campagne prouve en
# partant qu'aucune commune réelle n'a reçu de ligne.
#
#   docker compose exec -T api npm run test:avis-ar
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
val()  { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
req() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" ${4:+-H "Authorization: Bearer $4"} \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}

C=test_avis_ar
ESSAI_C="'$C'"
. tests/outils/comptes_temporaires.sh
. tests/outils/communes_essai.sh
. tests/outils/base_reelle.sh
nettoyer_c() {
  effacer_communes_essai "$ESSAI_C"
  retirer_comptes_temporaires
  effacer_communes_essai "$ESSAI_C"
}
nettoyer_c
trap 'nettoyer_c; rm -rf "$T"' EXIT
releve_base_reelle

commune_essai "$C" "TEST Commune des avis en arabe"
compte_temporaire admin_commune "$C" "Directeur des avis en arabe"; T_D=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_D" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }
AN=$($PSQL -c "SELECT extract(year FROM (now() AT TIME ZONE 'Africa/Tunis'))::int" | tr -d ' ')

# -----------------------------------------------------------------------------
echo
echo "1. Chaque texte de la base a son arabe, et chaque arabe a son texte"
npx tsx tests/outils/verifier_avis_ar.ts > "$T/completude.txt" 2>"$T/completude.err"
cat "$T/completude.err" | head -3
grep -E "^  (SANS MODÈLE|MAL RENDU|ORPHELIN)" "$T/completude.txt" | head -12
champ() { grep "^$1=" "$T/completude.txt" | head -1 | cut -d= -f2; }
FONCTIONS_BASE=$($PSQL -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname LIKE 'incoherences\_%' AND p.proname <> 'incoherences_commune'" | tr -d ' ')
chk "l'outil a lu toutes les fonctions d'avis de la base" "$FONCTIONS_BASE" "$(champ fonctions)"
chk "il y a des textes à traduire (la lecture n'est pas vide)" 1 "$([ "$(champ textes)" -ge 60 ] 2>/dev/null && echo 1 || echo 0)"
chk "aucun texte de la base n'est sans modèle : un avis sans arabe resterait en français" 0 "$(champ sans_modele)"
chk "aucun arabe n'est rendu à moitié (sans lettres arabes, ou avec une valeur {n} non remplacée)" 0 "$(champ mal_rendus)"
chk "aucun modèle n'est orphelin : la phrase française existe toujours dans la base" 0 "$(champ orphelins)"

# -----------------------------------------------------------------------------
echo
echo "2. De bout en bout : des avis réels, dans une commune de test"
# Un circuit en régie sans aucun agent (bloquant) ; un engin en panne confié à un circuit (bloquant, avec
# l'état de l'engin) ; un bâchage sous le seuil (avertissement, sujet fixe).
CIR=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage, actif) VALUES ('$C', 'TEST circuit des avis', ARRAY[1,2,3]::smallint[], true) RETURNING id")
req POST "/trucks?communeId=$C" '{"registration":"TEST-AR 001","type":"benne_tasseuse","etat":"en_service"}' "$T_D" >/dev/null
V=$(val "d['id']")
$PSQL -c "UPDATE vehicules SET etat = 'en_panne', etat_depuis = current_date, motif_immobilisation = 'TEST panne' WHERE id = '$V';" >/dev/null
$PSQL -c "UPDATE circuits SET vehicule_id = '$V' WHERE id = '$CIR';" >/dev/null
req PUT "/kpi/declarations/$C/$AN" '{"valeurs":{"M1-9":{"valeur":50,"cible":100}}}' "$T_D" >/dev/null

chk "la commune lit ses avis" 200 "$(req GET "/communes/$C/coherence" "" "$T_D")"
chk "chaque avis porte un constat et un « quoi faire » en arabe, en lettres arabes" True \
    "$(val "len(d) > 0 and all(e['constat_ar'] and e['quoi_faire_ar'] and any(0x600 <= ord(ch) <= 0x6FF for ch in e['constat_ar'] + e['quoi_faire_ar']) for e in d)")"
chk "le circuit sans agent est dit en arabe" True \
    "$(val "any(e['constat'] == 'Circuit en régie sans aucun agent affecté.' and e['constat_ar'] == 'مسلك في الإدارة المباشرة دون أي عون مسند.' for e in d)")"
chk "l'immatriculation passe telle quelle, et l'état « en panne » est traduit" True \
    "$(val "any('TEST-AR 001' in e['constat_ar'] and 'معطّبة' in e['constat_ar'] and 'en panne' not in e['constat_ar'] for e in d)")"
chk "le sujet fixe « Bâchage des bennes » est traduit, le pourcentage passe tel quel" True \
    "$(val "any(e['sujet'] == 'Bâchage des bennes' and e['sujet_ar'] == 'تغطية الشاحنات' and e['constat_ar'].startswith('50 %') for e in d)")"
chk "un nom propre (le circuit) n'a pas de sujet arabe : il passe tel quel" True \
    "$(val "any(e['sujet'] == 'TEST circuit des avis' and e['sujet_ar'] is None for e in d)")"
chk "le français est ce que la base écrit, mot pour mot (aucune réécriture)" 1 \
    "$(sql "SELECT count(*) FROM app.incoherences_commune('$C') WHERE constat = 'Circuit en régie sans aucun agent affecté.'")"
chk "l'accueil du portail porte l'arabe de ses avis" True \
    "$(req GET "/communes/$C/accueil" "" "$T_D" >/dev/null; val "len(d['a_agir']['a_verifier']) > 0 and all(e['constat_ar'] and e['quoi_faire_ar'] for e in d['a_agir']['a_verifier'])")"
chk "les avis des pesées passent aussi par la traduction (les clés sont rendues)" True \
    "$(req GET "/pesees/coherence?communeId=$C" "" "$T_D" >/dev/null; val "isinstance(d, list) and all('constat_ar' in e and 'sujet_ar' in e for e in d)")"
chk "les avis de communication aussi" True \
    "$(req GET "/communication/coherence?communeId=$C" "" "$T_D" >/dev/null; val "isinstance(d, list) and all('constat_ar' in e and 'sujet_ar' in e for e in d)")"

# -----------------------------------------------------------------------------
echo
echo "Aucune commune réelle n'a reçu de ligne"
base_reelle_intacte "pendant la campagne"
nettoyer_c
chk "sa commune de test et ses lignes, et son compte temporaire, sont effacés" "0|0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM circuits WHERE commune_id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM vehicules WHERE commune_id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
