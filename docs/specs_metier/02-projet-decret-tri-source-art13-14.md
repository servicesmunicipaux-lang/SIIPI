# Projet de décret — tri à la source et collecte séparée : définitions, articles 13.1 et 14

> **Statut : projet, non en vigueur.** Texte communiqué par Nacer le 30/09/2026 ; il est présenté
> comme la « vision partagée » du ministère de l'Environnement et du ministère de l'Intérieur
> (tutelle des communes). Il renvoie à des articles **non fournis** : l'article 4 (auditeur de tri
> et de collecte séparée) et l'article 13 (cartes professionnelles et identification).
> Le texte source bilingue (français / arabe) est conservé par Nacer ; le déposer dans
> `sources/` dès qu'une version citable existe. Ce fichier en est la **lecture orientée
> développement**, pas une reproduction.

Règle : SIIPI ne présente **jamais** ce texte comme une obligation en vigueur. Tout ce qui en
découle est livré derrière un paramètre national `cadre_secteur_informel_actif` (faux par défaut),
et toutes les durées ci-dessous sont des **paramètres historisés**, pas des constantes du code.

## 1. Définitions retenues (six)

| Terme | Ce qui le distingue | Conséquence pour la donnée |
| :--- | :--- | :--- |
| Pré-collecte séparative | Opérations *avant* la collecte par la commune ou son délégataire : stockage temporaire chez le producteur, dispositifs pour présenter les déchets triés | Hors périmètre de saisie SIIPI |
| Collecteur | Personne physique ou morale habilitée à la collecte séparée de déchets déjà triés | Catégorie générique |
| Secteur informel | Activités de pré-collecte, collecte, tri, valorisation, recyclage par des personnes **non déclarées** ou hors réglementation | Le registre communal les *déclare* : c'est ce qui les fait sortir de l'informel |
| Pré-collecteur informel (*barbéch*) | Collecte les valorisables dans la rue, chez les ménages ou sur les lieux de production ; **aucun local ou terrain** de stockage ; **n'achète pas** à d'autres pré-collecteurs | Catégorie `pre_collecteur` |
| Collecteur-acheteur intermédiaire informel | Achète aux pré-collecteurs, stocke, trie, revend à des grossistes ou recycleurs ; dispose **en général** d'un local, de véhicules motorisés et d'un pesage étalonné | Catégorie `intermediaire` |

Les deux catégories opérationnelles se distinguent par des faits vérifiables (local, achat aux
pairs, véhicule motorisé). Le formulaire de saisie doit poser ces questions et **signaler**
l'incohérence (« déclare acheter à d'autres pré-collecteurs : relève de la catégorie
intermédiaire ») sans la corriger seul.

## 2. Article 13.1 — intégration progressive du secteur informel (déchets secs des ménages)

| Disposition | Qui agit | Ce que SIIPI peut porter |
| :--- | :--- | :--- |
| Reconnaissance de la valeur économique, sociale, environnementale ; mesures progressives vers la formalisation | Communes, éco-organismes | — |
| Territoires sans secteur informel ou à présence saisonnière : les communes peuvent autoriser leurs agents de propreté à des activités complémentaires de collecte de valorisables, **par arrêté municipal** | Commune | Référence de l'arrêté, périmètre, dates. **Jamais** de suivi individuel de rendement des agents (ligne rouge 2) |
| **Carte de pré-collecteur** : sur demande à la commune ; validité **1 an renouvelable** ; **gratuite** ; droit d'accès aux points d'apport volontaire et au porte-à-porte dans des zones définies ; reconnaissance officielle ; accès prioritaire à la formation et à la protection sociale | Commune | Demande, décision, numéro scellé, zones, renouvellement, retrait motivé. **Aucun champ de paiement** (ligne rouge 5) |
| Conditions de délivrance : déclaration d'activité simplifiée ; engagement d'hygiène et de sécurité ; acceptation d'un accompagnement progressif | Demandeur | Trois attestations enregistrées, avec date |
| **Intermédiaire agréé** : agrément de l'**éco-organisme** (non de la commune), cahier des charges adapté — local autorisé, instruments de pesée étalonnés, registre des transactions avec les pré-collecteurs, barème de prix équitable, véhicules en état et assurés ; agrément **2 ans renouvelable** ; ouvre la reconnaissance comme prestataire logistique officiel, les contrats avec l'éco-organisme, des financements préférentiels | Éco-organisme | **Enregistrer** le statut, la référence et l'échéance de l'agrément délivré ailleurs, avec alerte d'échéance. SIIPI **n'agrée pas** |
| Formalisation après la période transitoire : conformité à l'article 13 ; accompagnement (statut d'auto-entrepreneur, régularisation fiscale, immatriculation des véhicules, signature du cahier des charges) ; étalonnage des instruments **dans les six mois** suivant la fin de la période | Communes, éco-organismes | Jalons d'accompagnement par acteur, agrégés au niveau communal |
| Missions de l'éco-organisme à but non lucratif : organiser et financer la collecte séparée, garantir un prix d'achat équitable, agréer et superviser les intermédiaires, accompagner, faire l'interface entre producteurs, acteurs informels agréés et recycleurs | Éco-organisme | — |
| Missions des autorités, communes et éco-organisme : **établir un registre des acteurs informels** du territoire ; former ; faciliter l'accès aux pesées étalonnées ; organiser la transition ; fonds d'accompagnement auprès de l'éco-organisme | Commune (registre) | **Registre communal des acteurs** — le cœur de la v0.18 |
| Période transitoire de **3 ans** (déchets secs des ménages) ; pendant elle, l'activité est permise à condition d'avoir **entamé une démarche de formalisation auprès de la commune** ; ensuite, seuls les acteurs pleinement conformes à l'article 13 collectent | Commune | Statut `demarche_entamee` daté : c'est la pièce qui fait courir le droit d'exercer |
| Auditeur de tri et de collecte séparée (art. 4) : évalue les processus d'intégration, vérifie la traçabilité et l'étalonnage, certifie les changements de statut, médie, contrôle la qualité du service ; **rapport semestriel** au ministre chargé de l'environnement et aux communes concernées | Auditeur | Un profil de **lecture seule** sur les indicateurs agrégés ; pas de rôle d'écriture |

