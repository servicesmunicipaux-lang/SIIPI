#!/usr/bin/env bash
# =============================================================================
# Lot 16.2 — les documents à numérotation scellée (migration 057).
#
# Elle commence par ce que la base REFUSE (SPEC_v0.16 § 5) : réutiliser un
# numéro ; deux émissions simultanées qui recevraient le même ; modifier ou
# supprimer un document émis ; combler un trou ; annuler sans motif ; émettre
# à la place de la commune (FNCT) ; lire ou annuler le document d'une autre
# commune. Puis : la continuité (une émission ratée ne consomme pas de numéro),
# l'empreinte du contenu, l'annulation qui garde le numéro, la détection d'un
# trou créé hors de l'application.
#
# Un document émis ne s'efface pas : la campagne ne touche donc à AUCUN
# registre réel. Elle travaille dans une commune de test qu'elle crée, à
# laquelle elle rattache un admin le temps des contrôles, et qu'elle efface en
# partant — seule opération où le scellement est levé, sur ses seules lignes.
#
# Cet admin n'est plus « le premier directeur » de la base (JC-014) : jusqu'à
# la v0.15.54, elle prenait celui des deux premières communes — sur une base
# réelle, deux directeurs réels — par une requête sur plusieurs lignes que la
# garde du lanceur ne voyait pas. Ce sont deux directeurs temporaires, chacun
# dans sa commune de test.
#
#   docker compose exec -T api npm run test:documents
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
refus() { $PSQL -c "$1" >"$T/err.txt" 2>&1; grep -c "$2" "$T/err.txt" | head -1; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
appel() { # méthode chemin jeton [corps] -> code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3" \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}

T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
# Deux directeurs temporaires, chacun dans sa commune de test (JC-014) : le
# premier est rattaché à la commune des documents, comme avant ; le second est
# « le directeur d'une autre commune ».
ESSAI_C="'test_documents_a','test_documents_b'"
. "$(dirname "$0")/outils/comptes_temporaires.sh"
. "$(dirname "$0")/outils/communes_essai.sh"
. "$(dirname "$0")/outils/base_reelle.sh"
effacer_communes_essai "$ESSAI_C"
releve_base_reelle
commune_essai test_documents_a "TEST commune A des documents"
commune_essai test_documents_b "TEST commune B des documents"
compte_temporaire admin_commune test_documents_a "Directeur A des documents"; DIR_A=$COMPTE_EMAIL; MDP_A=$COMPTE_MDP; ID_A=$COMPTE_ID
compte_temporaire admin_commune test_documents_b "Directeur B des documents"; DIR_B=$COMPTE_EMAIL; MDP_B=$COMPTE_MDP
TC=test_documents_162

# Effacer la commune de test : le seul endroit où le scellement est levé, le
# temps d'une transaction, et pour ses seules lignes.
nettoyer() {
  $PSQL -c "BEGIN;
            ALTER TABLE documents_emis DISABLE TRIGGER trg_proteger_document;
            DELETE FROM documents_emis WHERE commune_id = '$TC';
            ALTER TABLE documents_emis ENABLE TRIGGER trg_proteger_document;
            DELETE FROM utilisateur_communes WHERE commune_id = '$TC';
            DELETE FROM vehicules WHERE commune_id = '$TC';
            DELETE FROM communes WHERE id = '$TC';
            COMMIT;" >/dev/null 2>&1
}
nettoyer_c() {
  nettoyer
  retirer_comptes_temporaires
  effacer_communes_essai "$ESSAI_C"
}
trap 'nettoyer_c 2>/dev/null; rm -rf "$T"' EXIT
nettoyer
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune documents', 'TEST', 'TEST', 1);
          INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$ID_A', '$TC');
          INSERT INTO vehicules (id, registration, commune_id, type) VALUES ('test-doc-162-v1', 'TEST 162 001', '$TC', 'camion');" >/dev/null
T_A=$(tok "$DIR_A" "$MDP_A"); T_B=$(tok "$DIR_B" "$MDP_B")
[ -n "$T_A" ] && [ -n "$T_B" ] || { echo "Les directeurs temporaires ne se connectent pas." >&2; exit 1; }
Q="?communeId=$TC"
# Un contenu conforme au gabarit de chaque type (lot 16.2) : le contenu est
# figé à l'émission, et l'émission refuse ce que le gabarit ne sait pas imprimer.
contenu() {
  case "$1" in
    bon_carburant) echo "{\"engin\":\"TEST 162 001\",\"date\":\"2026-10-16\",\"carburant\":\"gasoil\",\"litres\":10,\"observations\":\"TEST-16.2 rang $2\"}" ;;
    ordre_mission) echo "{\"agent\":\"TEST agent\",\"destination\":\"TEST Tunis\",\"objet\":\"TEST-16.2\",\"date_debut\":\"2026-10-16\",\"observations\":\"TEST-16.2 rang $2\"}" ;;
  esac
}
emettre() { appel POST "/documents$Q" "$T_A" "{\"type\":\"$1\",\"contenu\":$(contenu "$1" "$2")}"; }

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la base refuse"
CODE=$(appel POST "/documents$Q" "$T_FNCT" '{"type":"bon_carburant","contenu":{"test":"TEST-16.2"}}')
chk "la FNCT n'émet pas un document à la place de la commune" 403 "$CODE"
CODE=$(appel POST "/documents$Q" "$T_A" '{"type":"bon_carburant","contenu":{}}')
chk "un document sans contenu : refusé" 400 "$CODE"
CODE=$(appel POST "/documents$Q" "$T_A" '{"type":"facture","contenu":{"test":"TEST-16.2"}}')
chk "un type de document inconnu : refusé" 400 "$CODE"
CODE=$(appel POST "/documents$Q" "$T_A" "{\"type\":\"ordre_mission\",\"contenu\":$(contenu ordre_mission 0),\"objet\":{\"type\":\"vehicule\",\"id\":\"dcef-inexistant\"}}")
chk "un ordre de mission pour un engin qui n'est pas de la commune : refusé" 400 "$CODE"
CODE=$(emettre bon_carburant 1)
chk "l'admin de la commune émet un bon de carburant" "201|BC-$(date +%Y)-00001" "$CODE|$(val "d['numero_affiche']")"
DOC1=$(val "d['id']")
chk "réutiliser un numéro : refusé par la base, même au super-utilisateur" 1 \
    "$(refus "INSERT INTO documents_emis (commune_id, type_document, exercice, numero, contenu, empreinte_contenu)
              VALUES ('$TC', 'bon_carburant', $(date +%Y), 1, '{\"test\":\"TEST-16.2\"}', '');" 'DOCUMENT_NUMERO\|duplicate key')"
