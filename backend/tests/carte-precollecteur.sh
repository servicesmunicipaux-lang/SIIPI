#!/usr/bin/env bash
# =============================================================================
# Lot I2 — la carte de pré-collecteur (18.2 ; migration 092 ; décisions du
# 28/10/2026).
#
# Elle commence par ce que la plateforme REFUSE : une demande tant que le cadre
# est éteint ; une carte pour un intermédiaire ou un acteur sans catégorie ; une
# demande datée de demain, sans secteur, avec le secteur d'une autre commune, ou
# l'acteur d'une autre commune ; une seconde demande en attente ; une pièce hors
# de la liste du jour de la demande, ou datée de demain ; un accord sans toutes
# les pièces, sans durée de validité en vigueur, par la FNCT, par un prestataire,
# par le directeur d'une autre commune ; une décision prise deux fois ; une carte
# scellée réécrite ; une carte émise par le formulaire générique ; une colonne
# de paiement.
#
# Puis les règles du lot :
#   - la liste des pièces est celle du JOUR DE LA DEMANDE : une pièce ajoutée
#     après n'est pas exigée d'elle, elle l'est d'une demande d'aujourd'hui ;
#   - la validité est la durée en vigueur le JOUR DE LA DÉCISION : une durée
#     changée change la carte suivante, pas celle déjà délivrée ; la fin se
#     vérifie contre un calcul de dates écrit ici ;
#   - un renouvellement est une nouvelle carte, un nouveau numéro, qui commence
#     le lendemain de la fin de la précédente ; sans « carte renouvelée »,
#     l'accord est refusé tant que la carte en cours vaut ;
#   - AUCUN NOM n'est scellé ni journalisé : le nom s'imprime pour le directeur
#     de la commune (lecture journalisée), jamais pour la FNCT ;
#   - « À vérifier » annonce une carte qui expire dans les 30 jours, en
#     français et en arabe, et se tait quand elle est retirée.
#
# Communes et comptes de test seulement ; noms et CIN fictifs, de même format.
# Les tables nationales touchées (interrupteurs, durées, listes) sont gardées
# avant le premier geste et rendues ligne entière en partant.
#
#   docker compose exec -T api npm run test:carte-precollecteur
# =============================================================================

