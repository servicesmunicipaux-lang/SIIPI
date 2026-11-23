#!/usr/bin/env bash
# =============================================================================
# v0.15.98 — jalon G, lot G5b : les campagnes de pesée et les densités des
# assimilés (SPEC_G § 3.3, § 3.5 ; décisions du 12 novembre 2026, G5 n° 7 à 11 ;
# migration 106).
#
# Elle commence par ce qui est REFUSÉ :
#   - une campagne écrite par la FNCT, par un prestataire, par le directeur d'une
#     autre commune ; une pesée dans une campagne en brouillon ou close, datée de
#     demain, hors de la période, sans cible ou avec deux, d'un établissement fermé
#     ou sans catégorie, d'une autre durée qu'une pesée du même jour ; une clé
#     réutilisée ; un ménage dans une campagne d'établissements, un code de ménage
#     saisi, une pesée de ménage qui porte un contenant ; une écriture directe ;
#   - la clôture d'une campagne vide, une version dépassée ; une campagne close
#     modifiée ; une campagne ouverte retirée, son début ou son intitulé changés,
#     sa fin ramenée avant sa dernière pesée ; l'adoption d'une densité sous le
#     seuil, deux fois la même ; une densité nationale par une commune, une
#     densité de commune par la FNCT, une catégorie inconnue, une densité réécrite ;
#   - un remplissage saisi en fraction (plus de 2 000 kg/m³), plus de décimales
#     que la base n'en garde ; une clé réutilisée avec un autre poids, volume,
#     remplissage, durée ou contenant ; le ménage d'une autre campagne,
#     l'établissement d'une autre commune ;
#   - la FNCT qui lit un ménage, un prestataire qui lit une campagne, le directeur
#     d'une autre commune qui lit, pèse, clôt, adopte ou annule (introuvable).
# Puis la vie d'une campagne (brouillon retiré, prolongation), deux envois
# simultanés du même lot, le calcul de la clôture comparé au témoin indépendant
# (tests/pesees_attendus.py, qui ne lit que le jeu fictif et la méthode) — dont un
# changement d'échelle fait après l'ouverture et des pesées saisies ensuite, un
# établissement reclassé, les ménages pesés deux fois le premier jour, et un ménage
# jamais pesé —, le seuil figé, les écartés et leur raison, les ménages masqués,
# les vrais effectifs lus par la FNCT, l'adoption, les densités saisies et
# retirées, et le tonnage estimé d'une convention : en fourchette quand rien ne
# manque, « non renseigné » sinon ; enfin l'import Kobo (clés « uuid: », doublons
# probables, classeur numérique, pesée annulée corrigée).
#
#   docker compose exec -T api npm run test:campagnes-pesee
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_pes_a; B=test_pes_b
ESSAI="'$A','$B'"
JEU=tests/donnees/campagne-pesee-fictive.json

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
sql() { $PSQL -c "$1" 2>&1 | tr -d ' '; }
texte_sql() { $PSQL -c "$1" 2>&1; }  # un texte lu tel quel, espaces compris
tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
appel() { # méthode chemin jeton [corps] — code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" ${3:+-H "Authorization: Bearer $3"} \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}
envoi() { # chemin jeton fichier du corps
  curl -s -o "$T/r.json" -w '%{http_code}' -X POST "$API$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' --data-binary "@$3"
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
erreur_contient() { val "1 if '$1' in d.get('error','') else 0"; }
en_base() { # rôle utilisateur commune instruction — le refus de la base, ou « ok »
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            SET LOCAL ROLE siipi_app; $4; ROLLBACK;" 2>&1 \
    | grep -oE '^ERROR: +[A-Z_]+(:|$)|permission denied|violates row-level security|cannot insert a non-DEFAULT value|violates (check|unique) constraint "[a-z_]+"' | head -1 \
    | sed -E 's/^ERROR: +//; s/:$//; s/violates (check|unique) constraint "([a-z_]+)"/\2/' | grep . || echo ok
}
vu() { # rôle utilisateur commune expression
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            SET LOCAL ROLE siipi_app; SELECT 'vu:' || ($4); ROLLBACK;" 2>&1 | grep -oE '^vu:.*' | cut -d: -f2
}
version_c() { sql "SELECT xmin FROM campagnes_pesee WHERE id = '$1'"; }
version_cv() { sql "SELECT xmin FROM conventions_commerciales WHERE id = '$1'"; }
cle() { python3 -c "import uuid;print(uuid.uuid4())"; }

. tests/outils/communes_essai.sh
. tests/outils/comptes_temporaires.sh
. tests/outils/base_reelle.sh
. tests/outils/tables_nationales.sh
. tests/outils/convention_signee.sh
nettoyer() {
  effacer_conventions_essai "$ESSAI"
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
}
nettoyer
# Les flux de test, et une densité nationale posée par la FNCT : deux tables
# nationales, gardées et rendues ligne entière (une densité nationale oubliée
# vaudrait pour toutes les communes réelles).
garder_tables_nationales elements_listes_nationales densites_assimiles
trap 'rendre_tables_nationales; nettoyer; rm -rf "$T" "$TABLES_NATIONALES_DIR"' EXIT
releve_base_reelle

commune_essai "$A" "TEST commune A des pesées"
commune_essai "$B" "TEST commune B des pesées"
compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_A=$COMPTE_ID
compte_temporaire admin_commune "$B" "Directeur B"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_B=$COMPTE_ID
compte_temporaire super_admin_fnct "" "FNCT des pesées"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_F=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$A" "Prestataire"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_F" ] && [ -n "$T_P" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }

JOUR=$(sql "SELECT app.jour_tunis()")
DEMAIN=$(sql "SELECT app.jour_tunis() + 1")
DEBUT=$(sql "SELECT app.jour_tunis() - 12")
FIN=$(sql "SELECT app.jour_tunis() - 2")
AVANT=$(sql "SELECT app.jour_tunis() - 13")
CONV_DEBUT=$(sql "SELECT app.jour_tunis() - 30")
CONV_FIN=$(sql "SELECT ((app.jour_tunis() - 30) + interval '1 year')::date - 1")
ANC=$(sql "SELECT extract(year FROM app.jour_tunis())::int")
GRILLE_DEBUT="$((ANC - 2))-01-01"
jour_de() { sql "SELECT DATE '$DEBUT' + $1 - 1"; }

# Les établissements du jeu fictif, inscrits par l'API.
python3 - "$JEU" > "$T/etabs.txt" <<'PY'
import json, sys
for e in json.load(open(sys.argv[1], encoding="utf-8"))["etablissements"]:
    corps = {"nom": e["nom"], "categorieActivite": e["categorie"], "matriculeFiscal": e["matricule"]}
    if e["unite"]:
        corps.update(uniteEchelle=e["unite"], valeurEchelle=e["valeur"])
    print(e["cle"] + "\t" + json.dumps(corps, ensure_ascii=False))
PY
: > "$T/ids.txt"
while IFS="$(printf '\t')" read -r k corps; do
  appel POST "/etablissements?communeId=$A" "$T_A" "$corps" >/dev/null
  id=$(val "d['id']")
  case "$id" in *-*-*-*-*) echo "$k $id" >> "$T/ids.txt" ;; *) echo "L'établissement $k n'a pas pu être inscrit" >&2; exit 1 ;; esac
done < "$T/etabs.txt"
N_ETABS=$(wc -l < "$T/etabs.txt" | tr -d ' ')
[ "$(wc -l < "$T/ids.txt" | tr -d ' ')" = "$N_ETABS" ] || { echo "Les $N_ETABS établissements du jeu n'ont pas été inscrits" >&2; exit 1; }
idde() { grep "^$1 " "$T/ids.txt" | cut -d' ' -f2; }
E_CAFE1=$(idde cafe01); E_CAFE12=$(idde cafe12)
appel POST "/etablissements?communeId=$A" "$T_A" '{"nom":"TEST Atelier fermé","categorieActivite":"atelier"}' >/dev/null; E_FERME=$(val "d['id']")
appel POST "/etablissements/$E_FERME/statut" "$T_A" "{\"statut\":\"ferme\",\"date\":\"$AVANT\",\"motif\":\"TEST fermeture constatée\"}" >/dev/null
[ "$(sql "SELECT statut FROM commerces WHERE id = '$E_FERME'")" = ferme ] || { echo "L'atelier n'a pas pu être fermé" >&2; exit 1; }
# Un établissement d'avant le jalon G, sans catégorie (comme la migration 099 en a gardé).
E_SANS=$(sql "BEGIN; ALTER TABLE commerces DISABLE TRIGGER trg_controler_etablissement;
              INSERT INTO commerces (commune_id, nom, source_creation) VALUES ('$A', 'TEST Ancien sans catégorie', 'anterieur') RETURNING id;
              ALTER TABLE commerces ENABLE TRIGGER trg_controler_etablissement; COMMIT;" | grep -E '^[0-9a-f-]{36}$' | head -1)
case "$E_SANS" in *-*-*-*-*) ;; *) echo "L'établissement sans catégorie n'a pas pu être posé" >&2; exit 1 ;; esac

campagne() { # objet intitulé — code ; corps dans $T/r.json
  appel POST "/campagnes-pesee?communeId=$A" "$T_A" "{\"objet\":\"$1\",\"intitule\":\"$2\",\"dateDebut\":\"$DEBUT\",\"dateFin\":\"$FIN\"}"
}
pesee() { # campagne corps-de-pesée — code
  appel POST "/campagnes-pesee/$1/pesees" "$T_A" "{\"pesees\":[$2]}"
}

