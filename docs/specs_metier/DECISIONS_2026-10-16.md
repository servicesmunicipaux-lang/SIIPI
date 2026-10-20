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
- Les 27 feuilles NOAA des normales OMM 1991-2020, leur manifeste (empreintes SHA-256) et la correspondance station → gouvernorat (24 lignes), pour le chargement des normales (voir l'amendement du 20/10/2026, complété).
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

**Complément du même jour — la source des normales.** Les normales INM 1981-2010 sont remplacées par les
**normales OMM 1991-2020 publiées par la NOAA** pour 27 stations tunisiennes : gratuites, standard OMM actuel, une
seule période ; aucun fichier INM n'est déposé. Une feuille par station (« Single Station Data Sheet ») ; on n'en
lit que les précipitations annuelles (paramètre 1, somme) et la température moyenne annuelle (paramètre 5,
moyenne). Le gouvernorat qui a sa station reçoit une normale **stationnaire** ; le gouvernorat sans station, celle
de la station la plus proche, **estimée**, avec la distance — Ariana, Ben Arous et Manouba depuis Tunis-Carthage,
Sousse depuis Monastir. Chaque normale porte sa période, sa méthode de rattachement, ses stations, sa distance et
son label, dans `wapla.facteurs_reference` (une seule source par donnée : pas de table nouvelle). Les feuilles sont
contrôlées par leur empreinte SHA-256 contre un manifeste. La date d'effet est paramétrable ; par défaut, le
1er janvier qui suit la période (2021).

**Complément du même jour — W0 acté.** **W0 acté le 20/10/2026 : validation par lecture croisée**, pas un rejeu contre une exécution de l'outil UNIDO. Le moteur a été écrit d'après une lecture de `server.r` ; un second port, en Python et indépendant du code de l'application (`backend/tests/wapla_attendus.py`), a été écrit d'après la même lecture ; les deux concordent sur 213 jeux (campagne `wapla-moteur`). C'est moins fort qu'un rejeu contre exécution, et c'est assumé : aucun vecteur officiel n'existe en accès libre (ni dans l'archive de l'outil, ni dans ses manuels, ni sur les pages de TU Wien), et aucune démarche n'est engagée pour en obtenir. Le jour où des vecteurs officiels apparaissent, ils entrent dans la campagne `wapla-moteur` et W0 repasse en « validé contre exécution ». Pas de lettre, pas d'attente externe.

**Complément du même jour — la distance d'une normale estimée.** Elle est la distance haversine réelle entre la
station et le centre géométrique du gouvernorat (centroïde des limites de ses communes), calculée par le
chargement ; jamais une valeur fictive ni recopiée. Sur les feuilles réelles : Ariana 16,5 km, Ben Arous 22,3 km
et Manouba 33,2 km de Tunis-Carthage ; Sousse 42,1 km de Monastir.
