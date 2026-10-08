#!/usr/bin/env bash
# =============================================================================
# Lot 17.5 — le rejeu du coût complet d'une étude de bureau d'études
# (migration 062, services/coutComplet.ts).
#
# Elle commence par ce que la plateforme REFUSE : un fichier qui porte une
# donnée personnelle, un fichier sans source, un fichier d'un autre
# gouvernorat, l'admin d'une autre commune ; en base, une provenance autre que
# « déclaré par le bureau d'études », un ratio sans son pas d'arrondi, un
# montant négatif, un total absent, deux versions retenues du même chiffre,
# une ligne réécrite ou effacée.
#
# Puis le rejeu, comparé à un TÉMOIN INDÉPENDANT : backend/tests/
# cout_complet_attendus.py lit le même fichier et la méthode, jamais le code de
# l'API. Le jeu est FICTIF (tests/donnees/cout-complet-fictif.json), construit
# pour déclencher chacun des écarts E1 à E8 ; le jeu réel de M'hamdia reste
# hors du dépôt public.
#
#   docker compose exec -T api npm run test:cout-complet
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
ICI="$(cd "$(dirname "$0")" && pwd)"
FICHIER="$ICI/donnees/cout-complet-fictif.json"
pass=0; fail=0
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
# 1 si l'erreur attendue figure dans le message, 0 sinon.
refus() { $PSQL -c "$1" >"$T/err.txt" 2>&1; if grep -q "$2" "$T/err.txt"; then echo 1; else echo 0; fi; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
appel() { # méthode chemin jeton [fichier du corps] -> code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3" \
    -H 'Content-Type: application/json' ${4:+--data-binary "@$4"}
}
# Le corps d'un chargement : {"fichier": <le fichier>}, éventuellement retouché.
corps() { # [expression python sur f]
  python3 -c "
import json
f = json.load(open('$FICHIER', encoding='utf-8'))
${1:-pass}
json.dump({'fichier': f}, open('$T/corps.json', 'w', encoding='utf-8'), ensure_ascii=False)"
  echo "$T/corps.json"
}
# Comparer le rejeu de l'API ($T/etude.json) au témoin ($T/attendu.json).
cmp() { python3 -c "
import json
api = json.load(open('$T/etude.json')); rj = api['rejeu']
att = json.load(open('$T/attendu.json'))
ratio = {x['code']: x for x in rj['ratios']}
ecart = {x['code']: x for x in rj['ecarts']}
print($1)" 2>/dev/null || echo erreur; }

T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
DIR_A=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire AND commune_id IS NOT NULL ORDER BY created_at LIMIT 1")
ID_A=$(sql "SELECT id FROM users WHERE email='$DIR_A'")
TC=test_cout_complet_175

nettoyer() { $PSQL -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1; }
nettoyer
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune coût', 'TEST', 'TEST', 40000);
          INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$ID_A', '$TC');" >/dev/null
T_A=$(tok "$DIR_A")
DIR_B=$(sql "SELECT u.email FROM users u WHERE u.role='admin_commune' AND u.deleted_at IS NULL AND u.is_active AND NOT u.mot_de_passe_provisoire AND u.email <> '$DIR_A' AND u.commune_id <> '$TC' AND NOT EXISTS (SELECT 1 FROM utilisateur_communes x WHERE x.user_id = u.id AND x.commune_id = '$TC') ORDER BY u.created_at LIMIT 1")
T_B=$(tok "$DIR_B")
Q="?communeId=$TC"
python3 "$ICI/cout_complet_attendus.py" "$FICHIER" >"$T/attendu.json"

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme refuse au chargement"
CODE=$(appel POST "/cout-complet/etudes$Q" "$T_A" "$(corps "f['commune']['nom_agent'] = 'TEST'")")
chk "un fichier qui porte un champ de nom d'agent : refusé en bloc" "400|1" "$CODE|$(val "int('donnée personnelle' in d['error'])")"
CODE=$(appel POST "/cout-complet/etudes$Q" "$T_A" "$(corps "f['charges_directes_collecte_2025']['salaires_individuels'] = [1]")")
chk "un fichier qui porte des salaires individuels : refusé" 400 "$CODE"
chk "un fichier qui ne nomme pas le rapport dont il vient : refusé" 400 \
    "$(appel POST "/cout-complet/etudes$Q" "$T_A" "$(corps "del f['_meta']['source']")")"
CODE=$(appel POST "/cout-complet/etudes$Q" "$T_A" "$(corps "f['commune']['gouvernorat'] = 'Sfax'")")
chk "un fichier d'un autre gouvernorat que la commune : refusé" "400|1" "$CODE|$(val "int('Sfax' in d['error'])")"
chk "l'admin d'une autre commune ne charge rien ici : introuvable (404)" 404 \
    "$(appel POST "/cout-complet/etudes$Q" "$T_B" "$(corps)")"
chk "aucune étude n'est entrée" 0 "$(sql "SELECT count(*) FROM etudes_cout_complet WHERE commune_id='$TC'")"

# -----------------------------------------------------------------------------
echo
echo "2. Le chargement : des chiffres déclarés, rien d'inventé"
CODE=$(appel POST "/cout-complet/etudes$Q" "$T_A" "$(corps)")
cp "$T/r.json" "$T/etude.json"
ETUDE=$(val "d['id']")
chk "le fichier fictif se charge, provenance « déclaré par le bureau d'études »" "201|declare_bureau_etudes|2025" \
    "$CODE|$(val "d['provenance']")|$(val "d['exercice']")"
chk "le tonnage pesé, la population et les ménages de l'étude" "10000|40000|10000" \
    "$(val "int(d['tonnage_pese_t'])")|$(val "d['population']")|$(val "d['menages']")"
chk "deux versions publiées du personnel : la principale retenue, l'autre rangée" "600000|600500" \
    "$(val "[int(v['montant']) for v in d['valeurs'] if v['code']=='personnel' and v['retenue']][0]")|$(val "[int(v['montant']) for v in d['valeurs'] if v['code']=='personnel' and not v['retenue']][0]")"
chk "des deux totaux indirects, celui qui égale siège + parc + direction est retenu" "300000|303000" \
    "$(val "[int(v['montant']) for v in d['valeurs'] if v['code']=='total_indirect' and v['retenue']][0]")|$(val "[int(v['montant']) for v in d['valeurs'] if v['code']=='total_indirect' and not v['retenue']][0]")"
chk "les postes absents à la lecture sont rangés absents : montant null, jamais 0" "$(python3 -c "import json;print(','.join(json.load(open('$T/attendu.json'))['declares_absents']))")" \
    "$(val "','.join(sorted(v['code'] for v in d['valeurs'] if v['nature']=='poste' and v['montant'] is None))")"
chk "le pas d'arrondi des ratios : 1 pour « 150 », 0,1 pour « 7,5 »" "1|0.1" \
    "$(val "[v['pas_arrondi'] for v in d['valeurs'] if v['code']=='cout_par_tonne'][0]")|$(val "[v['pas_arrondi'] for v in d['valeurs'] if v['code']=='gasoil_par_tonne'][0]")"
chk "l'écart E1 écrit dans le fichier n'est pas recopié (SIIPI le recalcule) ; E6 l'est" "0|1" \
    "$(val "sum(1 for c in d['constats'] if c['code']=='E1')")|$(val "sum(1 for c in d['constats'] if c['code']=='E6')")"
chk "la même étude deux fois : refusée (409)" 409 "$(appel POST "/cout-complet/etudes$Q" "$T_A" "$(corps)")"

# -----------------------------------------------------------------------------
echo
echo "3. Ce que la base refuse"
chk "une provenance autre que « déclaré par le bureau d'études »" 1 \
    "$(refus "INSERT INTO etudes_cout_complet (commune_id, exercice, document, provenance) VALUES ('$TC', 2024, 'TEST', 'mesure');" etudes_provenance_declaree)"
chk "un ratio sans son pas d'arrondi" 1 \
    "$(refus "INSERT INTO valeurs_cout_complet (etude_id, commune_id, nature, code, montant) VALUES ('$ETUDE', '$TC', 'ratio', 'cout_par_jour', 10);" valeurs_cout_pas_arrondi)"
chk "un montant négatif" 1 \
    "$(refus "INSERT INTO valeurs_cout_complet (etude_id, commune_id, nature, code, montant, retenue) VALUES ('$ETUDE', '$TC', 'poste', 'assurance', -1, false);" valeurs_cout_montant_positif)"
chk "un total déclaré sans montant (seul un poste peut être absent)" 1 \
    "$(refus "INSERT INTO valeurs_cout_complet (etude_id, commune_id, nature, code, retenue) VALUES ('$ETUDE', '$TC', 'total', 'cout_total', false);" valeurs_cout_absence_poste)"
chk "un code hors de la nomenclature" 1 \
    "$(refus "INSERT INTO valeurs_cout_complet (etude_id, commune_id, nature, code, montant) VALUES ('$ETUDE', '$TC', 'poste', 'divers', 5);" valeurs_cout_code)"
chk "deux versions retenues du même chiffre" 1 \
    "$(refus "INSERT INTO valeurs_cout_complet (etude_id, commune_id, nature, code, montant) VALUES ('$ETUDE', '$TC', 'poste', 'personnel', 1);" uq_valeur_cout_retenue)"
chk "une ligne déclarée ne se réécrit pas" 1 \
    "$(refus "UPDATE valeurs_cout_complet SET montant = 1 WHERE etude_id = '$ETUDE' AND code = 'personnel';" ETUDE_FIGEE)"
chk "… et l'application n'a aucun droit de l'effacer" 1 \
    "$(refus "SET ROLE siipi_app; DELETE FROM valeurs_cout_complet WHERE etude_id = '$ETUDE';" 'permission denied')"

# -----------------------------------------------------------------------------
echo
echo "4. Le rejeu Z = (A+B)+(C+D), comparé au témoin indépendant"
CODE=$(appel GET "/cout-complet/etudes/$ETUDE" "$T_A")
cp "$T/r.json" "$T/etude.json"
chk "les blocs A, B, C, D" "$(cmp "'|'.join(str(att['blocs'][b]) for b in 'ABCD')")" "$(cmp "'|'.join(str(float(rj['blocs'][b]['montant'])) for b in 'ABCD')")"
chk "X, Y, Z (900 000 + 300 000 = 1 200 000)" "$(cmp "f\"{att['X']}|{att['Y']}|{att['Z']}\"")" "$(cmp "f\"{float(rj['X'])}|{float(rj['Y'])}|{float(rj['Z'])}\"")"
chk "Z rejoué face au coût total publié : écart 0" "0|True" "$(cmp "f\"{int(rj['comparaison']['Z']['ecart'])}|{rj['complet']}\"")"
chk "le coût complet sur le tonnage PESÉ : 120 DT/t (le rapport publie 150)" "$(cmp "att['cout_par_tonne_pese']")" "$(cmp "float(rj['recalcul_tonnage_pese']['cout_par_tonne'])")"
chk "chaque ratio publié : l'intervalle de son dénominateur implicite" "$(cmp "sorted((k, v['intervalle']['min'], v['intervalle']['max']) for k, v in att['ratios'].items() if v['intervalle'])")" \
    "$(cmp "sorted((x['code'], float(x['intervalle']['min']), float(x['intervalle']['max'])) for x in rj['ratios'] if x['intervalle'])")"