# -----------------------------------------------------------------------------
echo
echo "1. Ce qui est refusé aux campagnes"
chk "la FNCT ne mène pas de campagne : 403 ; un prestataire non plus : 403" "403|403" \
  "$(appel POST "/campagnes-pesee?communeId=$A" "$T_F" "{\"objet\":\"etablissements\",\"intitule\":\"TEST\",\"dateDebut\":\"$DEBUT\",\"dateFin\":\"$FIN\"}")|$(appel POST "/campagnes-pesee?communeId=$A" "$T_P" "{\"objet\":\"etablissements\",\"intitule\":\"TEST\",\"dateDebut\":\"$DEBUT\",\"dateFin\":\"$FIN\"}")"
chk "le directeur de B, dans A : introuvable (404)" 404 \
  "$(appel POST "/campagnes-pesee?communeId=$A" "$T_B" "{\"objet\":\"etablissements\",\"intitule\":\"TEST de B\",\"dateDebut\":\"$DEBUT\",\"dateFin\":\"$FIN\"}")"
chk "plus de 61 jours : 400" "400|1" \
  "$(appel POST "/campagnes-pesee?communeId=$A" "$T_A" "{\"objet\":\"etablissements\",\"intitule\":\"TEST trop longue\",\"dateDebut\":\"$CONV_DEBUT\",\"dateFin\":\"$CONV_FIN\"}")|$(erreur_contient '61 jours')"
chk "rien n'a été créé" 0 "$(sql "SELECT count(*) FROM campagnes_pesee WHERE commune_id = '$A'")"

chk "la campagne d'établissements et celle de ménages naissent en brouillon" "201|brouillon|201" \
  "$(campagne etablissements "TEST Campagne des établissements")|$(val "d['statut']")|$(campagne menages "TEST Campagne des ménages")"
CE=$(sql "SELECT id FROM campagnes_pesee WHERE commune_id = '$A' AND objet = 'etablissements'")
CM=$(sql "SELECT id FROM campagnes_pesee WHERE commune_id = '$A' AND objet = 'menages'")
for c in "$CE" "$CM"; do case "$c" in *-*-*-*-*) ;; *) echo "Les campagnes de départ n'ont pas pu être créées" >&2; exit 1 ;; esac; done
chk "une pesée dans une campagne en brouillon : 409" "409|1" \
  "$(pesee "$CE" "{\"commerceId\":\"$E_CAFE1\",\"date\":\"$(jour_de 2)\",\"poidsKg\":5,\"dureeJours\":1,\"cle\":\"$(cle)\"}")|$(erreur_contient 'campagne ouverte')"
chk "une campagne vide ne se clôt pas (409, qui dit pourquoi et quoi faire) ; ouvertes, ses deux campagnes" "200|200|409|1|1|ouverte" \
  "$(appel POST "/campagnes-pesee/$CE/ouvrir" "$T_A" "{\"version\":\"$(version_c "$CE")\"}")|$(appel POST "/campagnes-pesee/$CM/ouvrir" "$T_A" "{\"version\":\"$(version_c "$CM")\"}")|$(appel POST "/campagnes-pesee/$CE/clore" "$T_A" "{\"version\":\"$(version_c "$CE")\"}")|$(erreur_contient 'sans pesée ne se clôt pas')|$(erreur_contient 'retirez-la, ou pesez')|$(sql "SELECT statut FROM campagnes_pesee WHERE id = '$CE'")"
chk "une version dépassée : 409" 409 "$(appel POST "/campagnes-pesee/$CE/clore" "$T_A" '{"version":"1"}')"

# La vie d'une campagne : un brouillon se modifie et se retire avec la version lue ;
# une campagne ouverte ne change plus que sa fin, jamais avant sa dernière pesée.
campagne etablissements "TEST Brouillon à retirer" >/dev/null; CL=$(val "d['id']")
campagne etablissements "TEST Campagne prolongée" >/dev/null; CO=$(val "d['id']")
for c in "$CL" "$CO"; do case "$c" in *-*-*-*-*) ;; *) echo "Les campagnes de la vie d'une campagne n'ont pas pu être créées" >&2; exit 1 ;; esac; done
chk "un brouillon : modifié avec une version dépassée, 409 ; retiré avec une version dépassée, 409 ; rien n'a bougé" "409|409|TEST Brouillon à retirer|1" \
  "$(appel PUT "/campagnes-pesee/$CL" "$T_A" '{"version":"1","intitule":"TEST Renommé trop tard"}')|$(appel DELETE "/campagnes-pesee/$CL?version=1" "$T_A")|$(texte_sql "SELECT intitule FROM campagnes_pesee WHERE id = '$CL'")|$(sql "SELECT count(*) FROM campagnes_pesee WHERE id = '$CL' AND deleted_at IS NULL")"
chk "un brouillon modifié avec sa version (200), puis retiré avec la nouvelle (204) : introuvable ensuite (404, 404), retiré sans être effacé" "200|TEST Brouillon renommé|204|404|404|1" \
  "$(appel PUT "/campagnes-pesee/$CL" "$T_A" "{\"version\":\"$(version_c "$CL")\",\"intitule\":\"TEST Brouillon renommé\"}")|$(val "d['intitule']")|$(appel DELETE "/campagnes-pesee/$CL?version=$(version_c "$CL")" "$T_A")|$(appel GET "/campagnes-pesee/$CL" "$T_A")|$(appel DELETE "/campagnes-pesee/$CL?version=$(version_c "$CL")" "$T_A")|$(sql "SELECT count(*) FROM campagnes_pesee WHERE id = '$CL' AND deleted_at IS NOT NULL")"
appel POST "/campagnes-pesee/$CO/ouvrir" "$T_A" "{\"version\":\"$(version_c "$CO")\"}" >/dev/null
chk "une campagne ouverte ne se retire pas : 409, qui le dit ; ni son début ni son intitulé ne changent : 409, 409" "409|1|409|409|1|$DEBUT|TEST Campagne prolongée" \
  "$(appel DELETE "/campagnes-pesee/$CO?version=$(version_c "$CO")" "$T_A")|$(erreur_contient 'brouillon')|$(appel PUT "/campagnes-pesee/$CO" "$T_A" "{\"version\":\"$(version_c "$CO")\",\"dateDebut\":\"$AVANT\"}")|$(appel PUT "/campagnes-pesee/$CO" "$T_A" "{\"version\":\"$(version_c "$CO")\",\"intitule\":\"TEST Renommée ouverte\"}")|$(erreur_contient 'fin prévue')|$(sql "SELECT date_debut FROM campagnes_pesee WHERE id = '$CO'")|$(texte_sql "SELECT intitule FROM campagnes_pesee WHERE id = '$CO' AND deleted_at IS NULL")"
J8=$(jour_de 8); J8_FR=$(sql "SELECT to_char(DATE '$(jour_de 8)', 'DD/MM/YYYY')")
chk "une pesée dans la campagne ouverte ; sa fin ramenée avant cette pesée : 409, qui nomme le jour ($J8_FR)" "201|409|1|$FIN" \
  "$(appel POST "/campagnes-pesee/$CO/pesees" "$T_A" "{\"pesees\":[{\"commerceId\":\"$E_CAFE1\",\"date\":\"$J8\",\"poidsKg\":4,\"dureeJours\":1,\"cle\":\"$(cle)\"}]}")|$(appel PUT "/campagnes-pesee/$CO" "$T_A" "{\"version\":\"$(version_c "$CO")\",\"dateFin\":\"$(jour_de 5)\"}")|$(erreur_contient "$J8_FR")|$(sql "SELECT date_fin FROM campagnes_pesee WHERE id = '$CO'")"
chk "une pesée d'aujourd'hui, hors de la période : 400 ; la campagne prolongée jusqu'à aujourd'hui (200) : la même pesée est reçue (201)" "400|200|$JOUR|201|1" \
  "$(appel POST "/campagnes-pesee/$CO/pesees" "$T_A" "{\"pesees\":[{\"commerceId\":\"$E_CAFE1\",\"date\":\"$JOUR\",\"poidsKg\":3,\"dureeJours\":1,\"cle\":\"prolongee-du-jour\"}]}")|$(appel PUT "/campagnes-pesee/$CO" "$T_A" "{\"version\":\"$(version_c "$CO")\",\"dateFin\":\"$JOUR\"}")|$(val "d['date_fin']")|$(appel POST "/campagnes-pesee/$CO/pesees" "$T_A" "{\"pesees\":[{\"commerceId\":\"$E_CAFE1\",\"date\":\"$JOUR\",\"poidsKg\":3,\"dureeJours\":1,\"cle\":\"prolongee-du-jour\"}]}")|$(sql "SELECT count(*) FROM pesees_campagne WHERE campagne_id = '$CO' AND date_pesee = '$JOUR'")"
# Le même lot envoyé deux fois en même temps (double clic, nouvel essai après une
# coupure) : les deux réponses sont des succès, une seule pesée est écrite.
KC=$(cle)
printf '{"pesees":[{"commerceId":"%s","date":"%s","poidsKg":2.2,"dureeJours":1,"volumeLitres":120,"remplissagePct":40,"cle":"%s"}]}' "$E_CAFE1" "$(jour_de 6)" "$KC" > "$T/concurrent.json"
for n in 1 2; do
  curl -s -o "$T/concurrent$n.out" -w '%{http_code}' -X POST "$API/campagnes-pesee/$CO/pesees" -H "Authorization: Bearer $T_A" \
    -H 'Content-Type: application/json' --data-binary "@$T/concurrent.json" > "$T/concurrent$n.code" &
done
wait
chk "deux envois identiques simultanés : 201 et 201, une seule pesée en base (l'autre « déjà reçue »)" "201|201|1|1" \
  "$(cat "$T/concurrent1.code")|$(cat "$T/concurrent2.code")|$(sql "SELECT count(*) FROM pesees_campagne WHERE cle_envoi = 'portail:$KC'")|$(python3 -c "import json;print(sum(json.load(open('$T/concurrent' + n + '.out'))['pesees'][0]['deja_recue'] for n in '12'))")"