set -u
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
sqlb() { $PSQL -c "$1" 2>/dev/null; }
# 1 si l'erreur attendue figure dans le message, 0 sinon.
refus() { $PSQL -c "$1" >"$T/err.txt" 2>&1; if grep -q "$2" "$T/err.txt"; then echo 1; else echo 0; fi; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
appel() { # méthode chemin jeton [corps] -> code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3" \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}
page() { # chemin jeton -> code HTTP, page dans $T/page.html
  curl -s -o "$T/page.html" -w '%{http_code}' "$API$1" -H "Authorization: Bearer $2"
}

A=test_carte_a
B=test_carte_b
ESSAI="'$A','$B'"
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
. "$(dirname "$0")/outils/comptes_temporaires.sh"
. "$(dirname "$0")/outils/communes_essai.sh"
. "$(dirname "$0")/outils/base_reelle.sh"
. "$(dirname "$0")/outils/tables_nationales.sh"
# Une carte émise est scellée : sa suppression est refusée, même au
# super-utilisateur. Les cartes des communes de test s'effacent le déclencheur
# levé, le temps d'une transaction, puis tout ce que les communes portent.
nettoyer() {
  $PSQL -c "BEGIN;
            ALTER TABLE documents_emis DISABLE TRIGGER trg_proteger_document;
            DELETE FROM demandes_carte_precollecteur WHERE commune_id IN ($ESSAI);
            DELETE FROM documents_emis WHERE commune_id IN ($ESSAI);
            ALTER TABLE documents_emis ENABLE TRIGGER trg_proteger_document;
            COMMIT;" >/dev/null 2>&1
  $PSQL -c "DELETE FROM barbechas WHERE commune_id IN ($ESSAI) OR id_precollecteur LIKE 'TEST-CP-%';" >/dev/null 2>&1
  effacer_communes_essai "$ESSAI"
}
nettoyer
trap 'nettoyer; retirer_comptes_temporaires; rm -rf "$T"' EXIT
garder_tables_nationales parametres_nationaux valeurs_parametres_nationaux elements_listes_nationales
rendre_tables_nationales_en_sortie
releve_base_reelle

commune_essai "$A" "TEST Commune de la carte"
commune_essai "$B" "TEST Autre commune de la carte"
compte_temporaire admin_commune "$A" "Directeur de la carte"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$B" "Directeur de l'autre commune"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire gestionnaire_prestataire "$A" "Prestataire de la commune"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
J=$(sql "SELECT app.jour_tunis()")
jour() { sql "SELECT (app.jour_tunis() + $1)::text"; }
J10=$(jour -10); J5=$(jour -5); J2=$(jour -2); DEMAIN=$(jour 1)
$PSQL -c "UPDATE parametres_nationaux SET valeur = 'false', reference = NULL WHERE cle = 'cadre_secteur_informel_actif';
          INSERT INTO parametres_commune (commune_id, recepisse_inpdp, recepisse_inpdp_date) VALUES ('$A', 'TEST-INPDP-0001', '$J10');
          INSERT INTO zones_collecte (commune_id, name, geom) VALUES
            ('$A', 'TEST secteur nord', ST_Multi(ST_MakeEnvelope(9.0, 35.0, 9.001, 35.001, 4326))),
            ('$A', 'TEST secteur sud', ST_Multi(ST_MakeEnvelope(9.0, 35.002, 9.001, 35.003, 4326))),
            ('$B', 'TEST secteur de l''autre commune', ST_Multi(ST_MakeEnvelope(9.1, 35.0, 9.101, 35.001, 4326)));" >/dev/null
Z1=$(sql "SELECT id FROM zones_collecte WHERE commune_id = '$A' AND name = 'TEST secteur nord'")
Z2=$(sql "SELECT id FROM zones_collecte WHERE commune_id = '$A' AND name = 'TEST secteur sud'")
ZB=$(sql "SELECT id FROM zones_collecte WHERE commune_id = '$B'")
# Les acteurs : posés en base, le cadre le temps de les catégoriser (la
# catégorie est le lot 18.1, éprouvé par sa campagne).
$PSQL -c "UPDATE parametres_nationaux SET valeur = 'true', reference = 'TEST cadre' WHERE cle = 'cadre_secteur_informel_actif';
          INSERT INTO barbechas (id_precollecteur, zone, commune_id, categorie, dispose_local, achete_aux_pairs, faits_releves_le) VALUES
            ('TEST-CP-P1', 'TEST', '$A', 'pre_collecteur', false, false, '$J10'),
            ('TEST-CP-P2', 'TEST', '$A', 'pre_collecteur', false, false, '$J10'),
            ('TEST-CP-P3', 'TEST', '$A', 'pre_collecteur', false, false, '$J10'),
            ('TEST-CP-I1', 'TEST', '$A', 'intermediaire', true, true, '$J10'),
            ('TEST-CP-B1', 'TEST', '$B', 'pre_collecteur', false, false, '$J10');
          INSERT INTO barbechas (id_precollecteur, zone, commune_id) VALUES ('TEST-CP-N1', 'TEST', '$A');
          UPDATE parametres_nationaux SET valeur = 'false', reference = NULL WHERE cle = 'cadre_secteur_informel_actif';" >/dev/null
acteur() { sql "SELECT id FROM barbechas WHERE id_precollecteur = '$1'"; }
P1=$(acteur TEST-CP-P1); P2=$(acteur TEST-CP-P2); P3=$(acteur TEST-CP-P3); I1=$(acteur TEST-CP-I1); N1=$(acteur TEST-CP-N1); B1=$(acteur TEST-CP-B1)
demande() { # acteur date [carte précédente] [zones JSON] -> code
  appel POST /cartes-precollecteur/demandes "$T_A" \
    "{\"acteurId\":\"$1\",\"dateDemande\":\"$2\",\"zones\":${4:-[\"$Z1\",\"$Z2\"]}${3:+,\"cartePrecedenteId\":\"$3\"}}"
}
piece() { # demande code date [référence] -> code
  appel POST "/cartes-precollecteur/demandes/$1/pieces" "$T_A" "{\"pieceCode\":\"$2\",\"datePiece\":\"$3\",\"reference\":\"${4:-TEST-REF}\"}"
}
pieces_du_projet() { # demande date
  piece "$1" declaration_activite_simplifiee "$2" >/dev/null
  piece "$1" engagement_hygiene_securite "$2" >/dev/null
  piece "$1" acceptation_accompagnement "$2" >/dev/null
}
accorder() { appel POST "/cartes-precollecteur/demandes/$1/accord" "${3:-$T_A}" "{\"dateDecision\":\"$2\"}"; }
# Le témoin : n mois ajoutés au jour dit (ramené au dernier jour du mois), la veille.
fin_attendue() {
  python3 - "$1" "$2" <<'PY'
import sys, calendar, datetime
d = datetime.date.fromisoformat(sys.argv[1]); n = int(sys.argv[2])
a, b = divmod(d.month - 1 + n, 12)
an, mo = d.year + a, b + 1
print(datetime.date(an, mo, min(d.day, calendar.monthrange(an, mo)[1])) - datetime.timedelta(days=1))
PY
}

# -----------------------------------------------------------------------------
echo
echo "1. Cadre éteint : aucune carte ne se demande"
CODE=$(demande "$P1" "$J10")
chk "une demande, le cadre éteint : refusée (409), le message dit pourquoi" "409|1" "$CODE|$(val "int('pas en vigueur' in d['error'])")"
chk "… et refusée par la base, même au super-utilisateur" 1 \
    "$(refus "INSERT INTO demandes_carte_precollecteur (commune_id, acteur_id, date_demande) VALUES ('$A', '$P1', '$J10');" CADRE_INACTIF)"
CODE=$(appel GET "/cartes-precollecteur?communeId=$A" "$T_A")
chk "le registre des cartes se lit : cadre éteint, aucune demande" "200|False|0" "$CODE|$(val "d['cadre_actif']")|$(val "len(d['demandes'])")"
$PSQL -c "UPDATE parametres_nationaux SET valeur = 'true', reference = 'TEST projet de décret — démonstration' WHERE cle = 'cadre_secteur_informel_actif';
          UPDATE parametres_nationaux SET valeur = 'true', reference = 'TEST hébergement' WHERE cle = 'hebergement_pii_accredite';" >/dev/null

# -----------------------------------------------------------------------------
echo
echo "2. Ce que la plateforme refuse à la demande"
CODE=$(demande "$I1" "$J10")
chk "une carte pour un acteur déclaré intermédiaire : refusée (409)" "409|1" "$CODE|$(val "int('intermédiaire' in d['error'])")"
CODE=$(demande "$N1" "$J10")
chk "une carte pour un acteur sans catégorie déclarée : refusée (409)" "409|1" "$CODE|$(val "int('sans catégorie' in d['error'])")"
chk "une demande datée de demain : refusée" 400 "$(demande "$P1" "$DEMAIN")"
chk "une demande sans secteur : refusée" 400 "$(demande "$P1" "$J10" "" '[]')"
chk "une demande avec le secteur d'une autre commune : refusée" 400 "$(demande "$P1" "$J10" "" "[\"$ZB\"]")"
chk "l'acteur d'une autre commune : introuvable" 404 "$(demande "$B1" "$J10")"
chk "la FNCT ne demande pas de carte à la place de la commune" 403 \
    "$(appel POST /cartes-precollecteur/demandes "$T_FNCT" "{\"acteurId\":\"$P1\",\"dateDemande\":\"$J10\",\"zones\":[\"$Z1\"]}")"
chk "un prestataire non plus" 403 \
    "$(appel POST /cartes-precollecteur/demandes "$T_P" "{\"acteurId\":\"$P1\",\"dateDemande\":\"$J10\",\"zones\":[\"$Z1\"]}")"
CODE=$(demande "$P1" "$J10")
D1=$(val "d['id']")
chk "la demande de P1, déposée il y a 10 jours, deux secteurs : enregistrée, en attente" "201|demandee|2|3|0" \
    "$CODE|$(val "d['etat']")|$(val "len(d['zones'])")|$(val "len(d['pieces'])")|$(val "len([p for p in d['pieces'] if p['piece_id']])")"
chk "la demande ne porte que le pseudonyme : aucune colonne de nom ni de CIN" "TEST-CP-P1|0" \
    "$(val "d['id_precollecteur']")|$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('demandes_carte_precollecteur','pieces_demande_carte','zones_demande_carte') AND column_name ~ '(nom|name|cin)'")"
chk "une seconde demande en attente pour le même acteur : refusée (409)" 409 "$(demande "$P1" "$J5")"
chk "aucune colonne de paiement, de montant ni de frais : la carte est gratuite" 0 \
    "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('demandes_carte_precollecteur','pieces_demande_carte','zones_demande_carte') AND column_name ~ '(paie|paiement|montant|prix|frais|tarif|tnd|redevance)'")"

