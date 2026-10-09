# Journal des corrections

`CLAUDE.md` § 9 et `FEUILLE_DE_ROUTE.md` § 5 et § 6 y renvoient : tout défaut trouvé — en recette
terrain surtout — s'y consigne **avec sa portée**, pas seulement sa cause. C'est l'une des trois
conditions de clôture d'une version (§ 5).

**Ce journal n'existait pas dans le dépôt** quand la recette R1 a été préparée (constat du
9 octobre 2026) : les documents le citaient, aucun fichier ne le portait. Les corrections
antérieures sont décrites dans les sections « Corrigé » du `CHANGELOG.md`. Les « cinq défauts
révélés seulement par l'usage réel » que cite `CLAUDE.md` § 9 n'y sont pas énumérés un par un ; ils
ne sont pas recopiés ici de mémoire. Le journal commence avec la préparation de R1.

## Comment consigner

Une entrée par défaut, la plus récente en bas. Champs :

| Champ | Ce qu'on y écrit |
|---|---|
| **Identifiant** | `JC-` suivi d'un numéro continu (`JC-003`, `JC-004`…) |
| **Date** | Le jour du constat |
| **Trouvé par** | Recette R1 · préparation de recette · usage réel · campagne · relecture |
| **Où** | L'écran (nom du menu) ou la route d'API, et la commune |
| **Constat** | Ce qui s'est passé, et ce qu'on attendait |
| **Cause** | Si elle est connue ; sinon « non établie » — jamais une supposition présentée comme sûre |
| **Portée** | Ce qui d'autre est touché : quelles communes, quelles données, depuis quand, quelles autres routes ou écrans. **Obligatoire** : c'est elle qui dit si d'autres données sont fausses |
| **Gravité** | Bloquant (empêche de travailler ou fausse une donnée) · gênant · d'apparence |
| **Correction** | Version et PR, ou « ouverte » |
| **Contrôle ajouté** | La campagne qui verrait le défaut revenir, ou pourquoi aucune ne le peut |

**Aucune donnée personnelle** : ni nom d'agent, ni matricule, ni CIN, ni capture d'écran qui en
montre un (loi organique n° 2004-63). Un engin se désigne par son identifiant au parc.

---

## Entrées

### JC-001

| Champ | |
|---|---|
| **Date** | 9 octobre 2026 |
| **Trouvé par** | Préparation de recette (commande `recette:etat`) |
| **Où** | Campagnes `module2`, `module3`, `module4`, `module5`, `module6`, `fichiers` ; commune Dar Chaâbane El Fehri |
| **Constat** | Le compte de démonstration `directeur.marsa@siipi.tn` est rattaché à Dar Chaâbane, avec droit d'écriture, sur la pile d'essai **et sur la base du dossier principal**. Personne ne l'a décidé. |
| **Cause** | `module2` rattache le premier directeur venu à Dar Chaâbane quand la commune n'a pas de directeur propre, « pour tourner sur une base fraîche », et ne retire que le rattachement du prestataire. Les campagnes suivantes (`module3` à `module6`, `fichiers`) en dépendent : elles écrivent dans Dar Chaâbane avec ce compte. |
| **Portée** | Toute base sur laquelle `npm test` a tourné — donc `MIGRER.bat` et `TESTS.bat` sur le poste : le compte de démonstration, dont le mot de passe est public, peut écrire dans le registre réel de Dar Chaâbane. En production, ce mot de passe n'ouvre plus aucun compte depuis la v0.15.15 ; en développement, si. Les campagnes écrivent aussi leurs lignes de test dans la commune réelle — `CLAUDE.md` § 7 le savait (« travailler sur le jeu de Dar Chaabane l'abîme à chaque passage ») sans en tirer la règle pour une recette. |
| **Gravité** | Bloquant pour R1 : une recette sur des données qu'une campagne peut modifier ne prouve rien |
| **Correction** | **Ouverte.** En attendant : (1) ne jamais lancer de campagne sur la base de la recette ([R1 § 2.2](R1_DAR_CHAABANE.md#22-clore-le-rattachement-du-compte-de-démonstration)) ; (2) clore le rattachement (date de fin). Correction durable proposée : que ces six campagnes bâtissent leur propre commune de test, comme les campagnes écrites depuis S0, au lieu de travailler sur Dar Chaâbane. |
| **Contrôle ajouté** | `recette:etat` signale tout compte de démonstration rattaché à la commune (préalable « À FAIRE ») ; campagne `recette-etat` (v0.15.16) |

### JC-002

| Champ | |
|---|---|
| **Date** | 9 octobre 2026 |
| **Trouvé par** | Relecture, en préparant la recette |
| **Où** | `FEUILLE_DE_ROUTE.md` § 8 ; panneau « À vérifier » de Dar Chaâbane |
| **Constat** | La feuille de route annonçait **14** lignes bloquantes au panneau de cohérence de Dar Chaâbane ; sur une base chargée dans l'ordre de référence, le panneau en compte **13** — une par circuit en régie sans agent affecté. |
| **Cause** | Non établie : le chiffre de 14 a été écrit à une date où les données ou les règles du panneau différaient peut-être. |
| **Portée** | Documentation seulement : le panneau calcule à chaque lecture, aucune donnée n'est touchée. Mais un chiffre recopié qui se dessèche est ce que `CLAUDE.md` § 7 interdit. |
| **Gravité** | D'apparence |
| **Correction** | v0.15.16 : la feuille de route donne 13, avec la date, et renvoie à `recette:etat`, qui recompte au lieu de citer. |
| **Contrôle ajouté** | Aucun chiffre figé : `recette:etat` le recalcule à chaque lecture. |