chk "devancer le compteur (glisser le n° 999) : refusé" 1 \
    "$(refus "INSERT INTO documents_emis (commune_id, type_document, exercice, numero, contenu, empreinte_contenu)
              VALUES ('$TC', 'bon_carburant', $(date +%Y), 999, '{\"test\":\"TEST-16.2\"}', '');" DOCUMENT_NUMERO)"
chk "modifier le contenu d'un document émis : refusé" 1 \
    "$(refus "UPDATE documents_emis SET contenu = '{\"litres\":9999}' WHERE id = '$DOC1';" DOCUMENT_SCELLE)"
chk "changer son numéro : refusé" 1 \
    "$(refus "UPDATE documents_emis SET numero = 7 WHERE id = '$DOC1';" DOCUMENT_SCELLE)"
chk "le supprimer : refusé" 1 "$(refus "DELETE FROM documents_emis WHERE id = '$DOC1';" DOCUMENT_SCELLE)"
chk "l'annuler sans motif, en base : refusé" 1 \
    "$(refus "UPDATE documents_emis SET statut='annule', annule_le=now() WHERE id = '$DOC1';" documents_annulation_motivee)"
chk "l'application n'a aucun droit d'écriture directe sur le registre" "false|false|false" \
    "$(sql "SELECT has_table_privilege('siipi_app','documents_emis','INSERT')||'|'||has_table_privilege('siipi_app','documents_emis','UPDATE')||'|'||has_table_privilege('siipi_app','documents_emis','DELETE')")"
CODE=$(appel PUT "/documents/$DOC1" "$T_A" '{"contenu":{"litres":9999}}')
chk "l'API n'offre ni modification…" 404 "$CODE"
CODE=$(appel DELETE "/documents/$DOC1" "$T_A")
chk "… ni suppression" 404 "$CODE"
CODE=$(appel GET "/documents/$DOC1" "$T_B")
chk "l'admin d'une autre commune ne le lit pas (404)" 404 "$CODE"
CODE=$(appel POST "/documents/$DOC1/annuler" "$T_B" '{"motif":"TEST tentative extérieure"}')
chk "… ni ne l'annule (404)" 404 "$CODE"
CODE=$(appel POST "/documents/$DOC1/annuler" "$T_A" '{"motif":"non"}')
chk "un motif d'annulation de moins de cinq caractères : refusé" 400 "$CODE"

