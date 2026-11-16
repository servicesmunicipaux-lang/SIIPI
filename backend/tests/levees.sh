#!/usr/bin/env bash
# =============================================================================
# v0.15.97 — jalon G, lot G5a : les dessertes et les levées des établissements
# (SPEC_G § 3.5 ; décisions du 12 novembre 2026, G5 n° 1 à 6 ; migration 105).
#
# Elle commence par ce qui est REFUSÉ :
#   - une desserte posée par la FNCT, par un prestataire, par le directeur d'une
#     autre commune ; sur un repère de tournée, sur un point d'une autre commune,
#     avant le début du circuit, pour un établissement fermé, par-dessus une autre ;
#   - une levée écrite par la FNCT, hors du périmètre, datée de demain, pour un
#     établissement sans desserte ce jour-là, sans convention (et celle du registre
#     d'avant le jalon G le dit), d'un flux hors des termes, d'un voyage que le
#     circuit ne fait pas, sur un autre circuit que celui de la desserte ; un lot dont
#     une ligne est fausse (rien n'est écrit) ; une clé réutilisée ; deux fois la
#     même levée ; une écriture directe en base ;
#   - pour le prestataire : ce qui n'est pas sur sa feuille (introuvable, jamais
#     « sans convention »), une date d'avant son contrat, le registre et les
#     dessertes de la commune, un contrat échu ;
#   - la validation d'une levée déjà instruite, un écart ou une annulation sans
#     motif, la clôture d'une desserte avant une levée, le retrait d'une desserte qui
#     a servi, une version dépassée.
# Puis la feuille du jour (commune, FNCT, prestataire), la saisie validée d'emblée,
# l'envoi rejoué (« déjà reçu »), les propositions validées et écartées,
# l'annulation, le point retiré (desserte « à clôturer »), et le constat : une levée
# qu'un circuit écourté ou une résiliation laissent hors de sa desserte ou de sa
# convention est « à revoir », jamais corrigée. Les dates se comptent depuis le jour.
#
#   docker compose exec -T api npm run test:levees
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_lev_a; B=test_lev_b
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
appel() { # méthode chemin jeton [corps] — code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" ${3:+-H "Authorization: Bearer $3"} \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
erreur_contient() { val "1 if '$1' in d.get('error','') else 0"; }
en_base() { # rôle utilisateur commune instruction — le refus de la base, ou « ok »
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            SET LOCAL ROLE siipi_app; $4; ROLLBACK;" 2>&1 \
    | grep -oE '^ERROR: +[A-Z_]+(:|$)|permission denied|violates row-level security|violates (check|unique) constraint "[a-z_]+"' | head -1 \
    | sed -E 's/^ERROR: +//; s/:$//; s/violates (check|unique) constraint "([a-z_]+)"/\2/' | grep . || echo ok
}
vu() { # rôle utilisateur commune requête de comptage — ce que le compte voit en base
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            SET LOCAL ROLE siipi_app; SELECT 'vu:' || ($4); ROLLBACK;" 2>&1 | grep -oE '^vu:.*' | cut -d: -f2
}
version_cv() { sql "SELECT xmin FROM conventions_commerciales WHERE id = '$1'"; }
version_d() { sql "SELECT xmin FROM dessertes_commerces WHERE id = '$1'"; }
cle() { python3 -c "import uuid;print(uuid.uuid4())"; }
lot() { # circuit date voyage levées(JSON) — le corps d'un lot de la feuille
  printf '{"circuitId":"%s","date":"%s","voyage":%s,"levees":%s}' "$1" "$2" "$3" "$4"
}
levee() { # établissement flux clé
  printf '{"commerceId":"%s","fluxCode":"%s","cle":"%s"}' "$1" "$2" "$3"
}

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
garder_tables_nationales elements_listes_nationales
trap 'rendre_tables_nationales; nettoyer; rm -rf "$T" "$TABLES_NATIONALES_DIR"' EXIT
releve_base_reelle

commune_essai "$A" "TEST commune A des levées"
commune_essai "$B" "TEST commune B des levées"
compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_A=$COMPTE_ID
compte_temporaire admin_commune "$B" "Directeur B"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_B=$COMPTE_ID
compte_temporaire super_admin_fnct "" "FNCT des levées"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_F=$COMPTE_ID
# Le prestataire du circuit : rattaché à B, sous contrat avec A depuis vingt jours.
compte_temporaire gestionnaire_prestataire "$B" "Prestataire du circuit"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_P=$COMPTE_ID
# Un autre prestataire de A, sans circuit.
compte_temporaire gestionnaire_prestataire "$A" "Prestataire sans circuit"; T_Q=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_Q=$COMPTE_ID
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_F" ] && [ -n "$T_P" ] && [ -n "$T_Q" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }
contrat() { # [date_debut] [date_fin] — le contrat du prestataire du circuit avec A
  $PSQL -c "DELETE FROM utilisateur_communes WHERE user_id = '$ID_P' AND commune_id = '$A';
            INSERT INTO utilisateur_communes (user_id, commune_id, contrat_reference, date_debut, date_fin)
            VALUES ('$ID_P', '$A', 'TEST-CONTRAT-LEVEES', ${1:-NULL}, ${2:-NULL});" >/dev/null
}
contrat "(app.jour_tunis() - 20)"

JOUR=$(sql "SELECT app.jour_tunis()")
HIER=$(sql "SELECT app.jour_tunis() - 1")
AVANT_HIER=$(sql "SELECT app.jour_tunis() - 2")
J3=$(sql "SELECT app.jour_tunis() - 3")
DEMAIN=$(sql "SELECT app.jour_tunis() + 1")
J22=$(sql "SELECT app.jour_tunis() - 22")
D0=$(sql "SELECT app.jour_tunis() - 25")
VEILLE_D0=$(sql "SELECT app.jour_tunis() - 26")
DEBUT=$(sql "SELECT app.jour_tunis() - 30")
FIN=$(sql "SELECT ((app.jour_tunis() - 30) + interval '1 year')::date - 1")
ANC=$(sql "SELECT extract(year FROM app.jour_tunis())::int")
GRILLE_DEBUT="$((ANC - 2))-01-01"

$PSQL -c "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, date_effet, dangereux, provisoire, reference) VALUES
            ('flux_assimiles', 'test_cartons', 'TEST Cartons', 'كرتون', DATE '2000-01-01', false, true, 'TEST levées'),
            ('flux_assimiles', 'test_verre', 'TEST Verre', 'بلور', DATE '2000-01-01', false, true, 'TEST levées'),
            ('flux_assimiles', 'test_plastique', 'TEST Plastique', 'بلاستيك', DATE '2000-01-01', false, true, 'TEST levées')" >/dev/null
etab() { appel POST "/etablissements?communeId=$1" "$2" "$3" >/dev/null; val "d['id']"; }
E_CAFE=$(etab "$A" "$T_A" '{"nom":"TEST Café des Levées","categorieActivite":"cafe","matriculeFiscal":"7654324E"}')
E_HOTEL=$(etab "$A" "$T_A" '{"nom":"TEST Hôtel des Levées","categorieActivite":"hotel","matriculeFiscal":"7654325F"}')
E_BOUL=$(etab "$A" "$T_A" '{"nom":"TEST Boulangerie sans convention","categorieActivite":"boulangerie"}')
E_ECOLE=$(etab "$A" "$T_A" '{"nom":"TEST École sans desserte","categorieActivite":"ecole"}')
E_REG=$(etab "$A" "$T_A" '{"nom":"TEST Bureau du registre","categorieActivite":"bureau"}')
E_FERME=$(etab "$A" "$T_A" '{"nom":"TEST Atelier fermé","categorieActivite":"atelier"}')
E_B=$(etab "$B" "$T_B" '{"nom":"TEST Café de B","categorieActivite":"cafe"}')
for e in "$E_CAFE" "$E_HOTEL" "$E_BOUL" "$E_ECOLE" "$E_REG" "$E_FERME" "$E_B"; do
  case "$e" in *-*-*-*-*) ;; *) echo "Un établissement de départ n'a pas pu être inscrit" >&2; exit 1 ;; esac
