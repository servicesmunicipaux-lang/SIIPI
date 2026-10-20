# shellcheck shell=bash
# ---------------------------------------------------------------------------
# Une copie du jeu réel de Dar Chaabane dans une commune de test, pour les
# campagnes qui l'éprouvent (module2 à module6).
#
# POURQUOI. Ces campagnes éprouvent les données réelles de Dar Chaabane : ses
# agents DCF-, ses engins, ses circuits. Elles écrivaient leurs lignes d'essai
# dans la commune même (circuits « TEST M2 », engins « TEST-M3 », pesées,
# pointages), avec un directeur temporaire, puis les effaçaient. Rien ne
# restait dans les tables, mais le journal d'audit, en ajout seul, gardait les
# écritures d'un directeur de la commune : Dar Chaabane paraissait « active »
# au tableau national (app._saisies_communales), alors que personne n'y
# travaille. Elles travaillent désormais sur une copie fidèle, dans une
# commune de test, et Dar Chaabane n'est que lue.
#
# CE QUI EST COPIÉ, dans une seule transaction, lignes retirées comprises : la
# fiche de la commune (limite comprise ; sans son code municipal, unique), les
# engins, les agents, les circuits et leurs équipes, les effectifs par
# service, les publications et leurs questions. Les identifiants sont neufs ;
# les liens (circuit → engin, équipe → circuit et agent, engin attelé,
# question → publication) suivent. Deux écarts, imposés par la base et
# appliqués partout pareil : l'identifiant d'un engin est préfixé par la
# commune de test (« <commune>-dcef-… »), et son immatriculation, unique dans
# toute la base, par « TEST » — y compris celle que cite un circuit, pour que
# le recoupement parc / circuits retrouve les mêmes paires.
#
# Ce fichier n'est pas une campagne : il est rangé sous tests/outils/ pour que
# le recomptage de CLAUDE.md § 7 (tests/*.sh) ne le compte pas.
#
# Usage, après avoir défini PSQL, sql() et chk() :
#   . "$(dirname "$0")/outils/copie_dar_chaabane.sh"
#   releve_base_reelle                          # tests/outils/base_reelle.sh
#   copie_dar_chaabane test_copie_dc_m2         # DC = Dar Chaabane, COMMUNE = la copie
#   trap … EXIT; effacer_copie_en_sortie        # la copie part après tout le reste
#   ...
#   base_reelle_intacte "pendant la campagne"
#   dar_chaabane_intacte "pendant la campagne"  # aucune écriture, pas même au journal
#   sortir_de_la_copie                          # avant le bilan : sortie jouée, puis « en partant »
#
# Le journal d'audit est le seul témoin : l'empreinte des tables
# (base_reelle.sh) le laisse de côté, et une campagne qui écrit puis efface
# ses lignes ne change aucune table. Éprouvé : module5 remise à écrire dans
# Dar Chaabane passe l'empreinte des tables et échoue ici.
# ---------------------------------------------------------------------------

effacer_copie_dar_chaabane() {
  [ -n "${COMMUNE_COPIE:-}" ] || return 0
  # Les questions et les équipes suivent leur publication et leur circuit ;
  # les engins, agents et circuits sont effacés par la commune.
  $PSQL -c "BEGIN;
            DELETE FROM circuit_equipe WHERE circuit_id IN (SELECT id FROM circuits WHERE commune_id = '$COMMUNE_COPIE');
            DELETE FROM sondage_questions WHERE publication_id IN (SELECT id FROM publications WHERE commune_id = '$COMMUNE_COPIE');
            COMMIT;" >/dev/null 2>&1
  if command -v effacer_communes_essai >/dev/null 2>&1; then
    effacer_communes_essai "'$COMMUNE_COPIE'"
  else
    . "$(dirname "$0")/outils/communes_essai.sh"
    effacer_communes_essai "'$COMMUNE_COPIE'"
  fi
  return 0
}

copie_dar_chaabane() {  # $1 = identifiant de la copie (commence par « test »)
  case "$1" in
    test*) ;;
    *) echo "La copie de Dar Chaabane doit vivre dans une commune de test (identifiant « test… »), pas dans « $1 »." >&2; exit 1 ;;
  esac
  DC=$(sql "SELECT id FROM communes WHERE (name ILIKE '%Chaâbane%' OR name ILIKE '%Chaabane%' OR id LIKE '%dar_chaabane%') AND id NOT LIKE 'test%' ORDER BY length(name) LIMIT 1")
  [ -n "$DC" ] || { echo "Dar Chaabane absente du référentiel. Lancer d'abord : npm run seed && npm run seed:dar-chaabane" >&2; exit 1; }
  COMMUNE_COPIE=$1
  effacer_copie_dar_chaabane
  # Le journal d'audit de Dar Chaabane, relevé avant la copie : la campagne
  # n'y laisse aucune ligne, et c'est ce qui la garde « non déployée ».
  DC_AUDIT_AVANT=$(sql "SELECT count(*) || ':' || coalesce(max(id), 0) FROM audit_log WHERE commune_id = '$DC'")
  if ! $PSQL -v ON_ERROR_STOP=1 >/dev/null 2>"${TMPDIR:-/tmp}/copie_dc.err" <<SQL
BEGIN;
CREATE TEMP TABLE x_commune ON COMMIT DROP AS SELECT * FROM communes WHERE id = '$DC';
UPDATE x_commune SET id = '$1', name = 'TEST copie du jeu DC', name_ar = 'TEST', code_municipalite = NULL;
INSERT INTO communes SELECT * FROM x_commune;

