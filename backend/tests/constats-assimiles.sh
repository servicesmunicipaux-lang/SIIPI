#!/usr/bin/env bash
# =============================================================================
# v0.15.99 — jalon G, lot G7a : les manquements des établissements (décisions du
# 23 novembre 2026, propositions G7 n° 1 à 7 et précisions P1 à P3 ; migration 107).
#
# Elle commence par ce qui est REFUSÉ :
#   - un constat écrit par la FNCT (403, après l'avoir lu), par un prestataire
#     (403), par le directeur d'une autre commune (introuvable) ; sur
#     l'établissement d'une autre commune ; daté de demain ; au-delà du délai
#     national (le message dit la date, le nombre de jours et le délai) ; sans
#     délai national en vigueur (jamais « sans limite ») ; sur un établissement
#     fermé le jour des faits — fermeture en cours, du jour, ou PASSÉE (fermé,
#     rouvert, refermé) ; « autre » sans description, un type inconnu ; un champ
#     libre qui porte un CIN ou un téléphone (rien n'atteint le journal) ;
#   - une écriture directe, un champ figé réécrit, une transition interdite, une
#     version périmée, une levée datée de demain, une seconde sanction valide, une
#     sanction sur un constat classé, le classement ou l'annulation d'un constat
#     qui porte une sanction valide, un motif trop court ;
#   - une photo d'une autre commune, d'un autre usage, un PDF, une photo jointe
#     hors délai, une onzième photo ; une photo de constat déposée par la FNCT ou
#     un prestataire, lue par un prestataire ou un citoyen, rendue publique ou
#     adressée à un citoyen, retirée ; aucune colonne de montant ; aucune
#     suppression.
# Puis la vie d'un constat : levée, levée annulée, nouvelle levée, classement,
# annulation ; sanction, annulation, nouvelle sanction, historique entier dans
# l'ordre ; « à revoir » quand une fermeture inscrite après coup couvre les
# faits ; le journal d'audit (statuts, annulations, compte de chaque geste) ;
# aucune réponse ne rend l'auteur ; base réelle intacte, table nationale rendue.
#
#   docker compose exec -T api npm run test:constats-assimiles
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_cst_a; B=test_cst_b
ESSAI="'$A','$B'"

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
sql() { $PSQL -c "$1" 2>&1 | tr -d ' '; }
tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
: > "$T/reponses.txt"
appel() { # méthode chemin jeton [corps] — code HTTP, corps dans $T/r.json
  local code
  code=$(curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" ${3:+-H "Authorization: Bearer $3"} \
    -H 'Content-Type: application/json' ${4:+-d "$4"})
  # Toute réponse des routes touchées par le lot est gardée : l'auteur d'un geste
  # ne doit apparaître dans aucune.
  # Une réponse JSON, quelle que soit sa première ligne (espace, marque d'ordre),
  # est gardée sur une ligne ; des octets (une photo servie) ne le sont pas.
  case "$2" in /constats-assimiles*|/fichiers*|/etablissements/*/fermetures*|/tickets/*)
    python3 -c "import json,sys;json.dump(json.load(open(sys.argv[1],encoding='utf-8-sig')),sys.stdout,ensure_ascii=False,separators=(',',':'));print()" "$T/r.json" >> "$T/reponses.txt" 2>/dev/null ;;
  esac
  echo "$code"
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
erreur_contient() { val "1 if '$1' in d.get('error','') else 0"; }
en_base() { # rôle utilisateur commune instruction — le refus de la base (rôle de l'API), ou « ok »
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            SET LOCAL ROLE siipi_app; $4; ROLLBACK;" 2>&1 \
    | grep -oE '^ERROR: +[A-Z_]+(:|$)|permission denied|violates row-level security|violates (check|unique) constraint "[a-z_]+"' | head -1 \
    | sed -E 's/^ERROR: +//; s/:$//; s/violates (check|unique) constraint "([a-z_]+)"/\2/' | grep . || echo ok
}
en_proprietaire() { # rôle utilisateur commune instruction — ce que les déclencheurs refusent même au propriétaire des tables
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            $4; ROLLBACK;" 2>&1 \
    | grep -oE '^ERROR: +[A-Z_]+(:|$)|violates (check|unique) constraint "[a-z_]+"' | head -1 \
    | sed -E 's/^ERROR: +//; s/:$//; s/violates (check|unique) constraint "([a-z_]+)"/\2/' | grep . || echo ok
}
vu() { # rôle utilisateur commune expression
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            SET LOCAL ROLE siipi_app; SELECT 'vu:' || ($4); ROLLBACK;" 2>&1 | grep -oE '^vu:.*' | cut -d: -f2
}
version() { sql "SELECT xmin FROM constats_assimiles WHERE id = '$1'"; }
version_s() { sql "SELECT xmin FROM sanctions_constats WHERE id = '$1'"; }
audit() { sql "SELECT count(*) FROM audit_log WHERE table_name = '$1' AND record_id = '$2'"; }
transition_au_journal() { # constat ancien nouveau compte — 1 si une ligne du journal porte ce changement de statut et ce compte
  sql "SELECT count(*) FROM audit_log WHERE table_name = 'constats_assimiles' AND record_id = '$1' AND operation = 'UPDATE'
         AND old_data ->> 'statut' = '$2' AND new_data ->> 'statut' = '$3' AND changed_by = '$4'"
}

. tests/outils/communes_essai.sh
. tests/outils/comptes_temporaires.sh
. tests/outils/base_reelle.sh
. tests/outils/tables_nationales.sh
nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
}
nettoyer
# Le délai de saisie vit dans les valeurs datées des paramètres nationaux (060),
# jamais dans `parametres_nationaux` (056) : c'est cette table qui est gardée.
garder_tables_nationales valeurs_parametres_nationaux
trap 'rendre_tables_nationales; nettoyer; rm -rf "$T" "$TABLES_NATIONALES_DIR"' EXIT
# Le délai absent s'éprouve dans une transaction annulée : la valeur y est retirée,
# puis le directeur (rôle de l'API) tente le geste ; ROLLBACK. Une valeur retirée
# pour de bon ne se « dé-retire » par aucune voie (garde de 060) : rien n'est
# retiré hors de cette transaction.
sans_delai() { # rôle utilisateur commune instruction — le refus de la base, ou « ok »
  $PSQL -c "BEGIN;
            UPDATE valeurs_parametres_nationaux SET retire_le = now(), motif_retrait = 'TEST transaction annulee'
             WHERE code = 'delai_saisie_constat_assimile' AND retire_le IS NULL;
            SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            SET LOCAL ROLE siipi_app; $4; ROLLBACK;" 2>&1 \
    | grep -oE '^ERROR: +[A-Z_]+(:|$)' | head -1 | sed -E 's/^ERROR: +//; s/:$//' | grep . || echo ok
}
releve_base_reelle

commune_essai "$A" "TEST commune A des constats"
commune_essai "$B" "TEST commune B des constats"
compte_temporaire admin_commune "$A" "Directeur A des constats"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_A=$COMPTE_ID
compte_temporaire admin_commune "$B" "Directeur B des constats"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_B=$COMPTE_ID
compte_temporaire super_admin_fnct "" "FNCT des constats"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_F=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$A" "Prestataire des constats"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_P=$COMPTE_ID
compte_temporaire citoyen "$A" "Citoyen des constats"; T_C=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_F" ] && [ -n "$T_P" ] && [ -n "$T_C" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }

JOUR=$(sql "SELECT app.jour_tunis()")
il_y_a() { sql "SELECT app.jour_tunis() - $1"; }
fr() { sql "SELECT to_char(DATE '$1', 'DD/MM/YYYY')"; }
DEMAIN=$(sql "SELECT app.jour_tunis() + 1")
J1=$(il_y_a 1); J2=$(il_y_a 2); J3=$(il_y_a 3); J5=$(il_y_a 5); J10=$(il_y_a 10); J12=$(il_y_a 12)
J15=$(il_y_a 15); J6=$(il_y_a 6); J7=$(il_y_a 7); J8=$(il_y_a 8); J20=$(il_y_a 20); J30=$(il_y_a 30); J31=$(il_y_a 31); J40=$(il_y_a 40)

etab() { # commune jeton nom — l'identifiant de l'établissement inscrit par l'API
  appel POST "/etablissements?communeId=$1" "$2" "{\"nom\":\"$3\",\"categorieActivite\":\"cafe\"}" >/dev/null
  val "d['id']"
}
statut_etab() { # établissement statut [date]
  appel POST "/etablissements/$1/statut" "$T_A" "{\"statut\":\"$2\"${3:+,\"date\":\"$3\"},\"motif\":\"TEST changement de statut\"}"
}
E1=$(etab "$A" "$T_A" "TEST Café des constats")
E_JOUR=$(etab "$A" "$T_A" "TEST Café fermé du jour")
E_ANCIEN=$(etab "$A" "$T_A" "TEST Café fermé depuis longtemps")
E_ROUVERT=$(etab "$A" "$T_A" "TEST Café fermé puis rouvert")
E_VERIF=$(etab "$A" "$T_A" "TEST Café à vérifier")
E_REVOIR=$(etab "$A" "$T_A" "TEST Café fermé après coup")
E_CLASSE=$(etab "$A" "$T_A" "TEST Café au constat classé")
E_APRES=$(etab "$A" "$T_A" "TEST Café fermé après les faits")
EB=$(etab "$B" "$T_B" "TEST Café de B")
for e in "$E1" "$E_JOUR" "$E_ANCIEN" "$E_ROUVERT" "$E_VERIF" "$E_REVOIR" "$E_CLASSE" "$E_APRES" "$EB"; do
  case "$e" in *-*-*-*-*) ;; *) echo "Les établissements de la campagne n'ont pas pu être inscrits" >&2; exit 1 ;; esac
done
[ "$(statut_etab "$E_JOUR" ferme "$JOUR")|$(statut_etab "$E_ANCIEN" ferme "$J40")|$(statut_etab "$E_VERIF" a_verifier)" = "200|200|200" ] \
  || { echo "Les statuts des établissements de départ n'ont pas pu être posés" >&2; exit 1; }
periode() { # établissement [ouverte|close] — l'identifiant de sa période (la plus récente)
  sql "SELECT id FROM fermetures_commerces WHERE commerce_id = '$1' AND retiree_le IS NULL
         AND ($( [ "${2:-close}" = ouverte ] && echo "rouvert_le IS NULL" || echo "rouvert_le IS NOT NULL")) ORDER BY ferme_le DESC LIMIT 1"
}
version_f() { sql "SELECT xmin FROM fermetures_commerces WHERE id = '$1'"; }
corriger_f() { # établissement période ferme_le rouvert_le|null [jeton] — code
  appel POST "/etablissements/$1/fermetures/$2/corriger" "${5:-$T_A}" \
    "{\"version\":\"$(version_f "$2")\",\"fermeLe\":\"$3\",\"rouvertLe\":$( [ "$4" = null ] && echo null || echo "\"$4\""),\"motif\":\"TEST date de fermeture corrigee\"}"
}
# Fermé il y a 20 jours, rouvert, puis refermé il y a 5 jours. La réouverture prend
# le jour où elle est inscrite (la table commerces n'a aucune date métier de
# réouverture) : la commune corrige la période pour dire qu'il a rouvert à J-12.
statut_etab "$E_ROUVERT" ferme "$J20" >/dev/null
statut_etab "$E_ROUVERT" actif >/dev/null
chk "fermé puis rouvert : la base tient la période, close le jour de l'inscription de la réouverture" "1|$J20|$JOUR" \
  "$(sql "SELECT count(*) FROM fermetures_commerces WHERE commerce_id = '$E_ROUVERT'")|$(sql "SELECT ferme_le FROM fermetures_commerces WHERE commerce_id = '$E_ROUVERT'")|$(sql "SELECT rouvert_le FROM fermetures_commerces WHERE commerce_id = '$E_ROUVERT'")"
chk "la commune corrige la réouverture à J-12, par sa route (200) ; la correction est datée et motivée" "200|$J12|1" \
  "$(corriger_f "$E_ROUVERT" "$(periode "$E_ROUVERT")" "$J20" "$J12")|$(sql "SELECT rouvert_le FROM fermetures_commerces WHERE commerce_id = '$E_ROUVERT'")|$(sql "SELECT count(*) FROM fermetures_commerces WHERE commerce_id = '$E_ROUVERT' AND corrigee_le IS NOT NULL AND motif_correction IS NOT NULL")"
statut_etab "$E_ROUVERT" ferme "$J5" >/dev/null
chk "refermé : une seconde période, ouverte ; aucun établissement fermé sans sa période ouverte, dans toute la base" "2|1|0" \
  "$(sql "SELECT count(*) FROM fermetures_commerces WHERE commerce_id = '$E_ROUVERT'")|$(sql "SELECT count(*) FROM fermetures_commerces WHERE commerce_id = '$E_ROUVERT' AND rouvert_le IS NULL")|$(sql "SELECT count(*) FROM commerces c WHERE c.statut = 'ferme' AND NOT EXISTS (SELECT 1 FROM fermetures_commerces f WHERE f.commerce_id = c.id AND f.rouvert_le IS NULL AND f.ferme_le = c.ferme_le)")"
[ "$(sql "SELECT statut FROM commerces WHERE id = '$E_JOUR'")|$(sql "SELECT statut FROM commerces WHERE id = '$E_VERIF'")" = "ferme|a_verifier" ] \
  || { echo "Les statuts des établissements de départ n'ont pas pu être posés" >&2; exit 1; }

constat() { # établissement date type [description] [jeton] [commune] — code ; corps dans $T/r.json
  appel POST "/constats-assimiles?communeId=${6:-$A}" "${5:-$T_A}" \
    "{\"commerceId\":\"$1\",\"dateConstat\":\"$2\",\"type\":\"$3\"${4:+,\"description\":\"$4\"}}"
}
nb_constats() { sql "SELECT count(*) FROM constats_assimiles WHERE commune_id IN ($ESSAI)"; }

# Les photos : un JPEG minuscule mais valide, et un PDF, déposés par l'API.
python3 - "$T" <<'PY'
import base64, sys
d = sys.argv[1]
jpeg = base64.b64decode(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==')
open(f'{d}/photo.b64', 'w').write(base64.b64encode(jpeg).decode())
open(f'{d}/doc.b64', 'w').write(base64.b64encode(b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n').decode())
PY
depot() { # fichier-b64 usage jeton commune — code ; corps dans $T/r.json
  appel POST "/fichiers?communeId=$4" "$3" "{\"nomFichier\":\"TEST-constat\",\"usage\":\"$2\",\"contenu\":\"$(cat "$T/$1.b64")\"}"
}
photo() { depot photo constat_assimile "$T_A" "$A" >/dev/null; val "d['id']"; }

# -----------------------------------------------------------------------------
echo
echo "1. Ce qui est refusé à la saisie d'un constat"
chk "la FNCT ne constate pas : 403, qui dit qui constate ; un prestataire non plus : 403" "403|1|403" \
  "$(constat "$E1" "$J1" debordement "" "$T_F")|$(erreur_contient 'La commune constate')|$(constat "$E1" "$J1" debordement "" "$T_P")"
chk "le directeur de B, dans A : introuvable (404)" 404 "$(constat "$E1" "$J1" debordement "" "$T_B")"
chk "l'établissement de B, depuis A : 400, qui dit de le choisir dans le registre" "400|1" \
  "$(constat "$EB" "$J1" debordement)|$(erreur_contient 'pas inscrit dans la commune')"
chk "un constat daté de demain : 400, qui le dit" "400|1" "$(constat "$E1" "$DEMAIN" debordement)|$(erreur_contient "pas encore arrivé")"
J31_FR=$(fr "$J31")
chk "constaté il y a 31 jours, délai de 30 : 400, avec la date, le nombre de jours et le délai" "400|1|1|1" \
  "$(constat "$E1" "$J31" debordement)|$(erreur_contient "onstaté le $J31_FR")|$(erreur_contient 'il y a 31 jours')|$(erreur_contient 'au plus 30 jours')"
chk "établissement fermé depuis le jour même : le constat du jour est refusé (409, qui nomme la fermeture)" "409|1" \
  "$(constat "$E_JOUR" "$JOUR" debordement)|$(erreur_contient "fermé depuis le $(fr "$JOUR")")"
chk "établissement fermé depuis 40 jours : un constat d'il y a 10 jours est refusé (409)" 409 "$(constat "$E_ANCIEN" "$J10" debordement)"
chk "fermé, rouvert, refermé : un constat dans la PREMIÈRE période est refusé (409, « était fermé du … au … »)" "409|1" \
  "$(constat "$E_ROUVERT" "$J15" debordement)|$(erreur_contient "était fermé du $(fr "$J20") au $(fr "$J12")")"
chk "… et un constat dans la seconde, en cours : refusé (409)" 409 "$(constat "$E_ROUVERT" "$J3" debordement)"
chk "« autre » sans description : 400 ; un type inconnu : 400" "400|400" \
  "$(constat "$E1" "$J1" autre)|$(constat "$E1" "$J1" incendie)"
chk "une description qui porte un CIN fictif (espacé, puis compact) : 400, qui cite la loi 2004-63" "400|1|400" \
  "$(constat "$E1" "$J1" autre "Depot vu, CIN 01 234 567 du gerant")|$(erreur_contient '2004-63')|$(constat "$E1" "$J1" autre "Depot vu, CIN 01234567")"
chk "rien n'a été créé, et la valeur n'a atteint ni la table ni le journal" "0|0" \
  "$(nb_constats)|$(sql "SELECT count(*) FROM audit_log WHERE new_data::text LIKE '%01 234 567%' OR new_data::text LIKE '%01234567%'")"
chk "en base aussi : une description à huit chiffres, « autre » sans description, un type inconnu, un constat de la FNCT" \
  "CONSTAT_IDENTIFIANT|constats_assimiles_autre_description|constats_assimiles_type|CONSTAT_HORS_PERIMETRE" \
  "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO constats_assimiles (commune_id, commerce_id, date_constat, type, description) VALUES ('$A', '$E1', '$J1', 'autre', 'tel. 98 765 432')")|$(en_base admin_commune "$ID_A" "$A" "INSERT INTO constats_assimiles (commune_id, commerce_id, date_constat, type) VALUES ('$A', '$E1', '$J1', 'autre')")|$(en_base admin_commune "$ID_A" "$A" "INSERT INTO constats_assimiles (commune_id, commerce_id, date_constat, type) VALUES ('$A', '$E1', '$J1', 'incendie')")|$(en_base super_admin_fnct "$ID_F" "" "INSERT INTO constats_assimiles (commune_id, commerce_id, date_constat, type) VALUES ('$A', '$E1', '$J1', 'debordement')")"
chk "une description qui porte une date JJ/MM/AAAA reste permise (en base)" ok \
  "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO constats_assimiles (commune_id, commerce_id, date_constat, type, description) VALUES ('$A', '$E1', '$J1', 'autre', 'Depot constate le 12/11/2026 vers 10 h')")"
# La garde « huit chiffres » : chiffres arabes-indiens, persans et pleine chasse
# ramenés en ASCII, seuls les espaces (insécable compris) joints ; points, tirets
# et barres obliques jamais. Mêmes valeurs fictives en base et à la route.
NBSP=$(printf '\302\240')
REFUSES=("٠٩ ٨٧٦ ٥٤٣" "۰۹۸۷۶۵۴۳" "０９８７６５４３" "98 123 456" "98${NBSP}123${NBSP}456" "01234567")
PERMIS=("constate le 23/11/2026" "le 2026-11-23" "le 23.11.2026" "arrete n° 2026-1123" "98.12.34.56" "98/765/432")
garde() { sql "SELECT app._texte_sans_identifiant('$1')"; }
r=""; for v in "${REFUSES[@]}"; do r="$r$(garde "$v")"; done
p=""; for v in "${PERMIS[@]}"; do p="$p$(garde "$v")"; done
chk "en base : arabe-indien, persan, pleine chasse, espaces, espaces insécables, compact — refusés ; dates, arrêté, points et barres obliques — permis" "ffffff|tttttt" "$r|$p"
r=""; for v in "${REFUSES[@]}"; do r="$r$(constat "$E1" "$J1" autre "Depot vu, numero $v")"; done
N_AVANT_PERMIS=$(nb_constats)
p=""; for v in "${PERMIS[@]}"; do p="$p$(constat "$E1" "$J1" autre "Depot vu, $v")"; done
chk "à la route, les mêmes : six refus (400), six descriptions permises (201)" "400400400400400400|201201201201201201|$((N_AVANT_PERMIS + 6))" \
  "$r|$p|$(nb_constats)"
chk "aucune des valeurs refusées n'a atteint le journal, brute ou ramenée en ASCII" 0 \
  "$(sql "SELECT count(*) FROM audit_log WHERE new_data::text ~ '(٠٩ ٨٧٦|۰۹۸۷۶۵۴۳|０９８７６５４３|98 123 456|98${NBSP}123|98123456|09876543|01234567)'")"
chk "aucune colonne de montant, d'amende, de somme, de prix ni de tarif sur les tables du lot" 0 \
  "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('constats_assimiles', 'sanctions_constats', 'photos_constats_assimiles') AND column_name ~ '(montant|amende|somme|prix|tarif)'")"
chk "aucune colonne d'auteur sur les tables du lot" 0 \
  "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('constats_assimiles', 'sanctions_constats', 'photos_constats_assimiles') AND column_name ~ '(_par$|auteur|user)'")"

# -----------------------------------------------------------------------------
echo
echo "2. Ce qui est accepté à la saisie"
chk "constaté il y a 30 jours, au bord du délai : 201, « constaté », version rendue" "201|constate|1" \
  "$(constat "$E1" "$J30" depot_hors_conteneur)|$(val "d['statut']")|$(val "1 if d['version'] else 0")"
C_BORD=$(val "d['id']")
chk "fermé depuis aujourd'hui : le constat de la veille est accepté (201)" 201 "$(constat "$E_JOUR" "$J1" debordement)"
chk "fermé, rouvert, refermé : un constat entre la réouverture et la refermeture est accepté (201)" 201 "$(constat "$E_ROUVERT" "$J10" tri_non_respecte)"
chk "un établissement « à vérifier » se constate (201)" 201 "$(constat "$E_VERIF" "$J1" conteneur_non_conforme)"
P1=$(photo); P2=$(photo)
for p in "$P1" "$P2"; do case "$p" in *-*-*-*-*) ;; *) echo "Les photos de départ n'ont pas pu être déposées" >&2; exit 1 ;; esac; done
chk "la photo d'un constat se dépose par POST /fichiers, usage « constat_assimile » (201) : son déposant n'est pas rendu" "201|constat_assimile|None|commune" \
  "$(depot photo constat_assimile "$T_A" "$A")|$(val "d['usage']")|$(val "d['televerse_par']")|$(val "d['visibilite']")"
chk "un constat avec deux photos, dans la même transaction : 201, deux photos, ni fiche ni déposant" "201|2|['created_at', 'fichier_id', 'taille_octets', 'type_mime', 'url']" \
  "$(appel POST "/constats-assimiles?communeId=$A" "$T_A" "{\"commerceId\":\"$E1\",\"dateConstat\":\"$J2\",\"type\":\"autre\",\"description\":\"Sacs deposes devant la vitrine\",\"photos\":[\"$P1\",\"$P2\"]}")|$(val "len(d['photos'])")|$(val "sorted(d['photos'][0].keys())")"
C1=$(val "d['id']")
case "$C1" in *-*-*-*-*) ;; *) echo "Le constat principal n'a pas pu être créé" >&2; exit 1 ;; esac

# -----------------------------------------------------------------------------
echo
echo "3. Les photos : ce qui est refusé"
depot photo constat_assimile "$T_B" "$B" >/dev/null; P_B=$(val "d['id']")
depot photo constat_terrain "$T_A" "$A" >/dev/null; P_AUTRE=$(val "d['id']")
chk "une photo de constat déposée par la FNCT : 403 ; par un prestataire : 403 ; adressée à un citoyen : 400" "403|403|400" \
  "$(depot photo constat_assimile "$T_F" "$A")|$(depot photo constat_assimile "$T_P" "$A")|$(appel POST "/fichiers?communeId=$A" "$T_A" "{\"nomFichier\":\"TEST\",\"usage\":\"constat_assimile\",\"destinataireCitoyenId\":\"$ID_P\",\"contenu\":\"$(cat "$T/photo.b64")\"}")"
chk "un PDF pour un constat : 415, qui dit qu'il faut une photo" "415|1" "$(depot doc constat_assimile "$T_A" "$A")|$(erreur_contient 'jamais un PDF')"
fichier_en_base() { # rôle utilisateur commune-du-fichier usage type nom visibilité — l'INSERT direct d'une fiche, dans une transaction annulée
  local id; id=$(python3 -c "import uuid;print(uuid.uuid4())")
  en_base "$1" "$2" "${3}" "INSERT INTO fichiers (id, commune_id, nom_original, type_mime, taille_octets, sha256, chemin_relatif, usage, televerse_par, visibilite)
    VALUES ('$id', '$3', '${6//@ID@/$id}', '$5', 10, repeat('a', 64), 'x/$id.jpg', '$4', '$2', '${7:-commune}')"
}
chk "en base : une photo de constat publique ne naît pas ; ni un PDF, ni un SVG ; ni un nom venu de l'appareil" \
  "fichiers_constat_prive|fichiers_type_autorise|fichiers_type_autorise|PHOTO_CONSTAT_NOM|ok" \
  "$(fichier_en_base admin_commune "$ID_A" "$A" constat_assimile image/jpeg 'constat-@ID@.jpg' publique)|$(fichier_en_base admin_commune "$ID_A" "$A" constat_assimile application/pdf 'constat-@ID@.jpg')|$(fichier_en_base admin_commune "$ID_A" "$A" constat_assimile image/svg+xml 'constat-@ID@.jpg')|$(fichier_en_base admin_commune "$ID_A" "$A" constat_assimile image/jpeg 'PV_TEST.jpg')|$(fichier_en_base admin_commune "$ID_A" "$A" constat_assimile image/jpeg 'constat-@ID@.jpg')"
chk "en base, le déclencheur du dépôt (et non la route) : la FNCT, un prestataire, le directeur de B — refusés dans A (PHOTO_CONSTAT_DEPOT) ; la FNCT dépose une photo d'un autre usage" \
  "PHOTO_CONSTAT_DEPOT|PHOTO_CONSTAT_DEPOT|PHOTO_CONSTAT_DEPOT|ok" \
  "$(fichier_en_base super_admin_fnct "$ID_F" "$A" constat_assimile image/jpeg 'constat-@ID@.jpg')|$(fichier_en_base gestionnaire_prestataire "$ID_P" "$A" constat_assimile image/jpeg 'constat-@ID@.jpg')|$(en_base admin_commune "$ID_B" "$B" "INSERT INTO fichiers (commune_id, nom_original, type_mime, taille_octets, sha256, chemin_relatif, usage, televerse_par) VALUES ('$A', 'x.jpg', 'image/jpeg', 10, repeat('a', 64), 'x/b.jpg', 'constat_assimile', '$ID_B')")|$(fichier_en_base super_admin_fnct "$ID_F" "$A" constat_terrain image/jpeg 'x.jpg')"
chk "par l'API, le directeur de B qui dépose une photo de constat dans A : refusé (403), rien n'est créé" "403|0" \
  "$(depot photo constat_assimile "$T_B" "$A")|$(sql "SELECT count(*) FROM fichiers WHERE commune_id = '$A' AND usage = 'constat_assimile' AND televerse_par = '$ID_B'")"
chk "le nom envoyé par l'appareil (« TEST_CIN_0X123456.jpg ») est remplacé par un nom posé par le serveur, dans la réponse et en base ; il n'atteint pas le journal" "201|1|1|0" \
  "$(appel POST "/fichiers?communeId=$A" "$T_A" "{\"nomFichier\":\"TEST_CIN_0X123456.jpg\",\"usage\":\"constat_assimile\",\"contenu\":\"$(cat "$T/photo.b64")\"}")|$(val "1 if d['nom_original'] == 'constat-' + d['id'] + '.jpg' else 0")|$(sql "SELECT count(*) FROM fichiers WHERE id = '$(val "d['id']")' AND nom_original = 'constat-' || id || '.jpg'")|$(sql "SELECT count(*) FROM audit_log WHERE new_data::text LIKE '%0X123456%'")"
chk "joindre la photo d'une autre commune : 400 ; une photo d'un autre usage : 400, qui dit l'usage attendu" "400|400|1" \
  "$(appel POST "/constats-assimiles/$C1/photos" "$T_A" "{\"version\":\"$(version "$C1")\",\"photos\":[\"$P_B\"]}")|$(appel POST "/constats-assimiles/$C1/photos" "$T_A" "{\"version\":\"$(version "$C1")\",\"photos\":[\"$P_AUTRE\"]}")|$(erreur_contient 'constat_assimile')"
chk "joindre une photo déjà jointe : 409" 409 "$(appel POST "/constats-assimiles/$C1/photos" "$T_A" "{\"version\":\"$(version "$C1")\",\"photos\":[\"$P1\"]}")"
: > "$T/huit.txt"; for i in 1 2 3 4 5 6 7 8; do photo >> "$T/huit.txt"; done
HUIT=$(python3 -c "import json;print(json.dumps(open('$T/huit.txt').read().split()))")
P_ONZE=$(photo)
chk "huit de plus (dix en tout) : 201 ; une onzième : 409, « 10 photos au plus »" "201|10|409|1" \
  "$(appel POST "/constats-assimiles/$C1/photos" "$T_A" "{\"version\":\"$(version "$C1")\",\"photos\":$HUIT}")|$(val "d['nb_photos']")|$(appel POST "/constats-assimiles/$C1/photos" "$T_A" "{\"version\":\"$(version "$C1")\",\"photos\":[\"$P_ONZE\"]}")|$(erreur_contient '10 photos au plus')"
chk "le prestataire de la commune ne lit pas la photo (404), un citoyen non plus (404) ; le directeur et la FNCT la lisent (200)" "404|404|200|200" \
  "$(appel GET "/fichiers/$P1" "$T_P")|$(appel GET "/fichiers/$P1" "$T_C")|$(appel GET "/fichiers/$P1" "$T_A")|$(appel GET "/fichiers/$P1" "$T_F")"
chk "le prestataire ne lit pas non plus une photo de constat encore libre (404) ; en base, il n'en voit aucune" "404|0" \
  "$(appel GET "/fichiers/$P_ONZE" "$T_P")|$(vu gestionnaire_prestataire "$ID_P" "$A" "(SELECT count(*) FROM fichiers WHERE usage = 'constat_assimile')")"
chk "rendre publique la photo : 409 pour le directeur, 409 pour la FNCT ; l'adresser à un citoyen : 409 ; même « commune » à l'identique : 409" "409|409|409|409|1" \
  "$(appel PATCH "/fichiers/$P1" "$T_A" '{"visibilite":"publique"}')|$(appel PATCH "/fichiers/$P1" "$T_F" '{"visibilite":"publique"}')|$(appel PATCH "/fichiers/$P1" "$T_A" "{\"visibilite\":\"citoyen\",\"destinataireCitoyenId\":\"$ID_P\"}")|$(appel PATCH "/fichiers/$P1" "$T_F" '{"visibilite":"commune"}')|$(erreur_contient 'reste au service')"
chk "une photo libre de constat ne se publie pas non plus (409) ; la visibilité n'a pas bougé" "409|commune|commune" \
  "$(appel PATCH "/fichiers/$P_ONZE" "$T_A" '{"visibilite":"publique"}')|$(sql "SELECT visibilite FROM fichiers WHERE id = '$P1'")|$(sql "SELECT visibilite FROM fichiers WHERE id = '$P_ONZE'")"
chk "même au propriétaire des tables, l'usage ne change ni depuis « constat_assimile » ni vers lui ; rien n'a bougé" \
  "PHOTO_CONSTAT_VISIBILITE|PHOTO_CONSTAT_VISIBILITE|constat_assimile|constat_terrain" \
  "$(en_proprietaire admin_commune "$ID_A" "$A" "UPDATE fichiers SET usage = 'reclamation' WHERE id = '$P_ONZE'")|$(en_proprietaire admin_commune "$ID_A" "$A" "UPDATE fichiers SET usage = 'constat_assimile' WHERE id = '$P_AUTRE'")|$(sql "SELECT usage FROM fichiers WHERE id = '$P_ONZE'")|$(sql "SELECT usage FROM fichiers WHERE id = '$P_AUTRE'")"
# Une réclamation de la commune A, transférée au prestataire : la photo d'un
# constat ne lui sert jamais de preuve de traitement, refusée avant toute écriture.
TK=$(sql "INSERT INTO tickets (ticket_number, commune_id, category, title, status, assigned_prestataire_id)
          VALUES ('TEST-CST-$$', '$A', 'point_noir', 'TEST reclamation des constats', 'assigne', '$ID_P') RETURNING id" | grep -E '^[0-9a-f-]{36}$')
case "$TK" in *-*-*-*-*) ;; *) echo "La réclamation de test n'a pas pu être posée" >&2; exit 1 ;; esac
chk "traiter une réclamation avec la photo d'un constat (jointe, puis libre) : 409 pour le directeur, 409 pour le prestataire, qui dit quoi déposer" "409|409|409|1" \
  "$(appel PATCH "/tickets/$TK/treat" "$T_A" "{\"status\":\"resolu\",\"resolvedPhotoUrl\":\"/fichiers/$P1\"}")|$(appel PATCH "/tickets/$TK/treat" "$T_A" "{\"status\":\"resolu\",\"resolvedPhotoUrl\":\"/fichiers/$P_ONZE\"}")|$(appel PATCH "/tickets/$TK/treat" "$T_P" "{\"status\":\"resolu\",\"resolvedPhotoUrl\":\"/fichiers/$P1\"}")|$(erreur_contient 'preuve_traitement')"
chk "… la réclamation n'a pas bougé (ni close, ni preuve) ; les photos restent au service, sans destinataire" "assigne|0|commune|commune|0" \
  "$(sql "SELECT status FROM tickets WHERE id = '$TK'")|$(sql "SELECT count(*) FROM tickets WHERE id = '$TK' AND (resolved_photo_url IS NOT NULL OR resolved_at IS NOT NULL)")|$(sql "SELECT visibilite FROM fichiers WHERE id = '$P1'")|$(sql "SELECT visibilite FROM fichiers WHERE id = '$P_ONZE'")|$(sql "SELECT count(*) FROM fichiers WHERE id IN ('$P1', '$P_ONZE') AND destinataire_citoyen_id IS NOT NULL")"
chk "retirer une photo jointe : 409 pour le directeur, 409 pour la FNCT, qui dit d'annuler le constat ; elle reste" "409|409|1|0" \
  "$(appel DELETE "/fichiers/$P1" "$T_A")|$(appel DELETE "/fichiers/$P1" "$T_F")|$(erreur_contient 'annulez le constat')|$(sql "SELECT count(*) FROM fichiers WHERE id = '$P1' AND deleted_at IS NOT NULL")"
chk "en base : une photo ne se modifie pas, ne s'efface pas" "PHOTO_FIGEE|permission denied" \
  "$(en_proprietaire admin_commune "$ID_A" "$A" "UPDATE photos_constats_assimiles SET created_at = now() WHERE fichier_id = '$P1'")|$(en_base admin_commune "$ID_A" "$A" "DELETE FROM photos_constats_assimiles WHERE fichier_id = '$P1'")"

# -----------------------------------------------------------------------------
echo
echo "4. Les gestes : ce qui est refusé"
geste() { # constat geste corps [jeton] — code
  appel POST "/constats-assimiles/$1/$2" "${4:-$T_A}" "$3"
}
V1=$(version "$C1")
N_AUDIT=$(audit constats_assimiles "$C1")
chk "la FNCT lit le constat (200), puis chaque geste lui est refusé (403, qui dit qui décide)" "200|403|403|403|403|403|403|1" \
  "$(appel GET "/constats-assimiles/$C1" "$T_F")|$(geste "$C1" lever "{\"version\":\"$V1\",\"date\":\"$JOUR\"}" "$T_F")|$(geste "$C1" classer "{\"version\":\"$V1\",\"motif\":\"TEST motif FNCT\"}" "$T_F")|$(geste "$C1" annuler "{\"version\":\"$V1\",\"motif\":\"TEST motif FNCT\"}" "$T_F")|$(geste "$C1" annuler-levee "{\"version\":\"$V1\",\"motif\":\"TEST motif FNCT\"}" "$T_F")|$(geste "$C1" sanctions "{\"version\":\"$V1\",\"nature\":\"arrete\",\"reference\":\"A-1\",\"dateDecision\":\"$JOUR\"}" "$T_F")|$(geste "$C1" photos "{\"photos\":[\"$P_ONZE\"]}" "$T_F")|$(erreur_contient 'la FNCT les lit')"
chk "un prestataire : 403 à la lecture comme aux gestes ; en base, il ne voit aucun constat" "403|403|403|0" \
  "$(appel GET "/constats-assimiles?communeId=$A" "$T_P")|$(appel GET "/constats-assimiles/$C1" "$T_P")|$(geste "$C1" lever "{\"version\":\"$V1\",\"date\":\"$JOUR\"}" "$T_P")|$(vu gestionnaire_prestataire "$ID_P" "$A" "(SELECT count(*) FROM constats_assimiles)")"
chk "le directeur de B : le constat de A est introuvable, à la lecture et aux gestes (404, 404, 404)" "404|404|404|0" \
  "$(appel GET "/constats-assimiles/$C1" "$T_B")|$(geste "$C1" lever "{\"version\":\"$V1\",\"date\":\"$JOUR\"}" "$T_B")|$(geste "$C1" sanctions "{\"version\":\"$V1\",\"nature\":\"arrete\",\"reference\":\"A-1\",\"dateDecision\":\"$JOUR\"}" "$T_B")|$(appel GET "/constats-assimiles?communeId=$A" "$T_B" >/dev/null; val "len(d)")"
chk "… et aucun de ces refus n'a laissé de ligne au journal ni changé la version" "$N_AUDIT|$V1" "$(audit constats_assimiles "$C1")|$(version "$C1")"
chk "un identifiant mal formé : introuvable (404), jamais « identifiant invalide »" "404|404|0" \
  "$(appel GET "/constats-assimiles/abc" "$T_A")|$(appel POST "/constats-assimiles/sanctions/abc/annuler" "$T_A" '{"version":"1","motif":"TEST motif"}')|$(erreur_contient 'invalide')"
chk "une version dépassée : 409, qui dit de recommencer" "409|1" "$(geste "$C1" lever "{\"version\":\"1\",\"date\":\"$JOUR\"}")|$(erreur_contient 'recommencez')"
chk "une levée datée de demain : 400, qui le dit ; le constat reste « constaté », version inchangée" "400|1|constate|$V1" \
  "$(geste "$C1" lever "{\"version\":\"$V1\",\"date\":\"$DEMAIN\"}")|$(erreur_contient 'après aujourd')|$(sql "SELECT statut FROM constats_assimiles WHERE id = '$C1'")|$(version "$C1")"
chk "une levée datée d'avant les faits : 400, « la levée suit le constat »" "400|1" "$(geste "$C1" lever "{\"version\":\"$V1\",\"date\":\"$J10\"}")|$(erreur_contient 'levée suit le constat')"
chk "un motif trop court : 400 ; un motif qui porte un téléphone fictif : 400" "400|400|1" \
  "$(geste "$C1" classer "{\"version\":\"$V1\",\"motif\":\"non\"}")|$(geste "$C1" annuler "{\"version\":\"$V1\",\"motif\":\"Appeler le 98 765 432\"}")|$(erreur_contient 'CIN ou de téléphone')"
chk "annuler la levée d'un constat qui n'est pas levé : 409" 409 "$(geste "$C1" annuler-levee "{\"version\":\"$V1\",\"motif\":\"TEST levée absente\"}")"
chk "à la route : une observation de levée, une observation de sanction qui portent un téléphone fictif — 400, 400" "400|400|1" \
  "$(geste "$C1" lever "{\"version\":\"$V1\",\"date\":\"$JOUR\",\"observation\":\"Gerant joint au 98 765 432\"}")|$(geste "$C1" sanctions "{\"version\":\"$V1\",\"nature\":\"arrete\",\"reference\":\"A-9\",\"dateDecision\":\"$JOUR\",\"observation\":\"Notifie au ٩٨٧٦٥٤٣٢\"}")|$(erreur_contient 'CIN ou de téléphone')"
# La même garde en base, sans la route : chaque geste appelé directement par le rôle
# de l'API, dans une transaction annulée (C1 n'a encore aucune sanction).
chk "en base, sans la route : classer, annuler, lever, annuler la levée, sanctionner, annuler la sanction — un numéro dans le texte est refusé six fois ; un motif daté passe" \
  "CONSTAT_IDENTIFIANT|CONSTAT_IDENTIFIANT|CONSTAT_IDENTIFIANT|CONSTAT_IDENTIFIANT|CONSTAT_IDENTIFIANT|CONSTAT_IDENTIFIANT|ok" \
  "$(en_base admin_commune "$ID_A" "$A" "SELECT app.classer_constat('$C1', '$V1', 'Appeler le 98765432')")|$(en_base admin_commune "$ID_A" "$A" "SELECT app.annuler_constat('$C1', '$V1', 'tel. 98 765 432')")|$(en_base admin_commune "$ID_A" "$A" "SELECT app.lever_constat('$C1', '$V1', '$JOUR', 'Gerant joint au ۹۸۷۶۵۴۳۲')")|$(en_base admin_commune "$ID_A" "$A" "SELECT app.lever_constat('$C1', '$V1', '$JOUR', NULL); SELECT app.annuler_levee('$C1', (SELECT xmin::text FROM constats_assimiles WHERE id = '$C1'), 'Rappeler le 98765432')")|$(en_base admin_commune "$ID_A" "$A" "SELECT app.enregistrer_sanction('$C1', '$V1', 'arrete', 'A-9', '$JOUR', 'Notifie au 98 765 432')")|$(en_base admin_commune "$ID_A" "$A" "SELECT app.enregistrer_sanction('$C1', '$V1', 'arrete', 'A-9', '$JOUR', NULL); SELECT app.annuler_sanction(s.id, s.xmin::text, 'Contact 98765432') FROM sanctions_constats s WHERE s.constat_id = '$C1' AND s.statut = 'valide'")|$(en_base admin_commune "$ID_A" "$A" "SELECT app.classer_constat('$C1', '$V1', 'Doublon du constat du 05.11.2026')")"
chk "en base : une description de plus de 500 caractères (constats_assimiles_description) ; une référence en phrase (sanctions_constats_reference) ; une référence en arabe passe" \
  "constats_assimiles_description|sanctions_constats_reference|ok" \
  "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO constats_assimiles (commune_id, commerce_id, date_constat, type, description) VALUES ('$A', '$E1', '$J1', 'autre', repeat('a', 501))")|$(en_base admin_commune "$ID_A" "$A" "SELECT app.enregistrer_sanction('$C1', '$V1', 'arrete', 'Voir : M. X', '$JOUR', NULL)")|$(en_base admin_commune "$ID_A" "$A" "SELECT app.enregistrer_sanction('$C1', '$V1', 'arrete', 'قرار 45/2026', '$JOUR', NULL)")"
chk "C1 est resté « constaté », sans sanction, version inchangée" "constate|0|$V1" \
  "$(sql "SELECT statut FROM constats_assimiles WHERE id = '$C1'")|$(sql "SELECT count(*) FROM sanctions_constats WHERE constat_id = '$C1'")|$(version "$C1")"
chk "en base : écrire un constat, le réécrire, l'effacer, écrire une sanction — refusés à l'application" "permission denied|permission denied|permission denied" \
  "$(en_base admin_commune "$ID_A" "$A" "UPDATE constats_assimiles SET statut = 'leve', leve_le = '$JOUR' WHERE id = '$C1'")|$(en_base admin_commune "$ID_A" "$A" "DELETE FROM constats_assimiles WHERE id = '$C1'")|$(en_base admin_commune "$ID_A" "$A" "INSERT INTO sanctions_constats (commune_id, constat_id, nature, reference, date_decision) VALUES ('$A', '$C1', 'arrete', 'A-1', '$JOUR')")"
chk "même au propriétaire des tables : un champ figé ne se réécrit pas ; la suppression n'est pas offerte (app.supprimer)" "CONSTAT_FIGE|TABLE_NON_SUPPRIMABLE" \
  "$(en_proprietaire admin_commune "$ID_A" "$A" "UPDATE constats_assimiles SET type = 'debordement' WHERE id = '$C1'")|$(en_proprietaire admin_commune "$ID_A" "$A" "SELECT app.supprimer('constats_assimiles', '$C1')")"
chk "aucune route ne supprime un constat (DELETE : 404)" 404 "$(appel DELETE "/constats-assimiles/$C1" "$T_A")"

# -----------------------------------------------------------------------------
echo
echo "5. La sanction, son annulation, la suivante"
chk "une décision datée de demain, ou d'avant les faits : 400, 400 ; aucune sanction" "400|400|0" \
  "$(geste "$C1" sanctions "{\"version\":\"$(version "$C1")\",\"nature\":\"arrete\",\"reference\":\"A-2\",\"dateDecision\":\"$DEMAIN\"}")|$(geste "$C1" sanctions "{\"version\":\"$(version "$C1")\",\"nature\":\"arrete\",\"reference\":\"A-2\",\"dateDecision\":\"$J10\"}")|$(sql "SELECT count(*) FROM sanctions_constats WHERE constat_id = '$C1'")"
chk "une sanction (procès-verbal, référence « PV n° 2026/00123 », telle que le document la porte) : 201" "201|1|valide|True" \
  "$(geste "$C1" sanctions "{\"version\":\"$(version "$C1")\",\"nature\":\"proces_verbal\",\"reference\":\"PV n° 2026/00123\",\"dateDecision\":\"$J1\"}")|$(val "len(d['sanctions'])")|$(val "d['sanctions'][0]['statut']")|$(val "d['sanction_valide']")"
S1=$(val "d['sanctions'][0]['id']")
chk "une seconde sanction valide : 409, qui dit d'annuler la première avec son motif" "409|1|1" \
  "$(geste "$C1" sanctions "{\"version\":\"$(version "$C1")\",\"nature\":\"arrete\",\"reference\":\"Arrete 45-2026\",\"dateDecision\":\"$JOUR\"}")|$(erreur_contient 'annulez-la, avec son motif')|$(sql "SELECT count(*) FROM sanctions_constats WHERE constat_id = '$C1'")"
chk "en base, même au propriétaire des tables (sans la fonction) : une seconde sanction valide bute sur l'index unique ; une seule reste valide" "uq_sanctions_constats_valide|1" \
  "$(en_proprietaire admin_commune "$ID_A" "$A" "INSERT INTO sanctions_constats (commune_id, constat_id, nature, reference, date_decision) VALUES ('$A', '$C1', 'arrete', 'A-9', '$JOUR')")|$(sql "SELECT count(*) FROM sanctions_constats WHERE constat_id = '$C1' AND statut = 'valide'")"
# Deux sanctions sur le même constat, au même instant, avec la même version lue :
# le verrou du constat (app._constat_a_traiter) les ordonne ; la seconde voit la
# première et s'arrête sur SANCTION_UNIQUE. (L'index n'est pas atteint par ce
# chemin : il est éprouvé juste au-dessus, sans la fonction.)
constat "$E1" "$J1" debordement >/dev/null; C_S=$(val "d['id']")
case "$C_S" in *-*-*-*-*) ;; *) echo "Le constat des sanctions simultanées n'a pas pu être créé" >&2; exit 1 ;; esac
V_S=$(version "$C_S")
for n in 1 2; do
  $PSQL -c "BEGIN; SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$ID_A', true), set_config('app.commune_id', '$A', true);
            SET LOCAL ROLE siipi_app; SELECT (app.enregistrer_sanction('$C_S', '$V_S', 'arrete', 'Simultanee-$n', '$JOUR', NULL)).id; SELECT pg_sleep(1); COMMIT;" > "$T/simultanee$n.txt" 2>&1 &
done
wait
chk "deux sanctions simultanées : le verrou du constat les ordonne — une seule valide, l'autre refusée (SANCTION_UNIQUE)" "1|1" \
  "$(sql "SELECT count(*) FROM sanctions_constats WHERE constat_id = '$C_S' AND statut = 'valide'")|$(cat "$T/simultanee1.txt" "$T/simultanee2.txt" | grep -c 'SANCTION_UNIQUE')"
constat "$E1" "$J1" debordement >/dev/null; C_AR=$(val "d['id']")
chk "une référence en arabe, telle que le document la porte : acceptée par la route (201) et gardée telle" "201|قرار 45/2026" \
  "$(geste "$C_AR" sanctions "{\"version\":\"$(version "$C_AR")\",\"nature\":\"arrete\",\"reference\":\"قرار 45/2026\",\"dateDecision\":\"$JOUR\"}")|$(val "d['sanctions'][0]['reference']")"
chk "une référence en phrase (guillemets, deux-points) : 400" 400 \
  "$(geste "$C1" sanctions "{\"version\":\"$(version "$C1")\",\"nature\":\"autre\",\"reference\":\"Voir : M. X\",\"dateDecision\":\"$JOUR\"}")"
chk "portant une sanction valide, le constat ne se classe pas (409) ni ne s'annule (409) : « annulez d'abord la sanction »" "409|409|1|constate" \
  "$(geste "$C1" classer "{\"version\":\"$(version "$C1")\",\"motif\":\"TEST sans suite\"}")|$(geste "$C1" annuler "{\"version\":\"$(version "$C1")\",\"motif\":\"TEST saisi a tort\"}")|$(erreur_contient 'abord la sanction')|$(sql "SELECT statut FROM constats_assimiles WHERE id = '$C1'")"
chk "annuler la sanction avec une version périmée : 409, qui dit de recommencer ; elle reste valide ; la fiche rend sa version" "409|1|valide|1" \
  "$(appel POST "/constats-assimiles/sanctions/$S1/annuler" "$T_A" '{"version":"1","motif":"TEST version perimee"}')|$(erreur_contient 'recommencez')|$(sql "SELECT statut FROM sanctions_constats WHERE id = '$S1'")|$(appel GET "/constats-assimiles/$C1" "$T_A" >/dev/null; val "1 if d['sanctions'][0]['version'] == '$(version_s "$S1")' else 0")"
chk "la sanction annulée, avec son motif : 200 ; une seconde annulation : 409" "200|annulee|False|409" \
  "$(appel POST "/constats-assimiles/sanctions/$S1/annuler" "$T_A" "{\"version\":\"$(version_s "$S1")\",\"motif\":\"TEST reference erronee\"}")|$(val "d['sanctions'][0]['statut']")|$(val "d['sanction_valide']")|$(appel POST "/constats-assimiles/sanctions/$S1/annuler" "$T_A" "{\"version\":\"$(version_s "$S1")\",\"motif\":\"TEST encore\"}")"
chk "la FNCT n'annule pas une sanction (403) ; le directeur de B ne la trouve pas (404)" "403|404" \
  "$(appel POST "/constats-assimiles/sanctions/$S1/annuler" "$T_F" "{\"version\":\"$(version_s "$S1")\",\"motif\":\"TEST motif\"}")|$(appel POST "/constats-assimiles/sanctions/$S1/annuler" "$T_B" "{\"version\":\"$(version_s "$S1")\",\"motif\":\"TEST motif\"}")"
chk "une nouvelle sanction (arrêté) : 201 ; l'historique entier, dans l'ordre : l'annulée avec son motif, puis la valide" "201|2|annulee|TEST reference erronee|valide|arrete" \
  "$(geste "$C1" sanctions "{\"version\":\"$(version "$C1")\",\"nature\":\"arrete\",\"reference\":\"Arrete 45-2026\",\"dateDecision\":\"$JOUR\"}")|$(val "len(d['sanctions'])")|$(val "d['sanctions'][0]['statut']")|$(val "d['sanctions'][0]['motif_annulation']")|$(val "d['sanctions'][1]['statut']")|$(val "d['sanctions'][1]['nature']")"
S2=$(sql "SELECT id FROM sanctions_constats WHERE constat_id = '$C1' AND statut = 'valide'")
chk "en base : une sanction ne se réécrit pas (même au propriétaire)" SANCTION_FIGEE \
  "$(en_proprietaire admin_commune "$ID_A" "$A" "UPDATE sanctions_constats SET reference = 'Autre-1' WHERE id = '$S2'")"

# -----------------------------------------------------------------------------
echo
echo "6. La levée, son annulation, le classement, l'annulation"
chk "levé aujourd'hui (200) ; le constat levé garde sa sanction et en reçoit encore le droit" "200|leve|$JOUR|True" \
  "$(geste "$C1" lever "{\"version\":\"$(version "$C1")\",\"date\":\"$JOUR\",\"observation\":\"Trottoir degage\"}")|$(val "d['statut']")|$(val "d['leve_le']")|$(val "d['sanction_valide']")"
# Le statut se juge sur un constat SANS photo : la limite de dix ne peut pas masquer le refus.
constat "$E1" "$J1" debordement >/dev/null; C_L=$(val "d['id']")
case "$C_L" in *-*-*-*-*) ;; *) echo "Le constat levé sans photo n'a pas pu être créé" >&2; exit 1 ;; esac
geste "$C_L" lever "{\"version\":\"$(version "$C_L")\",\"date\":\"$JOUR\"}" >/dev/null
chk "levé (et sans photo) : une photo ne s'y joint plus (409, « celui-ci est levé ») ; aucune n'est jointe" "leve|409|1|0" \
  "$(sql "SELECT statut FROM constats_assimiles WHERE id = '$C_L'")|$(appel POST "/constats-assimiles/$C_L/photos" "$T_A" "{\"version\":\"$(version "$C_L")\",\"photos\":[\"$(photo)\"]}")|$(erreur_contient 'celui-ci est levé')|$(sql "SELECT count(*) FROM photos_constats_assimiles WHERE constat_id = '$C_L'")"
chk "un constat levé ne se classe pas (409)" 409 "$(geste "$C1" classer "{\"version\":\"$(version "$C1")\",\"motif\":\"TEST sans suite\"}")"
chk "la levée annulée, avec son motif : « constaté » de nouveau, la levée effacée, le motif gardé" "200|constate|None|TEST levee saisie trop tot" \
  "$(geste "$C1" annuler-levee "{\"version\":\"$(version "$C1")\",\"motif\":\"TEST levee saisie trop tot\"}")|$(val "d['statut']")|$(val "d['leve_le']")|$(val "d['motif_annulation_levee']")"
chk "levé de nouveau (200)" "200|leve" "$(geste "$C1" lever "{\"version\":\"$(version "$C1")\",\"date\":\"$JOUR\"}")|$(val "d['statut']")"
appel POST "/constats-assimiles/sanctions/$S2/annuler" "$T_A" "{\"version\":\"$(version_s "$S2")\",\"motif\":\"TEST arrete rapporte\"}" >/dev/null
chk "sa sanction annulée, le constat levé s'annule (200) ; annulé, il est figé : lever, classer, rouvrir la levée, l'annuler encore — 409" "200|annule|409|409|409|409" \
  "$(geste "$C1" annuler "{\"version\":\"$(version "$C1")\",\"motif\":\"TEST constat saisi a tort\"}")|$(val "d['statut']")|$(geste "$C1" lever "{\"version\":\"$(version "$C1")\",\"date\":\"$JOUR\"}")|$(geste "$C1" classer "{\"version\":\"$(version "$C1")\",\"motif\":\"TEST sans suite\"}")|$(geste "$C1" annuler-levee "{\"version\":\"$(version "$C1")\",\"motif\":\"TEST levee\"}")|$(geste "$C1" annuler "{\"version\":\"$(version "$C1")\",\"motif\":\"TEST encore\"}")"
chk "annulé : aucune sanction ne s'y enregistre (409) ; en base, il ne repasse pas « constaté »" "409|CONSTAT_FIGE" \
  "$(geste "$C1" sanctions "{\"version\":\"$(version "$C1")\",\"nature\":\"arrete\",\"reference\":\"A-3\",\"dateDecision\":\"$JOUR\"}")|$(en_proprietaire admin_commune "$ID_A" "$A" "UPDATE constats_assimiles SET statut = 'constate', annule_le = NULL, motif_annulation = NULL WHERE id = '$C1'")"
chk "la photo d'un constat annulé ne se retire toujours pas (409)" 409 "$(appel DELETE "/fichiers/$P2" "$T_A")"

# L'historique d'un constat : deux levées annulées puis une troisième — la ligne du
# constat n'en garde que la dernière, l'historique garde tout, dans l'ordre.
constat "$E1" "$J3" debordement >/dev/null; C_H=$(val "d['id']")
case "$C_H" in *-*-*-*-*) ;; *) echo "Le constat de l'historique n'a pas pu être créé" >&2; exit 1 ;; esac
P_H=$(photo)
chk "joindre une photo avec une version périmée : 409, qui dit de recommencer ; rien n'est joint" "409|1|0" \
  "$(appel POST "/constats-assimiles/$C_H/photos" "$T_A" "{\"version\":\"1\",\"photos\":[\"$P_H\"]}")|$(erreur_contient 'recommencez')|$(sql "SELECT count(*) FROM photos_constats_assimiles WHERE constat_id = '$C_H'")"
[ "$(geste "$C_H" lever "{\"version\":\"$(version "$C_H")\",\"date\":\"$J2\",\"observation\":\"Trottoir degage\"}")|$(geste "$C_H" annuler-levee "{\"version\":\"$(version "$C_H")\",\"motif\":\"TEST premiere levee a tort\"}")|$(geste "$C_H" lever "{\"version\":\"$(version "$C_H")\",\"date\":\"$J1\",\"observation\":\"Conteneur remplace\"}")|$(geste "$C_H" annuler-levee "{\"version\":\"$(version "$C_H")\",\"motif\":\"TEST seconde levee a tort\"}")|$(geste "$C_H" lever "{\"version\":\"$(version "$C_H")\",\"date\":\"$JOUR\"}")" = "200|200|200|200|200" ] \
  || { echo "Les levées de l'historique n'ont pas pu être faites" >&2; exit 1; }
appel GET "/constats-assimiles/$C_H" "$T_F" >/dev/null
chk "l'historique, lu par la FNCT : chaque geste dans l'ordre, les trois dates de levée, les deux observations et les deux motifs ; aucun auteur" \
  "constate,leve,levee_annulee,leve,levee_annulee,leve|$J3,$J2,,$J1,,$JOUR|,Trottoir degage,TEST premiere levee a tort,Conteneur remplace,TEST seconde levee a tort,|['created_at', 'date_effet', 'geste', 'texte']" \
  "$(val "','.join(h['geste'] for h in d['historique'])")|$(val "','.join(h['date_effet'] or '' for h in d['historique'])")|$(val "','.join(h['texte'] or '' for h in d['historique'])")|$(val "sorted(d['historique'][0].keys())")"
chk "en base : l'historique ne se réécrit pas (même au propriétaire), ne s'écrit ni ne s'efface par l'application ; un prestataire n'en lit rien" \
  "HISTORIQUE_FIGE|permission denied|permission denied|0" \
  "$(en_proprietaire admin_commune "$ID_A" "$A" "UPDATE historique_constats_assimiles SET texte = 'x' WHERE constat_id = '$C_H'")|$(en_base admin_commune "$ID_A" "$A" "INSERT INTO historique_constats_assimiles (commune_id, constat_id, geste, date_effet) VALUES ('$A', '$C_H', 'constate', '$J1')")|$(en_base admin_commune "$ID_A" "$A" "DELETE FROM historique_constats_assimiles WHERE constat_id = '$C_H'")|$(vu gestionnaire_prestataire "$ID_P" "$A" "(SELECT count(*) FROM historique_constats_assimiles)")"

constat "$E1" "$J3" debordement >/dev/null; C2=$(val "d['id']")
chk "classé sans suite (200) ; classé, il ne se lève pas, sa levée ne s'annule pas, il ne reçoit pas de sanction (409, 409, 409)" "200|classe|409|409|409|1" \
  "$(geste "$C2" classer "{\"version\":\"$(version "$C2")\",\"motif\":\"TEST depot enleve par le gerant\"}")|$(val "d['statut']")|$(geste "$C2" lever "{\"version\":\"$(version "$C2")\",\"date\":\"$JOUR\"}")|$(geste "$C2" annuler-levee "{\"version\":\"$(version "$C2")\",\"motif\":\"TEST motif\"}")|$(geste "$C2" sanctions "{\"version\":\"$(version "$C2")\",\"nature\":\"arrete\",\"reference\":\"A-4\",\"dateDecision\":\"$JOUR\"}")|$(erreur_contient 'classé sans suite')"
chk "classé (et sans photo) : une photo ne s'y joint pas (409, « classé sans suite »)" "409|1|0" \
  "$(appel POST "/constats-assimiles/$C2/photos" "$T_A" "{\"version\":\"$(version "$C2")\",\"photos\":[\"$(photo)\"]}")|$(erreur_contient 'celui-ci est classé sans suite')|$(sql "SELECT count(*) FROM photos_constats_assimiles WHERE constat_id = '$C2'")"
chk "en base : classé, il ne repasse pas « levé » (transition refusée)" CONSTAT_TRANSITION \
  "$(en_proprietaire admin_commune "$ID_A" "$A" "UPDATE constats_assimiles SET statut = 'leve', leve_le = '$JOUR', classe_le = NULL, motif_classement = NULL WHERE id = '$C2'")"
chk "un constat classé peut encore s'annuler (200)" "200|annule" \
  "$(geste "$C2" annuler "{\"version\":\"$(version "$C2")\",\"motif\":\"TEST classement errone\"}")|$(val "d['statut']")"
chk "annulé (et sans photo) : une photo ne s'y joint pas (409, « annulé »)" "409|1|0" \
  "$(appel POST "/constats-assimiles/$C2/photos" "$T_A" "{\"version\":\"$(version "$C2")\",\"photos\":[\"$(photo)\"]}")|$(erreur_contient 'celui-ci est annulé')|$(sql "SELECT count(*) FROM photos_constats_assimiles WHERE constat_id = '$C2'")"

constat "$E1" "$J2" debordement >/dev/null; C3=$(val "d['id']")
geste "$C3" sanctions "{\"version\":\"$(version "$C3")\",\"nature\":\"arrete\",\"reference\":\"A-5\",\"dateDecision\":\"$J1\"}" >/dev/null
S3=$(sql "SELECT id FROM sanctions_constats WHERE constat_id = '$C3' AND statut = 'valide'")
chk "classement refusé tant qu'une sanction est valide (409) ; accepté après son annulation (200), l'historique gardé" "409|200|classe|1|annulee" \
  "$(geste "$C3" classer "{\"version\":\"$(version "$C3")\",\"motif\":\"TEST sans suite\"}")|$(appel POST "/constats-assimiles/sanctions/$S3/annuler" "$T_A" "{\"version\":\"$(version_s "$S3")\",\"motif\":\"TEST arrete rapporte\"}")|$(geste "$C3" classer "{\"version\":\"$(version "$C3")\",\"motif\":\"TEST sans suite\"}" >/dev/null; val "d['statut']")|$(val "len(d['sanctions'])")|$(val "d['sanctions'][0]['statut']")"

# -----------------------------------------------------------------------------
echo
echo "7. Le délai de saisie suit le paramètre national"
constat "$E1" "$J2" debordement >/dev/null; C_P=$(val "d['id']")
case "$C_P" in *-*-*-*-*) ;; *) echo "Le constat du délai n'a pas pu être créé" >&2; exit 1 ;; esac
chk "la FNCT ramène le délai à 1 jour, daté d'aujourd'hui (201)" 201 \
  "$(appel POST /parametres-nationaux/delai_saisie_constat_assimile "$T_F" "{\"dateEffet\":\"$JOUR\",\"valeurNombre\":1,\"provisoire\":true}")"
N_P=$(nb_constats)
chk "un constat d'il y a 2 jours : 400, « il y a 2 jours », « au plus 1 jours » ; d'hier : 201" "400|1|1|201" \
  "$(constat "$E1" "$J2" debordement)|$(erreur_contient 'il y a 2 jours')|$(erreur_contient 'au plus 1 jours')|$(constat "$E1" "$J1" debordement)"
P_TARD=$(photo)
chk "une photo jointe à un constat d'il y a 2 jours, hors délai : 400, qui le dit ; rien n'est joint" "400|1|0" \
  "$(appel POST "/constats-assimiles/$C_P/photos" "$T_A" "{\"version\":\"$(version "$C_P")\",\"photos\":[\"$P_TARD\"]}")|$(erreur_contient 'une photo se joint au plus 1 jours')|$(sql "SELECT count(*) FROM photos_constats_assimiles WHERE constat_id = '$C_P'")"
rendre_tables_nationales
tables_nationales_rendues "le délai réduit retiré"
chk "le délai de 30 jours rendu : la même photo est jointe (201)" "201|1" \
  "$(appel POST "/constats-assimiles/$C_P/photos" "$T_A" "{\"version\":\"$(version "$C_P")\",\"photos\":[\"$P_TARD\"]}")|$(val "d['nb_photos']")"
N_P=$(nb_constats)
P_SANS=$(photo)
chk "sans délai en vigueur (valeur retirée dans une transaction annulée) : un constat d'hier, une photo — refusés par la base (CONSTAT_DELAI_ABSENT), jamais « sans limite »" \
  "CONSTAT_DELAI_ABSENT|CONSTAT_DELAI_ABSENT" \
  "$(sans_delai admin_commune "$ID_A" "$A" "INSERT INTO constats_assimiles (commune_id, commerce_id, date_constat, type) VALUES ('$A', '$E1', '$J1', 'debordement')")|$(sans_delai admin_commune "$ID_A" "$A" "INSERT INTO photos_constats_assimiles (constat_id, fichier_id) VALUES ('$C_P', '$P_SANS')")"
chk "… le message dit que la FNCT fixe le délai" 1 \
  "$($PSQL -c "BEGIN; UPDATE valeurs_parametres_nationaux SET retire_le = now(), motif_retrait = 'TEST transaction annulee' WHERE code = 'delai_saisie_constat_assimile' AND retire_le IS NULL;
               SELECT set_config('app.role', 'admin_commune', true), set_config('app.user_id', '$ID_A', true), set_config('app.commune_id', '$A', true);
               SET LOCAL ROLE siipi_app; INSERT INTO constats_assimiles (commune_id, commerce_id, date_constat, type) VALUES ('$A', '$E1', '$J1', 'debordement'); ROLLBACK;" 2>&1 | grep -c 'la FNCT le fixe dans les paramètres nationaux')"
chk "rien n'est créé, la valeur n'est pas retirée, la table nationale est intacte ; la saisie continue (201)" "$N_P|0|201" \
  "$(nb_constats)|$(sql "SELECT count(*) FROM valeurs_parametres_nationaux WHERE code = 'delai_saisie_constat_assimile' AND retire_le IS NOT NULL")|$(constat "$E1" "$J1" debordement)"
tables_nationales_rendues "après le délai absent"

# -----------------------------------------------------------------------------
echo
echo "8. « À revoir » : une fermeture inscrite après le constat ; la corriger ou la retirer"
constat "$E_REVOIR" "$J5" debordement >/dev/null; C_R=$(val "d['id']")
geste "$C_R" sanctions "{\"version\":\"$(version "$C_R")\",\"nature\":\"proces_verbal\",\"reference\":\"PV 77\",\"dateDecision\":\"$J3\"}" >/dev/null
constat "$E_REVOIR" "$J6" debordement >/dev/null; C_R2=$(val "d['id']")
constat "$E_CLASSE" "$J5" debordement >/dev/null; C_K=$(val "d['id']")
geste "$C_K" classer "{\"version\":\"$(version "$C_K")\",\"motif\":\"TEST sans suite\"}" >/dev/null
constat "$E_APRES" "$J5" debordement >/dev/null; C_AP=$(val "d['id']")
for c in "$C_R" "$C_R2" "$C_K" "$C_AP"; do case "$c" in *-*-*-*-*) ;; *) echo "Les constats « à revoir » n'ont pas pu être créés" >&2; exit 1 ;; esac; done
[ "$(sql "SELECT statut FROM constats_assimiles WHERE id = '$C_K'")|$(sql "SELECT count(*) FROM sanctions_constats WHERE constat_id = '$C_R' AND statut = 'valide'")" = "classe|1" ] \
  || { echo "Le constat classé ou la sanction du constat « à revoir » n'ont pas pu être posés" >&2; exit 1; }
chk "avant toute fermeture : rien à revoir" None "$(appel GET "/constats-assimiles/$C_R" "$T_A" >/dev/null; val "d['a_revoir']")"
VR=$(version "$C_R")
[ "$(statut_etab "$E_REVOIR" ferme "$J10")|$(statut_etab "$E_CLASSE" ferme "$J10")|$(statut_etab "$E_APRES" ferme "$J2")" = "200|200|200" ] \
  || { echo "Les fermetures « à revoir » n'ont pas pu être inscrites" >&2; exit 1; }
chk "les fermetures sont inscrites avec leur date (J-10, J-10, J-2), périodes en cours" "$J10|$J10|$J2" \
  "$(sql "SELECT ferme_le FROM fermetures_commerces WHERE commerce_id = '$E_REVOIR' AND rouvert_le IS NULL")|$(sql "SELECT ferme_le FROM fermetures_commerces WHERE commerce_id = '$E_CLASSE' AND rouvert_le IS NULL")|$(sql "SELECT ferme_le FROM fermetures_commerces WHERE commerce_id = '$E_APRES' AND rouvert_le IS NULL")"
chk "fermé à J-10, inscrit après coup : le constat de J-5 est « à revoir », en français et en arabe, la sanction nommée, le geste possible dit ; constat et sanction inchangés" \
  "CONSTAT_ETABLISSEMENT_FERME_DEPUIS|1|1|1|1|$VR|valide" \
  "$(appel GET "/constats-assimiles/$C_R" "$T_A" >/dev/null; val "d['a_revoir']['code']")|$(val "1 if 'PV 77' in d['a_revoir']['message'] else 0")|$(val "1 if 'المؤسسة' in d['a_revoir']['message_ar'] else 0")|$(val "1 if '$(fr "$J10")' in d['a_revoir']['message'] else 0")|$(val "1 if 'la corriger ou la retirer' in d['a_revoir']['message'] else 0")|$(version "$C_R")|$(sql "SELECT statut FROM sanctions_constats WHERE constat_id = '$C_R'")"
chk "la FNCT le lit aussi « à revoir » (liste)" CONSTAT_ETABLISSEMENT_FERME_DEPUIS \
  "$(appel GET "/constats-assimiles?communeId=$A&commerceId=$E_REVOIR&mois=${J5%-*}&type=debordement" "$T_F" >/dev/null; val "[x for x in d if x['id'] == '$C_R'][0]['a_revoir']['code']")"
chk "un constat classé n'est jamais « à revoir » ; une fermeture datée d'après les faits ne le déclenche pas" "None|None" \
  "$(appel GET "/constats-assimiles/$C_K" "$T_A" >/dev/null; val "d['a_revoir']")|$(appel GET "/constats-assimiles/$C_AP" "$T_A" >/dev/null; val "d['a_revoir']")"
chk "annulé, un constat n'est plus « à revoir »" "CONSTAT_ETABLISSEMENT_FERME_DEPUIS|None" \
  "$(appel GET "/constats-assimiles/$C_R2" "$T_A" >/dev/null; val "d['a_revoir']['code']")|$(geste "$C_R2" annuler "{\"version\":\"$(version "$C_R2")\",\"motif\":\"TEST etablissement ferme\"}" >/dev/null; val "d['a_revoir']")"

# Les périodes de fermeture : lues par la commune et la FNCT, jamais par un prestataire.
chk "les périodes de fermeture de A : le prestataire n'en lit aucune ; le directeur et la FNCT les lisent" "0|1|1" \
  "$(vu gestionnaire_prestataire "$ID_P" "$A" "(SELECT count(*) FROM fermetures_commerces WHERE commune_id = '$A')")|$(vu admin_commune "$ID_A" "$A" "(SELECT (count(*) > 0)::int FROM fermetures_commerces WHERE commune_id = '$A')")|$(vu super_admin_fnct "$ID_F" "" "(SELECT (count(*) > 0)::int FROM fermetures_commerces WHERE commune_id = '$A')")"
F_EN_COURS=$(periode "$E_REVOIR" ouverte)
chk "la route des périodes : le directeur (200) et la FNCT (200) les lisent, avec leur version ; le prestataire non (403)" "200|1|200|403" \
  "$(appel GET "/etablissements/$E_REVOIR/fermetures" "$T_A")|$(val "1 if d[0]['id'] == '$F_EN_COURS' and d[0]['version'] else 0")|$(appel GET "/etablissements/$E_REVOIR/fermetures" "$T_F")|$(appel GET "/etablissements/$E_REVOIR/fermetures" "$T_P")"
retirer_f() { # établissement période version motif [jeton] — code
  appel POST "/etablissements/$1/fermetures/$2/retirer" "${5:-$T_A}" "{\"version\":\"$3\",\"motif\":\"$4\"}"
}
chk "retirer une fermeture EN COURS : 409, qui dit de rouvrir d'abord ; la période est inchangée" "409|1|$(version_f "$F_EN_COURS")" \
  "$(retirer_f "$E_REVOIR" "$F_EN_COURS" "$(version_f "$F_EN_COURS")" "TEST fermeture saisie a tort")|$(erreur_contient "rouvrez d")|$(version_f "$F_EN_COURS")"
chk "corriger la fermeture EN COURS à J-8 (200) : l'établissement porte la même date, la période aussi" "200|$J8|$J8" \
  "$(corriger_f "$E_REVOIR" "$F_EN_COURS" "$J8" null)|$(sql "SELECT ferme_le FROM commerces WHERE id = '$E_REVOIR'")|$(sql "SELECT ferme_le FROM fermetures_commerces WHERE id = '$F_EN_COURS'")"
statut_etab "$E_REVOIR" actif >/dev/null
F_R=$(periode "$E_REVOIR")
chk "rouvert : la période est close, connue, et le constat reste « à revoir » (fermé du … au …)" "$F_EN_COURS|CONSTAT_ETABLISSEMENT_FERME_DEPUIS|1" \
  "$F_R|$(appel GET "/constats-assimiles/$C_R" "$T_A" >/dev/null; val "d['a_revoir']['code']")|$(val "1 if 'au $(fr "$JOUR")' in d['a_revoir']['message'] else 0")"
VF=$(version_f "$F_R")
chk "retirer la période : sans motif (400), version périmée (409), par la FNCT (403), par le directeur de B (404) — la ligne est inchangée" "400|409|403|404|$VF|0" \
  "$(retirer_f "$E_REVOIR" "$F_R" "$VF" "non")|$(retirer_f "$E_REVOIR" "$F_R" 1 "TEST fermeture saisie a tort")|$(retirer_f "$E_REVOIR" "$F_R" "$VF" "TEST fermeture saisie a tort" "$T_F")|$(retirer_f "$E_REVOIR" "$F_R" "$VF" "TEST fermeture saisie a tort" "$T_B")|$(version_f "$F_R")|$(sql "SELECT count(*) FROM fermetures_commerces WHERE id = '$F_R' AND retiree_le IS NOT NULL")"
chk "une correction qui chevauche une autre période est refusée (409) ; une date à venir aussi (400)" "409|400" \
  "$(corriger_f "$E_ROUVERT" "$(periode "$E_ROUVERT")" "$J20" "$J3")|$(corriger_f "$E_ROUVERT" "$(periode "$E_ROUVERT")" "$J20" "$DEMAIN")"
chk "la période retirée par le directeur, avec son motif (200) : elle reste en base, et le constat n'est plus « à revoir »" "200|1|1|None|$VR" \
  "$(retirer_f "$E_REVOIR" "$F_R" "$VF" "TEST fermeture saisie a tort")|$(val "1 if [f for f in d['fermetures'] if f['id'] == '$F_R'][0]['retiree_le'] else 0")|$(sql "SELECT count(*) FROM fermetures_commerces WHERE id = '$F_R' AND motif_retrait = 'TEST fermeture saisie a tort'")|$(appel GET "/constats-assimiles/$C_R" "$T_A" >/dev/null; val "d['a_revoir']")|$(version "$C_R")"
chk "… un constat daté dans la période retirée est maintenant accepté (201) ; la période ne se retire pas deux fois (409)" "201|409" \
  "$(constat "$E_REVOIR" "$J7" debordement)|$(retirer_f "$E_REVOIR" "$F_R" "$(version_f "$F_R")" "TEST encore")"
chk "le journal garde le retrait et la correction, avec le compte du directeur" "1|1" \
  "$(sql "SELECT count(*) FROM audit_log WHERE table_name = 'fermetures_commerces' AND record_id = '$F_R' AND operation = 'UPDATE' AND new_data ->> 'motif_retrait' = 'TEST fermeture saisie a tort' AND changed_by = '$ID_A'")|$(sql "SELECT (count(*) > 0)::int FROM audit_log WHERE table_name = 'fermetures_commerces' AND record_id = '$F_R' AND new_data ->> 'motif_correction' IS NOT NULL AND changed_by = '$ID_A'")"
chk "la liste se filtre par type, statut, établissement et mois" "1|1" \
  "$(appel GET "/constats-assimiles?communeId=$A&type=conteneur_non_conforme" "$T_A" >/dev/null; val "len(d)")|$(appel GET "/constats-assimiles?communeId=$A&statut=classe&commerceId=$E_CLASSE&mois=${J5%-*}" "$T_A" >/dev/null; val "len(d)")"

# -----------------------------------------------------------------------------
echo
echo "9. Le journal d'audit : chaque geste et son compte, nulle part ailleurs"
chk "le constat levé, la levée annulée, le constat annulé : au journal, ancien et nouveau statut, avec le compte du directeur" "1|1|1|1" \
  "$(transition_au_journal "$C1" constate leve "$ID_A" | grep -c '^[1-9]')|$(transition_au_journal "$C1" leve constate "$ID_A")|$(transition_au_journal "$C1" leve annule "$ID_A")|$(transition_au_journal "$C2" constate classe "$ID_A")"
chk "le constat classé puis annulé ; la sanction annulée : au journal, avec le compte" "1|1" \
  "$(transition_au_journal "$C2" classe annule "$ID_A")|$(sql "SELECT count(*) FROM audit_log WHERE table_name = 'sanctions_constats' AND record_id = '$S1' AND operation = 'UPDATE' AND old_data ->> 'statut' = 'valide' AND new_data ->> 'statut' = 'annulee' AND new_data ->> 'motif_annulation' = 'TEST reference erronee' AND changed_by = '$ID_A'")"
chk "la création du constat et l'ajout d'une photo : au journal, rattachés à la commune, avec le compte" "1|1" \
  "$(sql "SELECT count(*) FROM audit_log WHERE table_name = 'constats_assimiles' AND record_id = '$C1' AND operation = 'INSERT' AND commune_id = '$A' AND changed_by = '$ID_A'")|$(sql "SELECT count(*) FROM audit_log WHERE table_name = 'photos_constats_assimiles' AND new_data ->> 'fichier_id' = '$P1' AND operation = 'INSERT' AND commune_id = '$A' AND changed_by = '$ID_A'")"
chk "le directeur lit ces lignes du journal ; le directeur de B, aucune" "1|0" \
  "$(vu admin_commune "$ID_A" "$A" "(SELECT count(*) FROM audit_log WHERE table_name = 'photos_constats_assimiles' AND new_data ->> 'fichier_id' = '$P1')")|$(vu admin_commune "$ID_B" "$B" "(SELECT count(*) FROM audit_log WHERE table_name = 'photos_constats_assimiles' AND new_data ->> 'fichier_id' = '$P1')")"
appel GET "/constats-assimiles?communeId=$A" "$T_A" >/dev/null
appel GET "/constats-assimiles?communeId=$A" "$T_F" >/dev/null
appel GET "/constats-assimiles/$C1" "$T_F" >/dev/null
NOM_A=$(sql "SELECT replace(full_name, ' ', '') FROM users WHERE id = '$ID_A'")
# La seule réponse écartée : le dépôt de la photo « d'un autre usage » (constat_terrain),
# qui rend à son déposant son propre identifiant, comme tout dépôt hors de ce lot.
grep -v '"usage":"constat_terrain"' "$T/reponses.txt" > "$T/reponses_lot.txt"; mv "$T/reponses_lot.txt" "$T/reponses.txt"
NOM_F=$(sql "SELECT replace(full_name, ' ', '') FROM users WHERE id = '$ID_F'")
NB_REP=$(grep -c . "$T/reponses.txt")
# Un contrôle qui n'aurait rien lu passerait à vide : la lecture se prouve d'abord.
chk "les réponses ont bien été lues (plus de 150), dont la fiche de C1 avec ses photos et ses sanctions, lue par la FNCT" "1|1" \
  "$([ "$NB_REP" -gt 150 ] && echo 1 || echo 0)|$(python3 -c "import json
n=0
for l in open('$T/reponses.txt', encoding='utf-8'):
    try: d=json.loads(l)
    except Exception: continue
    if isinstance(d, dict) and d.get('id') == '$C1' and d.get('photos') and d.get('sanctions'): n=1
print(n)")"
chk "aucune réponse des routes /constats-assimiles, /fichiers, /etablissements/…/fermetures et /tickets ne porte l'identifiant ni le nom du directeur ou de la FNCT ($NB_REP réponses lues)" "0|0|0|0" \
  "$(grep -c -- "$ID_A" "$T/reponses.txt")|$(grep -c -- "$ID_F" "$T/reponses.txt")|$(tr -d ' ' < "$T/reponses.txt" | grep -c -- "$NOM_A")|$(tr -d ' ' < "$T/reponses.txt" | grep -c -- "$NOM_F")"
chk "aucun numéro fictif refusé n'est au journal, sous aucune forme (98 765 432, 98765432, 98-765-432, persan, arabe-indien)" 0 \
  "$(sql "SELECT count(*) FROM audit_log WHERE new_data::text ~ '(98 765 432|98765432|98-765-432|۹۸۷۶۵۴۳۲|٩٨٧٦٥٤٣٢)'")"
# Si l'auteur ressort, la réponse qui le porte est montrée : c'est elle qu'il faut corriger.
grep -h -- "$ID_A\|$ID_F" "$T/reponses.txt" | cut -c1-400 | sed 's/^/    réponse fautive : /'
chk "… alors que le journal, lui, porte bien le compte du directeur, sur les trois tables" 3 \
  "$(sql "SELECT count(DISTINCT table_name) FROM audit_log WHERE changed_by = '$ID_A' AND table_name IN ('constats_assimiles', 'sanctions_constats', 'photos_constats_assimiles')")"

# -----------------------------------------------------------------------------
echo
base_reelle_intacte "pendant la campagne"
rendre_tables_nationales
nettoyer
chk "en partant : communes, constats, photos, sanctions, périodes et comptes de test effacés" "0|0|0|0|0|0" \
  "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM constats_assimiles WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM photos_constats_assimiles WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM sanctions_constats WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM fermetures_commerces WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"
tables_nationales_rendues "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