done
appel POST "/etablissements/$E_FERME/statut" "$T_A" "{\"statut\":\"ferme\",\"date\":\"$DEBUT\",\"motif\":\"TEST fermeture constatée\"}" >/dev/null
[ "$(sql "SELECT statut FROM commerces WHERE id = '$E_FERME'")" = ferme ] || { echo "L'atelier n'a pas pu être fermé" >&2; exit 1; }

appel POST "/grilles-tarifaires?communeId=$A" "$T_A" \
  "{\"intitule\":\"TEST Grille des levées\",\"referenceArrete\":\"TEST-ARRETE-LEV\",\"dateArrete\":\"$GRILLE_DEBUT\",\"dateEffet\":\"$GRILLE_DEBUT\",\"lignes\":[{\"categorie\":\"cafe\",\"mode\":\"reel_levee\",\"tarif\":2},{\"categorie\":\"hotel\",\"mode\":\"reel_levee\",\"tarif\":3},{\"categorie\":\"ecole\",\"mode\":\"forfait_annuel\",\"tarif\":50}]}" >/dev/null
G_A=$(val "d['id']")
appel POST "/grilles-tarifaires/$G_A/approbation" "$T_A" \
  "{\"dateApprobation\":\"$GRILLE_DEBUT\",\"reference\":\"TEST visa de la tutelle\",\"version\":\"$(sql "SELECT xmin FROM grilles_tarifaires WHERE id = '$G_A'")\"}" >/dev/null
[ "$(sql "SELECT date_approbation_tutelle IS NOT NULL FROM grilles_tarifaires WHERE id = '$G_A'")" = t ] || { echo "La grille de A n'a pas pu être approuvée" >&2; exit 1; }
K=TEST-LEV-K1
$PSQL -c "INSERT INTO conteneurs (id, code, commune_id, type) VALUES ('$K', '$K', '$A', 'carton')" >/dev/null
[ "$(sql "SELECT count(*) FROM conteneurs WHERE id = '$K'")" = 1 ] || { echo "Le conteneur de départ n'a pas pu être posé" >&2; exit 1; }

signer_convention() { # établissement lignes(JSON) — l'identifiant, ou rien
  local id
  appel POST "/conventions?communeId=$A" "$T_A" "{\"commerceId\":\"$1\",\"dateDebut\":\"$DEBUT\",\"dateFin\":\"$FIN\",\"lignes\":$2}" >/dev/null
  id=$(val "d['id']")
  appel POST "/conventions/$id/instruire" "$T_A" "{\"version\":\"$(version_cv "$id")\"}" >/dev/null
  appel POST "/conventions/$id/signer" "$T_A" "{\"version\":\"$(version_cv "$id")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST dossier de départ\"}" >/dev/null
  [ "$(val "d['statut']")" = signee ] && echo "$id"
}
CV_CAFE=$(signer_convention "$E_CAFE" "[{\"fluxCode\":\"test_cartons\",\"leveesParSemaine\":3,\"conteneurId\":\"$K\"},{\"fluxCode\":\"test_verre\",\"leveesParSemaine\":1}]")
CV_HOTEL=$(signer_convention "$E_HOTEL" '[{"fluxCode":"test_cartons","leveesParSemaine":6}]')
CV_ECOLE=$(signer_convention "$E_ECOLE" '[{"fluxCode":"test_cartons","leveesParSemaine":2}]')
for c in "$CV_CAFE" "$CV_HOTEL" "$CV_ECOLE"; do
  case "$c" in *-*-*-*-*) ;; *) echo "Une convention signée de départ n'a pas pu être bâtie" >&2; exit 1 ;; esac