# -----------------------------------------------------------------------------
echo
echo "3. Les pièces : la liste du jour de la demande"
chk "une pièce hors de la liste : refusée" 400 "$(piece "$D1" photo_identite "$J10")"
chk "une pièce datée de demain : refusée" 400 "$(piece "$D1" declaration_activite_simplifiee "$DEMAIN")"
CODE=$(accorder "$D1" "$J5")
chk "un accord sans les pièces : refusé (409), les trois manquantes nommées" "409|1" \
    "$CODE|$(val "int(all(x in d['error'] for x in ('Déclaration d’activité'.replace('’', \"'\"), 'hygiène', 'accompagnement')))")"
piece "$D1" declaration_activite_simplifiee "$J10" >/dev/null
chk "la même pièce deux fois : refusée (409)" 409 "$(piece "$D1" declaration_activite_simplifiee "$J10")"
# Une pièce ajoutée par la FNCT il y a cinq jours : après la demande de P1.
$PSQL -c "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, ordre, date_effet, provisoire, reference)
          VALUES ('pieces_carte_precollecteur', 'test_photo_identite', 'TEST Photo d''identité', 'TEST صورة', 40, '$J5', true, 'TEST circulaire');" >/dev/null
chk "une pièce exigée depuis cinq jours ne l'est pas d'une demande d'il y a dix jours" 400 "$(piece "$D1" test_photo_identite "$J5")"
piece "$D1" engagement_hygiene_securite "$J10" >/dev/null
piece "$D1" acceptation_accompagnement "$J10" "" >/dev/null
appel GET "/cartes-precollecteur?communeId=$A" "$T_A" >/dev/null
chk "les trois pièces de la demande de P1 sont reçues" "3|3" \
    "$(val "len([x for x in d['demandes'] if x['id']=='$D1'][0]['pieces'])")|$(val "len([p for p in [x for x in d['demandes'] if x['id']=='$D1'][0]['pieces'] if p['piece_id']])")"
CODE=$(demande "$P2" "$J")
D2=$(val "d['id']")
chk "une demande d'aujourd'hui, elle, exige quatre pièces" "201|4" "$CODE|$(val "len(d['pieces'])")"

# -----------------------------------------------------------------------------
echo
echo "4. L'accord : la carte est émise, scellée, sans nom"
chk "la FNCT n'accorde pas à la place de la commune" 403 "$(accorder "$D1" "$J5" "$T_FNCT")"
chk "un prestataire non plus" 403 "$(accorder "$D1" "$J5" "$T_P")"
chk "le directeur d'une autre commune : demande introuvable" 404 "$(accorder "$D1" "$J5" "$T_B")"
chk "une décision qui précède la demande : refusée" 400 "$(accorder "$D1" "$(jour -11)")"
chk "une décision datée de demain : refusée" 400 "$(accorder "$D1" "$DEMAIN")"
CODE=$(accorder "$D1" "$J5")
DOC1=$(val "d['document_id']"); NUM1=$(val "d['numero_affiche']")
chk "accordée il y a cinq jours : valide, numérotée « CP-… »" "200|valide|1" \
    "$CODE|$(val "d['etat']")|$(val "int(__import__('re').fullmatch(r'CP-\\d{4}-\\d{5}', d['numero_affiche']) is not None)")"
chk "valable du jour de la décision, 12 mois (la durée du jour), jusqu'à la veille" "$J5|$(fin_attendue "$J5" 12)" \
    "$(val "d['date_debut']")|$(val "d['date_fin']")"
CONTENU=$(sqlb "SELECT contenu::text FROM documents_emis WHERE id = '$DOC1'")
chk "la carte scellée porte le pseudonyme, les deux secteurs, 12 mois, une règle provisoire" "TEST-CP-P1|1|12|True" \
    "$(python3 -c "import json,sys;c=json.loads(sys.argv[1]);print(c['identifiant'],int('TEST secteur nord' in c['zones'] and 'TEST secteur sud' in c['zones']),c['duree_mois'],c['regle_provisoire'],sep='|')" "$CONTENU")"
appel GET /documents/gabarits "$T_A" >/dev/null
chk "chaque clé scellée est une clé du gabarit ; le nom n'en est pas une, scellée" "[]|False" \
    "$(python3 -c "
import json,sys
g=[x for x in json.load(open('$T/r.json')) if x['type']=='carte_precollecteur'][0]
cles={c['cle'] for c in g['champs'] if not c.get('imprimeSeulement')}
c=json.loads(sys.argv[1])
print(sorted(set(c)-cles),'|','nom' in c,sep='')" "$CONTENU")"
chk "une décision prise deux fois : refusée (409)" 409 "$(accorder "$D1" "$J5")"
chk "une demande décidée ne se retire pas (409)" 409 "$(appel DELETE "/cartes-precollecteur/demandes/$D1" "$T_A")"
chk "ses pièces ne changent plus (409)" 409 "$(piece "$D1" test_photo_identite "$J5")"
chk "la carte scellée ne se réécrit pas (base)" 1 \
    "$(refus "UPDATE documents_emis SET contenu = contenu || '{\"duree_mois\":99}' WHERE id = '$DOC1';" DOCUMENT_SCELLE)"
chk "la décision ne se réécrit pas non plus (base)" 1 \
    "$(refus "UPDATE demandes_carte_precollecteur SET date_fin = date_fin + 365 WHERE id = '$D1';" CARTE_DECIDEE)"
chk "le formulaire générique des documents n'émet pas de carte" 400 \
    "$(appel POST "/documents?communeId=$A" "$T_A" '{"type":"carte_precollecteur","contenu":{"identifiant":"TEST-CP-P1"}}')"
chk "l'application ne peut ni modifier ni effacer une demande" "f|f" \
    "$(sql "SELECT has_table_privilege('siipi_app', 'demandes_carte_precollecteur', 'UPDATE')")|$(sql "SELECT has_table_privilege('siipi_app', 'demandes_carte_precollecteur', 'DELETE')")"

# -----------------------------------------------------------------------------
echo
echo "5. Refus, et validité absente"
# Une demande du 1er septembre 2026 : ni pièce ni durée n'étaient en vigueur
# (le projet est daté du 30/09/2026). La base n'invente pas de validité.
CODE=$(demande "$P3" "2026-09-01")
D3=$(val "d['id']")
chk "une demande du 1er septembre 2026 : aucune pièce n'était exigée ce jour-là" "201|0" "$CODE|$(val "len(d['pieces'])")"
CODE=$(accorder "$D3" "2026-09-15")
chk "un accord au 15 septembre : aucune durée en vigueur, refusé (409)" "409|1" "$CODE|$(val "int('durée de validité' in d['error'])")"
chk "un refus sans motif : refusé" 400 \
    "$(appel POST "/cartes-precollecteur/demandes/$D3/refus" "$T_A" '{"dateDecision":"2026-09-15","motif":"non"}')"
CODE=$(appel POST "/cartes-precollecteur/demandes/$D3/refus" "$T_A" '{"dateDecision":"2026-09-15","motif":"TEST dossier incomplet au dépôt"}')
chk "refusée, motivée : aucun document émis" "200|refusee|None" "$CODE|$(val "d['etat']")|$(val "d['document_id']")"
chk "un refus ne se change pas en accord (409)" 409 "$(accorder "$D3" "2026-09-20")"

# -----------------------------------------------------------------------------
echo
echo "6. La durée du jour de la décision, et le renouvellement"
$PSQL -c "INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_nombre, provisoire, reference)
          VALUES ('informel_validite_carte_mois', '$J2', 18, false, 'TEST arrêté de validité');" >/dev/null
pieces_du_projet "$D2" "$J"
CODE=$(accorder "$D2" "$J")
chk "sans la photo exigée depuis cinq jours, la demande d'aujourd'hui n'est pas accordée (409)" "409|1" "$CODE|$(val "int('Photo' in d['error'])")"
piece "$D2" test_photo_identite "$J" >/dev/null
CODE=$(accorder "$D2" "$J")
DOC2=$(val "d['document_id']")
chk "accordée aujourd'hui : 18 mois, la durée publiée il y a deux jours" "200|$(fin_attendue "$J" 18)" "$CODE|$(val "d['date_fin']")"
chk "… avec ses quatre pièces, la photo comprise" 1 \
    "$(sql "SELECT count(*) FROM pieces_demande_carte WHERE demande_id = '$D2' AND piece_code = 'test_photo_identite' AND deleted_at IS NULL")"
chk "la carte de P1, délivrée avant, garde ses 12 mois" "12|$(fin_attendue "$J5" 12)" \
    "$(sql "SELECT (contenu->>'duree_mois') || '|' || (contenu->>'date_fin') FROM documents_emis WHERE id = '$DOC1'")"
chk "la règle de P2 est officielle : la carte ne se dit pas provisoire" false \
    "$(sql "SELECT contenu->>'regle_provisoire' FROM documents_emis WHERE id = '$DOC2'")"
CODE=$(demande "$P1" "$J")
D5=$(val "d['id']")
pieces_du_projet "$D5" "$J"; piece "$D5" test_photo_identite "$J" >/dev/null
CODE=$(accorder "$D5" "$J")
chk "une nouvelle carte pour P1, sans dire qu'elle renouvelle la sienne : refusée (409)" "409|1" "$CODE|$(val "int('renouvel' in d['error'])")"
chk "cette demande, saisie à tort, se retire avant la décision" 204 "$(appel DELETE "/cartes-precollecteur/demandes/$D5" "$T_A")"
CODE=$(demande "$P1" "$J" "$DOC1")
D4=$(val "d['id']")
chk "le renouvellement de la carte de P1 : enregistré, il nomme la carte renouvelée" "201|$NUM1" "$CODE|$(val "d['carte_precedente']")"
pieces_du_projet "$D4" "$J"; piece "$D4" test_photo_identite "$J" >/dev/null
CODE=$(accorder "$D4" "$J")
DOC4=$(val "d['document_id']")
chk "accordé aujourd'hui, il commence le lendemain de la fin de l'ancienne : « à venir »" \
    "200|a_venir|$(sql "SELECT (date_fin + 1)::text FROM demandes_carte_precollecteur WHERE id = '$D1'")" \
    "$CODE|$(val "d['etat']")|$(val "d['date_debut']")"
chk "une nouvelle carte, un nouveau numéro, qui renvoie à l'ancienne" "t|$NUM1" \
    "$(sql "SELECT (SELECT numero_affiche FROM documents_emis WHERE id = '$DOC4') <> '$NUM1'")|$(sql "SELECT contenu->>'carte_precedente' FROM documents_emis WHERE id = '$DOC4'")"
chk "trois cartes émises, numéros continus, aucun trou" "3|0" \
    "$(sql "SELECT count(*) FROM documents_emis WHERE commune_id = '$A' AND type_document = 'carte_precollecteur'")|$(sql "SELECT count(*) FROM app.trous_documents('$A')")"

# -----------------------------------------------------------------------------
echo
echo "7. « À vérifier » : la carte qui expire, puis son retrait"
$PSQL -c "INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_nombre, provisoire, reference)
          VALUES ('informel_validite_carte_mois', '$J', 1, false, 'TEST validité d''un mois');" >/dev/null
CODE=$(demande "$P3" "$J")
D6=$(val "d['id']")
pieces_du_projet "$D6" "$J"; piece "$D6" test_photo_identite "$J" >/dev/null
CODE=$(accorder "$D6" "$J")
NUM6=$(val "d['numero_affiche']")
chk "une carte d'un mois, accordée à P3" "200|valide" "$CODE|$(val "d['etat']")"
appel GET "/communes/$A/coherence" "$T_A" >/dev/null
chk "« À vérifier » annonce son échéance, en français et en arabe" "1|1" \
    "$(val "len([l for l in d if l['domaine']=='acteurs_informels' and l['constat'].startswith('La carte $NUM6 expire le')])")|$(val "len([l for l in d if l['constat'].startswith('La carte $NUM6') and l['constat_ar'] and l['quoi_faire_ar']])")"
chk "la carte de P1, qui a son renouvellement, n'y figure pas" 0 \
    "$(val "len([l for l in d if l['constat'].startswith('La carte $NUM1')])")"
chk "un retrait sans motif : refusé" 400 \
    "$(appel POST "/cartes-precollecteur/demandes/$D6/retrait" "$T_A" "{\"dateRetrait\":\"$J\",\"motif\":\"non\"}")"
chk "un retrait daté de demain : refusé" 400 \
    "$(appel POST "/cartes-precollecteur/demandes/$D6/retrait" "$T_A" "{\"dateRetrait\":\"$DEMAIN\",\"motif\":\"TEST activité cessée\"}")"
chk "le retrait d'une demande refusée : refusé (409)" 409 \
    "$(appel POST "/cartes-precollecteur/demandes/$D3/retrait" "$T_A" "{\"dateRetrait\":\"$J\",\"motif\":\"TEST activité cessée\"}")"
CODE=$(appel POST "/cartes-precollecteur/demandes/$D6/retrait" "$T_A" "{\"dateRetrait\":\"$J\",\"motif\":\"TEST activité cessée\"}")
chk "la carte de P3 se retire, motivée : « retirée », et reste au registre des documents" "200|retiree|emis" \
    "$CODE|$(val "d['etat']")|$(sql "SELECT statut FROM documents_emis WHERE numero_affiche = '$NUM6' AND commune_id = '$A'")"
appel GET "/communes/$A/coherence" "$T_A" >/dev/null
chk "« À vérifier » ne l'annonce plus" 0 "$(val "len([l for l in d if l['constat'].startswith('La carte $NUM6')])")"
chk "un second retrait : refusé (409)" 409 \
    "$(appel POST "/cartes-precollecteur/demandes/$D6/retrait" "$T_A" "{\"dateRetrait\":\"$J\",\"motif\":\"TEST encore\"}")"
appel POST "/documents/$DOC2/annuler" "$T_A" '{"motif":"TEST erreur d’émission"}' >/dev/null
appel GET "/cartes-precollecteur?communeId=$A" "$T_A" >/dev/null
chk "une carte annulée (erreur d'émission) se dit « annulée », pas « retirée »" annulee \
    "$(val "[x['etat'] for x in d['demandes'] if x['id']=='$D2'][0]")"

# -----------------------------------------------------------------------------
echo
echo "8. Le nom : imprimé pour le directeur, jamais scellé"
CODE=$(appel PUT "/barbechas/$P1/identite" "$T_A" '{"nomComplet":"Test Titulaire Carte","cin":"99999902"}')
chk "l'identité fictive de P1 s'enregistre (hébergement et récépissé de test)" 200 "$CODE"
ACCES_AVANT=$(sql "SELECT count(*) FROM access_log WHERE endpoint = 'GET /documents/:id/impression' AND '$P1' = ANY (precollecteur_ids)")
CODE=$(page "/documents/$DOC1/impression" "$T_A")
chk "le directeur imprime la carte : le nom y est, et le bandeau du projet de décret" "200|1|1|1" \
    "$CODE|$(grep -c 'Test Titulaire Carte' "$T/page.html")|$(grep -c 'PROJET DE DÉCRET' "$T/page.html")|$(grep -c 'MODÈLE PROVISOIRE' "$T/page.html")"
chk "cette lecture du nom est journalisée" "$((ACCES_AVANT + 1))" \
    "$(sql "SELECT count(*) FROM access_log WHERE endpoint = 'GET /documents/:id/impression' AND '$P1' = ANY (precollecteur_ids)")"
CODE=$(page "/documents/$DOC1/impression" "$T_FNCT")
chk "la FNCT imprime la même carte : la case du nom reste vide" "200|0|1" \
    "$CODE|$(grep -c 'Test Titulaire Carte' "$T/page.html")|$(grep -c 'TEST-CP-P1' "$T/page.html")"
chk "le nom n'est dans aucun document émis, aucune demande, aucune ligne du journal d'audit" "0|0|0" \
    "$(sql "SELECT count(*) FROM documents_emis WHERE contenu::text LIKE '%Test Titulaire%'")|$(sql "SELECT count(*) FROM demandes_carte_precollecteur d WHERE d::text LIKE '%Test Titulaire%'")|$(sql "SELECT count(*) FROM audit_log WHERE COALESCE(old_data::text, '') || COALESCE(new_data::text, '') LIKE '%Test Titulaire%'")"
CODE=$(page "/documents/$DOC2/impression" "$T_A")
chk "la carte de P2, sur une règle officielle : pas de bandeau « projet de décret » ; sans identité, pas de nom" "200|0" \
    "$CODE|$(grep -c 'PROJET DE DÉCRET' "$T/page.html")"

# -----------------------------------------------------------------------------
echo
echo "9. Qui lit quoi"
CODE=$(appel GET "/cartes-precollecteur?communeId=$A" "$T_FNCT")
chk "la FNCT lit les cartes de la commune" "200|5" "$CODE|$(val "len(d['demandes'])")"
CODE=$(appel GET "/cartes-precollecteur?communeId=$A" "$T_B")
chk "le directeur d'une autre commune n'en voit aucune" "200|0" "$CODE|$(val "len(d['demandes'])")"
chk "chaque geste est au journal d'audit, sous la commune" t \
    "$(sql "SELECT count(*) >= 6 FROM audit_log WHERE table_name = 'demandes_carte_precollecteur' AND commune_id = '$A'")"

# -----------------------------------------------------------------------------
echo
echo "10. En partant"
base_reelle_intacte "pendant la campagne"
nettoyer
rendre_tables_nationales
tables_nationales_rendues "en partant"
chk "les communes de test, leurs acteurs et leurs cartes sont retirés" "0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM barbechas WHERE id_precollecteur LIKE 'TEST-CP-%'")|$(sql "SELECT count(*) FROM documents_emis WHERE commune_id IN ($ESSAI)")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s échecs.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
