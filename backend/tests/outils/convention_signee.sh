#!/usr/bin/env bash
# Une convention de propreté signée, bâtie comme une commune la bâtirait (lot G4a) :
# une grille approuvée, un flux de la liste nationale, un brouillon, l'instruction,
# la signature. Pour les campagnes qui éprouvent ce qu'une convention signée change
# (M2-2) sans éprouver la convention elle-même — c'est l'objet de `conventions`.
#
# À sourcer. La campagne fournit $API et $PSQL, garde la table nationale
# `elements_listes_nationales` (tables_nationales.sh) avant le premier appel, et
# appelle effacer_conventions_essai dans son nettoyage, AVANT d'effacer ses
# communes : un document scellé refuse qu'on l'efface, et la commune avec lui.

CONVENTION_FLUX_ESSAI=test_flux_outil

# Un flux de la liste nationale, en vigueur depuis 2000, jamais dangereux.
convention_flux_essai() {
  $PSQL -c "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, date_effet, dangereux, provisoire, reference)
            SELECT 'flux_assimiles', '$CONVENTION_FLUX_ESSAI', 'TEST Déchets assimilés de l''outil', 'نفايات مشابهة', DATE '2000-01-01', false, true, 'TEST outil'
             WHERE NOT EXISTS (SELECT 1 FROM elements_listes_nationales
                                WHERE liste = 'flux_assimiles' AND code = '$CONVENTION_FLUX_ESSAI' AND retire_le IS NULL)" >/dev/null 2>&1
}

_convention_appel() { # méthode chemin jeton [corps] — le corps de la réponse
  curl -s -X "$1" "$API$2" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' ${4:+-d "$4"}
}
_convention_champ() { python3 -c "import sys,json
try: print(json.load(sys.stdin).get('$1') or '')
except Exception: print('')"; }

# Une grille approuvée de la commune, en vigueur depuis 2000, un forfait annuel pour
# chacune des catégories de départ. Rendue si la commune en a déjà une.
convention_grille_essai() { # commune jeton_directeur — l'identifiant de la grille
  local g v lignes
  g=$($PSQL -tA -c "SELECT id FROM grilles_tarifaires WHERE commune_id = '$1' AND deleted_at IS NULL AND date_approbation_tutelle IS NOT NULL LIMIT 1" 2>/dev/null)
  if [ -n "$g" ]; then echo "$g"; return 0; fi
  lignes=$(python3 -c "import json;print(json.dumps([{'categorie':c,'mode':'forfait_annuel','tarif':100} for c in ['cafe','restaurant','hotel','superette','boulangerie','marche','bureau','ecole','atelier']]))")
  g=$(_convention_appel POST "/grilles-tarifaires?communeId=$1" "$2" \
      "{\"intitule\":\"TEST Grille de l'outil\",\"referenceArrete\":\"TEST-ARRETE-OUTIL\",\"dateArrete\":\"2000-01-01\",\"dateEffet\":\"2000-01-01\",\"lignes\":$lignes}" | _convention_champ id)
  [ -n "$g" ] || return 1
  v=$($PSQL -tA -c "SELECT xmin FROM grilles_tarifaires WHERE id = '$g'")
  _convention_appel POST "/grilles-tarifaires/$g/approbation" "$2" \
      "{\"dateApprobation\":\"2000-01-10\",\"reference\":\"TEST visa de l'outil\",\"version\":\"$v\"}" >/dev/null
  [ -n "$($PSQL -tA -c "SELECT 1 FROM grilles_tarifaires WHERE id = '$g' AND date_approbation_tutelle IS NOT NULL")" ] || return 1
  echo "$g"
}

# Une convention signée aujourd'hui, du début à la fin données. Rend son identifiant,
# ou rien (la campagne qui l'appelle le vérifie : un contrôle sous condition d'une
# convention qu'on espère trouver se sauterait en silence).
convention_signee() { # commune jeton_directeur commerce debut fin
  local id version jour
  convention_flux_essai
  convention_grille_essai "$1" "$2" >/dev/null || return 1
  id=$(_convention_appel POST "/conventions?communeId=$1" "$2" \
       "{\"commerceId\":\"$3\",\"dateDebut\":\"$4\",\"dateFin\":\"$5\",\"lignes\":[{\"fluxCode\":\"$CONVENTION_FLUX_ESSAI\",\"leveesParSemaine\":3}]}" | _convention_champ id)
  [ -n "$id" ] || return 1
  version=$(_convention_appel POST "/conventions/$id/instruire" "$2" \
            "{\"version\":\"$($PSQL -tA -c "SELECT xmin FROM conventions_commerciales WHERE id = '$id'")\"}" | _convention_champ version)
  [ -n "$version" ] || return 1
  jour=$($PSQL -tA -c "SELECT app.jour_tunis()")
  [ "$(_convention_appel POST "/conventions/$id/signer" "$2" \
        "{\"version\":\"$version\",\"dateSignature\":\"$jour\",\"referenceSignature\":\"TEST signature de l'outil\"}" | _convention_champ statut)" = signee ] || return 1
  echo "$id"
}

# Les avenants, les conventions et leurs documents scellés des communes de test, le déclencheur
# qui protège les documents levé le temps d'une transaction, puis leurs grilles :
# une grille approuvée garde son auteur, et un compte temporaire ne s'effacerait
# pas tant qu'elle le cite.
effacer_conventions_essai() { # liste SQL d'identifiants, chacun « test… »
  case "$1" in *"'test"*) ;; *) echo "effacer_conventions_essai : liste sans commune de test ($1)." >&2; return 1 ;; esac
  $PSQL -c "BEGIN;
            DELETE FROM avenants_convention WHERE commune_id IN ($1);
            DELETE FROM conventions_commerciales WHERE commune_id IN ($1);
            ALTER TABLE documents_emis DISABLE TRIGGER trg_proteger_document;
            DELETE FROM documents_emis WHERE commune_id IN ($1);
            ALTER TABLE documents_emis ENABLE TRIGGER trg_proteger_document;
            DELETE FROM sequences_documents WHERE commune_id IN ($1);
            DELETE FROM grilles_tarifaires WHERE commune_id IN ($1);
            COMMIT;" >/dev/null 2>&1
}