echo
echo "2. Ce qui est refusé aux pesées et aux ménages"
chk "une pesée de demain : 400 ; hors de la période : 400" "400|1|400|1" \
  "$(pesee "$CE" "{\"commerceId\":\"$E_CAFE1\",\"date\":\"$DEMAIN\",\"poidsKg\":5,\"dureeJours\":1,\"cle\":\"$(cle)\"}")|$(erreur_contient "pas encore arrivé")|$(pesee "$CE" "{\"commerceId\":\"$E_CAFE1\",\"date\":\"$AVANT\",\"poidsKg\":5,\"dureeJours\":1,\"cle\":\"$(cle)\"}")|$(erreur_contient "en fait pas partie")"
chk "sans cible, ou avec deux : 400" "400|400" \
  "$(pesee "$CE" "{\"date\":\"$(jour_de 2)\",\"poidsKg\":5,\"dureeJours\":1,\"cle\":\"$(cle)\"}")|$(pesee "$CE" "{\"commerceId\":\"$E_CAFE1\",\"menageId\":\"$E_CAFE1\",\"date\":\"$(jour_de 2)\",\"poidsKg\":5,\"dureeJours\":1,\"cle\":\"$(cle)\"}")"
chk "un établissement fermé : 409 ; sans catégorie : 409, qui le dit" "409|409|1" \
  "$(pesee "$CE" "{\"commerceId\":\"$E_FERME\",\"date\":\"$(jour_de 2)\",\"poidsKg\":5,\"dureeJours\":1,\"cle\":\"$(cle)\"}")|$(pesee "$CE" "{\"commerceId\":\"$E_SANS\",\"date\":\"$(jour_de 2)\",\"poidsKg\":5,\"dureeJours\":1,\"cle\":\"$(cle)\"}")|$(erreur_contient 'catégorie')"
chk "un ménage dans une campagne d'établissements : 409 ; une pesée de ménage dans une campagne d'établissements : 400, qui le dit" "409|400|1" \
  "$(appel POST "/campagnes-pesee/$CE/menages" "$T_A" '{"habitants":3,"trancheRevenu":"bas"}')|$(appel POST "/campagnes-pesee/$CE/pesees" "$T_A" "{\"pesees\":[{\"menageId\":\"$E_CAFE1\",\"date\":\"$(jour_de 2)\",\"poidsKg\":5,\"dureeJours\":1,\"cle\":\"$(cle)\"}]}")|$(erreur_contient 'pèse un établissement')"
# Un ménage d'une AUTRE campagne de ménages : la cible existe, elle n'est pas de cet échantillon.
campagne menages "TEST Seconde campagne des ménages" >/dev/null; CM2=$(val "d['id']")
appel POST "/campagnes-pesee/$CM2/menages" "$T_A" '{"habitants":2,"trancheRevenu":"moyen"}' >/dev/null; M_AUTRE=$(val "d['id']")
case "$M_AUTRE" in *-*-*-*-*) ;; *) echo "Le ménage de la seconde campagne n'a pas pu être inscrit" >&2; exit 1 ;; esac
chk "le ménage d'une autre campagne de ménages : 400, « pas de l'échantillon de cette campagne », rien d'écrit" "400|1|0" \
  "$(pesee "$CM" "{\"menageId\":\"$M_AUTRE\",\"date\":\"$(jour_de 2)\",\"poidsKg\":5,\"dureeJours\":1,\"cle\":\"$(cle)\"}")|$(erreur_contient 'échantillon de cette campagne')|$(sql "SELECT count(*) FROM pesees_campagne WHERE menage_id = '$M_AUTRE'")"
appel POST "/etablissements?communeId=$B" "$T_B" '{"nom":"TEST Café de la commune B","categorieActivite":"cafe"}' >/dev/null; E_B=$(val "d['id']")
case "$E_B" in *-*-*-*-*) ;; *) echo "L'établissement de B n'a pas pu être inscrit" >&2; exit 1 ;; esac
chk "peser dans A un établissement de B : 400, « pas inscrit dans la commune »" "400|1" \
  "$(pesee "$CE" "{\"commerceId\":\"$E_B\",\"date\":\"$(jour_de 2)\",\"poidsKg\":5,\"dureeJours\":1,\"cle\":\"$(cle)\"}")|$(erreur_contient "pas inscrit dans la commune")"
chk "un remplissage saisi en fraction (0,5 pour 50 %) : plus de 2 000 kg/m³, 400, qui dit d'écrire un pourcentage" "400|1" \
  "$(pesee "$CE" "{\"commerceId\":\"$E_CAFE1\",\"date\":\"$(jour_de 9)\",\"poidsKg\":30,\"dureeJours\":1,\"volumeLitres\":120,\"remplissagePct\":0.5,\"cle\":\"$(cle)\"}")|$(erreur_contient 'en pourcentage')"
decimales() { val "1 if '$1' in json.dumps(d, ensure_ascii=False) else 0"; }
chk "plus de décimales que la base n'en garde : poids (3), volume (1), remplissage (1) — 400 chacun, qui le dit" "400|1|400|1|400|1" \
  "$(pesee "$CE" "{\"commerceId\":\"$E_CAFE1\",\"date\":\"$(jour_de 9)\",\"poidsKg\":2.0005,\"dureeJours\":1,\"cle\":\"$(cle)\"}")|$(decimales '3 décimales au plus')|$(pesee "$CE" "{\"commerceId\":\"$E_CAFE1\",\"date\":\"$(jour_de 9)\",\"poidsKg\":2,\"dureeJours\":1,\"volumeLitres\":120.25,\"remplissagePct\":50,\"cle\":\"$(cle)\"}")|$(decimales '1 décimale au plus')|$(pesee "$CE" "{\"commerceId\":\"$E_CAFE1\",\"date\":\"$(jour_de 9)\",\"poidsKg\":2,\"dureeJours\":1,\"volumeLitres\":120,\"remplissagePct\":0.04,\"cle\":\"$(cle)\"}")|$(decimales '1 décimale au plus')"
chk "aucune de ces pesées refusées n'est écrite" 0 "$(sql "SELECT count(*) FROM pesees_campagne WHERE campagne_id IN ('$CE', '$CM')")"
chk "en base : un code de ménage ne se saisit pas, une pesée ne s'écrit pas directement" "cannot insert a non-DEFAULT value|permission denied" \
  "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO menages_echantillon (campagne_id, commune_id, rang, code, habitants, tranche_revenu) VALUES ('$CM', '$A', 1, 'BENSALAH', 3, 'bas')")|$(en_base admin_commune "$ID_A" "$A" "INSERT INTO pesees_campagne (campagne_id, commune_id, commerce_id, date_pesee, jour_campagne, poids_kg, duree_jours, source, cle_envoi) VALUES ('$CE', '$A', '$E_CAFE1', DATE '$JOUR', 1, 5, 1, 'portail', 'x')")"
chk "la FNCT et un prestataire n'ajoutent pas de ménage : 403, 403" "403|403" \
  "$(appel POST "/campagnes-pesee/$CM/menages" "$T_F" '{"habitants":3,"trancheRevenu":"bas"}')|$(appel POST "/campagnes-pesee/$CM/menages" "$T_P" '{"habitants":3,"trancheRevenu":"bas"}')"

# -----------------------------------------------------------------------------
echo
echo "3. Les pesées du jeu fictif"
# Les pesées des établissements, dans l'ordre des jours ; la valeur d'échelle du
# café 12 change avant sa dernière pesée, l'atelier change de catégorie avant
# chacune des siennes. Les pesées d'un établissement « lot » attendent la fin de la
# boucle : sa valeur d'échelle change alors, et elles partent d'un seul envoi.
python3 - "$JEU" "$T/ids.txt" > "$T/pesees.txt" <<'PY'
import json, sys
jeu = json.load(open(sys.argv[1], encoding="utf-8"))
ids = dict(l.split() for l in open(sys.argv[2]))
lots = {e["cle"] for e in jeu["etablissements"] if e.get("lot")}
for i, p in enumerate(sorted(jeu["pesees"], key=lambda p: (p["jour"], p["etab"]))):
    corps = {"commerceId": ids[p["etab"]], "jour": p["jour"], "poidsKg": p["poids"], "dureeJours": p["duree"],
             "volumeLitres": p.get("volume"), "remplissagePct": p.get("remplissage")}
    lot = "lot" if p["etab"] in lots else ""
    print(f'{p["etab"]}|{p.get("valeur", "")}|{p.get("categorie", "")}|{lot}|{json.dumps(corps)}')
PY
N_PESEES=$(wc -l < "$T/pesees.txt" | tr -d ' ')
N_LOT=$(grep -c '|lot|' "$T/pesees.txt")
corps_pesee() { # corps du jeu — le corps envoyé (date du jour de campagne, clé neuve)
  local j
  j=$(python3 -c "import json;print(json.loads('''$1''')['jour'])")
  python3 -c "import json,uuid;d=json.loads('''$1''');d.pop('jour');d['date']='$(jour_de "$j")';d['cle']=str(uuid.uuid4());print(json.dumps(d))"
}
ok_pesees=0
: > "$T/lot.txt"
# Un séparateur qui n'est pas une espace : deux tabulations se fondraient en une, et
# une valeur vide décalerait le corps.
while IFS='|' read -r k valeur categorie lot corps; do
  if [ -n "$lot" ]; then echo "$k|$valeur|$(corps_pesee "$corps")" >> "$T/lot.txt"; continue; fi
  if [ -n "$valeur" ]; then $PSQL -c "UPDATE commerces SET valeur_echelle = $valeur WHERE id = '$(idde "$k")'" >/dev/null; fi
  if [ -n "$categorie" ]; then $PSQL -c "UPDATE commerces SET categorie_activite = '$categorie' WHERE id = '$(idde "$k")'" >/dev/null; fi
  [ "$(pesee "$CE" "$(corps_pesee "$corps")")" = 201 ] && ok_pesees=$((ok_pesees+1))
