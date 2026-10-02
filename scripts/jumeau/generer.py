"""Génère le jeu du jumeau numérique (lot S1) : trois mois d'activité simulée.

    python scripts/jumeau/generer.py

Écrit backend/seed/data/jumeau_3mois.json, qui est VERSIONNÉ : l'application
charge ce fichier, elle ne le génère pas. Deux chargements donnent donc les
mêmes données par construction, quelle que soit la version de Python qui a
servi à le produire.

Ce que le jeu reprend de Dar Chaabane El Fehri : la STRUCTURE — treize
circuits (huit de levée, cinq de balayage), vingt-neuf engins répartis par
catégorie et par état, soixante et un agents répartis par fonction. Rien
d'autre : aucun nom, aucune immatriculation, aucun matricule, aucun salaire
réels. Les noms sont tirés de deux listes de prénoms et de noms courants ; les
immatriculations commencent par « 99 », série qui n'existe pas.

Les anomalies VOLONTAIRES (rubrique « anomalies ») sont là pour que chaque
alerte se déclenche, puis s'éteigne quand la campagne corrige la donnée.
Ailleurs, le jeu est propre : aucune réclamation laissée ouverte, aucun
nettoyage oublié — sinon chacun ferait une alerte de plus, et l'on ne saurait
plus lesquelles sont voulues.

Les valeurs attendues ne sont PAS calculées ici : backend/tests/jumeau_attendus.py
les recalcule depuis ce fichier, sans rien emprunter au code de l'application.
"""
import datetime as dt
import json
import pathlib
import random

GRAINE = 20260601
DEBUT = dt.date(2026, 6, 1)
FIN = dt.date(2026, 8, 31)
PRIX_GASOIL_TND = 2.205  # prix fictif, fixe sur la période

alea = random.Random(GRAINE)
jours = [DEBUT + dt.timedelta(days=i) for i in range((FIN - DEBUT).days + 1)]

PRENOMS = ['Mohamed', 'Ali', 'Sami', 'Karim', 'Nabil', 'Hichem', 'Walid', 'Anis', 'Fathi', 'Mounir',
           'Slim', 'Ridha', 'Lotfi', 'Bechir', 'Kamel', 'Imed', 'Hatem', 'Moez', 'Tarek', 'Zied',
           'Faouzi', 'Chokri', 'Adel', 'Hamza', 'Yassine', 'Nizar', 'Habib', 'Mehdi', 'Sofien', 'Maher']
NOMS = ['Ben Salah', 'Trabelsi', 'Gharbi', 'Jaziri', 'Hammami', 'Mejri', 'Ayari', 'Sassi', 'Dridi',
        'Chaouch', 'Ferchichi', 'Zouari', 'Bouazizi', 'Jlassi', 'Mansouri', 'Khelifi', 'Romdhane',
        'Hamdi', 'Riahi', 'Saidi', 'Baccouche', 'Toumi', 'Nasri', 'Labidi']


def nom_fictif(rang):
    return f'{PRENOMS[rang % len(PRENOMS)]} {NOMS[(rang * 7) % len(NOMS)]}'


def iso(d):
    return d.isoformat()


def horodatage(d, heure, minute):
    # Heure de Tunis (UTC+1, pas d'heure d'été) : écrite avec son décalage pour
    # que la base ne la reconvertisse pas selon le fuseau du serveur.
    return f'{d.isoformat()}T{heure:02d}:{minute:02d}:00+01:00'


# --- Commune -----------------------------------------------------------------
commune = {
    'id': 'demo_jumeau_numerique',
    'name': 'Commune de démonstration (jumeau numérique)',
    'name_ar': 'بلدية العرض (التوأم الرقمي)',
    'gouvernorat': 'Démonstration',
    'population': 46000,
    'lat': 36.47,
    'lng': 10.75,
}
CENTRE = (commune['lat'], commune['lng'])

# --- Parc : 29 engins, même répartition par catégorie que Dar Chaabane ---------
vehicules = []


def engin(type_, categorie, marque, charge, etat, motif=None):
    rang = len(vehicules) + 1
    vehicules.append({
        'cle': f'V{rang:02d}',
        'registration': f'99 9{rang:02d} {alea.randint(100, 999)}',
        'type': type_, 'categorie': categorie, 'marque': marque,
        'charge_utile_t': charge, 'etat': etat, 'motif_immobilisation': motif,
        'etat_depuis': None if etat == 'en_service' else '2026-05-15',
    })
    return vehicules[-1]['cle']