chk "chaque ratio : compatible ou non avec le dénominateur déclaré" "$(cmp "sorted((k, v['compatible']) for k, v in att['ratios'].items())")" \
    "$(cmp "sorted((x['code'], x['compatible']) for x in rj['ratios'])")"

# -----------------------------------------------------------------------------
echo
echo "5. Les écarts E1 à E8 : montrés, pas tranchés"
chk "le statut de chaque écart, identique au témoin" "$(cmp "'|'.join(f'{k}:{att[\"ecarts\"][k]}' for k in sorted(att['ecarts']))")" \
    "$(cmp "'|'.join(f'{k}:{ecart[k][\"statut\"]}' for k in sorted(ecart))")"
chk "E1 : 150 DT/t implique 7 973 à 8 027 t, pas les 10 000 t pesées" "constate|7973.42|8026.76|10000|120" \
    "$(cmp "f\"{ecart['E1']['statut']}|{ecart['E1']['donnees']['intervalle']['min']}|{ecart['E1']['donnees']['intervalle']['max']}|{int(ecart['E1']['donnees']['tonnage_pese'])}|{ecart['E1']['donnees']['ratio_sur_tonnage_pese']:g}\"")"
chk "E2 : la maintenance implique le tonnage pesé, les autres ratios non" "constate|maintenance_par_tonne" \
    "$(cmp "ecart['E2']['statut'] + '|' + ','.join(x['code'] for x in ecart['E2']['donnees']['ratios'] if x['compatible_tonnage_pese'])")"
