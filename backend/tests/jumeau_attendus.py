"""Les valeurs attendues du jumeau numérique, calculées SANS l'application.

    python3 jumeau_attendus.py <jeu.json> <fin AAAA-MM-JJ> [<mesures.json>]

Ce script ne lit que le fichier du jeu (seed/data/jumeau_3mois.json) et
recalcule chaque indicateur depuis sa DÉFINITION (FEUILLE_DE_ROUTE.md, fiche
des KPI 5 axes), pas depuis le code SQL qui le calcule dans la plateforme.
Vérifier l'application par elle-même ne prouverait rien.

`fin` est la borne de calcul de l'année : le 31 décembre, ou la date du jour
si l'année n'est pas finie. Elle compte pour les mesures « par jour » : les
mètres balayés par jour se rapportent aux jours écoulés depuis le premier
balayage mesuré, pas à la seule période simulée.

Sans <mesures.json>, imprime les valeurs attendues. Avec, compare : une ligne
par indicateur, « code<TAB>attendu<TAB>obtenu », que la campagne
simulation-3mois relit. Un indicateur attendu absent, ou présent sans être
attendu, s'y lit aussi : une mesure sans source n'a pas de ligne (règle d'or
1.1), et c'est vérifié.
"""
import datetime as dt
import json
import sys
from decimal import Decimal, ROUND_HALF_UP

ANNEE = 2026


def arrondi(x, n):
    """Arrondi commercial (0,05 → 0,1), celui de round() en SQL sur un numeric."""
    return Decimal(str(x)).quantize(Decimal(1).scaleb(-n), rounding=ROUND_HALF_UP)


def jour(texte):
    return dt.date.fromisoformat(texte[:10])


def horodatage(texte):
    return dt.datetime.fromisoformat(texte)