BENNES = [engin('benne_tasseuse', 'poids_lourd', 'Iveco', 8, 'en_service') for _ in range(2)]
engin('benne_tasseuse', 'poids_lourd', 'Ford', 12, 'en_panne', 'En attente de pièces de rechange')
engin('camion', 'poids_lourd', 'Renault Trucks', 6, 'en_service')
engin('camion', 'poids_lourd', 'Renault Trucks', 6, 'en_panne', 'Boîte de vitesses à remplacer')
engin('camion', 'poids_lourd', 'Iveco', 6, 'en_service')
engin('camion_remorque', 'poids_lourd', 'Iveco', 20, 'en_service')
engin('balayeuse', 'poids_lourd', 'RCM', None, 'en_panne', 'Brosses et aspiration hors d’usage')
for type_, etat, motif in [('chargeuse_pelleteuse', 'en_service', None), ('chargeuse_pelleteuse', 'en_panne', 'Réfection du moteur'),
                           ('chargeuse', 'en_service', None), ('mini_chargeuse', 'en_service', None),
                           ('mini_chargeuse', 'en_panne', 'En attente de pièces de rechange'), ('niveleuse', 'en_service', None)]:
    engin(type_, 'engin_lourd', 'New Holland', None, etat, motif)
TRACTEURS = [engin('tracteur', 'tracteur', 'Landini', None, 'en_service') for _ in range(6)]
engin('tracteur', 'tracteur', 'SAME', None, 'en_panne', 'Contrôle moteur à effectuer')
engin('tracteur', 'tracteur', 'Landini', None, 'a_reformer', 'À réformer')
# ANOMALIE A4 : un engin immobilisé sans motif — l'alerte demande de le dire.
V_SANS_MOTIF = engin('tracteur', 'tracteur', 'Changfa', None, 'en_panne', None)
REMORQUES = [engin('remorque', 'remorque', 'SIMMA', 3, 'en_service') for _ in range(6)]
assert len(vehicules) == 29

# --- Personnel : 61 agents, même répartition par fonction ----------------------
personnel = []


def agent(fonction, service='proprete', affectation='circuit', permis=None):
    rang = len(personnel) + 1
    personnel.append({
        'matricule': f'DEMO-{rang:03d}', 'nom_complet': nom_fictif(rang), 'fonction': fonction,
        'service': service, 'statut': 'titulaire', 'affectation': affectation, 'permis': permis,
    })
    return personnel[-1]['matricule']


CHEFS = [agent('chef_equipe', affectation='encadrement') for _ in range(2)]
CHAUFFEURS = [agent('chauffeur', permis=['C']) for _ in range(8)]
TRACTORISTES = [agent('tractoriste', permis=['B']) for _ in range(4)]
for _ in range(2):
    agent('mecanicien', service='atelier', affectation='atelier')
for _ in range(4):
    agent('jardinier', service='espaces_verts', affectation='point_fixe')
BALAYEURS = [agent('agent_balayage', affectation='balayage') for _ in range(18)]
AGENTS = [agent('agent') for _ in range(22)]
agent('encadrement', affectation='encadrement')
assert len(personnel) == 61

# --- Circuits : 8 de levée, 5 de balayage ---------------------------------------
circuits = []
conducteurs = TRACTORISTES + CHAUFFEURS  # 12 : six tracteurs, deux bennes, et des remplaçants
for n in range(1, 9):
    conteneurs = n >= 7
    vehicule = BENNES[n - 7] if conteneurs else TRACTEURS[n - 1]
    equipe = [{'matricule': conducteurs[n - 1], 'role': 'chauffeur'},
              {'matricule': AGENTS[2 * (n - 1)], 'role': 'agent'},
              {'matricule': AGENTS[2 * (n - 1) + 1], 'role': 'agent'}]
    base_lat = CENTRE[0] + 0.004 * (n - 4.5)
    points = []
    for o in range(1, 7):
        points.append({
            'ordre': o,
            'nom': f'Arrêt {n}.{o}',
            'type': 'debut_collecte' if o == 1 else ('fin_collecte' if o == 6 else ('point_de_collecte' if conteneurs else 'porte_a_porte')),
            'lat': round(base_lat + 0.0006 * o, 6),
            'lng': round(CENTRE[1] - 0.006 + 0.0021 * o, 6),
        })
    circuits.append({
        'code': f'LEVEE-{n}', 'nom': f'Circuit de levée n° {n}',
        'mode_collecte': 'conteneurs' if conteneurs else 'porte_a_porte', 'type_dechet': 'menager',
        'voyages_par_jour': 1 if conteneurs else 2, 'jours_passage': [1, 2, 3, 4, 5, 6, 7],
        'vehicule': vehicule, 'taille_equipe': len(equipe), 'poste': 'jour',
        'heure_depart': '05:30', 'heure_fin': '11:30', 'equipe': equipe, 'points': points,
    })