done < "$T/pesees.txt"
# L'établissement « lot » : sa valeur d'échelle change APRÈS l'ouverture, puis
# toutes ses pesées, datées d'avant ce changement, partent d'un seul envoi — elles
# portent toutes la nouvelle valeur ; seul l'instantané de l'ouverture garde l'ancienne.
K_LOT=$(head -1 "$T/lot.txt" | cut -d'|' -f1); V_LOT=$(head -1 "$T/lot.txt" | cut -d'|' -f2); E_LOT=$(idde "$K_LOT")
case "$E_LOT" in *-*-*-*-*) ;; *) echo "L'établissement dont les pesées partent d'un seul envoi manque au jeu" >&2; exit 1 ;; esac
V_LOT_AVANT=$(sql "SELECT valeur_echelle FROM commerces WHERE id = '$E_LOT'")
$PSQL -c "UPDATE commerces SET valeur_echelle = $V_LOT WHERE id = '$E_LOT'" >/dev/null
chk "les $N_PESEES pesées des établissements s'enregistrent ($N_LOT d'un seul envoi, après le changement d'échelle)" "$((N_PESEES - N_LOT))|201|$N_LOT" \
  "$ok_pesees|$(pesee "$CE" "$(cut -d'|' -f3- "$T/lot.txt" | paste -sd, -)")|$(val "len([p for p in d['pesees'] if not p['deja_recue']])")"
chk "la catégorie, l'unité et la valeur d'échelle sont figées sur chaque pesée (58 puis 70 pour le café 12) ; l'instantané de l'ouverture garde 58" \
  "cafe|chaise|58.00,cafe|chaise|58.00,cafe|chaise|70.00|cafe|chaise|58.00" \
  "$(sql "SELECT string_agg(categorie_activite || '|' || unite_echelle || '|' || valeur_echelle, ',' ORDER BY date_pesee) FROM pesees_campagne WHERE commerce_id = '$E_CAFE12'")|$(sql "SELECT categorie_activite || '|' || unite_echelle || '|' || valeur_echelle FROM instantanes_campagne WHERE campagne_id = '$CE' AND commerce_id = '$E_CAFE12'")"
chk "l'établissement d'un seul envoi : ses pesées portent la nouvelle valeur, l'instantané l'ancienne" \
  "superette|m2|$V_LOT.00,superette|m2|$V_LOT.00|superette|m2|$V_LOT_AVANT" \
  "$(sql "SELECT string_agg(categorie_activite || '|' || unite_echelle || '|' || valeur_echelle, ',' ORDER BY date_pesee) FROM pesees_campagne WHERE commerce_id = '$E_LOT'")|$(sql "SELECT categorie_activite || '|' || unite_echelle || '|' || valeur_echelle FROM instantanes_campagne WHERE campagne_id = '$CE' AND commerce_id = '$E_LOT'")"
E_ATELIER=$(idde atelier1)
chk "l'atelier reclassé : « bureau » puis « boulangerie » sur ses pesées, « atelier » dans l'instantané" "bureau,boulangerie|atelier" \
  "$(sql "SELECT string_agg(categorie_activite, ',' ORDER BY date_pesee) FROM pesees_campagne WHERE commerce_id = '$E_ATELIER'")|$(sql "SELECT categorie_activite FROM instantanes_campagne WHERE campagne_id = '$CE' AND commerce_id = '$E_ATELIER'")"
chk "une autre durée pour le même jour : 409, qui le dit" "409|1" \
  "$(pesee "$CE" "{\"commerceId\":\"$E_CAFE1\",\"date\":\"$(jour_de 2)\",\"poidsKg\":3,\"dureeJours\":2,\"cle\":\"$(cle)\"}")|$(erreur_contient 'même durée')"
K1=$(cle)
P1="{\"commerceId\":\"$E_CAFE1\",\"date\":\"$(jour_de 7)\",\"poidsKg\":2.5,\"dureeJours\":1,\"cle\":\"$K1\"}"
chk "une pesée rejouée (même clé, même contenu) : déjà reçue ; avec un autre contenu : 409" "201|True|409|1" \
  "$(pesee "$CE" "$P1" >/dev/null; pesee "$CE" "$P1")|$(val "d['pesees'][0]['deja_recue']")|$(pesee "$CE" "{\"commerceId\":\"$E_CAFE1\",\"date\":\"$(jour_de 7)\",\"poidsKg\":9,\"dureeJours\":1,\"cle\":\"$K1\"}")|$(erreur_contient 'a déjà servi')"
P7=$(sql "SELECT id FROM pesees_campagne WHERE commerce_id = '$E_CAFE1' AND date_pesee = '$(jour_de 7)'")
chk "cette pesée en trop s'annule avec son motif (sans motif : 400)" "400|200|annulee" \
  "$(appel POST "/campagnes-pesee/pesees/$P7/annuler" "$T_A" '{"motif":"non"}')|$(appel POST "/campagnes-pesee/pesees/$P7/annuler" "$T_A" '{"motif":"TEST pesée en double"}')|$(sql "SELECT statut FROM pesees_campagne WHERE id = '$P7'")"
# Le même poids sous la même clé, mais un dénominateur changé : ce n'est pas la même pesée.
K2=$(cle)
p2() { printf '{"commerceId":"%s","date":"%s","poidsKg":3,"dureeJours":%s,"volumeLitres":%s,"remplissagePct":%s,"contenant":"%s","cle":"%s"}' "$E_CAFE1" "$(jour_de 9)" "$1" "$2" "$3" "$4" "$K2"; }
chk "même clé, même poids : même contenu, déjà reçue ; autre volume, autre durée, autre remplissage, autre contenant : 409 chacun" "201|True|409|1|409|409|409|1" \
  "$(pesee "$CE" "$(p2 1 120 50 'TEST bac vert')" >/dev/null; pesee "$CE" "$(p2 1 120 50 'TEST bac vert')")|$(val "d['pesees'][0]['deja_recue']")|$(pesee "$CE" "$(p2 1 240 50 'TEST bac vert')")|$(erreur_contient 'a déjà servi')|$(pesee "$CE" "$(p2 2 120 50 'TEST bac vert')")|$(pesee "$CE" "$(p2 1 120 60 'TEST bac vert')")|$(pesee "$CE" "$(p2 1 120 50 'TEST bac bleu')")|$(sql "SELECT count(*) FROM pesees_campagne WHERE cle_envoi = 'portail:$K2'")"
appel POST "/campagnes-pesee/pesees/$(sql "SELECT id FROM pesees_campagne WHERE cle_envoi = 'portail:$K2'")/annuler" "$T_A" '{"motif":"TEST pesée d essai des clés"}' >/dev/null
[ "$(sql "SELECT statut FROM pesees_campagne WHERE cle_envoi = 'portail:$K2'")" = annulee ] || { echo "La pesée d'essai des clés n'a pas pu être annulée" >&2; exit 1; }

# Les ménages, dans l'ordre du jeu (le code M-001… est posé par la base) : deux
# sacs le même jour pour l'un, des pesées de deux jours pour un autre, et un
# ménage inscrit qui n'est jamais pesé.
N_MEN=$(python3 -c "import json;print(len(json.load(open('$JEU', encoding='utf-8'))['menages']))")
N_PM=$(python3 -c "import json;print(sum(len(m['pesees']) for m in json.load(open('$JEU', encoding='utf-8'))['menages']))")
python3 - "$JEU" > "$T/menages.txt" <<'PY'
import json, sys
for m in json.load(open(sys.argv[1], encoding="utf-8"))["menages"]:
    print(f'{m["rang"]}\t{json.dumps({"habitants": m["habitants"], "trancheRevenu": m["tranche"]})}\t{json.dumps(m["pesees"])}')
PY
ok_menages=0; ok_pm=0
while IFS="$(printf '\t')" read -r rang corps pes; do
  [ "$(appel POST "/campagnes-pesee/$CM/menages" "$T_A" "$corps")" = 201 ] && ok_menages=$((ok_menages+1))
  M=$(val "d['id']")
  for ligne in $(python3 -c "import json;[print(f'{p[\"jour\"]}:{p[\"poids\"]}:{p[\"duree\"]}') for p in json.loads('''$pes''')]"); do
    j=${ligne%%:*}; reste=${ligne#*:}; poids=${reste%%:*}; duree=${reste#*:}
    [ "$(pesee "$CM" "{\"menageId\":\"$M\",\"date\":\"$(jour_de "$j")\",\"poidsKg\":$poids,\"dureeJours\":$duree,\"cle\":\"$(cle)\"}")" = 201 ] && ok_pm=$((ok_pm+1))
  done
done < "$T/menages.txt"
chk "$N_MEN ménages (codes M-001 à M-$(printf '%03d' "$N_MEN"), posés par la base) et leurs $N_PM pesées" "$N_MEN|M-001,M-$(printf '%03d' "$N_MEN")|$N_PM" \
  "$ok_menages|$(sql "SELECT min(code) || ',' || max(code) FROM menages_echantillon WHERE campagne_id = '$CM'")|$ok_pm"
M1=$(sql "SELECT id FROM menages_echantillon WHERE campagne_id = '$CM' AND rang = 1")
chk "une pesée de ménage ne porte ni contenant ni volume : 400" 400 \
  "$(pesee "$CM" "{\"menageId\":\"$M1\",\"date\":\"$(jour_de 2)\",\"poidsKg\":2,\"dureeJours\":1,\"contenant\":\"TEST sac de M. X\",\"cle\":\"$(cle)\"}")"
chk "la FNCT ne lit pas l'échantillon (403), ni en base les ménages et leurs pesées" "403|0|0" \
  "$(appel GET "/campagnes-pesee/$CM/menages" "$T_F")|$(vu super_admin_fnct "$ID_F" "" "(SELECT count(*) FROM menages_echantillon WHERE campagne_id = '$CM')")|$(vu super_admin_fnct "$ID_F" "" "(SELECT count(*) FROM pesees_campagne WHERE campagne_id = '$CM')")"
chk "un prestataire ne lit aucune campagne (403)" 403 "$(appel GET "/campagnes-pesee?communeId=$A" "$T_P")"

# -----------------------------------------------------------------------------
echo
echo "3 bis. Une campagne hors du périmètre est introuvable"
PX=$(sql "SELECT id FROM pesees_campagne WHERE campagne_id = '$CE' AND statut = 'valide' ORDER BY created_at LIMIT 1")
case "$PX" in *-*-*-*-*) ;; *) echo "Aucune pesée valide dans la campagne des établissements" >&2; exit 1 ;; esac
chk "le directeur de B : la campagne de A, ses pesées, ses ménages — introuvables (404, 404, 404)" "404|404|404" \
  "$(appel GET "/campagnes-pesee/$CE" "$T_B")|$(appel GET "/campagnes-pesee/$CE/pesees" "$T_B")|$(appel GET "/campagnes-pesee/$CM/menages" "$T_B")"