done
# Une ligne du registre d'avant le jalon G (posée comme la migration 103 les a gardées).
$PSQL -c "BEGIN; ALTER TABLE conventions_commerciales DISABLE TRIGGER trg_controler_convention;
          INSERT INTO conventions_commerciales (commune_id, commerce_id, type, date_debut, nature) VALUES ('$A', '$E_REG', 'collecte', DATE '$DEBUT', 'registre');
          ALTER TABLE conventions_commerciales ENABLE TRIGGER trg_controler_convention; COMMIT;" >/dev/null
[ "$(sql "SELECT count(*) FROM conventions_commerciales WHERE commerce_id = '$E_REG' AND nature = 'registre'")" = 1 ] || { echo "La ligne du registre n'a pas pu être posée" >&2; exit 1; }

# Les circuits : C1 (deux voyages) confié au prestataire, C2 en régie ; un circuit de B.
C1=$(sql "INSERT INTO circuits (commune_id, nom, code, jours_passage, actif, date_debut, voyages_par_jour, prestataire_id)
          VALUES ('$A', 'TEST circuit des levées', 'TLEV1', ARRAY[1,2,3,4,5,6,7]::smallint[], true, app.jour_tunis() - 60, 2, '$ID_P') RETURNING id" | head -1)
C2=$(sql "INSERT INTO circuits (commune_id, nom, code, jours_passage, actif, date_debut, voyages_par_jour)
          VALUES ('$A', 'TEST circuit en régie', 'TLEV2', ARRAY[1,2,3,4,5,6,7]::smallint[], true, app.jour_tunis() - 60, 1) RETURNING id" | head -1)
CB=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage, actif, date_debut)
          VALUES ('$B', 'TEST circuit de B', ARRAY[1,2,3,4,5,6,7]::smallint[], true, app.jour_tunis() - 60) RETURNING id" | head -1)
point() { # circuit commune ordre type nom
  sql "INSERT INTO points_collecte (circuit_id, commune_id, ordre, nom, type, geom)
       VALUES ('$1', '$2', $3, '$5', '$4', ST_SetSRID(ST_MakePoint(10.0, 36.0), 4326)) RETURNING id" | head -1
}
P1=$(point "$C1" "$A" 1 point_de_collecte TEST-arret-1)
P2=$(point "$C1" "$A" 2 point_de_collecte TEST-arret-2)
PCT=$(point "$C1" "$A" 3 centre_transfert TEST-centre)
P3=$(point "$C2" "$A" 1 porte_a_porte TEST-arret-regie)
PB=$(point "$CB" "$B" 1 point_de_collecte TEST-arret-B)
for x in "$C1" "$C2" "$CB" "$P1" "$P2" "$PCT" "$P3" "$PB"; do
  case "$x" in *-*-*-*-*) ;; *) echo "Un circuit ou un point de départ n'a pas pu être posé" >&2; exit 1 ;; esac
done
desserte() { # établissement point début [fin] — code HTTP ; le corps dans $T/r.json
  appel POST "/dessertes?communeId=$A" "$T_A" "{\"commerceId\":\"$1\",\"pointId\":\"$2\",\"dateDebut\":\"$3\"${4:+,\"dateFin\":\"$4\"}}"
}

# -----------------------------------------------------------------------------
echo
echo "1. Ce qui est refusé aux dessertes"
chk "la FNCT ne pose pas de desserte : 403" 403 \
  "$(appel POST "/dessertes?communeId=$A" "$T_F" "{\"commerceId\":\"$E_CAFE\",\"pointId\":\"$P1\",\"dateDebut\":\"$D0\"}")"
chk "un prestataire non plus : 403" 403 \
  "$(appel POST "/dessertes?communeId=$A" "$T_P" "{\"commerceId\":\"$E_CAFE\",\"pointId\":\"$P1\",\"dateDebut\":\"$D0\"}")"
chk "le directeur de B, dans A : introuvable (404)" 404 \
  "$(appel POST "/dessertes?communeId=$A" "$T_B" "{\"commerceId\":\"$E_CAFE\",\"pointId\":\"$P1\",\"dateDebut\":\"$D0\"}")"
chk "un repère de tournée (centre de transfert) n'est pas un arrêt : 400, qui le dit" "400|1" \
  "$(desserte "$E_CAFE" "$PCT" "$D0")|$(erreur_contient 'repère de tournée')"
chk "un point d'une autre commune : 400" "400|1" \
  "$(desserte "$E_CAFE" "$PB" "$D0")|$(erreur_contient 'existe pas (ou plus)')"
chk "avant le début du circuit : 400, qui donne sa période" "400|1" \
  "$(desserte "$E_CAFE" "$P1" "$(sql "SELECT app.jour_tunis() - 61")")|$(erreur_contient 'court du')"
chk "un établissement fermé : 409" "409|1" "$(desserte "$E_FERME" "$P1" "$D0")|$(erreur_contient 'fermé depuis')"
chk "en base, le directeur de B ne pose rien dans A" DESSERTE_HORS_PERIMETRE \
  "$(en_base admin_commune "$ID_B" "$B" "INSERT INTO dessertes_commerces (commune_id, commerce_id, point_id, date_debut) VALUES ('$A', '$E_CAFE', '$P1', DATE '$D0')")"
chk "rien n'a été posé" 0 "$(sql "SELECT count(*) FROM dessertes_commerces WHERE commune_id = '$A'")"

chk "les dessertes de départ se posent (café, hôtel, boulangerie, bureau du registre)" "201|201|201|201" \
  "$(desserte "$E_CAFE" "$P1" "$D0")|$(desserte "$E_HOTEL" "$P2" "$D0")|$(desserte "$E_BOUL" "$P1" "$D0")|$(desserte "$E_REG" "$P2" "$D0")"