repartition = [4, 4, 4, 3, 3]
debut = 0
for n, taille in enumerate(repartition, start=1):
    membres = BALAYEURS[debut:debut + taille]
    debut += taille
    equipe = [{'matricule': m, 'role': 'agent'} for m in membres]
    if n <= 2:
        equipe.append({'matricule': CHEFS[n - 1], 'role': 'chef_equipe'})
    circuits.append({
        'code': f'BALAYAGE-{n}', 'nom': f'Balayage manuel, secteur {n}',
        'mode_collecte': 'mixte', 'type_dechet': 'balayage',
        'voyages_par_jour': 1, 'jours_passage': [1, 2, 3, 4, 5, 6],
        'vehicule': None, 'taille_equipe': len(equipe), 'poste': 'jour',
        'heure_depart': '05:00', 'heure_fin': '11:00', 'equipe': equipe, 'points': [],
    })
circuit_de = {e['matricule']: c['code'] for c in circuits for e in c['equipe']}
jours_de = {c['code']: c['jours_passage'] for c in circuits}

# --- Présences : chaque agent, chaque jour --------------------------------------
presences = []
for p in personnel:
    m = p['matricule']
    code = circuit_de.get(m)
    for d in jours:
        travaille = code is None and d.isoweekday() <= 6 or code is not None and d.isoweekday() in jours_de[code]
        if not travaille:
            presences.append({'matricule': m, 'jour': iso(d), 'present': False, 'motif_absence': 'repos', 'circuit': None})
            continue
        tirage = alea.random()
        motif = ('absence_non_justifiee' if tirage < 0.02 else
                 'absence_justifiee' if tirage < 0.06 else
                 'conge' if tirage < 0.09 else
                 'formation' if tirage < 0.10 else None)
        presences.append({'matricule': m, 'jour': iso(d), 'present': motif is None, 'motif_absence': motif,
                          'circuit': code if motif is None else None})

# --- Pesées : chaque circuit de levée, chaque jour, chaque voyage ---------------
pesees = []
for c in circuits[:8]:
    for d in jours:
        for v in range(1, c['voyages_par_jour'] + 1):
            if c['mode_collecte'] == 'conteneurs':
                kg = alea.randint(5200, 7400)
            else:
                kg = alea.randint(1800, 2900)
            # Le samedi, le second voyage du circuit 1 ramène les déchets verts.
            type_dechet = 'vert' if c['code'] == 'LEVEE-1' and v == 2 and d.isoweekday() == 6 else 'menager'
            pesees.append({'circuit': c['code'], 'jour': iso(d), 'voyage': v, 'vehicule': c['vehicule'],
                           'type_dechet': type_dechet, 'poids_net_kg': kg})
# ANOMALIE A1 : une pesée au-delà de la charge utile de la benne (8 t).
A1 = next(p for p in pesees if p['circuit'] == 'LEVEE-7' and p['jour'] == '2026-07-14' and p['voyage'] == 1)
A1['poids_net_kg'] = 9400

# --- Fins de poste --------------------------------------------------------------
fins_de_poste = []
for c in circuits[:8]:
    chauffeur = next(e['matricule'] for e in c['equipe'] if e['role'] == 'chauffeur')
    for d in jours:
        fins_de_poste.append({'vehicule': c['vehicule'], 'circuit': c['code'], 'chauffeur': chauffeur,
                              'jour': iso(d), 'benne_bachee': alea.random() < 0.92})