chk "le directeur de B : peser, clore (avec la bonne version), adopter, annuler une pesée de A — introuvables (404 chacun)" "404|404|404|404" \
  "$(appel POST "/campagnes-pesee/$CE/pesees" "$T_B" "{\"pesees\":[{\"commerceId\":\"$E_CAFE1\",\"date\":\"$(jour_de 10)\",\"poidsKg\":5,\"dureeJours\":1,\"cle\":\"$(cle)\"}]}")|$(appel POST "/campagnes-pesee/$CE/clore" "$T_B" "{\"version\":\"$(version_c "$CE")\"}")|$(appel POST "/campagnes-pesee/$CE/adopter" "$T_B" '{"categorie":"cafe"}')|$(appel POST "/campagnes-pesee/pesees/$PX/annuler" "$T_B" '{"motif":"TEST pas la mienne"}')"
chk "… et rien n'a bougé dans A : campagne ouverte, pesée valide, aucune pesée du jour 10" "ouverte|valide|0" \
  "$(sql "SELECT statut FROM campagnes_pesee WHERE id = '$CE'")|$(sql "SELECT statut FROM pesees_campagne WHERE id = '$PX'")|$(sql "SELECT count(*) FROM pesees_campagne WHERE campagne_id = '$CE' AND date_pesee = '$(jour_de 10)'")"
chk "les densités d'une commune au nom illisible (%00) : introuvable (404)" 404 "$(appel GET "/densites-assimiles?communeId=%00" "$T_A")"

# -----------------------------------------------------------------------------
echo
echo "4. La clôture : le calcul, comparé au témoin"
chk "les deux campagnes se closent ; le seuil national du jour est figé (10)" "200|close|10|200" \
  "$(appel POST "/campagnes-pesee/$CE/clore" "$T_A" "{\"version\":\"$(version_c "$CE")\"}")|$(val "d['statut']")|$(val "d['seuil_applique']")|$(appel POST "/campagnes-pesee/$CM/clore" "$T_A" "{\"version\":\"$(version_c "$CM")\"}")"
python3 tests/pesees_attendus.py "$JEU" > "$T/attendu.txt"
appel GET "/campagnes-pesee/$CE" "$T_A" >/dev/null; cp "$T/r.json" "$T/ce.json"
appel GET "/campagnes-pesee/$CM" "$T_A" >/dev/null; cp "$T/r.json" "$T/cm.json"
python3 - "$T/ce.json" "$T/cm.json" > "$T/obtenu.txt" <<'PY'
import json, sys
f = lambda x: "" if x is None else f"{x:.10g}"
lignes = []
for chemin, objet in ((sys.argv[1], "etablissements"), (sys.argv[2], "menages")):
    d = json.load(open(chemin, encoding="utf-8"))
    for r in d["resultats"]:
        etat = "masque" if r["masque"] else (("oui" if r["seuil_atteint"] else "non") if objet == "etablissements" else "visible")
        lignes.append("|".join(["R", objet, r["groupe"], r["sous_groupe"], r["indicateur"], str(r["n"]), f(r["q1"]), f(r["mediane"]), f(r["q3"]), etat]))
    for e in d["ecartes"]:
        lignes.append("|".join(["E", objet, e["groupe"], e["indicateur"], e["raison"], str(e["nombre"])]))
print("\n".join(sorted(lignes)))
PY
# Comparés ligne pour ligne : mêmes groupes, mêmes n, mêmes écartés ; les quartiles en
# écart RELATIF (1e-4), avec un plancher de 2e-6 : la base garde six décimales des
# mesures et des quartiles, le témoin calcule en flottant. Un écart absolu fixe
# n'éprouverait rien sur un ratio au m², qui vaut quelques centièmes.
compare() {
  python3 - "$T/attendu.txt" "$T/obtenu.txt" <<'PY'
import sys
a = [l.split("|") for l in open(sys.argv[1]).read().split("\n") if l]
o = [l.split("|") for l in open(sys.argv[2]).read().split("\n") if l]
ecarts = []
if len(a) != len(o):
    ecarts.append(f"{len(a)} lignes attendues, {len(o)} obtenues")
for x, y in zip(a, o):
    if x[0] != y[0] or len(x) != len(y):
        ecarts.append("|".join(x) + " ≠ " + "|".join(y)); continue
    if x[0] == "E":
        if x != y: ecarts.append("|".join(x) + " ≠ " + "|".join(y))
        continue
    egal = x[:6] == y[:6] and x[9] == y[9]
    for i in (6, 7, 8):
        if x[i] == "" or y[i] == "":
            egal = egal and x[i] == y[i]
        else:
            egal = egal and abs(float(x[i]) - float(y[i])) <= max(1e-4 * abs(float(x[i])), 2e-6)
    if not egal: ecarts.append("|".join(x) + " ≠ " + "|".join(y))
print("identiques" if not ecarts else " ; ".join(ecarts[:3]))
PY
}
chk "les résultats et les écartés sont ceux du témoin indépendant ($(wc -l < "$T/attendu.txt") lignes)" "identiques" "$(compare)"
chk "les ménages : une tranche de moins de 5 est masquée, sans quartile ; la FNCT lit les résultats par tranche" "True|None|200|3" \
  "$(python3 -c "import json;d=json.load(open('$T/cm.json'));r=[x for x in d['resultats'] if x['groupe']=='eleve'][0];print(r['masque'])")|$(python3 -c "import json;d=json.load(open('$T/cm.json'));r=[x for x in d['resultats'] if x['groupe']=='eleve'][0];print(r['mediane'])")|$(appel GET "/campagnes-pesee/$CM" "$T_F")|$(val "len(d['resultats'])")"
chk "… et jamais une valeur de ménage (aucune mesure rendue)" 0 "$(val "len(d['mesures'])")"
chk "la FNCT lit les vrais effectifs de la campagne de ménages ($N_MEN ménages, $N_PM pesées — jamais 0) et ses écartés comptés par raison" \
  "200|$N_MEN|$N_PM|aucune_pesee:1,une_seule_pesee:1" \
  "$(appel GET "/campagnes-pesee/$CM" "$T_F")|$(val "d['menages']")|$(val "d['pesees']")|$(val "','.join(sorted(e['raison'] + ':' + str(e['nombre']) for e in d['ecartes']))")"
compte_menages() { # rôle utilisateur commune — ménages|pesées de ménage|mesures de ménage lus en base
  echo "$(vu "$1" "$2" "$3" "(SELECT count(*) FROM menages_echantillon WHERE campagne_id = '$CM')")|$(vu "$1" "$2" "$3" "(SELECT count(*) FROM pesees_campagne WHERE campagne_id = '$CM')")|$(vu "$1" "$2" "$3" "(SELECT count(*) FROM mesures_campagne WHERE campagne_id = '$CM')")"
}
chk "en base, la FNCT ne lit aucune ligne de ménage (ménages, pesées, mesures) ; le directeur les lit toutes" "0|0|0|$N_MEN|$N_PM|$N_MEN" \
  "$(compte_menages super_admin_fnct "$ID_F" "")|$(compte_menages admin_commune "$ID_A" "$A")"
mesure() { # commerce indicateur — groupe:raison des mesures de cet établissement
  python3 -c "import json;d=json.load(open('$T/ce.json'));print(','.join(sorted(m['groupe'] + ':' + str(m['raison_ecart']) for m in d['mesures'] if m['commerce_id'] == '$1' and m['indicateur'] == '$2')))"
}
chk "l'atelier reclassé : écarté des trois indicateurs « categorie_modifiee », rangé sous la plus petite catégorie de ses pesées (boulangerie)" \
  "boulangerie:categorie_modifiee|boulangerie:categorie_modifiee|boulangerie:categorie_modifiee" \
  "$(mesure "$E_ATELIER" kg_jour_unite)|$(mesure "$E_ATELIER" kg_levee)|$(mesure "$E_ATELIER" kg_m3)"
chk "l'établissement d'un seul envoi : écarté du ratio par unité « echelle_modifiee » (l'instantané le voit), gardé pour la levée et la densité" \
  "superette:echelle_modifiee|superette:None|superette:None" \
  "$(mesure "$E_LOT" kg_jour_unite)|$(mesure "$E_LOT" kg_levee)|$(mesure "$E_LOT" kg_m3)"
chk "sans aucun volume : « sans_volume » et « sans_volume_ou_remplissage » ; un volume sans remplissage : levée gardée, densité écartée" \
  "superette:sans_volume|superette:sans_volume_ou_remplissage|superette:None|superette:sans_volume_ou_remplissage" \
  "$(mesure "$(idde superette4)" kg_levee)|$(mesure "$(idde superette4)" kg_m3)|$(mesure "$(idde superette5)" kg_levee)|$(mesure "$(idde superette5)" kg_m3)"

