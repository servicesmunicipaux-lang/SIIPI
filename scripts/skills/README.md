# scripts/skills — les outils de vérification interne

Quatre outils, chacun né d'un défaut réel. Ils ne remplacent pas les 33
campagnes de tests : ils cherchent ce qu'une campagne ne voit pas, parce qu'une
campagne éprouve un comportement alors que ceux-ci interrogent une **structure**.

| Outil | Ce qu'il cherche | Le défaut qui l'a fait naître |
|---|---|---|
| `db-check.sh` | Tables à `commune_id` sans RLS forcée, politiques qui comparent à la commune *principale*, géométries sans index, `SECURITY DEFINER` sans `search_path` | Sept politiques ignoraient l'intercommunalité : un directeur rattaché à deux communes obtenait un **écran vide** sur la seconde — pas un refus, rien |
| `kpi-evaluator.mjs` | Une absence de donnée transformée en `0` ; la chaîne Automatique > Déclaré > Non renseigné | « 0 accident » quand personne ne tient le registre est lu comme vrai, et opposé un jour à un conseil municipal |
| `ui-builder.mjs` | Écran neuf conforme : trois états distingués, propriétés logiques (RTL), clés posées **dans les deux langues** | Une classe `ml-` casse la mise en page en arabe ; une clé absente d'`ar.json` affiche la clé brute |
| `pdf-template.mjs` | Gabarit légal complet : numéro d'ordre continu, référence réglementaire, signatures qualifiées, mention d'édition | Un bon de carburant sans numéro continu ne prouve rien : on ne peut pas montrer qu'aucun bon ne manque |

## Emploi

```bash
bash scripts/skills/db-check.sh                    # tout
bash scripts/skills/db-check.sh rls                # rls · geo · fonctions

node scripts/skills/kpi-evaluator.mjs              # Dar Chaabane, année courante
node scripts/skills/kpi-evaluator.mjs medenine_djerba_houmt_souk 2026

node scripts/skills/ui-builder.mjs Carburant flotte           # aperçu
node scripts/skills/ui-builder.mjs Carburant flotte --ecrire  # pose les fichiers

node scripts/skills/pdf-template.mjs bon-carburant            # sur la sortie standard
node scripts/skills/pdf-template.mjs bon-carburant --ecrire   # backend/src/documents/gabarits/
```

`db-check.sh` et `kpi-evaluator.mjs` ont besoin des conteneurs démarrés
(`RELANCER.bat`). Ils sortent avec un code non nul dès la première alerte : ils
s'enchaînent donc dans un script de vérification.

## Quand les lancer

- **`db-check`** après toute migration qui crée une table ou touche une
  politique. C'est le moment où le trou se creuse, et il ne se voit qu'ici.
- **`kpi-evaluator`** après toute modification des fonctions de mesure, et
  **avant de montrer un tableau de bord à une commune**.
- **`ui-builder`** au départ d'un écran, jamais après : il pose des conventions,
  il ne corrige pas.
- **`pdf-template`** au départ d'un nouveau document légal.

## Ce qu'ils ne font pas

Ils ne corrigent rien. Ils constatent et nomment — comme
`app.incoherences_commune()` le fait pour les registres de la commune. Un outil
qui réparerait tout seul ferait disparaître le signal qu'il est censé rendre
visible.