chk "E3 : 300 000 contre 303 000, et 900 000 + 303 000 ≠ 1 200 000" "$(cmp "','.join(att['recoupements'])")|303000" \
    "$(cmp "','.join(x['verification'] for x in ecart['E3']['donnees']['recoupements']) + '|' + str(int(ecart['E3']['donnees']['versions'][0]['autres'][0]['montant']))")"
chk "E4 : deux versions du personnel et des engins" "$(cmp "','.join(att['versions_postes'])")" \
    "$(cmp "','.join(sorted(x['code'] for x in ecart['E4']['donnees']['versions']))")"
chk "E5 : 30 DT/hab et 120 DT/ménage retombent sur 40 000 hab. et 10 000 ménages — aucun écart" "aucun|True|True" \
    "$(cmp "ecart['E5']['statut'] + '|' + '|'.join(str(x['compatible']) for x in ecart['E5']['donnees']['ratios'])")"
chk "E6 : la note de lecture, recopiée telle quelle" "declare|1" "$(cmp "ecart['E6']['statut'] + '|' + str(len(ecart['E6']['notes']))")"
chk "E7 : les postes non renseignés — jamais comptés pour 0" "$(cmp "','.join(att['non_renseignes'])")" \
    "$(cmp "','.join(ecart['E7']['donnees']['non_renseignes'])")"
