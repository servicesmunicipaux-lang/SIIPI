# Décisions de Nacer — 20 octobre 2026

Suite du registre `DECISIONS_2026-10-16.md`. Claude Code applique ces décisions telles quelles ; elles priment sur les valeurs par défaut des spécifications. Une décision ne se modifie que par une nouvelle entrée datée.

## Ordre de travail

1. **Retrait des versions fantômes** (JC-010) — court.
2. **Chantier P — préparation à la mise en production**, indépendante de l'hébergeur — prochain chantier principal.
3. **17.4 — connecteur GPS générique** (Menzel Chaker en premier fournisseur) : peut avancer avec un faux fournisseur (mock) avant de recevoir la documentation réelle de l'API.
4. **Noms arabes** et **17.2 matrice des densités** : Claude Code prépare les listes ; rien n'est écrit en base avant la validation de Nacer.

## 1. Versions fantômes du découpage (JC-010)

- **Retirées**, dans les bases où elles existent (pile d'essai : trois versions, Houmt Souk et Midoun). La base du dossier principal n'en porte aucune.
- Par une opération **réservée à la FNCT**, inscrite au **journal d'audit** avec le motif « version fantôme JC-010 ». Une version n'est retirée que si elle porte la signature de l'inventaire du 19 octobre (geste d'essai à 60 s près dans la même commune).
- **D'abord une liste à blanc** de ce qui serait retiré, puis l'exécution.
- Test de sortie : la liste à blanc et le retrait donnent le même nombre ; aucune version réelle n'est touchée (vérifié par un mutant qui pose une vraie version à côté).

## 2. Bases déjà passées par les tests

- **La production est toujours créée sur une base neuve**, puis on y charge les données réelles. Aucune base où les campagnes ont tourné ne devient production. Ceci s'ajoute à la nature de base déjà retenue (D-FNCT-5) : une base de développement ou de formation ne passe jamais en production.
- La **pile d'essai** est reconstruite de zéro.
- L'**ancien volume** `nacer_siipi_postgres_data` (arrêté à la migration 012) est sauvegardé en archive hors ligne, puis retiré. **Claude Code demande la confirmation de Nacer avant le retrait** : il est irréversible.

## 3. Serveur d'envoi de courriels (SMTP)

- Un **compte d'envoi sur `fnct.org.tn`** (du type `noreply@fnct.org.tn`), demandé à la DSI avec la demande d'hébergement.
- Aucun changement de code : le mécanisme `SMTP_*` (v0.15.47) existe. D'ici là, le mot de passe provisoire reste affiché une fois au cadre.

## 4. Chantier P — préparation à la mise en production

Indépendant de l'hébergeur que la DSI proposera.

- **Sauvegardes** : base et photos ensemble, quotidiennes, chiffrées, avec rotation ; copie hors du serveur.
- **Restauration testée** : une campagne restaure la dernière sauvegarde sur une base neuve et vérifie que les recomptages sont identiques.
- **HTTPS** : reverse proxy avec certificat renouvelé automatiquement ; seuls les ports 80 et 443 sont ouverts ; la base n'est jamais exposée.
- **Supervision** : `/health` surveillé, alerte si la plateforme ou la sauvegarde échoue.
- **Déploiement et mise à jour** : procédure écrite (installation sur base neuve, migrations, retour arrière) ; secrets dans l'environnement, jamais dans le dépôt.
- **Refus** : les campagnes de tests refusent de tourner sur une base de production.

## 5. Populations des communes

- **On garde les valeurs actuelles de SIIPI**, marquées « estimées », sans changement. La carte du conseiller SIG ne les remplace pas.

## 6. Noms arabes douteux

- Claude Code produit `docs/specs_metier/sources/sig/NOMS_ARABES_A_VALIDER.md` à partir des écarts du 16 octobre (`ECARTS_CARTE_CONSEILLER_2026-10-16.md`) : code, commune, nom dans SIIPI, nom du conseiller, proposition, colonne « décision de Nacer ».
- **Nacer valide cas par cas.** Seuls les cas validés sont corrigés, par une migration. L'ancien nom reste dans l'historique et la correction est tracée au journal.

## 7. Lot 17.2 — matrice des densités