# -----------------------------------------------------------------------------
echo
echo "2. La continuité du numéro"
for i in 2 3 4 5 6 7 8 9 10 11; do emettre bon_carburant "$i" >"$T/code-$i" & done; wait
chk "dix émissions SIMULTANÉES : dix succès" "201201201201201201201201201201" "$(cat "$T"/code-* | tr -d '\n')"
chk "… dix numéros distincts, et contigus (2 à 11)" "10|2|11" \
    "$(sql "SELECT count(DISTINCT numero)||'|'||min(numero)||'|'||max(numero) FROM documents_emis WHERE commune_id='$TC' AND type_document='bon_carburant' AND numero > 1")"
# Une émission qui échoue en base, APRÈS que le compteur a avancé, ne doit
# pas consommer de numéro : tout se défait dans la même transaction.
$PSQL -c "BEGIN; SELECT set_config('app.role','admin_commune',true), set_config('app.user_id','$ID_A',true);
          SET LOCAL ROLE siipi_app; SELECT app.emettre_document('$TC', 'bon_carburant', '{}'::jsonb); COMMIT;" >/dev/null 2>&1
CODE=$(emettre bon_carburant 12)
chk "une émission ratée en base ne consomme pas de numéro : la suivante reçoit le 12" "201|12" "$CODE|$(val "d['numero']")"
CODE=$(emettre ordre_mission 1)
chk "chaque type a son propre registre : premier ordre de mission n° 1" "201|OM-$(date +%Y)-00001" "$CODE|$(val "d['numero_affiche']")"
CODE=$(appel POST "/documents$Q" "$T_A" "{\"type\":\"ordre_mission\",\"contenu\":$(contenu ordre_mission 1),\"objet\":{\"type\":\"vehicule\",\"id\":\"test-doc-162-v1\"}}")
chk "un ordre de mission rattaché à un engin de la commune" "201|vehicule|test-doc-162-v1" "$CODE|$(val "d['objet_type']")|$(val "d['objet_id']")"
chk "le contenu porte son empreinte SHA-256" 1 \
    "$(sql "SELECT count(*) FROM documents_emis WHERE id='$DOC1' AND empreinte_contenu = encode(digest(contenu::text,'sha256'),'hex')")"
appel GET "/documents/trous$Q" "$T_A" >/dev/null
chk "aucun trou dans le registre" 0 "$(val "len(d)")"

# -----------------------------------------------------------------------------
echo
echo "3. L'annulation garde le numéro"
CODE=$(appel POST "/documents/$DOC1/annuler" "$T_A" '{"motif":"TEST — bon émis par erreur de saisie"}')
chk "l'admin annule, avec un motif" "200|annule|TEST — bon émis par erreur de saisie" "$CODE|$(val "d['statut']")|$(val "d['motif_annulation']")"
chk "le numéro reste au registre, le contenu reste lisible" "BC-$(date +%Y)-00001|TEST-16.2" "$(val "d['numero_affiche']")|$(val "d['contenu']['observations'].split()[0]")"
CODE=$(appel POST "/documents/$DOC1/annuler" "$T_A" '{"motif":"TEST seconde annulation"}')
chk "annuler deux fois : refusé (409)" 409 "$CODE"
chk "… et refusé par la base" 1 "$(refus "UPDATE documents_emis SET motif_annulation='autre motif bis' WHERE id = '$DOC1';" DOCUMENT_SCELLE)"
CODE=$(emettre bon_carburant 13)
chk "le numéro annulé n'est jamais réattribué : le suivant est le 13" "201|13" "$CODE|$(val "d['numero']")"
appel GET "/documents$Q&type=bon_carburant" "$T_FNCT" >/dev/null
chk "la FNCT lit le registre (treize bons, dont un annulé)" "13|1" "$(val "len(d)")|$(val "sum(1 for x in d if x['statut']=='annule')")"

# -----------------------------------------------------------------------------
echo
echo "4. Un trou créé hors de l'application se voit"
$PSQL -c "BEGIN; ALTER TABLE documents_emis DISABLE TRIGGER trg_proteger_document;
          DELETE FROM documents_emis WHERE commune_id='$TC' AND type_document='bon_carburant' AND numero=5;
          ALTER TABLE documents_emis ENABLE TRIGGER trg_proteger_document; COMMIT;" >/dev/null
appel GET "/documents/trous$Q" "$T_A" >/dev/null
chk "le n° 5 arraché du registre est signalé" "1|bon_carburant|5" "$(val "len(d)")|$(val "d[0]['type_document']")|$(val "d[0]['numero_manquant']")"
chk "le scellement est bien rétabli après la manipulation" 1 "$(refus "DELETE FROM documents_emis WHERE id = '$DOC1';" DOCUMENT_SCELLE)"

