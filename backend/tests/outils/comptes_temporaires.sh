# shellcheck shell=bash
# ---------------------------------------------------------------------------
# Des comptes de tout rôle, le temps d'une campagne (JC-011, JC-012,
# docs/recette/JOURNAL_DES_CORRECTIONS.md).
#
# POURQUOI. Quinze campagnes empruntaient « le premier directeur de la base »
# — sur la pile d'essai, un compte de démonstration ; ailleurs, le plus ancien
# directeur réel — et d'autres les comptes de démonstration d'une commune
# réelle. Une campagne qui a besoin d'un directeur, d'un prestataire ou d'un
# agent de la FNCT dans SA commune de test le crée ici, avec un mot de passe
# qui ne sert qu'une fois, et l'efface en partant.
#
# Les adresses suivent le motif « test.compte.… » : une campagne interrompue
# laisse ses comptes orphelins, et la suivante les efface en commençant (les
# campagnes ne tournent jamais deux à la fois). Leurs lignes rattachées doivent
# avoir été effacées avant (la commune de test d'abord, ses comptes ensuite).
#
# Ce fichier n'est pas une campagne : il est rangé sous tests/outils/ pour que
# le recomptage de CLAUDE.md § 7 (tests/*.sh) ne le compte pas.
#
# Usage, après avoir défini PSQL :
#   . "$(dirname "$0")/outils/comptes_temporaires.sh"
#   compte_temporaire admin_commune test_x "Directeur"   # COMPTE_EMAIL, COMPTE_MDP, COMPTE_ID
#   retirer_comptes_temporaires                          # dans le trap EXIT
# ---------------------------------------------------------------------------

COMPTES_TEMPORAIRES=""
COMPTES_TEMPORAIRES_N=0
$PSQL -c "DELETE FROM users WHERE email LIKE 'test.compte.%@siipi.tn';" >/dev/null 2>&1

compte_temporaire() {  # $1 = rôle, $2 = commune (ou vide pour la FNCT), $3 = libellé
  COMPTES_TEMPORAIRES_N=$((COMPTES_TEMPORAIRES_N + 1))
  COMPTE_EMAIL="test.compte.$$.$COMPTES_TEMPORAIRES_N.$(date +%s)@siipi.tn"
  COMPTE_MDP="TEST-Compte-$$-$COMPTES_TEMPORAIRES_N"
  local commune="NULL" libelle="${3//\'/\'\'}"
  [ -n "$2" ] && commune="'$2'"
  # bcrypt par pgcrypto ($2a$), que bcryptjs relit à la connexion.
  COMPTE_ID=$($PSQL -c "INSERT INTO users (email, password_hash, full_name, role, commune_id)
                        VALUES ('$COMPTE_EMAIL', crypt('$COMPTE_MDP', gen_salt('bf', 10)), 'TEST $libelle', '$1', $commune)
                        RETURNING id;" 2>/dev/null | head -1 | tr -d ' ')
  if [ -z "$COMPTE_ID" ]; then
    echo "Impossible de créer le compte temporaire « $3 » ($1, ${2:-sans commune})." >&2
    exit 1
  fi
  COMPTES_TEMPORAIRES="$COMPTES_TEMPORAIRES '$COMPTE_EMAIL'"
}

# Ajoute une commande à ce que la campagne fait déjà en sortant, APRÈS elle : les
# lignes qu'un compte a posées s'effacent avant le compte qui les tient.
ajouter_a_la_sortie() {  # $1 = commande
  local actuel
  actuel=$(trap -p EXIT | sed -E "s/^trap -- '(.*)' EXIT$/\1/")
  trap "${actuel:+$actuel; }$1" EXIT
}

retirer_comptes_temporaires() {
  [ -n "$COMPTES_TEMPORAIRES" ] && $PSQL -c "DELETE FROM users WHERE email IN ($(echo $COMPTES_TEMPORAIRES | tr ' ' ','));" >/dev/null 2>&1
  return 0
}