## 3. Article 14 — registres de collecte séparée et traçabilité digitalisée

- **Pesée à chaque enlèvement** par les collecteurs, pour les déchets triés à la source et collectés
  séparément.
- **Système de traçabilité digitalisé** sur toute la chaîne, permettant : l'enregistrement
  électronique des quantités pesées ; la **géolocalisation des opérations** de collecte et de
  transport ; la numérisation des documents de suivi (bordereaux, certificats de traitement) ;
  l'interconnexion des registres des différents acteurs.
- **Registre**, numérique ou physique **coté et paraphé, fourni par l'ANGeD** : quantités pesées,
  nature, origine, **noms des personnes chargées de la collecte**, horaires et périodicité,
  immatriculation des véhicules, destination, mode de valorisation.
- Registre numérique : mêmes rubriques que le physique, plateforme dédiée, **sécurisé contre toute
  modification non autorisée**.
- **Trois rubriques de signature et de validation** : collecteurs, producteurs, recycleurs ; cachets
  portant les **matricules fiscales** ; en numérique, **certificat électronique reconnu**.
- Les **recycleurs** doivent s'approvisionner auprès de collecteurs munis de registres, sous peine
  de sanction pénale.
- Consultation à toute réquisition : ministère de l'Environnement, ANGeD, ANPE, ministère des
  collectivités locales, auditeurs ; **accès en temps réel** de ces autorités à la plateforme.
- **L'ANGeD met à disposition gratuitement une application mobile et une plateforme web**, y
  compris pour les acteurs informels en cours de formalisation.

## 4. Ce que cela change pour SIIPI

1. **La frontière est nette.** Le texte confie à la **commune** : le registre des acteurs informels,
   la carte de pré-collecteur, la réception de la démarche de formalisation, l'arrêté municipal des
   agents. Il confie à l'**éco-organisme / ANGeD** : l'agrément des intermédiaires, les registres
   cotés et paraphés, la plateforme de traçabilité. SIIPI porte la première liste ; pour la seconde
   il **enregistre des références et s'interface**, il ne s'y substitue pas. C'est la même
   position que celle déjà prise pour l'interopérabilité ANGeD (feuille de route § 7.3).
2. **Le registre de l'article 14 n'est pas celui de la commune.** Il est tenu par les collecteurs et
   signé par eux, les producteurs et les recycleurs. Le construire dans SIIPI supposerait que
   l'ANGeD n'ouvre pas sa plateforme ; il est donc classé **prospectif, derrière le paramètre
   national**, et limité à la consultation et à l'export tant que l'ANGeD n'a pas publié son interface.
3. **Tension avec la ligne rouge 3.** L'article 14 demande la géolocalisation *des opérations* de
   collecte. Cela relève de la plateforme des collecteurs. SIIPI ne doit **pas** suivre des
   pré-collecteurs individuellement ; il ne reçoit, s'il reçoit quelque chose, que des quantités
   agrégées par zone.
4. **Données personnelles.** Registre communal, noms des personnes chargées de la collecte et
   matricules fiscales (identifiant d'une personne physique lorsque l'acteur est en nom propre) :
   tout cela tombe sous les amendements R1 à R3 de `SPEC_v0.16.md` — identifiant pseudonyme, table
   d'identité séparée, garde `hebergement_pii_accredite`, garde `recepisse_inpdp`. **La v0.18 ne
   commence pas avant que 16.1 soit clos.**
5. **Signatures.** Le scellement de 16.2 (numéro continu, contenu figé, annulation motivée)
   s'applique à la carte. Une signature électronique qualifiée, elle, ne se fabrique pas dans
   SIIPI : on enregistre la **référence du certificat et l'empreinte du document signé**, pas la
   signature.
6. **Les durées sont des paramètres.** 1 an (carte), 2 ans (agrément), 3 ans (période
   transitoire), 6 mois (étalonnage) : table nationale à date d'effet, comme la redevance ANGeD.

## 5. Ce qui reste à faire lever

| Point | Pourquoi il compte | Qui |
| :--- | :--- | :--- |
| Articles 4 et 13 du projet (auditeur ; cartes professionnelles et identification) | La carte de l'article 13 et celle du 13.1 sont-elles la même ? Les champs d'identification en dépendent | FNCT / ministères |
| Date de départ de la période transitoire de 3 ans | Sans elle, aucun décompte ni alerte n'est possible | FNCT / ministères |
| Version arabe du dernier alinéa de la période transitoire : la négation semble mal placée (« ne peuvent … que les acteurs pleinement conformes ») | Le sens change : qui a le droit de collecter après la période | Rédacteur du projet |
| Périmètre « déchets secs » de l'article 13.1 face à « déchets des ménages » en tête de section | Détermine quels flux le registre couvre | FNCT |
| Constitution effective de l'éco-organisme et calendrier de la plateforme ANGeD | Conditionne le lot d'interconnexion | ANGeD |
| Carte délivrée à une personne morale : quelles pièces ? | Le texte parle de « personne physique ou morale » pour la définition, de « pré-collecteurs » pour la carte | FNCT |