D_CAFE=$(sql "SELECT id FROM dessertes_commerces WHERE commerce_id = '$E_CAFE'")
D_HOTEL=$(sql "SELECT id FROM dessertes_commerces WHERE commerce_id = '$E_HOTEL'")
D_BOUL=$(sql "SELECT id FROM dessertes_commerces WHERE commerce_id = '$E_BOUL'")
chk "le circuit est celui du point, posé par la base" "$C1" "$(sql "SELECT circuit_id FROM dessertes_commerces WHERE id = '$D_CAFE'")"
chk "une seconde desserte du café, qui chevauche : 409, qui nomme la première" "409|1" \
  "$(desserte "$E_CAFE" "$P3" "$JOUR")|$(erreur_contient 'TEST circuit des levées')"

# -----------------------------------------------------------------------------
echo
echo "2. Ce qui est refusé aux levées"
K1=$(cle); K2=$(cle)
chk "la FNCT n'écrit pas de levée : 403" 403 "$(appel POST /levees "$T_F" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_CAFE" test_cartons "$K1")]")")"
chk "le directeur de B, sur un circuit de A : introuvable (404)" 404 "$(appel POST /levees "$T_B" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_CAFE" test_cartons "$K1")]")")"
chk "une levée de demain : 400, qui le dit" "400|1" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$DEMAIN" 1 "[$(levee "$E_CAFE" test_cartons "$K1")]")")|$(erreur_contient "pas encore arrivé")"
chk "un établissement sans desserte : 409" "409|1" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_ECOLE" test_cartons "$K1")]")")|$(erreur_contient 'desservi par aucun circuit')"
chk "avant le début de sa desserte : 409" "409|1" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$VEILLE_D0" 1 "[$(levee "$E_CAFE" test_cartons "$K1")]")")|$(erreur_contient 'desservi par aucun circuit')"
chk "un établissement desservi sans convention : 409" "409|1" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_BOUL" test_cartons "$K1")]")")|$(erreur_contient 'aucune convention signée')"
chk "celui du registre d'avant le jalon G : 409, qui dit de le reprendre en convention" "409|1" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_REG" test_cartons "$K1")]")")|$(erreur_contient 'registre des conventions')"
chk "un flux hors des termes : 409" "409|1" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_CAFE" test_plastique "$K1")]")")|$(erreur_contient 'pas prévu pour')"
chk "un voyage que le circuit ne fait pas : 400" "400|1" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$HIER" 3 "[$(levee "$E_CAFE" test_cartons "$K1")]")")|$(erreur_contient 'voyage(s) par jour')"
chk "sur un autre circuit que celui de la desserte : 409" "409|1" \
  "$(appel POST /levees "$T_A" "$(lot "$C2" "$HIER" 1 "[$(levee "$E_CAFE" test_cartons "$K1")]")")|$(erreur_contient 'autre circuit')"
chk "un lot dont une ligne est fausse : 409, et rien n'est écrit" "409|0" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_CAFE" test_cartons "$K1"),$(levee "$E_BOUL" test_cartons "$K2")]")")|$(sql "SELECT count(*) FROM levees WHERE commune_id = '$A'")"
chk "en base, le directeur n'écrit pas la table : il passe par la fonction" "permission denied" \
  "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO levees (commune_id, commerce_id, circuit_id, flux_code, date_levee, voyage, source, cle_envoi) VALUES ('$A', '$E_CAFE', '$C1', 'test_cartons', DATE '$HIER', 1, 'portail', 'x')")"
chk "en base, la fonction refuse le directeur de B dans A" LEVEE_HORS_PERIMETRE \
  "$(en_base admin_commune "$ID_B" "$B" "SELECT * FROM app.enregistrer_levees('$A', 'portail', '[{\"n\":1,\"commerce\":\"$E_CAFE\",\"flux\":\"test_cartons\",\"jour\":\"$HIER\",\"voyage\":1,\"cle\":\"x\"}]'::jsonb)")"
chk "en base, la commune ne se fait pas passer pour le prestataire (source)" LEVEE_SOURCE \
  "$(en_base admin_commune "$ID_A" "$A" "SELECT * FROM app.enregistrer_levees('$A', 'prestataire', '[{\"n\":1,\"commerce\":\"$E_CAFE\",\"flux\":\"test_cartons\",\"jour\":\"$HIER\",\"voyage\":1,\"circuit\":\"$C1\",\"cle\":\"x\"}]'::jsonb)")"

echo
echo "3. Ce qui est refusé au prestataire"
chk "un prestataire sans ce circuit : introuvable (404)" 404 \
  "$(appel POST /levees "$T_Q" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_CAFE" test_cartons "$K1")]")")"
chk "un établissement sans convention, sur sa feuille : introuvable (404), jamais « sans convention »" "404|0" \
  "$(appel POST /levees "$T_P" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_BOUL" test_cartons "$K1")]")")|$(erreur_contient 'convention')"
chk "un établissement d'une autre commune : introuvable (404)" 404 \
  "$(appel POST /levees "$T_P" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_B" test_cartons "$K1")]")")"
chk "une date d'avant son contrat : 409, qui le dit" "409|1" \
  "$(appel POST /levees "$T_P" "$(lot "$C1" "$J22" 1 "[$(levee "$E_CAFE" test_cartons "$K1")]")")|$(erreur_contient 'contrat avec la commune commence')"
chk "le registre et les dessertes de la commune lui sont fermés : 403, 403" "403|403" \
  "$(appel GET "/levees?communeId=$A" "$T_P")|$(appel GET "/dessertes?communeId=$A" "$T_P")"
chk "il ne valide rien : 403" 403 "$(appel POST /levees/valider "$T_P" "{\"ids\":[\"$D_CAFE\"]}")"
chk "en base, le prestataire ne se fait pas passer pour la commune (source portail), même sous contrat" LEVEE_SOURCE \
  "$(en_base gestionnaire_prestataire "$ID_P" "$B" "SELECT * FROM app.enregistrer_levees('$A', 'portail', '[{\"n\":1,\"commerce\":\"$E_CAFE\",\"flux\":\"test_cartons\",\"jour\":\"$HIER\",\"voyage\":1,\"circuit\":\"$C1\",\"cle\":\"x\"}]'::jsonb)")"