# --- Carburant : tous les trois jours, chaque engin d'un circuit ------------------
carburant = []
for c in circuits[:8]:
    benne = c['mode_collecte'] == 'conteneurs'
    for d in jours[c['voyages_par_jour'] % 3::3]:
        litres = alea.randint(70, 130) if benne else alea.randint(30, 60)
        carburant.append({'vehicule': c['vehicule'], 'jour': iso(d), 'litres': litres,
                          'montant_tnd': round(litres * PRIX_GASOIL_TND, 3)})

# --- Réclamations ------------------------------------------------------------------
CATEGORIES = ['point_noir', 'conteneur_plein', 'conteneur_deteriore', 'encombrants', 'dechets_verts', 'ddc', 'autre']
TITRES = {
    'point_noir': 'Dépôt sauvage au bord de la route', 'conteneur_plein': 'Conteneur plein non vidé',
    'conteneur_deteriore': 'Conteneur endommagé', 'encombrants': 'Encombrants sur le trottoir',
    'dechets_verts': 'Déchets de jardin non ramassés', 'ddc': 'Gravats déposés sur la voie', 'autre': 'Autre signalement',
}
tickets = []
for n in range(1, 150):
    d = jours[alea.randrange(len(jours) - 5)]
    cat = CATEGORIES[alea.randrange(len(CATEGORIES))]
    h, mi = alea.randint(7, 20), alea.randint(0, 59)
    rejete = alea.random() < 0.05
    delai_h = alea.randint(4, 24 * 10)  # jusqu'à dix jours : certaines hors délai
    cree = dt.datetime(d.year, d.month, d.day, h, mi)
    resolu = cree + dt.timedelta(hours=delai_h)
    tickets.append({
        'numero': f'DEMO-2026-{n:04d}', 'category': cat, 'title': TITRES[cat],
        'priority': ['basse', 'moyenne', 'haute'][alea.randrange(3)],
        'status': 'rejete' if rejete else 'resolu',
        'cree_le': horodatage(d, h, mi),
        'resolu_le': None if rejete else f'{resolu.date().isoformat()}T{resolu.hour:02d}:{resolu.minute:02d}:00+01:00',
        'rejet_motif': 'Hors du périmètre du service de propreté' if rejete else None,
        'lat': round(CENTRE[0] + alea.uniform(-0.02, 0.02), 5), 'lng': round(CENTRE[1] + alea.uniform(-0.02, 0.02), 5),
        'location_name': f'Quartier {alea.randint(1, 9)}',
    })
# ANOMALIE A2 : une réclamation reçue le 25 août, jamais traitée.
tickets.append({
    'numero': 'DEMO-2026-0150', 'category': 'point_noir', 'title': 'Dépôt sauvage près du marché',
    'priority': 'haute', 'status': 'recu', 'cree_le': horodatage(dt.date(2026, 8, 25), 9, 15),
    'resolu_le': None, 'rejet_motif': None,
    'lat': round(CENTRE[0] + 0.004, 5), 'lng': round(CENTRE[1] - 0.003, 5), 'location_name': 'Marché hebdomadaire',
})

# --- Lieux et nettoyages ---------------------------------------------------------------
poi = [
    {'cle': 'MARCHE-HEBDO', 'nom': 'Marché hebdomadaire', 'type': 'marche', 'lat': CENTRE[0] + 0.004, 'lng': CENTRE[1] - 0.003, 'jour': 7},
    {'cle': 'MARCHE-CENTRAL', 'nom': 'Marché central', 'type': 'marche', 'lat': CENTRE[0] + 0.001, 'lng': CENTRE[1] + 0.002, 'jour': 6},
    {'cle': 'CIMETIERE', 'nom': 'Cimetière municipal', 'type': 'cimetiere', 'lat': CENTRE[0] - 0.006, 'lng': CENTRE[1] + 0.004, 'jour': 5},
    {'cle': 'ABATTOIR', 'nom': 'Abattoir municipal', 'type': 'abattoir', 'lat': CENTRE[0] - 0.003, 'lng': CENTRE[1] - 0.007, 'jour': 4},
]
nettoyages = []
for d in jours:
    if d.isoweekday() <= 6:
        nettoyages.append({'titre': 'Balayage des rues du centre', 'jour': iso(d), 'poi': None,
                           'statut': 'terminee', 'metres_lineaires': alea.randint(3200, 4800)})
