#!/usr/bin/env bash
# =============================================================================
# Recette terrain — la commande qui dit si une commune est prête (R1).
# FEUILLE_DE_ROUTE § 6 ; src/outils/etatRecette.ts ; docs/recette/.
#
# Elle commence par ce que la commande REFUSE ou SIGNALE :
#   - sans commune, ou une commune inconnue : refus, codes 2 et 1 ;
#   - une commune sans compte propre, sans registres, avec un compte de
#     démonstration rattaché ou une incohérence bloquante : « PAS PRÊTE »,
#     code 3, et chaque préalable nommé avec ce qu'il faut faire.
# Puis : chaque préalable levé un à un fait passer sa ligne à OK, jusqu'à
# « PRÊTE », code 0. Le nombre d'incohérences bloquantes attendu est lu dans
# app.incoherences_commune par la campagne elle-même. Et la commande n'écrit
# rien : la base est la même avant et après.
#
# Données fictives : une commune de test, effacée en partant.
#
#   docker compose exec -T api npm run test:recette-etat
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
TC=test_recette_r1
ESSAI="test.recette.$$@siipi.tn"
DEMO=directeur.marsa@siipi.tn
nettoyer() {
  # vehicules, personnel et circuits ne suivent pas tous la commune quand on
  # l'efface : on les retire d'abord, pour ne rien laisser d'orphelin.
  $PSQL -c "DELETE FROM circuits WHERE commune_id = '$TC';
            DELETE FROM personnel WHERE commune_id = '$TC';
            DELETE FROM vehicules WHERE commune_id = '$TC';
            DELETE FROM users WHERE email LIKE 'test.recette.%@siipi.tn';
            DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
}
trap 'nettoyer; rm -rf "$T"' EXIT

sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
etat() { npm run -s recette:etat -- "$@" >"$T/sortie.txt" 2>&1; echo $?; }
ligne() { grep -c -F -- "$1" "$T/sortie.txt"; }
# Empreinte des tables que la commande lit : identique avant et après.
empreinte() {
  sql "SELECT md5(string_agg(x, '|')) FROM (
         SELECT (SELECT count(*) FROM audit_log)::text AS x
         UNION ALL SELECT md5(string_agg(u.email||u.password_hash||u.is_active::text, ',' ORDER BY u.email)) FROM users u
         UNION ALL SELECT md5(string_agg(uc.user_id::text||uc.commune_id||coalesce(uc.date_fin::text,''), ',' ORDER BY uc.user_id, uc.commune_id)) FROM utilisateur_communes uc
       ) t"
}

nettoyer
ID_DEMO=$(sql "SELECT id FROM users WHERE email='$DEMO'")
[ -n "$ID_DEMO" ] || { echo "Compte de démonstration $DEMO absent : lancer d'abord le seed." >&2; exit 1; }
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune de recette', 'TEST', 'TEST', 9000);" >/dev/null

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la commande refuse"
CODE=$(etat)
chk "sans commune : refusée (code 2), l'usage est rappelé" "2|1" "$CODE|$(ligne 'Usage')"
CODE=$(etat "commune_inexistante_$$")
chk "commune inconnue : refusée (code 1), l'identifiant attendu est rappelé" "1|1" "$CODE|$(ligne 'Commune introuvable')"

# -----------------------------------------------------------------------------
echo
echo "2. Une commune vide n'est pas prête, et la commande dit pourquoi"
AVANT=$(empreinte)
CODE=$(etat "$TC")
chk "PAS PRÊTE (code 3) : deux préalables" "3|1" "$CODE|$(ligne 'PAS PRÊTE — 2 préalable(s)')"
chk "aucun compte propre : à faire, et qui l'ouvre" "1|1" \
    "$(ligne '[À FAIRE] Compte propre de la commune (administrateur) : 0')|$(ligne 'La FNCT l’ouvre')"
chk "registres vides : à faire" 1 "$(ligne '[À FAIRE] Registres chargés : 0 engin(s), 0 agent(s) actif(s), 0 circuit(s)')"
chk "ni compte de démonstration ni incohérence bloquante : OK" "1|1" \
    "$(ligne '[OK] Compte de démonstration rattaché à la commune : 0')|$(ligne '[OK] Incohérences bloquantes (panneau « À vérifier ») : 0')"
chk "les registres de la recette sont listés, vides" "1|1" "$(ligne 'Pesées : 0')|$(ligne 'Carnet de bord (sorties d’engins) : 0')"
chk "la commande n'a rien écrit" "$AVANT" "$(empreinte)"