def attendus(jeu, fin):
    debut = dt.date(ANNEE, 1, 1)
    fin = min(dt.date(ANNEE, 12, 31), fin)
    dans = lambda d: debut <= d <= fin
    r = {}

    # M1-2 — contrôles terrain : (faits + ½ partiels) / contrôles.
    ctl = [c for c in jeu['controles'] if dans(jour(c['jour']))]
    if ctl:
        f = sum(c['etat'] == 'fait' for c in ctl)
        p = sum(c['etat'] == 'partiel' for c in ctl)
        r['M1-2'] = (arrondi(100 * (f + 0.5 * p) / len(ctl), 1), (f + 0.5 * p) / len(ctl))

    # M1-3 — calendrier publié, informations (plafonnées à 4), consultations : moyenne des trois.
    publie = any(c['jours_passage'] for c in jeu['circuits'])
    infos = sum(1 for p in jeu['publications'] if p['type'] == 'notification' and p['publiee_le'] and dans(jour(p['publiee_le'])))
    consult = sum(1 for p in jeu['publications'] if p['type'] in ('sondage', 'projet') and p['publiee_le'] and dans(jour(p['publiee_le'])))
    s = (1 if publie else 0) + min(infos, 4) / 4 + (1 if consult else 0)
    r['M1-3'] = (arrondi(100 * s / 3, 1), s / 3)

    # M3-1 — réclamations de l'année (hors rejetées) : taux de résolution, et part résolue dans le délai.
    delai = dt.timedelta(days=jeu['parametres']['delai_reclamation_jours'])
    tk = [t for t in jeu['tickets'] if dans(jour(t['cree_le'])) and t['status'] != 'rejete']
    res = [t for t in tk if t['status'] == 'resolu']
    dans_delai = sum(horodatage(t['resolu_le']) - horodatage(t['cree_le']) <= delai for t in res)
    r['M3-1'] = (arrondi(100 * len(res) / len(tk), 1),
                 (len(res) / len(tk) + (dans_delai / len(res) if res else 0)) / 2)
    r['RECLAMATIONS'] = (Decimal(len(tk)), None)
    jours_res = [(horodatage(t['resolu_le']) - horodatage(t['cree_le'])).total_seconds() / 86400 for t in res]
    r['DELAI_MOYEN_J'] = (arrondi(sum(jours_res) / len(jours_res), 1), None)

    # M3-3 — les six modules utilisés (la commune est activée, le jeu les remplit tous).
    r['M3-3'] = (Decimal('100.0'), 1.0)

    # Tonnages : toutes les pesées de l'année ; le ratio par habitant se rapporte aux mois pesés.
    pes = [p for p in jeu['pesees'] if dans(jour(p['jour']))]
    kg = sum(p['poids_net_kg'] for p in pes)
    separe = sum(p['poids_net_kg'] for p in pes if p['type_dechet'] in ('tri', 'vert'))
    r['DMA-4'] = (arrondi(100 * separe / kg, 1), separe / kg)
    r['TONNAGE_T'] = (arrondi(kg / 1000, 3), None)
    mois = sorted({(jour(p['jour']).year, jour(p['jour']).month) for p in pes})
    jours_couverts = 0
    for a, m in mois:
        premier = dt.date(a, m, 1)
        dernier = (dt.date(a + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1))
        jours_couverts += (min(dernier, fin) - premier).days + 1
    r['KG_HAB_J'] = (arrondi(kg / jeu['commune']['population'] / jours_couverts, 3), None)

    r['CIRCUITS'] = (Decimal(len(jeu['circuits'])), None)

    eff = [e for e in jeu['effectifs'] if e['annee'] == ANNEE and e['service'] == 'proprete']
    ouv = sum(e['effectif_ouvriers'] for e in eff)
    enc = sum(e['effectif_encadrement'] for e in eff)
    r['MASSE_SALARIALE'] = (Decimal(sum(e['masse_salariale_tnd'] for e in eff)), None)
    r['EFFECTIF_OUVRIERS'] = (Decimal(ouv), None)
    r['ENCADREMENT'] = (arrondi(enc / ouv, 3), None)

    # Absentéisme : les absences qui ne sont ni congé, ni repos, ni formation, ni détachement.
    pr = [p for p in jeu['presences'] if dans(jour(p['jour']))]
    absences = sum(1 for p in pr if not p['present'] and p['motif_absence'] not in ('conge', 'repos', 'formation', 'detachement'))
    r['ABSENTEISME'] = (arrondi(100 * absences / len(pr), 1), None)

    # M1-1 — mètres balayés par jour, depuis le premier balayage mesuré de l'année.
    bal = [n for n in jeu['nettoyages'] if n['statut'] == 'terminee' and n['metres_lineaires'] is not None and dans(jour(n['jour']))]
    if bal:
        ml = sum(n['metres_lineaires'] for n in bal)
        jours_bal = (fin - min(jour(n['jour']) for n in bal)).days + 1
        objectif = jeu['parametres']['objectif_balayage_ml_j']
        r['M1-1'] = (arrondi(ml / jours_bal, 1), min(1, ml / jours_bal / objectif))

    # M2-3, M2-4, M2-5 — nettoyages échus (non annulés) sur les cimetières, marchés, abattoirs.
    type_du_lieu = {p['cle']: p['type'] for p in jeu['poi']}
    for type_lieu, code in (('cimetiere', 'M2-3'), ('marche', 'M2-4'), ('abattoir', 'M2-5')):
        lieux = [n for n in jeu['nettoyages'] if n['poi'] and type_du_lieu[n['poi']] == type_lieu
                 and n['statut'] != 'annulee' and dans(jour(n['jour']))]
        if lieux:
            faits = sum(n['statut'] == 'terminee' for n in lieux)
            r[code] = (arrondi(100 * faits / len(lieux), 1), faits / len(lieux))

    # M1-9 — fins de poste benne bâchée.
    fp = [f for f in jeu['fins_de_poste'] if dans(jour(f['jour']))]
    if fp:
        b = sum(f['benne_bachee'] for f in fp)
        r['M1-9'] = (Decimal(b), b / len(fp))

    # M1-6 — agents de terrain du service propreté dotés d'un EPI en cours à la fin de la période.
    terrain = {'chauffeur', 'agent', 'chef_equipe', 'agent_balayage', 'ripeur', 'tractoriste', 'jardinier', 'agent_hygiene', 'mecanicien'}
    effectif = sum(1 for p in jeu['personnel'] if p['service'] == 'proprete' and p['fonction'] in terrain)
    if jeu['dotations_epi']:
        dotes = len({d['matricule'] for d in jeu['dotations_epi'] if jour(d['date_remise']) <= fin})
        r['M1-6'] = (Decimal(dotes), min(1, dotes / effectif))

    # Carburant (montant) et accidents du travail.
    carb = [c for c in jeu['carburant'] if dans(jour(c['jour']))]
    if carb:
        r['ECO-CARBURANT'] = (sum(Decimal(str(c['montant_tnd'])) for c in carb), None)
    it = [i for i in jeu['incidents_travail'] if dans(jour(i['jour']))]
    if it:
        r['RH-ACCIDENTS'] = (Decimal(sum(i['type'] == 'accident' for i in it)), None)
    return r


