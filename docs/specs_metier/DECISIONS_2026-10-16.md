# Décisions de Nacer — 16 octobre 2026

Ce registre consigne les décisions prises pour débloquer les lots en attente. Claude Code doit les appliquer telles quelles. Une décision ne se modifie que par une nouvelle entrée datée ici.

## Plateforme

| Sujet | Décision | Lots concernés |
|---|---|---|
| Mobile et marquage blanc | **Attendre.** L'espace citoyen est d'abord installable sur téléphone (PWA), sans store. Le marquage blanc est conçu après l'usage réel. Pas d'application native par commune. | Jalon 9 (en attente), jalon 10 (PWA) |
| Courriels et SMS | **Courriel d'abord, SMS plus tard.** Le push web reste le canal immédiat. Aucun contrat SMS maintenant. | B1.2, B5.4.3 |
| Inscription par téléphone | **Pas de code SMS (OTP) tant qu'aucun fournisseur SMS n'est choisi.** L'inscription reste par courriel. Le numéro peut être saisi plus tard, sans vérification. | M1 |
| Modèles des documents à numérotation scellée (16.2) | **Construire maintenant.** Les quatre modèles affichent « modèle provisoire » jusqu'à validation par le chef de dépôt de Dar Chaâbane pendant la recette. | 16.2, 16.3, 16.4 |

## Mutualisation (jalon 14, `SPEC_v0.19_mutualisation.md`)

| Sujet | Décision | Lots concernés |
|---|---|---|
| D-1 Forme juridique | **Convention signée par les deux présidents.** SIIPI enregistre sa référence. | 19.1 |
| D-2 Écriture de la prêteuse pendant le prêt | **Refusée**, avec la période du prêt affichée. | 19.1 |
| D-3 Panne pendant le prêt | **La bénéficiaire déclare, la prêteuse instruit**, la convention fixe qui paie. | 19.1 |
| D-4 Chauffeur | **Chauffeur de la bénéficiaire par défaut.** | 19.1 |
| D-5 Distance limitrophe et tolérance | **Valeurs fixées sur les relevés de Djerba**, comme paramètres nationaux datés. Le conseiller SIG valide. | 19.2 |
| D-6 Réclamation près d'une limite | **Non transférée.** À instruire avec le jalon 15. | Hors jalon 14 |
| D-7 Communes de test | **Djerba : Ajim, Midoun, Houmt Souk.** | 19.2 et recette R2 |

## Démarches restantes (pas des décisions)

Ces points restent en attente d'une action extérieure. Ils ne sont pas tranchés :

- Une commune disponible pour la recette terrain (R1 Dar Chaâbane, R2 M'hamdia).
- Les vecteurs de référence de l'outil UNIDO original (entrées et sorties documentées), pour valider le moteur WaPla réimplémenté (W0).
- Le fichier des normales climatiques INM 1981-2010 par gouvernorat, depuis data.gov.tn (open data, licence OTL), pour le lot d'import des normales (voir l'amendement du 20/10/2026).
- Les articles 13 et 14 du décret et la date de départ de la période transitoire (jalons 18.2 et 18.3).
- La documentation des API GPS (lot 17.4) et la matrice des densités (lot 17.2).

---

## Amendement du 20 octobre 2026 — WaPla : W0 et le climat

**W0.** WaPla n'est pas un service externe : ses méthodes de calcul sont réimplémentées dans SIIPI
(`backend/src/wapla/moteur.ts`, couche `wapla.*`). W0 devient la **validation du moteur WaPla réimplémenté contre
les vecteurs de référence UNIDO, sans dépendance externe**. Écartés : une application WaPla à lancer, une URL
locale, un service externe à connecter.

**Climat — décision annulée le jour même.** Une première décision du 20/10/2026 confiait la saisie du climat à
chaque commune. Elle est **annulée** : imposer une saisie météo à 350 communes est un fardeau opérationnel, quand
24 gouvernorats suffisent et sont la maille officielle de l'INM. Est acté :

- **maille** : le gouvernorat (24 lignes) ;
- **source** : les normales climatiques INM 1981-2010, publiées en open data sous licence OTL (Open Tunisian
  License) sur data.gov.tn et catalogue-data.transport.tn ; aucun achat à l'INM ; pas de 1991-2020 tant qu'elles
  ne sont pas publiées en open data ;
- **saisie** : la FNCT, par `/wapla/facteurs-reference` ; les normales sont chargées en base une fois, puis
  versionnées par leur date d'effet ;
- **ni** fichier national importable côté commune, **ni** dépendance à une API externe à l'exécution ;
- la commune **peut** saisir sa météo locale en surcharge ; ce n'est pas obligatoire ;
- un bilan **étayé** a un climat renseigné ; un bilan indicatif peut ne pas en avoir, affiché comme tel.

Le code climat (message de l'amorce, API `/wapla/facteurs-reference`) reste tel quel jusqu'au lot d'import des
normales.