# -----------------------------------------------------------------------------
echo
echo "3. Les registres chargés font naître ce que la commune doit trancher"
$PSQL -c "INSERT INTO vehicules (id, registration, commune_id, type) VALUES ('test-r1-01', 'TEST 0001', '$TC', 'camion');
          INSERT INTO personnel (commune_id, nom_complet, fonction) VALUES ('$TC', 'TEST Agent Un', 'agent_balayage');
          INSERT INTO circuits (commune_id, nom) VALUES ('$TC', 'TEST circuit en régie');" >/dev/null
BLOQUANTS=$(sql "SELECT count(*) FROM app.incoherences_commune('$TC') WHERE gravite='bloquant'")
CODE=$(etat "$TC")
chk "registres chargés : OK" 1 "$(ligne '[OK] Registres chargés : 1 engin(s), 1 agent(s) actif(s), 1 circuit(s)')"
chk "un circuit en régie sans équipe : autant de bloquants que le panneau ($BLOQUANTS)" "1|1" \
    "$([ "${BLOQUANTS:-0}" -gt 0 ] && echo 1 || echo 0)|$(ligne "[À FAIRE] Incohérences bloquantes (panneau « À vérifier ») : $BLOQUANTS")"
chk "… nommé, avec ce qu'il faut faire" 1 "$(ligne 'TEST circuit en régie — Circuit en régie sans aucun agent affecté. → Affecter')"
chk "les écarts non bloquants sont à recueillir en route, pas des préalables" 1 "$(ligne 'avertissement · Ni exécutant ni engin renseignés. (1)')"
chk "le prix d'achat manquant est à recueillir" 1 "$(ligne 'Engins sans prix d’achat : 1')"

# -----------------------------------------------------------------------------
echo
echo "4. Un compte de démonstration ne compte pas pour la commune ; il est signalé"
$PSQL -c "INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$ID_DEMO', '$TC');" >/dev/null
CODE=$(etat "$TC")
chk "rattaché, il est à clore, nommé" "1|1" \
    "$(ligne '[À FAIRE] Compte de démonstration rattaché à la commune : 1')|$(ligne "$DEMO — son mot de passe est public")"
chk "… et la commune n'a toujours aucun compte propre" 1 "$(ligne '[À FAIRE] Compte propre de la commune (administrateur) : 0')"
chk "PAS PRÊTE : trois préalables" "3|1" "$CODE|$(ligne 'PAS PRÊTE — 3 préalable(s)')"

# -----------------------------------------------------------------------------
echo
echo "5. Chaque préalable levé passe à OK, jusqu'à « PRÊTE »"
$PSQL -c "INSERT INTO users (email, password_hash, full_name, role, commune_id, mot_de_passe_provisoire)
          VALUES ('$ESSAI', 'x', 'TEST Chef de dépôt', 'admin_commune', '$TC', true);" >/dev/null
CODE=$(etat "$TC")
chk "un compte propre, provisoire : OK, et le rappel de le remplacer" "1|1" \
    "$(ligne '[OK] Compte propre de la commune (administrateur) : 1')|$(ligne "$ESSAI — mot de passe provisoire")"
$PSQL -c "INSERT INTO circuit_equipe (circuit_id, personnel_id, role)
          SELECT c.id, p.id, 'agent' FROM circuits c, personnel p WHERE c.commune_id = '$TC' AND p.commune_id = '$TC';" >/dev/null
CODE=$(etat "$TC")
chk "l'équipe affectée : plus de bloquant" "1|$(sql "SELECT count(*) FROM app.incoherences_commune('$TC') WHERE gravite='bloquant'")" \
    "$(ligne '[OK] Incohérences bloquantes (panneau « À vérifier ») : 0')|0"
$PSQL -c "UPDATE utilisateur_communes SET date_fin = CURRENT_DATE - 1 WHERE user_id = '$ID_DEMO' AND commune_id = '$TC';" >/dev/null
AVANT=$(empreinte)
CODE=$(etat "$TC")
chk "le rattachement de démonstration clos (date de fin) : il ne compte plus" 1 "$(ligne '[OK] Compte de démonstration rattaché à la commune : 0')"
chk "PRÊTE (code 0)" "0|1" "$CODE|$(ligne 'Verdict : PRÊTE')"
chk "… le rattachement clos reste en base : rien ne s'efface" 1 \
    "$(sql "SELECT count(*) FROM utilisateur_communes WHERE user_id='$ID_DEMO' AND commune_id='$TC' AND date_fin IS NOT NULL")"
chk "la commande n'a toujours rien écrit" "$AVANT" "$(empreinte)"

nettoyer
chk "la commune de test et ce qu'elle contenait sont retirés" "0|0|0" \
    "$(sql "SELECT (SELECT count(*) FROM communes WHERE id='$TC')||'|'||(SELECT count(*) FROM vehicules WHERE commune_id='$TC')||'|'||(SELECT count(*) FROM users WHERE email LIKE 'test.recette.%@siipi.tn')")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