- Claude Code propose une **matrice provisoire** : par type d'engin et par flux, densités minimale, typique et maximale, **chaque valeur avec sa source** (PCGD reçus, études). Une valeur sans source reste vide : rien n'est inventé.
- La matrice est marquée « provisoire ». **Nacer la valide** avant chargement ; 17.2 se débloque alors.

## 8. Lot 17.4 — connecteur GPS générique

**Décision** : premier fournisseur, la commune de **Menzel Chaker**. Le connecteur est **générique et paramétrable depuis le portail**, sans code propre à un fournisseur dans SIIPI.

**Étapes (plan de Nacer)** :
1. Configuration par commune, stockée de façon sécurisée : URL de l'API, mode (*pull* : SIIPI interroge ; *push* : le fournisseur envoie), jeton ou clé, correspondance des champs.
2. Écran « Intégration GPS » dans le portail de la commune.
3. Service générique : interrogation périodique ou réception par webhook, traduction des positions en PostGIS.
4. Migrations, campagne de tests avec un faux fournisseur générique, version, CHANGELOG, registre des décisions, PR.

**Exigences qui s'y ajoutent** (feuille de route § 10.4 et lignes rouges) :
- **Le jeton est un secret** : chiffré en base (clé dans l'environnement), jamais rendu par l'API ni affiché après l'enregistrement, jamais écrit dans les journaux.
- **Webhook authentifié** : un secret propre à chaque commune, refus de tout envoi non signé, limite de débit.
- **Positions d'engins uniquement** : jamais de GPS individuel sur un agent (ligne rouge 3).
- **Correspondance boîtier → engin** saisie par la commune. Une position sans engin correspondant est **signalée**, jamais rattachée au hasard.
- **Provenance** : les positions vont dans une table de traces de véhicules, marquées « GPS fournisseur ». Elles ne modifient jamais le tracé d'un circuit ni un relevé fait par la commune.
- **Panne du fournisseur** : l'écran affiche la date du dernier relevé reçu et l'échec ne bloque rien.
- **Cloisonnement** : RLS par commune sur la configuration et sur les traces ; la FNCT lit, le prestataire ne lit pas la configuration.
- **Tests qui commencent par les refus** : jeton relu en clair, webhook non signé, position d'une autre commune, coordonnées hors Tunisie, position sans engin.
- **Pour le test réel** : la documentation de l'API et un accès de test de Menzel Chaker. Le lot est livrable avec le faux fournisseur ; il n'est *recetté* qu'avec Menzel Chaker.

## Restent en attente (démarches, pas des décisions)

- Une commune disponible pour la recette R1 (`recette:etat` dira si Dar Chaâbane peut commencer).
- La réponse de la DSI sur l'hébergement et le compte SMTP.
- L'article 13 et la date de départ de la période transitoire (18.2, 18.3).
- La documentation de l'API GPS de Menzel Chaker.

## Complément du 20 octobre 2026 (soir) — ordre de travail révisé

Remplace l'« Ordre de travail » en tête de ce registre.

- **Nouvel objectif proche : la présentation** au staff de la FNCT et au ministère de l'Intérieur, dans **2 à 3 semaines**, en **diapositives avec captures d'écran**, sur les **seules communes réelles déjà chargées**. SIIPI ne sort devant une commune que lorsque Nacer la juge prête.
- **Jalon D d'abord** (`docs/specs_metier/SPEC_D_pret_a_presenter.md`) : D1 logos des communes (déposés par la commune, FNCT en secours), D2 page d'accueil du portail, D3 UI/UX des écrans indicateurs, national et accueil, D4 bibliothèque nationale des données, D5 captures d'écran.
- **Ensuite**, dans l'ordre : versions fantômes, chantier P, 17.4, noms arabes, 17.2.
- Le courriel à la DSI (hébergement et compte SMTP) est envoyé le 20 octobre ; le chantier P attend sa réponse pour le choix de l'hébergeur, pas pour sa préparation.

## Complément du 20 octobre 2026 (fin) — tout reprend après D

- **Pendant le jalon D, rien d'autre n'est travaillé.** Claude Code ne présente pas les autres points comme « sans changement » à chaque lot : ils sont **suspendus jusqu'à la fin de D**, pas fermés.
- **Après D, tout reprend**, dans cet ordre : versions fantômes et bases d'essai, chantier P, 17.4 connecteur GPS, noms arabes, 17.2 matrice des densités, puis le **jalon 14 (mutualisation)**, qui n'attend plus que les jalons 11 à 13 tournent en production.
- Restent dépendants d'une réponse extérieure : R1 (Nacer décide quand SIIPI est prête), la DSI (hébergement, compte SMTP à demander dans la relance), l'article 13 (18.2, 18.3), l'API GPS de Menzel Chaker.

## Complément du 23 octobre 2026 — versions fantômes closes, chantier P tranché

**Versions fantômes (§ 1).** La liste à blanc est vide : la base du dossier principal ne porte aucune version du
découpage ; la pile d'essai, reconstruite de zéro, a perdu ses trois fantômes ; l'ancien volume
`nacer_siipi_postgres_data` n'a pas d'historique du découpage. **JC-010 est close par la documentation, sans
opération de retrait** : elle n'aurait rien à retirer. La signature de l'inventaire devient un outil en lecture seule,
`scripts/skills/versions-fantomes.sh`, à lancer sur toute base avant une recette ou une mise en production. Si une
base en porte un jour, la FNCT décide, et le retrait s'écrit alors contre ces lignes-là.

**Chantier P (§ 4).** Le plan en six lots est validé, dans cet ordre : P1 refus, P2 sauvegardes, P3 restauration
testée, P4 HTTPS, P5 supervision, P6 déploiement et mise à jour. Trois choix tranchés :

- **Le refus vaut aussi pour une base de formation** : les campagnes ne tournent que sur une base de développement,
  et devant une API de développement. Une nature illisible ou une API injoignable valent refus.
- **Caddy** sert le front et relaie l'API, avec un certificat renouvelé automatiquement ; il accepte aussi un
  certificat fourni par la DSI.
- **La clé privée des sauvegardes** (chiffrement `age` par clé publique : le serveur chiffre, il ne sait pas
  déchiffrer) est gardée par **deux personnes de la FNCT**, sur un support hors ligne. Sans elle, aucune sauvegarde
  n'est lisible.

## Complément du 23 octobre 2026 (soir) — Lot 17.4 : les choix

Le plan du lot 17.4 (§ 8) est validé, en deux lots : **17.4a** le service, **17.4b** l'écran. Quatre choix :

- **Le webhook est signé** (HMAC-SHA256 du corps et de l'horodatage, secret propre à la commune) ; un mode « jeton dans
  l'en-tête » ne s'ajoutera que si la documentation de Menzel Chaker montre que leur plateforme ne sait pas signer.
- **Les traces sont gardées entières** pour l'instant ; la supervision surveille le disque. Une colonne `agregee_le`
  (vide) est réservée dans `traces_engins` pour résumer plus tard les vieilles traces sans casser la base.
- **L'écran porte une carte** : la dernière position de chaque engin, la trace du jour d'un engin choisi.
- **La commune seule écrit la configuration** ; la FNCT la lit.

Trois ajouts de Nacer :

- **Une aide dans l'écran**, près du bouton « Essayer », en français et en arabe : « Si votre fournisseur change son API,
  recliquez sur Essayer pour vérifier le mapping. » (17.4b).
- **Un horodatage illisible ou impossible n'entre jamais dans `traces_engins`** : il va dans les positions signalées. Un
  mutant qui force une telle position dans les traces fait échouer la campagne `gps` (17.4a).
- **La colonne `agregee_le`**, nulle, documentée « Date à laquelle cette trace a été résumée. NULL = trace brute. » (17.4a).

## Complément du 25 octobre 2026 — Noms arabes : les décisions (§ 6)

La liste `docs/specs_metier/sources/sig/NOMS_ARABES_A_VALIDER.md` est tranchée (décision **D-NOMS-AR-1**) :

- **Groupe A, 12 noms : corrigés** par la migration 086 (Tazarka, Tazghrane Boukrim Zaouiet El Mgaiez, Tunis, Sidi Bou
  Saïd, Bembla El Mnara, El Masdour Menzel Harb, Cherahil, Tlelsa, El Alâa, Nasrallah, Ben Guerdane, Bir Lahmar). L'ancien
  nom reste dans `corrections_referentiel` et au journal d'audit ; un nom déjà changé par la FNCT n'est pas réécrit.
- **Groupe C, 24 noms : gardés** tels que dans SIIPI (variantes, gouvernorat ajouté, nom complet, erreurs de la carte).
- **Groupe B, 8 noms : en attente** d'une source officielle (Kalaat Khasba, Bahra, Grymet Hicher, Zelba, Hazeg El Louza,
  Sisseb-Driaat, Aïn El Beidha, Saïda). Rien n'est changé d'ici là.

## Complément du 25 octobre 2026 (suite) — Le guide TADAEEM, la matrice 17.2, le lot T

- **Le guide TADAEEM devient la référence métier officielle de SIIPI** (*Guide d'optimisation de la collecte des DMA en
  Tunisie*, USAID TADAEEM, MALE ; `docs/specs_metier/sources/guide_tadaeem_collecte_dma.pdf`, lu dans
  `GUIDE_TADAEEM_LECTURE.md`). Il sert pour tout le reste du plan. Le code applique ses formules sans le citer en
  commentaire ; les documents et les colonnes `source` le citent.
- **Matrice des densités 17.2, flux DMA** (§ 7), validée par Nacer :
  - benne tasseuse de 7 à 8 m³ : **0,35** ; de plus de 8 m³ : **0,5** ; de moins de 7 m³ : aucune densité ;
  - tracteur et remorque compactrice : **0,3** ;
  - benne basculante (Cbb), tracteur et remorque agricole (Tag), poubelles et conteneurs : **fourchette 0,20 – 0,25**
    (le guide donne 0,2 aux Tableaux 2 et Annexe 14, 0,25 au Tableau 11 : les deux bornes viennent de lui) ;
  - un engin sans densité dans le guide (pick-up, ampli-roll, remorque seule) : **aucune estimation**, « non renseigné ».
  - La benne tasseuse à 0,75 t/m³ n'est pas retenue.
- **Ordre de travail** : lot T (typologie des engins), puis 17.2, puis K (indicateurs du § 1.2.7), puis C (coût de
  collecte par circuit et par engin), puis le jalon 14.
- **Lot T, plan validé** avec ses quatre recommandations :
  1. aucun engin n'est classé automatiquement ; l'écran propose la classe évidente (benne tasseuse, ampli-roll), la
     commune la confirme ;
  2. pour un attelage, classe et volume se portent sur la remorque ; le tracteur les reprend par `attele_a` ;
  3. le volume dit sa provenance (constructeur, mesuré, déclaré), avec une aide longueur × largeur × hauteur ;
  4. un volume hors de la plage de référence de sa classe est un avis de « À vérifier », jamais un refus.

## Complément du 26 octobre 2026 — Lot 17.2 : les engins absents de la matrice, le plan

- **Correction de la matrice (§ 7)** : les engins que les tableaux de densité du guide ne citent pas — le **pick-up** et
  l'**ampli-roll avec caisson** — ne compactent pas. Ils prennent la **fourchette des non-compactants, 0,20 – 0,25 t/m³**.
  Pas de « non renseigné » pour eux. Le reste de la matrice du 25/10 tient : 0,20 – 0,25 pour les poubelles et
  conteneurs, la benne basculante et le tracteur à remorque agricole ; 0,35 pour la benne tasseuse de 7 à 8 m³ ; 0,5
  au-delà de 8 m³ ; **rien sous 7 m³** pour une benne tasseuse.
- Une remorque porte toujours une classe qui a sa densité (agricole 0,20 – 0,25, compactrice 0,3). Reste « non
  renseigné » l'engin dont la commune n'a pas encore dit la classe : on ne sait pas s'il tasse.
- **Plan 17.2**, avec les quatre recommandations : calcul **benne pleine** (le taux de remplissage réel viendra du lot K,
  aucun taux par défaut) ; **seuls les voyages non pesés s'estiment**, le pesé reste à côté, jamais additionné ; la
  matrice se révise par la **FNCT**, valeur datée et sourcée, jamais effacée ; les **poubelles et conteneurs** sont dans
  la matrice mais ne servent pas à l'estimation (pré-collecte, plus tard).