chk "en base, sous contrat, il voit son circuit, mais ni les levées ni les dessertes" "1|0|0" \
  "$(vu gestionnaire_prestataire "$ID_P" "$B" "(SELECT count(*) FROM circuits WHERE id = '$C1')")|$(vu gestionnaire_prestataire "$ID_P" "$B" "(SELECT count(*) FROM levees WHERE commune_id = '$A')")|$(vu gestionnaire_prestataire "$ID_P" "$B" "(SELECT count(*) FROM dessertes_commerces WHERE commune_id = '$A')")"

# -----------------------------------------------------------------------------
echo
echo "4. La feuille du jour"
chk "la commune voit tout ce que le circuit dessert : 5 lignes (café ×2 flux, hôtel, boulangerie sans convention, bureau du registre)" "200|5|aucune|registre" \
  "$(appel GET "/levees/feuille?circuitId=$C1&date=$HIER" "$T_A")|$(val "len(d['lignes'])")|$(val "next(l['etat_convention'] for l in d['lignes'] if l['commerce_id']=='$E_BOUL')")|$(val "next(l['etat_convention'] for l in d['lignes'] if l['commerce_id']=='$E_REG')")"
chk "… le conteneur des termes, et les levées par semaine" "$K|3" \
  "$(val "next(l['conteneur_code'] for l in d['lignes'] if l['commerce_id']=='$E_CAFE' and l['flux_code']=='test_cartons')")|$(val "next(l['levees_par_semaine'] for l in d['lignes'] if l['commerce_id']=='$E_CAFE' and l['flux_code']=='test_cartons')")"
chk "le prestataire : ce qu'il peut proposer seulement (3 lignes), sans identifiant de convention" "200|3|True" \
  "$(appel GET "/levees/feuille?circuitId=$C1&date=$HIER" "$T_P")|$(val "len(d['lignes'])")|$(val "all(l['convention_id'] is None and l['etat_convention']=='convention' for l in d['lignes'])")"
chk "la FNCT lit la feuille ; le directeur de B et l'autre prestataire n'y trouvent rien (404)" "200|404|404" \
  "$(appel GET "/levees/feuille?circuitId=$C1&date=$HIER" "$T_F")|$(appel GET "/levees/feuille?circuitId=$C1&date=$HIER" "$T_B")|$(appel GET "/levees/feuille?circuitId=$C1&date=$HIER" "$T_Q")"

# -----------------------------------------------------------------------------
echo
echo "5. La saisie de la commune, l'envoi rejoué, les propositions"
LC1=$(cle); LC2=$(cle)
LOT="$(lot "$C1" "$HIER" 1 "[$(levee "$E_CAFE" test_cartons "$LC1"),$(levee "$E_CAFE" test_verre "$LC2")]")"
chk "la commune saisit deux levées du café : validées d'emblée, source portail" "201|validee,validee|False" \
  "$(appel POST /levees "$T_A" "$LOT")|$(val "','.join(l['statut'] for l in d['levees'])")|$(val "any(l['deja_recue'] for l in d['levees'])")"
chk "la base déduit la convention, le conteneur, la desserte et le point" "$CV_CAFE|$K|$D_CAFE|$P1|portail" \
  "$(sql "SELECT convention_id || '|' || conteneur_id || '|' || desserte_id || '|' || point_id || '|' || source FROM levees WHERE commerce_id = '$E_CAFE' AND flux_code = 'test_cartons'")"
chk "le même envoi rejoué (coupure réseau) : « déjà reçu », rien de créé" "201|True|2" \
  "$(appel POST /levees "$T_A" "$LOT")|$(val "all(l['deja_recue'] for l in d['levees'])")|$(sql "SELECT count(*) FROM levees WHERE commune_id = '$A'")"
chk "la même clé pour une autre levée : 409, rien n'est enregistré" "409|1|2" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_HOTEL" test_cartons "$LC1")]")")|$(erreur_contient 'a déjà servi')|$(sql "SELECT count(*) FROM levees WHERE commune_id = '$A'")"
chk "deux fois la même levée (même voyage, même jour), avec une autre clé : 409" "409|1" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_CAFE" test_cartons "$(cle)")]")")|$(erreur_contient 'déjà enregistrée')"
PH=$(cle)
chk "le prestataire propose l'hôtel, voyage 2 : proposée" "201|proposee" \
  "$(appel POST /levees "$T_P" "$(lot "$C1" "$HIER" 2 "[$(levee "$E_HOTEL" test_cartons "$PH")]")")|$(val "d['levees'][0]['statut']")"
LH=$(sql "SELECT id FROM levees WHERE commerce_id = '$E_HOTEL' AND date_levee = '$HIER' AND voyage = 2")
chk "sa proposition rejouée (coupure réseau) : « déjà reçue », rien de créé" "201|True|$LH|3" \
  "$(appel POST /levees "$T_P" "$(lot "$C1" "$HIER" 2 "[$(levee "$E_HOTEL" test_cartons "$PH")]")")|$(val "d['levees'][0]['deja_recue']")|$(val "d['levees'][0]['id']")|$(sql "SELECT count(*) FROM levees WHERE commune_id = '$A'")"
chk "la feuille du prestataire montre sa proposition" "proposee|prestataire" \
  "$(appel GET "/levees/feuille?circuitId=$C1&date=$HIER" "$T_P" >/dev/null; val "next(l['levees'][0]['statut'] for l in d['lignes'] if l['commerce_id']=='$E_HOTEL')")|$(val "next(l['levees'][0]['source'] for l in d['lignes'] if l['commerce_id']=='$E_HOTEL')")"
