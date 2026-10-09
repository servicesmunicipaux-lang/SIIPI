# shellcheck shell=bash
# ---------------------------------------------------------------------------
# Un directeur de commune le temps d'une campagne (JC-001,
# docs/recette/JOURNAL_DES_CORRECTIONS.md).
#
# POURQUOI. Les campagnes module2 à module6 éprouvent les données réelles de
# Dar Chaabane, et il leur faut un administrateur de cette commune. Elles
# prenaient le premier directeur venu — un compte de démonstration, au mot de
# passe public — et module2 le rattachait à Dar Chaabane sans jamais retirer ce
# rattachement : sur toute base où les campagnes avaient tourné, un compte que
# n'importe qui peut ouvrir écrivait dans le registre réel de la commune.
#
# Chaque campagne a désormais son propre directeur : créé au début, rattaché à
# la commune à titre principal, avec un mot de passe de test qui ne sert
# qu'une fois, et effacé en partant. Aucun compte de démonstration n'est plus
# rattaché à quoi que ce soit, et clore celui qui l'avait été ne casse rien.
#
# Ce fichier n'est pas une campagne : il est rangé sous tests/outils/ pour que
# le recomptage de CLAUDE.md § 7 (tests/*.sh) ne le compte pas.
#
# Usage, après avoir défini PSQL :
#   . "$(dirname "$0")/outils/directeur_temporaire.sh"
#   directeur_temporaire "$COMMUNE"      # DIR_EMAIL, DIR_MDP, DIR_ID
#   ...
#   retirer_directeur_temporaire         # dans le trap EXIT de la campagne
# ---------------------------------------------------------------------------

directeur_temporaire() {
  # Les restes d'une campagne interrompue : les campagnes ne tournent jamais
  # deux à la fois (CLAUDE.md), un directeur temporaire présent est orphelin.
  $PSQL -c "DELETE FROM users WHERE email LIKE 'test.directeur.%@siipi.tn';" >/dev/null 2>&1
  DIR_EMAIL="test.directeur.$$.$(date +%s)@siipi.tn"
  DIR_MDP="TEST-Directeur-$$-$(date +%s)"
  # bcrypt par pgcrypto ($2a$), que bcryptjs relit à la connexion.
  DIR_ID=$($PSQL -c "INSERT INTO users (email, password_hash, full_name, role, commune_id)
                     VALUES ('$DIR_EMAIL', crypt('$DIR_MDP', gen_salt('bf', 10)),
                             'TEST Directeur de campagne', 'admin_commune', '$1')
                     RETURNING id;" 2>/dev/null | head -1 | tr -d ' ')
  if [ -z "$DIR_ID" ]; then
    echo "Impossible de créer le directeur temporaire de la campagne pour la commune « $1 »." >&2
    exit 1
  fi
}

retirer_directeur_temporaire() {
  [ -n "${DIR_EMAIL:-}" ] && $PSQL -c "DELETE FROM users WHERE email = '$DIR_EMAIL';" >/dev/null 2>&1
  return 0
}