chk "E7 : la note « amortissement détaillé par engin » reste une note" 1 "$(cmp "len(ecart['E7']['notes'])")"
chk "E8 : seules les campagnes de propreté sont ventilées" "$(cmp "','.join(att['flux_manquants'])")|campagnes_proprete" \
    "$(cmp "','.join(ecart['E8']['donnees']['flux_manquants']) + '|' + ','.join(x['code'] for x in ecart['E8']['donnees']['flux_ventiles'])")"

# -----------------------------------------------------------------------------
echo
echo "6. Cloisonnement et retrait"
chk "l'admin d'une autre commune ne lit pas l'étude : introuvable (404)" 404 "$(appel GET "/cout-complet/etudes/$ETUDE" "$T_B")"
CODE=$(appel GET "/cout-complet/etudes$Q" "$T_B")
chk "… et ne la voit pas dans la liste" "200|0" "$CODE|$(val "len(d)")"
chk "la FNCT la lit" 200 "$(appel GET "/cout-complet/etudes/$ETUDE" "$T_FNCT")"
chk "retirée (pour la recharger)" 204 "$(appel DELETE "/cout-complet/etudes/$ETUDE" "$T_A")"
chk "… elle n'est plus lisible, ses lignes restent en base" "404|1" \
    "$(appel GET "/cout-complet/etudes/$ETUDE" "$T_A")|$(sql "SELECT count(*) > 0 FROM valeurs_cout_complet WHERE etude_id='$ETUDE'" | sed 's/t/1/')"
chk "… et l'étude se recharge" 201 "$(appel POST "/cout-complet/etudes$Q" "$T_A" "$(corps)")"

nettoyer
chk "la commune de test et ses études sont retirées" 0 "$(sql "SELECT count(*) FROM etudes_cout_complet WHERE commune_id='$TC'")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