chk "la commune ne la double pas par une saisie : 409, qui dit de la valider" "409|1" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$HIER" 2 "[$(levee "$E_HOTEL" test_cartons "$(cle)")]")")|$(erreur_contient 'validez-la')"
PC=$(cle)
appel POST /levees "$T_P" "$(lot "$C1" "$HIER" 2 "[$(levee "$E_CAFE" test_cartons "$PC")]")" >/dev/null
LC=$(sql "SELECT id FROM levees WHERE commerce_id = '$E_CAFE' AND date_levee = '$HIER' AND voyage = 2")
chk "le registre de la commune : les propositions d'abord" "200|4|proposee,proposee" \
  "$(appel GET "/levees?communeId=$A" "$T_A")|$(val "len(d)")|$(val "','.join(l['statut'] for l in d[:2])")"
chk "le registre dit son total ; « jusqu'à hier » seul compte trente jours avant hier ; une période à l'envers : 400" "4|200|4|400" \
  "$(appel GET "/levees?communeId=$A" "$T_A" >/dev/null; val "d[0]['total']")|$(appel GET "/levees?communeId=$A&jusqua=$HIER" "$T_A")|$(val "len(d)")|$(appel GET "/levees?communeId=$A&depuis=$HIER&jusqua=$AVANT_HIER" "$T_A")"
chk "le directeur de B ne lit rien des levées de A ; la FNCT les lit" "0|4" \
  "$(appel GET "/levees?communeId=$A" "$T_B" >/dev/null; val "len(d)")|$(appel GET "/levees?communeId=$A" "$T_F" >/dev/null; val "len(d)")"
chk "la FNCT ne valide pas : 403 ; le directeur de B : introuvable (404)" "403|404" \
  "$(appel POST /levees/valider "$T_F" "{\"ids\":[\"$LH\"]}")|$(appel POST /levees/valider "$T_B" "{\"ids\":[\"$LH\"]}")"
chk "le directeur valide les deux propositions" "200|2|validee,validee" \
  "$(appel POST /levees/valider "$T_A" "{\"ids\":[\"$LH\",\"$LC\"]}")|$(val "d['validees']")|$(sql "SELECT string_agg(statut, ',') FROM levees WHERE id IN ('$LH', '$LC')")"
chk "… une seconde fois : 409, qui le dit" "409|1" \
  "$(appel POST /levees/valider "$T_A" "{\"ids\":[\"$LH\"]}")|$(erreur_contient 'plus une proposition')"
PJ=$(cle)
appel POST /levees "$T_P" "$(lot "$C1" "$JOUR" 1 "[$(levee "$E_HOTEL" test_cartons "$PJ")]")" >/dev/null
LJ=$(sql "SELECT id FROM levees WHERE commerce_id = '$E_HOTEL' AND date_levee = '$JOUR' AND voyage = 1")
chk "écarter sans motif : 400 ; avec : écartée, motif gardé" "400|200|ecartee|TEST bac non sorti" \
  "$(appel POST /levees/ecarter "$T_A" "{\"ids\":[\"$LJ\"],\"motif\":\"non\"}")|$(appel POST /levees/ecarter "$T_A" "{\"ids\":[\"$LJ\"],\"motif\":\"TEST bac non sorti\"}")|$(sql "SELECT statut FROM levees WHERE id = '$LJ'")|$($PSQL -c "SELECT motif_ecart FROM levees WHERE id = '$LJ'")"
chk "après un écart, la même levée peut être proposée de nouveau" "201|proposee" \
  "$(appel POST /levees "$T_P" "$(lot "$C1" "$JOUR" 1 "[$(levee "$E_HOTEL" test_cartons "$(cle)")]")")|$(val "d['levees'][0]['statut']")"
LJ2=$(sql "SELECT id FROM levees WHERE commerce_id = '$E_HOTEL' AND date_levee = '$JOUR' AND statut = 'proposee'")
LV=$(sql "SELECT id FROM levees WHERE commerce_id = '$E_CAFE' AND flux_code = 'test_verre'")
chk "annuler sans motif : 400 ; avec : annulée, et elle reste lisible" "400|200|annulee|TEST saisie en double" \
  "$(appel POST "/levees/$LV/annuler" "$T_A" '{"motif":"non"}')|$(appel POST "/levees/$LV/annuler" "$T_A" '{"motif":"TEST saisie en double"}')|$(val "d['statut']")|$(val "d['motif_annulation']")"
chk "… deux fois : 409 ; une proposition ne s'annule pas (elle s'écarte) : 409" "409|409" \
  "$(appel POST "/levees/$LV/annuler" "$T_A" '{"motif":"TEST encore une fois"}')|$(appel POST "/levees/$LJ2/annuler" "$T_A" '{"motif":"TEST pas une validée"}')"
chk "en base, une levée ne se réécrit pas, même par son propriétaire" LEVEE_FIGEE \
  "$($PSQL -c "UPDATE levees SET voyage = 2 WHERE id = '$LV'" 2>&1 | grep -oE 'LEVEE_FIGEE' | head -1)"
chk "l'audit garde chaque écriture des levées : 6 créations, 4 levées instruites (validées, écartée, annulée)" "6|4" \
  "$(sql "SELECT count(*) FILTER (WHERE operation = 'INSERT') || '|' || count(DISTINCT record_id) FILTER (WHERE operation = 'UPDATE' AND record_id IN ('$LH', '$LC', '$LJ', '$LV')) FROM audit_log WHERE table_name = 'levees' AND commune_id = '$A'")"

# -----------------------------------------------------------------------------
echo
echo "6. Les dessertes qui ont servi, le point retiré"
chk "clore la desserte du café avant sa dernière levée : 409, qui donne la date" "409|1" \
  "$(appel PUT "/dessertes/$D_CAFE" "$T_A" "{\"version\":\"$(version_d "$D_CAFE")\",\"dateFin\":\"$J3\"}")|$(erreur_contient 'au plus tôt')"