for lieu in poi:
    for d in jours:
        if d.isoweekday() == lieu['jour']:
            nettoyages.append({'titre': f"Nettoyage — {lieu['nom']}", 'jour': iso(d), 'poi': lieu['cle'],
                               'statut': 'terminee', 'metres_lineaires': None})
# ANOMALIE A3 : le nettoyage de l'abattoir du 27 août, resté « planifié ».
A3 = next(n for n in nettoyages if n['poi'] == 'ABATTOIR' and n['jour'] == '2026-08-27')
A3['statut'] = 'planifiee'

# --- Contrôles terrain : deux par semaine ------------------------------------------------
controles = []
for d in jours:
    if d.isoweekday() in (2, 5):
        c = circuits[alea.randrange(8)]
        t = alea.random()
        controles.append({'circuit': c['code'], 'jour': iso(d), 'voyage': 1,
                          'etat': 'fait' if t < 0.8 else ('partiel' if t < 0.95 else 'non_fait')})

# --- Incidents, EPI, effectifs -------------------------------------------------------------
incidents = []
for _ in range(12):
    d = jours[alea.randrange(len(jours))]
    incidents.append({'circuit': circuits[alea.randrange(8)]['code'], 'jour': iso(d),
                      'type': ['acces_bloque', 'point_sature', 'panne_vehicule', 'dechets_non_conformes'][alea.randrange(4)],
                      'statut': 'clos', 'description': 'Incident simulé'})
incidents_travail = [
    {'matricule': AGENTS[3], 'jour': '2026-06-18', 'type': 'accident', 'gravite': 'avec_arret', 'jours_arret': 5},
    {'matricule': BALAYEURS[7], 'jour': '2026-07-22', 'type': 'accident', 'gravite': 'avec_arret', 'jours_arret': 12},
    {'matricule': AGENTS[10], 'jour': '2026-08-05', 'type': 'presque_accident', 'gravite': 'benin', 'jours_arret': 0},
]
terrain = CHEFS + CHAUFFEURS + TRACTORISTES + BALAYEURS + AGENTS
dotations_epi = []
for m in terrain[:40]:
    dotations_epi.append({'matricule': m, 'type_epi': 'gilet', 'date_remise': '2026-06-02'})
    dotations_epi.append({'matricule': m, 'type_epi': 'gants', 'date_remise': '2026-06-02'})
effectifs = [{'annee': 2026, 'service': 'proprete', 'effectif_ouvriers': 54, 'effectif_encadrement': 3,
              'masse_salariale_tnd': 1450000}]

# --- Communication : un sondage clos, une notification archivée ----------------------------
reponses = []
for _ in range(48):
    reponses.append({'question': 1, 'choix': [alea.choice([0, 0, 1, 1, 1, 2, 3])], 'note': None})
    reponses.append({'question': 2, 'choix': None, 'note': alea.randint(3, 10)})
    reponses.append({'question': 3, 'choix': [0 if alea.random() < 0.7 else 1], 'note': None})
publications = [
    {'cle': 'SONDAGE-ETE', 'type': 'sondage', 'statut': 'close',
     'titre_fr': 'Votre avis sur la collecte cet été', 'titre_ar': 'رأيكم في رفع الفضلات هذا الصيف',
     'contenu_fr': 'Sondage de démonstration.', 'contenu_ar': 'استبيان تجريبي.',
     'publiee_le': horodatage(dt.date(2026, 7, 1), 8, 0), 'date_debut': '2026-07-01', 'date_fin': '2026-07-31',
     'questions': [
         {'ordre': 1, 'type': 'choix_unique', 'libelle_fr': 'La collecte passe-t-elle à l’heure ?', 'libelle_ar': 'هل يمر الرفع في الوقت؟',
          'options_fr': ['Toujours', 'Souvent', 'Rarement', 'Jamais'], 'options_ar': ['دائما', 'غالبا', 'نادرا', 'أبدا']},
         {'ordre': 2, 'type': 'note', 'libelle_fr': 'Note de propreté de votre rue (0 à 10)', 'libelle_ar': 'تقييم نظافة نهجكم (0 إلى 10)',
          'options_fr': None, 'options_ar': None},
         {'ordre': 3, 'type': 'choix_unique', 'libelle_fr': 'Trieriez-vous vos déchets à la source ?', 'libelle_ar': 'هل تفرزون فضلاتكم من المصدر؟',
          'options_fr': ['Oui', 'Non'], 'options_ar': ['نعم', 'لا']},
     ],
     'reponses': reponses},
    {'cle': 'AVIS-AID', 'type': 'notification', 'statut': 'archivee',
     'titre_fr': 'Horaires de collecte pendant l’Aïd', 'titre_ar': 'مواقيت رفع الفضلات خلال العيد',
     'contenu_fr': 'Notification de démonstration.', 'contenu_ar': 'إشعار تجريبي.',
     'publiee_le': horodatage(dt.date(2026, 6, 10), 18, 0), 'date_debut': None, 'date_fin': None,
     'questions': [], 'reponses': []},
]