CREATE TEMP TABLE x_vehicules ON COMMIT DROP AS SELECT * FROM vehicules WHERE commune_id = '$DC';
UPDATE x_vehicules SET id = '$1-' || id, commune_id = '$1', registration = 'TEST ' || registration,
       attele_a = CASE WHEN attele_a IS NULL THEN NULL ELSE '$1-' || attele_a END, zone_id = NULL;
INSERT INTO vehicules SELECT * FROM x_vehicules;

CREATE TEMP TABLE m_personnel ON COMMIT DROP AS SELECT id AS ancien, gen_random_uuid() AS nouveau FROM personnel WHERE commune_id = '$DC';
CREATE TEMP TABLE x_personnel ON COMMIT DROP AS SELECT * FROM personnel WHERE commune_id = '$DC';
UPDATE x_personnel x SET id = m.nouveau, commune_id = '$1' FROM m_personnel m WHERE x.id = m.ancien;
INSERT INTO personnel SELECT * FROM x_personnel;

CREATE TEMP TABLE m_circuits ON COMMIT DROP AS SELECT id AS ancien, gen_random_uuid() AS nouveau FROM circuits WHERE commune_id = '$DC';
CREATE TEMP TABLE x_circuits ON COMMIT DROP AS SELECT * FROM circuits WHERE commune_id = '$DC';
UPDATE x_circuits x SET id = m.nouveau, commune_id = '$1', zone_id = NULL,
       vehicule_id = CASE WHEN x.vehicule_id IS NULL THEN NULL ELSE '$1-' || x.vehicule_id END,
       vehicule_immat = CASE WHEN x.vehicule_immat IS NULL THEN NULL ELSE 'TEST ' || x.vehicule_immat END
  FROM m_circuits m WHERE x.id = m.ancien;
INSERT INTO circuits SELECT * FROM x_circuits;

CREATE TEMP TABLE x_equipe ON COMMIT DROP AS
  SELECT e.* FROM circuit_equipe e JOIN circuits c ON c.id = e.circuit_id WHERE c.commune_id = '$DC';
UPDATE x_equipe x SET id = gen_random_uuid(),
       circuit_id = (SELECT nouveau FROM m_circuits WHERE ancien = x.circuit_id),
       personnel_id = (SELECT nouveau FROM m_personnel WHERE ancien = x.personnel_id);
INSERT INTO circuit_equipe SELECT * FROM x_equipe;

CREATE TEMP TABLE x_effectifs ON COMMIT DROP AS SELECT * FROM effectifs_service WHERE commune_id = '$DC';
UPDATE x_effectifs SET id = gen_random_uuid(), commune_id = '$1';
INSERT INTO effectifs_service SELECT * FROM x_effectifs;

CREATE TEMP TABLE m_publications ON COMMIT DROP AS SELECT id AS ancien, gen_random_uuid() AS nouveau FROM publications WHERE commune_id = '$DC';
CREATE TEMP TABLE x_publications ON COMMIT DROP AS SELECT * FROM publications WHERE commune_id = '$DC';
UPDATE x_publications x SET id = m.nouveau, commune_id = '$1' FROM m_publications m WHERE x.id = m.ancien;
INSERT INTO publications SELECT * FROM x_publications;
CREATE TEMP TABLE x_questions ON COMMIT DROP AS
  SELECT q.* FROM sondage_questions q JOIN m_publications m ON m.ancien = q.publication_id;
UPDATE x_questions x SET id = gen_random_uuid(), publication_id = (SELECT nouveau FROM m_publications WHERE ancien = x.publication_id);
INSERT INTO sondage_questions SELECT * FROM x_questions;
COMMIT;
SQL
  then
    echo "La copie du jeu de Dar Chaabane a échoué :" >&2
    cat "${TMPDIR:-/tmp}/copie_dc.err" >&2
    exit 1
  fi
  COMMUNE=$1
}

# La copie s'efface après tout ce que la campagne fait déjà en sortant : ses
# lignes d'essai et ses comptes partent avant la commune qui les porte.
effacer_copie_en_sortie() {
  local actuel
  actuel=$(trap -p EXIT | sed -E "s/^trap -- '(.*)' EXIT$/\1/")
  trap "${actuel:+$actuel; }effacer_copie_dar_chaabane" EXIT
}

# Avant le bilan : tout ce que la campagne fait en sortant, joué maintenant
# (le piège le rejouera à la sortie, sans rien trouver), puis les contrôles
# « en partant ». « set -- » relit la commande du piège telle qu'elle a été
# posée, guillemets compris.
sortir_de_la_copie() {
  eval "set -- $(trap -p EXIT)"
  eval "$3"
  chk "en partant : la copie de Dar Chaabane est effacée" 0 "$(sql "SELECT count(*) FROM communes WHERE id = '$COMMUNE_COPIE'")"
  base_reelle_intacte "en partant"
  dar_chaabane_intacte "en partant"
}

dar_chaabane_intacte() {  # $1 = moment
  chk "$1 : Dar Chaabane n'a reçu aucune écriture, pas même au journal d'audit (copie : $COMMUNE_COPIE)" \
      "$DC_AUDIT_AVANT" "$(sql "SELECT count(*) || ':' || coalesce(max(id), 0) FROM audit_log WHERE commune_id = '$DC'")"
}