echo
echo "5. Une campagne close est figée"
chk "une pesée : 409 ; une annulation : 409 ; une modification : 409" "409|409|409" \
  "$(pesee "$CE" "{\"commerceId\":\"$E_CAFE1\",\"date\":\"$(jour_de 8)\",\"poidsKg\":5,\"dureeJours\":1,\"cle\":\"$(cle)\"}")|$(appel POST "/campagnes-pesee/pesees/$(sql "SELECT id FROM pesees_campagne WHERE campagne_id = '$CE' AND statut = 'valide' LIMIT 1")/annuler" "$T_A" '{"motif":"TEST trop tard"}')|$(appel PUT "/campagnes-pesee/$CE" "$T_A" "{\"version\":\"$(version_c "$CE")\",\"intitule\":\"TEST renommée\"}")"
chk "en base, les résultats ne s'écrivent pas" "permission denied" \
  "$(en_base admin_commune "$ID_A" "$A" "UPDATE resultats_campagne SET n = 99 WHERE campagne_id = '$CE'")"

# -----------------------------------------------------------------------------
echo
echo "6. Les densités"
chk "sous le seuil (les restaurants : 3) : rien à adopter, 409, qui le dit" "409|1" \
  "$(appel POST "/campagnes-pesee/$CE/adopter" "$T_A" '{"categorie":"restaurant"}')|$(erreur_contient 'sous le seuil')"
Q=$(python3 -c "import json;d=json.load(open('$T/ce.json'));r=[x for x in d['resultats'] if x['groupe']=='cafe' and x['indicateur']=='kg_m3'][0];print(f\"{r['q1']:.3f}|{r['q3']:.3f}\")")
chk "les cafés (12 au seuil) : adoptés, les quartiles pour bornes, du jour de la clôture" "201|$Q|campagne|$JOUR|commune" \
  "$(appel POST "/campagnes-pesee/$CE/adopter" "$T_A" '{"categorie":"cafe"}')|$(val "f\"{d['densite_min']:.3f}|{d['densite_max']:.3f}\"")|$(val "d['source']")|$(val "d['date_effet']")|$(val "d['portee']")"
D_CAFE=$(val "d['id']")
chk "… une seconde fois : 409" 409 "$(appel POST "/campagnes-pesee/$CE/adopter" "$T_A" '{"categorie":"cafe"}')"
chk "une densité saisie sans pièce : 400 ; nationale par une commune : 403 ; par la FNCT : 201" "400|403|201|nationale" \
  "$(appel POST "/densites-assimiles?communeId=$A" "$T_A" "{\"portee\":\"commune\",\"categorie\":\"hotel\",\"densiteMin\":80,\"densiteMax\":120,\"source\":\"tadaeem\",\"reference\":\"\",\"dateEffet\":\"$CONV_DEBUT\"}")|$(appel POST "/densites-assimiles?communeId=$A" "$T_A" "{\"portee\":\"nationale\",\"categorie\":\"hotel\",\"densiteMin\":80,\"densiteMax\":120,\"source\":\"tadaeem\",\"reference\":\"TEST guide, tableau 4\",\"dateEffet\":\"$CONV_DEBUT\"}")|$(appel POST /densites-assimiles "$T_F" "{\"portee\":\"nationale\",\"categorie\":\"hotel\",\"densiteMin\":80,\"densiteMax\":120,\"source\":\"tadaeem\",\"reference\":\"TEST guide, tableau 4\",\"dateEffet\":\"$CONV_DEBUT\"}")|$(val "d['portee']")"
D_NAT=$(val "d['id']")
chk "la commune lit ses densités et celles du pays (2) ; le directeur de B ne retire pas celle de A (404)" "2|404" \
  "$(appel GET "/densites-assimiles?communeId=$A" "$T_A" >/dev/null; val "len([x for x in d if x['retire_le'] is None])")|$(appel POST "/densites-assimiles/$D_CAFE/retirer" "$T_B" '{"motif":"TEST pas la mienne"}')"
chk "en base, une densité ne se réécrit pas" DENSITE_FIGEE \
  "$($PSQL -c "UPDATE densites_assimiles SET densite_max = 999 WHERE id = '$D_CAFE'" 2>&1 | grep -oE 'DENSITE_FIGEE' | head -1)"
densite_en_base() { # commune (NULL ou 'id') — l'instruction d'insertion d'une densité saisie
  echo "INSERT INTO densites_assimiles (commune_id, categorie_activite, densite_min, densite_max, source, reference, date_effet) VALUES ($1, 'hotel', 80, 120, 'tadaeem', 'TEST pièce en base', DATE '$CONV_DEBUT')"
}
chk "en base : le directeur ne pose pas une densité du pays (commune vide) ; la FNCT ne pose pas une densité de commune" "DENSITE_HORS_PERIMETRE|DENSITE_HORS_PERIMETRE" \
  "$(en_base admin_commune "$ID_A" "$A" "$(densite_en_base NULL)")|$(en_base super_admin_fnct "$ID_F" "" "$(densite_en_base "'$A'")")"
chk "une catégorie inconnue de la liste nationale : 400, qui le dit ; rien d'écrit" "400|1|0" \
  "$(appel POST "/densites-assimiles?communeId=$A" "$T_A" "{\"portee\":\"commune\",\"categorie\":\"piscine_test\",\"densiteMin\":80,\"densiteMax\":120,\"source\":\"tadaeem\",\"reference\":\"TEST guide, tableau 9\",\"dateEffet\":\"$CONV_DEBUT\"}")|$(erreur_contient 'pas une catégorie')|$(sql "SELECT count(*) FROM densites_assimiles WHERE categorie_activite = 'piscine_test'")"

# -----------------------------------------------------------------------------
echo
echo "7. Le tonnage estimé d'une convention"
appel POST "/grilles-tarifaires?communeId=$A" "$T_A" \
  "{\"intitule\":\"TEST Grille des pesées\",\"referenceArrete\":\"TEST-ARRETE-PES\",\"dateArrete\":\"$GRILLE_DEBUT\",\"dateEffet\":\"$GRILLE_DEBUT\",\"lignes\":[{\"categorie\":\"cafe\",\"mode\":\"reel_levee\",\"tarif\":2},{\"categorie\":\"hotel\",\"mode\":\"reel_levee\",\"tarif\":3}]}" >/dev/null
G_A=$(val "d['id']")
appel POST "/grilles-tarifaires/$G_A/approbation" "$T_A" "{\"dateApprobation\":\"$GRILLE_DEBUT\",\"reference\":\"TEST visa de la tutelle\",\"version\":\"$(sql "SELECT xmin FROM grilles_tarifaires WHERE id = '$G_A'")\"}" >/dev/null
$PSQL -c "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, date_effet, dangereux, provisoire, reference) VALUES
            ('flux_assimiles', 'test_cartons', 'TEST Cartons', 'كرتون', DATE '2000-01-01', false, true, 'TEST pesées'),
            ('flux_assimiles', 'test_verre', 'TEST Verre', 'بلور', DATE '2000-01-01', false, true, 'TEST pesées')" >/dev/null
signer() { # établissement lignes
  local id
  appel POST "/conventions?communeId=$A" "$T_A" "{\"commerceId\":\"$1\",\"dateDebut\":\"$CONV_DEBUT\",\"dateFin\":\"$CONV_FIN\",\"lignes\":$2}" >/dev/null
  id=$(val "d['id']")
  appel POST "/conventions/$id/instruire" "$T_A" "{\"version\":\"$(version_cv "$id")\"}" >/dev/null
  appel POST "/conventions/$id/signer" "$T_A" "{\"version\":\"$(version_cv "$id")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST dossier\"}" >/dev/null
  [ "$(val "d['statut']")" = signee ] && echo "$id"
}
E_C2=$(idde cafe02); E_H1=$(idde hotel1); E_C3=$(idde cafe03)
CV_C=$(signer "$E_C2" '[{"fluxCode":"test_cartons","leveesParSemaine":6,"volumeLitres":90},{"fluxCode":"test_verre","leveesParSemaine":2,"volumeLitres":30}]')
CV_H=$(signer "$E_H1" '[{"fluxCode":"test_cartons","leveesParSemaine":6,"volumeLitres":200}]')
CV_V=$(signer "$E_C3" '[{"fluxCode":"test_cartons","leveesParSemaine":6}]')
for c in "$CV_C" "$CV_H" "$CV_V"; do case "$c" in *-*-*-*-*) ;; *) echo "Une convention de départ n'a pas pu être signée" >&2; exit 1 ;; esac; done
C1=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage, actif, date_debut, voyages_par_jour) VALUES ('$A', 'TEST circuit des pesées', ARRAY[1,2,3,4,5,6,7]::smallint[], true, app.jour_tunis() - 60, 2) RETURNING id" | head -1)
P=$(sql "INSERT INTO points_collecte (circuit_id, commune_id, ordre, nom, type, geom) VALUES ('$C1', '$A', 1, 'TEST arrêt', 'point_de_collecte', ST_SetSRID(ST_MakePoint(10.0, 36.0), 4326)) RETURNING id" | head -1)
for e in "$E_C2" "$E_H1" "$E_C3"; do appel POST "/dessertes?communeId=$A" "$T_A" "{\"commerceId\":\"$e\",\"pointId\":\"$P\",\"dateDebut\":\"$CONV_DEBUT\"}" >/dev/null; done
[ "$(sql "SELECT count(*) FROM dessertes_commerces WHERE commune_id = '$A'")" = 3 ] || { echo "Les dessertes de départ n'ont pas pu être posées" >&2; exit 1; }
lev() { printf '{"commerceId":"%s","fluxCode":"%s","cle":"%s"}' "$1" "$2" "$(cle)"; }
appel POST /levees "$T_A" "{\"circuitId\":\"$C1\",\"date\":\"$JOUR\",\"voyage\":1,\"levees\":[$(lev "$E_C2" test_cartons),$(lev "$E_C2" test_verre),$(lev "$E_H1" test_cartons),$(lev "$E_C3" test_cartons)]}" >/dev/null
appel POST /levees "$T_A" "{\"circuitId\":\"$C1\",\"date\":\"$JOUR\",\"voyage\":2,\"levees\":[$(lev "$E_C2" test_cartons)]}" >/dev/null
[ "$(sql "SELECT count(*) FROM levees WHERE commune_id = '$A' AND statut = 'validee'")" = 5 ] || { echo "Les levées de départ n'ont pas pu être saisies" >&2; exit 1; }
tonnage() { # convention — « levées|sans volume|sans densité|kg min|kg max » du mois en cours
  appel GET "/conventions/$1" "$T_A" >/dev/null
  val "(lambda t, f: f\"{t['levees']}|{t['sans_volume']}|{t['sans_densite']}|{f(t['kg_min'])}|{f(t['kg_max'])}\")(d['tonnage_estime'][0], lambda x: 'None' if x is None else f'{x:.1f}')"
}
ATTENDU_C=$(python3 -c "q1,q3=[float(x) for x in '$Q'.split('|')];v=(90+30+90)/1000;print(f'3|0|0|{round(v*round(q1,3),1):.1f}|{round(v*round(q3,3),1):.1f}')")
chk "le café : 3 levées, densité de sa campagne × volume des termes, en fourchette, tous flux confondus" "$ATTENDU_C" "$(tonnage "$CV_C")"
# Une densité du pays pour les cafés, posée par la FNCT : la commune garde la sienne.
# (Table nationale : la ligne est retirée en partant, par le rendu ligne entière.)
chk "une densité nationale des cafés posée par la FNCT (201) : le café garde celle de sa commune" "201|$ATTENDU_C|commune|1" \
  "$(appel POST /densites-assimiles "$T_F" "{\"portee\":\"nationale\",\"categorie\":\"cafe\",\"densiteMin\":50,\"densiteMax\":60,\"source\":\"defaut\",\"reference\":\"TEST valeur nationale des cafés\",\"dateEffet\":\"$CONV_DEBUT\"}")|$(tonnage "$CV_C")|$(val "d['tonnage_estime'][0]['densites'][0]['portee']")|$(val "len(d['tonnage_estime'][0]['densites'])")"