# --- Lot 16.3 : carnet de bord et quotas -------------------------------------------------------
# Tirés APRÈS tout le reste, avec leur propre graine : ajouter ces données ne
# change pas une seule valeur des sections précédentes (ni leurs attendus).
alea_163 = random.Random(GRAINE + 163)
carnets = []
for i, c in enumerate(circuits[:8]):
    benne = c['mode_collecte'] == 'conteneurs'
    chauffeur = next(e['matricule'] for e in c['equipe'] if e['role'] == 'chauffeur')
    compteur = 40000 + 7000 * i
    for d in jours:
        km = alea_163.randint(60, 110) if benne else alea_163.randint(35, 70)
        carnets.append({'vehicule': c['vehicule'], 'circuit': c['code'], 'chauffeur': chauffeur, 'jour': iso(d),
                        'seance': 'matin', 'compteur_sortie': compteur, 'compteur_retour': compteur + km})
        compteur += km
# Quota mensuel : 450 L pour un tracteur, 1 000 L pour une benne, depuis le
# début de la période. Certains mois le dépassent : « À vérifier » le dira.
quotas = [{'vehicule': c['vehicule'], 'litres_mois': 1000 if c['mode_collecte'] == 'conteneurs' else 450, 'depuis': iso(DEBUT)}
          for c in circuits[:8]]

jeu = {
    'version': 2,
    'graine': GRAINE,
    'periode': {'debut': iso(DEBUT), 'fin': iso(FIN)},
    'commune': commune,
    'parametres': {'delai_reclamation_jours': 7, 'objectif_balayage_ml_j': 4000},
    'vehicules': vehicules,
    'personnel': personnel,
    'circuits': circuits,
    'presences': presences,
    'pesees': pesees,
    'fins_de_poste': fins_de_poste,
    'carburant': carburant,
    'tickets': tickets,
    'poi': [{k: v for k, v in p.items() if k != 'jour'} for p in poi],
    'nettoyages': nettoyages,
    'controles': controles,
    'incidents': incidents,
    'incidents_travail': incidents_travail,
    'dotations_epi': dotations_epi,
    'effectifs': effectifs,
    'publications': publications,
    'carnets': carnets,
    'quotas': quotas,
    'anomalies': [
        {'code': 'A1', 'domaine': 'pesees', 'constat': 'Pesée au-delà de la charge utile de la benne',
         'circuit': 'LEVEE-7', 'jour': '2026-07-14', 'voyage': 1, 'correction': {'poids_net_kg': 7400}},
        {'code': 'A2', 'domaine': 'seuils', 'constat': 'Réclamation reçue et jamais traitée',
         'ticket': 'DEMO-2026-0150', 'correction': {'status': 'resolu'}},
        {'code': 'A3', 'domaine': 'seuils', 'constat': 'Nettoyage de l’abattoir resté planifié',
         'poi': 'ABATTOIR', 'jour': '2026-08-27', 'correction': {'statut': 'terminee'}},
        {'code': 'A4', 'domaine': 'parc', 'constat': 'Engin immobilisé sans motif',
         'vehicule': V_SANS_MOTIF, 'correction': {'motif_immobilisation': 'En attente de diagnostic'}},
    ],
}

sortie = pathlib.Path(__file__).resolve().parents[2] / 'backend' / 'seed' / 'data' / 'jumeau_3mois.json'
sortie.write_text(json.dumps(jeu, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
print(f'{sortie} : {sortie.stat().st_size} octets')
for cle in ('vehicules', 'personnel', 'circuits', 'presences', 'pesees', 'fins_de_poste', 'carburant',
            'tickets', 'nettoyages', 'controles', 'incidents', 'dotations_epi'):
    print(f'  {cle} : {len(jeu[cle])}')