chk "la retirer : 409 (elle a servi, elle se clôt)" "409|1" \
  "$(appel DELETE "/dessertes/$D_CAFE?version=$(version_d "$D_CAFE")" "$T_A")|$(erreur_contient 'se clôt')"
chk "une version dépassée : 409" 409 "$(appel PUT "/dessertes/$D_CAFE" "$T_A" '{"version":"1","dateFin":null}')"
chk "la boulangerie, qui n'a servi à rien, se retire" "204|0" \
  "$(appel DELETE "/dessertes/$D_BOUL?version=$(version_d "$D_BOUL")" "$T_A")|$(sql "SELECT count(*) FROM dessertes_commerces WHERE id = '$D_BOUL' AND deleted_at IS NULL")"
chk "la FNCT lit les dessertes, ne les retire pas : 200, 403" "200|403" \
  "$(appel GET "/dessertes?communeId=$A" "$T_F")|$(appel DELETE "/dessertes/$D_CAFE?version=$(version_d "$D_CAFE")" "$T_F")"
# Le point de l'hôtel est retiré (réimport du circuit) : la desserte s'arrête ce jour-là.
appel DELETE "/circuits/$C1/points/$P2" "$T_A" >/dev/null
chk "le point retiré : la desserte de l'hôtel est « à clôturer », fin effective aujourd'hui" "a_cloturer|point_retire|$JOUR" \
  "$(appel GET "/dessertes?communeId=$A" "$T_A" >/dev/null; val "next(x['etat'] for x in d if x['id']=='$D_HOTEL')")|$(val "next(x['raison_fin'] for x in d if x['id']=='$D_HOTEL')")|$(val "next(x['fin_effective'] for x in d if x['id']=='$D_HOTEL')")"
chk "… la desserte suivante attend sa clôture : 409" 409 "$(desserte "$E_HOTEL" "$P3" "$DEMAIN")"
chk "la clôture au jour du retrait, puis la suivante le lendemain" "200|201" \
  "$(appel PUT "/dessertes/$D_HOTEL" "$T_A" "{\"version\":\"$(version_d "$D_HOTEL")\",\"dateFin\":\"$JOUR\"}")|$(desserte "$E_HOTEL" "$P3" "$DEMAIN")"
chk "la proposition du jour pour l'hôtel se valide encore (le jour du retrait compte)" "200|validee" \
  "$(appel POST /levees/valider "$T_A" "{\"ids\":[\"$LJ2\"]}")|$(sql "SELECT statut FROM levees WHERE id = '$LJ2'")"

# -----------------------------------------------------------------------------
echo
echo "7. Constater, ne pas corriger"
chk "rien à revoir pour l'instant" "None" \
  "$(appel GET "/levees?communeId=$A" "$T_A" >/dev/null; val "next(l['a_revoir'] for l in d if l['commerce_id']=='$E_CAFE' and l['flux_code']=='test_cartons' and l['date_levee']=='$HIER' and l['voyage']==1)")"
# Une proposition de l'hôtel, pour hier, attend sa décision pendant ce qui suit.
appel POST /levees "$T_P" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_HOTEL" test_cartons "$(cle)")]")" >/dev/null
LP=$(sql "SELECT id FROM levees WHERE commerce_id = '$E_HOTEL' AND date_levee = '$HIER' AND voyage = 1 AND statut = 'proposee'")
case "$LP" in *-*-*-*-*) ;; *) echo "La proposition d'attente n'a pas pu être faite" >&2; exit 1 ;; esac
# Le circuit est écourté après coup : la levée d'hier n'est plus dans sa desserte.
$PSQL -c "UPDATE circuits SET date_fin = DATE '$AVANT_HIER' WHERE id = '$C1'" >/dev/null
chk "le circuit écourté : la proposition d'hier ne se valide plus (409, qui le dit), elle reste proposée, « à revoir »" "409|1|proposee|LEVEE_SANS_DESSERTE" \
  "$(appel POST /levees/valider "$T_A" "{\"ids\":[\"$LP\"]}")|$(erreur_contient 'desservi par aucun circuit')|$(sql "SELECT statut FROM levees WHERE id = '$LP'")|$(appel GET "/levees?communeId=$A&statut=proposee" "$T_A" >/dev/null; val "next(l['a_revoir'] for l in d if l['id']=='$LP')")"
chk "le circuit écourté : la levée d'hier est « à revoir » (plus de desserte ce jour-là), toujours validée" "LEVEE_SANS_DESSERTE|validee" \
  "$(appel GET "/levees?communeId=$A" "$T_A" >/dev/null; val "next(l['a_revoir'] for l in d if l['commerce_id']=='$E_CAFE' and l['flux_code']=='test_cartons' and l['date_levee']=='$HIER' and l['voyage']==1)")|$(sql "SELECT statut FROM levees WHERE commerce_id = '$E_CAFE' AND flux_code = 'test_cartons' AND date_levee = '$HIER' AND voyage = 1")"
chk "… et la desserte du café dit qu'elle est à clôturer (circuit échu)" "a_cloturer|circuit_echu" \
  "$(appel GET "/dessertes?communeId=$A" "$T_A" >/dev/null; val "next(x['etat'] for x in d if x['id']=='$D_CAFE')")|$(val "next(x['raison_fin'] for x in d if x['id']=='$D_CAFE')")"
$PSQL -c "UPDATE circuits SET date_fin = NULL WHERE id = '$C1'" >/dev/null
chk "le circuit rétabli : plus rien à revoir (le constat se recalcule)" "None" \
  "$(appel GET "/levees?communeId=$A" "$T_A" >/dev/null; val "next(l['a_revoir'] for l in d if l['commerce_id']=='$E_CAFE' and l['flux_code']=='test_cartons' and l['date_levee']=='$HIER' and l['voyage']==1)")"