chk "l'hôtel : la densité du pays, faute de densité de la commune (200 L × 80 à 120)" "1|0|0|16.0|24.0|nationale" \
  "$(tonnage "$CV_H")|$(val "d['tonnage_estime'][0]['densites'][0]['portee']")"
chk "le café sans volume dans ses termes : non renseigné, jamais 0, et il le dit" "1|1|0|None|None" "$(tonnage "$CV_V")"
# Deux levées de la même convention, l'une d'un flux qui a un volume dans les termes,
# l'autre d'un flux qui n'en a pas : le total n'existe pas, et il dit pourquoi.
E_C4=$(idde cafe04)
CV_M=$(signer "$E_C4" '[{"fluxCode":"test_cartons","leveesParSemaine":6,"volumeLitres":90},{"fluxCode":"test_verre","leveesParSemaine":2}]')
case "$CV_M" in *-*-*-*-*) ;; *) echo "La convention à volume partiel n'a pas pu être signée" >&2; exit 1 ;; esac
appel POST "/dessertes?communeId=$A" "$T_A" "{\"commerceId\":\"$E_C4\",\"pointId\":\"$P\",\"dateDebut\":\"$CONV_DEBUT\"}" >/dev/null
appel POST /levees "$T_A" "{\"circuitId\":\"$C1\",\"date\":\"$JOUR\",\"voyage\":1,\"levees\":[$(lev "$E_C4" test_cartons),$(lev "$E_C4" test_verre)]}" >/dev/null
[ "$(sql "SELECT count(*) FROM levees WHERE convention_id = '$CV_M' AND statut = 'validee'")" = 2 ] || { echo "Les levées de la convention à volume partiel n'ont pas pu être saisies" >&2; exit 1; }
chk "deux levées, une seule avec un volume dans ses termes : 2 levées, 1 sans volume, aucun total (jamais la moitié)" "2|1|0|None|None" "$(tonnage "$CV_M")"
appel POST "/densites-assimiles/$D_NAT/retirer" "$T_F" '{"motif":"TEST valeur saisie à tort"}' >/dev/null
chk "la densité du pays retirée (avec son motif) : l'hôtel n'a plus de densité, non renseigné" "1|0|1|None|None" "$(tonnage "$CV_H")"
# Une densité de la commune qui ne vaut qu'à partir de demain : la levée d'aujourd'hui
# ne la prend pas — elle prend celle du pays s'il y en a une, sinon elle n'en a pas.
chk "une densité de la commune datée de demain (201) : la levée d'aujourd'hui reste sans densité" "201|1|0|1|None|None" \
  "$(appel POST "/densites-assimiles?communeId=$A" "$T_A" "{\"portee\":\"commune\",\"categorie\":\"hotel\",\"densiteMin\":150,\"densiteMax\":160,\"source\":\"tadaeem\",\"reference\":\"TEST guide, tableau 5\",\"dateEffet\":\"$DEMAIN\"}")|$(tonnage "$CV_H")"
chk "… une densité du pays posée ensuite (201) : la levée d'aujourd'hui prend celle du pays (200 L × 90 à 110), pas celle de demain" "201|1|0|0|18.0|22.0|nationale" \
  "$(appel POST /densites-assimiles "$T_F" "{\"portee\":\"nationale\",\"categorie\":\"hotel\",\"densiteMin\":90,\"densiteMax\":110,\"source\":\"tadaeem\",\"reference\":\"TEST guide, tableau 4 révisé\",\"dateEffet\":\"$CONV_DEBUT\"}")|$(tonnage "$CV_H")|$(val "d['tonnage_estime'][0]['densites'][0]['portee']")"

# -----------------------------------------------------------------------------
echo
echo "8. L'import d'un export Kobo de pesées"
corps() { # sortie fichier nom [JSON en plus]
  python3 - "$@" <<'PY'
import base64, json, sys
sortie, source, nom = sys.argv[1], sys.argv[2], sys.argv[3]
extra = json.loads(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else {}
d = {"nomFichier": nom, "contenu": base64.b64encode(open(source, "rb").read()).decode()}
d.update(extra)
json.dump(d, open(sortie, "w"), ensure_ascii=False)
PY
}
campagne etablissements "TEST Campagne importée" >/dev/null
CI=$(val "d['id']")
case "$CI" in *-*-*-*-*) ;; *) echo "La campagne d'import n'a pas pu être créée" >&2; exit 1 ;; esac
D3=$(jour_de 3)
printf 'date;matricule;poids;duree_heures;volume;remplissage;_uuid\n%s;7654301A;12,5;12;120;50;k-0001\n%s;TEST Café pesé 02;3;24;;;k-0002\n%s;7654303A;1.250;24;;;k-0003\n%s;7654304A;4;;;;k-0004\n' "$D3" "$D3" "$D3" "$D3" > "$T/kobo.csv"
CORR='{"date":"date","etablissement":"matricule","poids":"poids","duree_heures":"duree_heures","volume":"volume","remplissage":"remplissage","cle":"_uuid"}'
corps "$T/c.json" "$T/kobo.csv" "kobo_pesees.csv"
corps "$T/v0.json" "$T/kobo.csv" "kobo_pesees.csv" "{\"correspondance\":$CORR}"
corps "$T/v1.json" "$T/kobo.csv" "kobo_pesees.csv" "{\"correspondance\":$CORR,\"valider\":true}"
corps "$T/v2.json" "$T/kobo.csv" "kobo_pesees.csv" '{"correspondance":{"date":"date","etablissement":"matricule","poids":"poids","duree_jours":"duree_heures","duree_heures":"duree_heures","cle":"_uuid"}}'
chk "une campagne en brouillon n'importe rien : 409 ; la FNCT n'importe pas : 403" "409|403" \
  "$(envoi "/campagnes-pesee/$CI/import" "$T_A" "$T/v0.json")|$(envoi "/campagnes-pesee/$CI/import" "$T_F" "$T/v0.json")"
appel POST "/campagnes-pesee/$CI/ouvrir" "$T_A" "{\"version\":\"$(version_c "$CI")\"}" >/dev/null
chk "les colonnes proposées (date, matricule, poids, durée en heures, clé)" "200|date|matricule|poids|duree_heures|_uuid" \
  "$(envoi "/campagnes-pesee/$CI/import/colonnes" "$T_A" "$T/c.json")|$(val "d['correspondance']['date']")|$(val "d['correspondance']['etablissement']")|$(val "d['correspondance']['poids']")|$(val "d['correspondance']['duree_heures']")|$(val "d['correspondance']['cle']")"
chk "une durée en jours ET en heures : 400" "400|1" "$(envoi "/campagnes-pesee/$CI/import" "$T_A" "$T/v2.json")|$(erreur_contient 'OU en heures')"
chk "l'aperçu : une ligne à enregistrer (12 heures = 0,5 jour), le nom, le nombre ambigu et la durée absente refusés" "200|1|3|0.5|1|1|1" \
  "$(envoi "/campagnes-pesee/$CI/import" "$T_A" "$T/v0.json")|$(val "d['resume']['enregistrer']")|$(val "d['resume']['erreur']")|$(val "d['lignes'][0]['duree_jours']")|$(val "1 if 'pas à son nom' in d['lignes'][1]['erreurs'][0] else 0")|$(val "1 if 'aussi bien' in d['lignes'][2]['erreurs'][0] else 0")|$(val "1 if 'durée couverte absente' in d['lignes'][3]['erreurs'][0] else 0")"
chk "la validation : une pesée, source kobo, sa ligne et son journal" "201|1|kobo|2|1" \
  "$(envoi "/campagnes-pesee/$CI/import" "$T_A" "$T/v1.json")|$(val "d['enregistrees']")|$(sql "SELECT source FROM pesees_campagne WHERE campagne_id = '$CI'")|$(sql "SELECT import_ligne FROM pesees_campagne WHERE campagne_id = '$CI'")|$(sql "SELECT count(*) FROM imports_pesees WHERE campagne_id = '$CI'")"
