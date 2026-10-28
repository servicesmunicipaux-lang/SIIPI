#!/usr/bin/env python3
"""Témoin indépendant du lot I3 (la période transitoire du secteur informel).

Il ne lit que le fichier d'entrée écrit par la campagne (les taux de redevance
qu'elle a posés, les livraisons et les pesées qu'elle a inscrites) et la
méthode arrêtée le 28/10/2026 — jamais le code testé :

  - une livraison compte au jour de Tunis (UTC+1, sans heure d'été) ;
  - la redevance évitée d'une livraison est son tonnage au taux en vigueur le
    jour de la livraison (le dernier taux dont la date d'effet le précède ou
    l'égale) ; sans taux, ses tonnes sont comptées à part ;
  - le poids moyen d'un voyage pesé est celui des pesées de circuit, en ordures
    ménagères, du même mois ; sans elles, ni poids moyen ni voyages économisés ;
  - voyages économisés = tonnes du mois (arrondies au kilo) / poids moyen, au
    dixième ;
  - un mois sans livraison n'a pas de ligne.

Les arrondis sont ceux de PostgreSQL (au plus proche, la moitié loin de zéro).

  periode_transitoire_attendus.py conversion <entrees.json> <annee>
  periode_transitoire_attendus.py fin <AAAA-MM-JJ> <mois>   # dernier jour de n mois comptés d'un jour
"""
import calendar
import datetime
import json
import sys
from decimal import ROUND_HALF_UP, Decimal


def arrondi(x, n):
    return x.quantize(Decimal(1).scaleb(-n), rounding=ROUND_HALF_UP)


def ajouter_mois(d, n):
    a, b = divmod(d.month - 1 + n, 12)
    an, mo = d.year + a, b + 1
    return datetime.date(an, mo, min(d.day, calendar.monthrange(an, mo)[1]))


def fin(debut, mois):
    return ajouter_mois(debut, mois) - datetime.timedelta(days=1)


def jour_tunis(horodatage):
    t = datetime.datetime.fromisoformat(horodatage.replace('Z', '+00:00'))
    return (t.astimezone(datetime.timezone.utc) + datetime.timedelta(hours=1)).date()


def conversion(entrees, annee):
    taux = sorted(
        ((datetime.date.fromisoformat(t['date_effet']), Decimal(str(t['valeur'])), t['provisoire']) for t in entrees['taux']),
        key=lambda t: t[0],
    )

    def taux_du(j):
        retenu = None
        for t in taux:
            if t[0] <= j:
                retenu = t
        return retenu

    mois = {}
    for l in entrees['livraisons']:
        if l.get('retiree'):
            continue
        j = jour_tunis(l['horodatage'])
        if j.year != annee:
            continue
        m = mois.setdefault(j.month, {'acteurs': set(), 'livraisons': 0, 't': Decimal(0), 'sans': Decimal(0),
                                      'redevance': None, 'taux': set(), 'provisoire': False})
        t = Decimal(str(l['kg'])) / 1000
        m['acteurs'].add(l['acteur'])
        m['livraisons'] += 1
        m['t'] += t
        tx = taux_du(j)
        if tx is None:
            m['sans'] += t
        else:
            m['redevance'] = (m['redevance'] or Decimal(0)) + t * tx[1]
            m['taux'].add(tx[1])
            m['provisoire'] = m['provisoire'] or tx[2]

    voyages = {}
    for p in entrees['pesees']:
        j = datetime.date.fromisoformat(p['jour'])
        if j.year != annee or not p['circuit'] or p['type'] != 'menager':
            continue
        voyages.setdefault(j.month, []).append(Decimal(str(p['kg'])))

    lignes = []
    for mo in sorted(mois):
        m = mois[mo]
        tonnes = arrondi(m['t'], 3)
        v = voyages.get(mo, [])
        moyen = (sum(v) / len(v) / 1000) if v else None
        lignes.append({
            'annee': annee,
            'mois': mo,
            'acteurs': len(m['acteurs']),
            'livraisons': m['livraisons'],
            'tonnes_detournees': float(tonnes),
            'tonnes_sans_taux': float(arrondi(m['sans'], 3)),
            'redevance_evitee_tnd': None if m['redevance'] is None else float(arrondi(m['redevance'], 3)),
            'taux_appliques': sorted(float(x) for x in m['taux']) or None,
            'redevance_provisoire': m['provisoire'],
            'voyages_peses': len(v),
            'poids_moyen_voyage_t': None if moyen is None else float(arrondi(moyen, 3)),
            'voyages_economises': None if moyen is None else float(arrondi(tonnes / moyen, 1)),
            'masque': False,
        })
    return lignes


if __name__ == '__main__':
    if sys.argv[1] == 'fin':
        print(fin(datetime.date.fromisoformat(sys.argv[2]), int(sys.argv[3])))
    elif sys.argv[1] == 'conversion':
        with open(sys.argv[2], encoding='utf-8') as f:
            print(json.dumps(conversion(json.load(f), int(sys.argv[3])), sort_keys=True))
    else:
        sys.exit('usage : conversion <entrees.json> <annee> | fin <date> <mois>')