# Un avenant de l'hôtel signé aujourd'hui, avec effet d'avant-hier, affecte un conteneur
# aux cartons : les levées d'hier gardent ce que la base avait déduit (aucun conteneur).
appel POST "/conventions/$CV_HOTEL/avenants" "$T_A" "{\"dateEffet\":\"$AVANT_HIER\",\"lignes\":[{\"fluxCode\":\"test_cartons\",\"leveesParSemaine\":6,\"conteneurId\":\"$K\"}]}" >/dev/null
AV=$(val "d['id']")
appel POST "/conventions/avenants/$AV/instruire" "$T_A" "{\"version\":\"$(sql "SELECT xmin FROM avenants_convention WHERE id = '$AV'")\"}" >/dev/null
appel POST "/conventions/avenants/$AV/signer" "$T_A" "{\"version\":\"$(sql "SELECT xmin FROM avenants_convention WHERE id = '$AV'")\",\"dateSignature\":\"$JOUR\",\"referenceSignature\":\"TEST avenant du conteneur\"}" >/dev/null
[ "$(sql "SELECT statut FROM avenants_convention WHERE id = '${AV:-absent}'")" = signe ] || { echo "L'avenant de l'hôtel n'a pas pu être signé" >&2; exit 1; }
chk "l'avenant rétroactif : la levée validée d'hier est « à revoir » (termes changés), toujours validée, son conteneur inchangé" "LEVEE_A_REPROPOSER|validee|" \
  "$(appel GET "/levees?communeId=$A" "$T_A" >/dev/null; val "next(l['a_revoir'] for l in d if l['id']=='$LH')")|$(sql "SELECT statut FROM levees WHERE id = '$LH'")|$(sql "SELECT COALESCE(conteneur_id, '') FROM levees WHERE id = '$LH'")"
chk "… et la proposition d'hier ne se valide pas telle quelle : 409, qui le dit ; elle reste proposée" "409|1|proposee" \
  "$(appel POST /levees/valider "$T_A" "{\"ids\":[\"$LP\"]}")|$(erreur_contient 'ont changé depuis sa proposition')|$(sql "SELECT statut FROM levees WHERE id = '$LP'")"
# Une levée du café saisie aujourd'hui, puis sa convention résiliée à compter
# d'aujourd'hui (le premier jour sans convention) : la levée du jour est hors période.
chk "une levée du café saisie aujourd'hui" "201|validee" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$JOUR" 1 "[$(levee "$E_CAFE" test_cartons "$(cle)")]")")|$(val "d['levees'][0]['statut']")"
appel POST "/conventions/$CV_CAFE/resilier" "$T_A" "{\"version\":\"$(version_cv "$CV_CAFE")\",\"dateResiliation\":\"$JOUR\",\"motif\":\"TEST cessation d'activité\",\"reference\":\"TEST courrier 7\"}" >/dev/null
chk "la convention résiliée à compter d'aujourd'hui : la levée du jour est « à revoir » (sans convention), toujours validée ; celle d'hier, non" "resiliee|LEVEE_SANS_CONVENTION|validee|None" \
  "$(sql "SELECT statut FROM conventions_commerciales WHERE id = '$CV_CAFE'")|$(appel GET "/levees?communeId=$A" "$T_A" >/dev/null; val "next(l['a_revoir'] for l in d if l['commerce_id']=='$E_CAFE' and l['date_levee']=='$JOUR')")|$(sql "SELECT statut FROM levees WHERE commerce_id = '$E_CAFE' AND date_levee = '$JOUR'")|$(val "next(l['a_revoir'] for l in d if l['commerce_id']=='$E_CAFE' and l['flux_code']=='test_cartons' and l['date_levee']=='$HIER' and l['voyage']==1)")"
chk "… et plus aucune levée du café ne s'y enregistre aujourd'hui : 409" "409|1" \
  "$(appel POST /levees "$T_A" "$(lot "$C1" "$JOUR" 2 "[$(levee "$E_CAFE" test_cartons "$(cle)")]")")|$(erreur_contient 'aucune convention signée')"

# -----------------------------------------------------------------------------
echo
echo "8. Le contrat échu, qui lit quoi"
contrat "(app.jour_tunis() - 20)" "(app.jour_tunis() - 1)"
chk "le contrat échu : la feuille et les propositions du prestataire sont introuvables (404, 404)" "404|404" \
  "$(appel GET "/levees/feuille?circuitId=$C1&date=$HIER" "$T_P")|$(appel POST /levees "$T_P" "$(lot "$C1" "$HIER" 1 "[$(levee "$E_HOTEL" test_cartons "$(cle)")]")")"
chk "en base, le prestataire ne lit ni les levées ni les dessertes" "0|0" \
  "$(vu gestionnaire_prestataire "$ID_P" "$B" "(SELECT count(*) FROM levees WHERE commune_id = '$A')")|$(vu gestionnaire_prestataire "$ID_P" "$B" "(SELECT count(*) FROM dessertes_commerces WHERE commune_id = '$A')")"
chk "en base, le directeur de B ne lit rien de A ; la FNCT lit" "0|0|1" \
  "$(vu admin_commune "$ID_B" "$B" "(SELECT count(*) FROM levees WHERE commune_id = '$A')")|$(vu admin_commune "$ID_B" "$B" "(SELECT count(*) FROM dessertes_commerces WHERE commune_id = '$A')")|$(vu super_admin_fnct "$ID_F" "" "(SELECT (count(*) > 0)::int FROM levees WHERE commune_id = '$A')")"

# -----------------------------------------------------------------------------
echo
base_reelle_intacte "pendant la campagne"
rendre_tables_nationales
nettoyer
chk "en partant : communes, levées, dessertes et comptes de test effacés" "0|0|0|0" \
  "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM levees WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM dessertes_commerces WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"
tables_nationales_rendues "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