def consommation(jeu, mois):
    """Lot 16.3 — par engin, pour le mois AAAA-MM : litres, distance, L/100 km, écart au quota.

    Définition (référentiel du dépôt, diapo 44) : litres des pleins du mois ÷
    kilomètres parcourus au carnet ce mois-là × 100 ; écart = litres − quota
    en vigueur au premier jour du mois. Une source absente rend « None ».
    """
    debut = dt.date.fromisoformat(f'{mois}-01')
    fin = dt.date(debut.year + (debut.month == 12), debut.month % 12 + 1, 1)
    dans = lambda d: debut <= jour(d) < fin
    immat = {v['cle']: v['registration'] for v in jeu['vehicules']}
    r = {}
    for cle in immat:
        pleins = [Decimal(str(c['litres'])) for c in jeu['carburant'] if c['vehicule'] == cle and dans(c['jour'])]
        sorties = [Decimal(str(c['compteur_retour'])) - Decimal(str(c['compteur_sortie']))
                   for c in jeu.get('carnets', []) if c['vehicule'] == cle and dans(c['jour'])]
        quotas = sorted((q for q in jeu.get('quotas', []) if q['vehicule'] == cle and jour(q['depuis']) <= debut),
                        key=lambda q: q['depuis'])
        if not pleins and not sorties and not quotas:
            continue
        litres = sum(pleins) if pleins else None
        parcouru = sum(sorties) if sorties and sum(sorties) > 0 else None
        quota = Decimal(str(quotas[-1]['litres_mois'])) if quotas else None
        l100 = arrondi(litres / parcouru * 100, 1) if litres is not None and parcouru else None
        ecart = litres - quota if litres is not None and quota is not None else None
        r[immat[cle]] = (litres, parcouru, l100, ecart)
    return r


def ligne_conso(t):
    return '|'.join('None' if x is None else f'{Decimal(x).normalize():f}' for x in t)


def texte(valeur, note):
    v = f'{Decimal(valeur).normalize():f}'
    return v if note is None else f'{v} (note {note:.6f})'


def main():
    jeu = json.load(open(sys.argv[1], encoding='utf-8'))
    # python3 jumeau_attendus.py <jeu.json> --consommation AAAA-MM <obtenus.json>
    # Une ligne par engin : « immatriculation<TAB>litres|km|L/100 km|écart (attendu)<TAB>(obtenu) ».
    if sys.argv[2] == '--consommation':
        a = consommation(jeu, sys.argv[3])
        obtenus = {}
        for e in json.load(open(sys.argv[4], encoding='utf-8'), parse_float=Decimal) or []:
            obtenus[e['registration']] = tuple(None if e[k] is None else Decimal(str(e[k]))
                                               for k in ('litres', 'parcouru', 'litres_100km', 'ecart_quota_litres'))
        for immat in sorted(set(a) | set(obtenus)):
            print(f"{immat}\t{ligne_conso(a[immat]) if immat in a else 'absent'}\t{ligne_conso(obtenus[immat]) if immat in obtenus else 'absent'}")
        return
    a = attendus(jeu, dt.date.fromisoformat(sys.argv[2]))
    if len(sys.argv) < 4:
        for code in sorted(a):
            print(f'{code}\t{texte(*a[code])}')
        return
    obtenus = {}
    for m in json.load(open(sys.argv[3], encoding='utf-8'), parse_float=Decimal) or []:
        obtenus[m['code']] = (Decimal(str(m['valeur'])), None if m['note'] is None else float(m['note']))
    for code in sorted(set(a) | set(obtenus)):
        attendu = texte(*a[code]) if code in a else 'absent'
        obtenu = 'absent'
        if code in obtenus:
            v, n = obtenus[code]
            # La note attendue n'est pas arrondie ; celle de la base est un
            # numeric exact : on compare à 1e-6 près, comme on l'imprime.
            obtenu = texte(v, n if code in a and a[code][1] is not None else None)
        print(f'{code}\t{attendu}\t{obtenu}')


if __name__ == '__main__':
    main()