# -----------------------------------------------------------------------------
echo
echo "5. Les gabarits (décision du 16/10/2026) et l'impression"
appel GET "/documents/gabarits" "$T_A" >/dev/null
chk "quatre gabarits, tous « provisoires » jusqu'à la validation du chef de dépôt" "4|4" \
    "$(val "len(d)")|$(val "sum(1 for g in d if g['statut'] == 'provisoire')")"
CODE=$(appel POST "/documents$Q" "$T_A" '{"type":"bon_travail","contenu":{"engin":"TEST 162 001","nature":"TEST vidange"}}')
chk "un champ obligatoire manque : 400, et la réponse le nomme" "400|True" \
    "$CODE|$(val "'Travaux demandés' in d['error'] and 'Date d’entrée' in d['error']")"
CODE=$(appel POST "/documents$Q" "$T_A" "{\"type\":\"ordre_mission\",\"contenu\":$(contenu ordre_mission 2 | sed 's/}$/,"prime":"500"}/')}")
chk "un champ que le gabarit n'imprime pas : 400, nommé" "400|True" "$CODE|$(val "'prime' in d['error']")"
CODE=$(appel POST "/documents$Q" "$T_A" '{"type":"declaration_panne","contenu":{"engin":"TEST 162 001","date_panne":"16/10/2026","description":"TEST"}}')
chk "une date mal écrite : 400" 400 "$CODE"
CODE=$(appel POST "/documents$Q" "$T_A" '{"type":"declaration_panne","contenu":{"engin":"TEST 162 001","date_panne":"2026-10-16","description":"TEST frein <script>alert(1)</script>","immobilise":true}}')
chk "une déclaration de panne conforme : émise (DP-…-00001)" "201|DP-$(date +%Y)-00001" "$CODE|$(val "d['numero_affiche']")"
DP=$(val "d['id']"); EMPREINTE=$(val "d['empreinte_contenu'][:16]")
imprimer() { curl -s -o "$T/page.html" -w '%{http_code}' -H "Authorization: Bearer $2" "$API/documents/$1/impression"; }
chk "elle s'imprime : 200, en HTML" "200|t" "$(imprimer "$DP" "$T_A")|$(grep -q '<!doctype html>' "$T/page.html" && echo t || echo f)"
chk "… avec son numéro, son titre bilingue et le bandeau « modèle provisoire »" "t|t|t" \
    "$(grep -q "DP-$(date +%Y)-00001" "$T/page.html" && echo t || echo f)|$(grep -q 'بطاقة التصريح بعطب' "$T/page.html" && echo t || echo f)|$(grep -q 'MODÈLE PROVISOIRE' "$T/page.html" && echo t || echo f)"
chk "… le texte saisi est échappé, jamais interprété" "f|t" \
    "$(grep -q '<script>alert' "$T/page.html" && echo t || echo f)|$(grep -q '&lt;script&gt;alert' "$T/page.html" && echo t || echo f)"
chk "… un champ vide reste vide : ni tiret ni zéro dans la case du lieu" "t" \
    "$(python3 -c "
import re
h = open('$T/page.html', encoding='utf-8').read()
m = re.search(r'Lieu<span class=\"ar\">[^<]*</span></th><td>(.*?)</td>', h)
print('t' if m and m.group(1) == '' else 'f')")"
chk "… l'empreinte du contenu imprimée est celle du registre" t "$(grep -q "$EMPREINTE" "$T/page.html" && echo t || echo f)"
chk "… la mention d'édition est là" t "$(grep -q 'heure de Tunis' "$T/page.html" && echo t || echo f)"
chk "le directeur d'une autre commune : introuvable (404)" 404 "$(imprimer "$DP" "$T_B")"
chk "sans compte : 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$API/documents/$DP/impression")"
chk "un document annulé s'imprime encore, marqué « ANNULÉ » avec son motif" "200|t|t" \
    "$(imprimer "$DOC1" "$T_A")|$(grep -q 'ANNULÉ' "$T/page.html" && echo t || echo f)|$(grep -q 'bon émis par erreur de saisie' "$T/page.html" && echo t || echo f)"
chk "le bon carburant émis depuis l'écran générique s'imprime avec ses champs" "t|t" \
    "$(grep -q 'TEST 162 001' "$T/page.html" && echo t || echo f)|$(grep -q '10 L' "$T/page.html" && echo t || echo f)"

echo
echo "Aucune commune réelle n'a reçu de ligne (JC-014)"
base_reelle_intacte "pendant la campagne"
nettoyer_c
chk "ses communes de test et ses comptes temporaires sont effacés" "0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"
chk "la commune de test et ses documents sont retirés" "0|0" \
    "$(sql "SELECT (SELECT count(*) FROM communes WHERE id='$TC')||'|'||(SELECT count(*) FROM documents_emis WHERE commune_id='$TC')")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