chk "le même fichier : déjà reçue, rien à enregistrer (400)" "200|1|400" \
  "$(envoi "/campagnes-pesee/$CI/import" "$T_A" "$T/v0.json")|$(val "d['resume']['deja_recue']")|$(envoi "/campagnes-pesee/$CI/import" "$T_A" "$T/v1.json")"

ENTETE='date;matricule;poids;duree_heures;volume;remplissage;_uuid'
kobo() { # nom lignes… — l'aperçu (valider: false) ou l'écriture (KOBO_VALIDER=true) ; code HTTP
  local nom=$1; shift
  { echo "$ENTETE"; printf '%s\n' "$@"; } > "$T/$nom.csv"
  corps "$T/$nom.json" "$T/$nom.csv" "$nom.csv" "{\"correspondance\":$CORR,\"valider\":${KOBO_VALIDER:-false}}"
  envoi "/campagnes-pesee/$CI/import" "$T_A" "$T/$nom.json"
}
ligne_contient() { val "1 if '$2' in ' '.join(d['lignes'][$1]['erreurs']) else 0"; }
D4=$(jour_de 4); D5=$(jour_de 5); D6=$(jour_de 6)
N_CI=$(sql "SELECT count(*) FROM pesees_campagne WHERE campagne_id = '$CI'")
chk "« UUID:K-0001 » est la clé « k-0001 » : déjà reçue ; la même pesée sous une autre clé : doublon probable, jamais ajoutée" "200|deja_recue|erreur|1" \
  "$(kobo cles "$D3;7654301A;12,5;12;120;50;UUID:K-0001" "$D3;7654301A;12,5;12;120;50;k-0099")|$(val "d['lignes'][0]['action']")|$(val "d['lignes'][1]['action']")|$(ligne_contient 1 'doublon probable')"
chk "la soumission k-0001 modifiée après coup (autre volume ; autre durée) : refusée « avec un autre contenu »" "200|erreur|1|200|erreur|1" \
  "$(kobo modif_volume "$D3;7654301A;12,5;12;240;50;k-0001")|$(val "d['lignes'][0]['action']")|$(ligne_contient 0 'avec un autre contenu')|$(kobo modif_duree "$D3;7654301A;12,5;24;120;50;uuid:k-0001")|$(val "d['lignes'][0]['action']")|$(ligne_contient 0 'avec un autre contenu')"
chk "trop de décimales (remplissage 0,04 ; poids 2,0005) et un 2.375 écrit en texte dans un CSV : erreurs de ligne, qui le disent" "200|1|1|1|3" \
  "$(kobo decimales "$D4;7654305A;3;24;120;0,04;k-0030" "$D4;7654306A;2,0005;24;;;k-0031" "$D4;7654307A;2.375;24;;;k-0032")|$(ligne_contient 0 'remplissage « 0,04 » : 1 décimale au plus')|$(ligne_contient 1 'poids « 2,0005 » : 3 décimales au plus')|$(ligne_contient 2 'aussi bien')|$(val "d['resume']['erreur']")"
# La colonne de la clé, changée après un premier import de la campagne.
printf '%s;meta/instanceID\n%s;7654304A;3;24;;;k-0040;uuid:k-0040\n' "$ENTETE" "$D4" > "$T/autre_cle.csv"
corps "$T/autre_cle.json" "$T/autre_cle.csv" "autre_cle.csv" '{"correspondance":{"date":"date","etablissement":"matricule","poids":"poids","duree_heures":"duree_heures","volume":"volume","remplissage":"remplissage","cle":"meta/instanceID"}}'
chk "une autre colonne de clé que celle du premier import : 409, « gardez cette colonne »" "409|1" \
  "$(envoi "/campagnes-pesee/$CI/import" "$T_A" "$T/autre_cle.json")|$(erreur_contient 'gardez cette colonne')"
# Un classeur dont le poids est une cellule NUMÉRIQUE 2.375 : Excel n'y met jamais de milliers.
python3 - "$T/numerique.xlsx" "$D4" <<'PY'
import sys, zipfile
sortie, jour = sys.argv[1], sys.argv[2]
ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
t = lambda r, v: f'<c r="{r}" t="inlineStr"><is><t>{v}</t></is></c>'
n = lambda r, v: f'<c r="{r}"><v>{v}</v></c>'
entetes = ["date", "matricule", "poids", "duree_heures", "volume", "remplissage", "_uuid"]
rows = ('<row r="1">' + "".join(t(f"{chr(65 + i)}1", e) for i, e in enumerate(entetes)) + '</row>'
        + '<row r="2">' + t("A2", jour) + t("B2", "7654308A") + n("C2", "2.375") + n("D2", "24") + t("G2", "x-0050") + '</row>')
with zipfile.ZipFile(sortie, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    z.writestr('xl/workbook.xml', f'<?xml version="1.0"?><workbook {ns}><sheets><sheet name="Pesees" sheetId="1" r:id="rId1"/></sheets></workbook>')
    z.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="ws"/></Relationships>')
    z.writestr('xl/worksheets/sheet1.xml', f'<?xml version="1.0"?><worksheet {ns}><sheetData>{rows}</sheetData></worksheet>')
PY
corps "$T/numerique.json" "$T/numerique.xlsx" "kobo_pesees.xlsx" "{\"correspondance\":$CORR}"
chk "un classeur dont le poids est la cellule numérique 2.375 : lu 2,375 kg, à enregistrer (jamais « ambigu »)" "200|enregistrer|2.375|0" \
  "$(envoi "/campagnes-pesee/$CI/import" "$T_A" "$T/numerique.json")|$(val "d['lignes'][0]['action']")|$(val "d['lignes'][0]['poids_kg']")|$(val "len(d['lignes'][0]['erreurs'])")"
chk "aucun de ces aperçus n'a rien écrit" "$N_CI" "$(sql "SELECT count(*) FROM pesees_campagne WHERE campagne_id = '$CI'")"

# La durée d'une pesée ANNULÉE ne bloque plus la pesée juste du même jour.
chk "une pesée importée sur deux jours (48 h) : enregistrée" "201|1" \
  "$(KOBO_VALIDER=true kobo deux_jours "$D5;7654302A;4;48;;;k-0010")|$(val "d['enregistrees']")"
P_48=$(sql "SELECT id FROM pesees_campagne WHERE campagne_id = '$CI' AND cle_envoi = 'kobo:k-0010'")
appel POST "/campagnes-pesee/pesees/$P_48/annuler" "$T_A" '{"motif":"TEST durée saisie à tort"}' >/dev/null
[ "$(sql "SELECT statut FROM pesees_campagne WHERE id = '$P_48'")" = annulee ] || { echo "La pesée de 48 h n'a pas pu être annulée" >&2; exit 1; }
chk "annulée, puis l'export de nouveau : l'ancienne ligne déjà reçue, la soumission corrigée (24 h, même jour) à enregistrer" "200|deja_recue|enregistrer" \
  "$(kobo corrige "$D5;7654302A;4;48;;;k-0010" "$D5;7654302A;3;24;;;k-0011")|$(val "d['lignes'][0]['action']")|$(val "d['lignes'][1]['action']")"
chk "… la validation l'écrit : une seule pesée valide ce jour-là, d'un jour" "201|1|1|1" \
  "$(KOBO_VALIDER=true kobo corrige "$D5;7654302A;4;48;;;k-0010" "$D5;7654302A;3;24;;;k-0011")|$(val "d['enregistrees']")|$(sql "SELECT count(*) FROM pesees_campagne WHERE campagne_id = '$CI' AND commerce_id = '$E_C2' AND date_pesee = '$D5' AND statut = 'valide'")|$(sql "SELECT trim_scale(duree_jours) FROM pesees_campagne WHERE campagne_id = '$CI' AND cle_envoi = 'kobo:k-0011'")"

# Un remplissage en fraction dans un export : une erreur sur sa ligne, dès l'aperçu ;
# la ligne juste du même fichier s'enregistre (la base, elle, refuserait le lot entier).
N_CI=$(sql "SELECT count(*) FROM pesees_campagne WHERE campagne_id = '$CI'")
N_IMP=$(sql "SELECT count(*) FROM imports_pesees WHERE campagne_id = '$CI'")
chk "un remplissage « 0,5 » dans un export : l'aperçu le refuse sur sa ligne (il dit d'écrire un pourcentage), la ligne juste est à enregistrer" "200|erreur|True|enregistrer" \
  "$(kobo fraction "$D6;7654309A;3;24;120;0,5;k-0060" "$D6;7654310A;3;24;120;50;k-0061")|$(val "d['lignes'][0]['action']")|$(val "any('en pourcentage' in e for e in d['lignes'][0]['erreurs'])")|$(val "d['lignes'][1]['action']")"
chk "… la validation n'écrit que la ligne juste : une pesée et un journal de plus, la fraction absente" "201|1|$((N_CI + 1))|$((N_IMP + 1))|0" \
  "$(KOBO_VALIDER=true kobo fraction "$D6;7654309A;3;24;120;0,5;k-0060" "$D6;7654310A;3;24;120;50;k-0061")|$(val "d['enregistrees']")|$(sql "SELECT count(*) FROM pesees_campagne WHERE campagne_id = '$CI'")|$(sql "SELECT count(*) FROM imports_pesees WHERE campagne_id = '$CI'")|$(sql "SELECT count(*) FROM pesees_campagne WHERE campagne_id = '$CI' AND cle_envoi = 'kobo:k-0060'")"

# -----------------------------------------------------------------------------
echo
base_reelle_intacte "pendant la campagne"
rendre_tables_nationales
nettoyer
chk "en partant : communes, campagnes, densités de test et comptes effacés" "0|0|0|0" \
  "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM campagnes_pesee WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM densites_assimiles WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"
tables_nationales_rendues "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
