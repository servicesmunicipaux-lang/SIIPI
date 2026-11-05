#!/usr/bin/env python3
"""Valeurs attendues des indicateurs ODD calculés (lot « Indicateurs ODD et radar »).

Script INDÉPENDANT : il ne lit que le scénario JSON donné en argument (ce que la
campagne `indicateurs-odd` a bâti) et la méthode décidée le 4 novembre 2026
(DECISIONS_2026-11-04.md § 3.1). Il ne lit jamais le code testé (migration 097) :
c'est ce qui en fait un témoin.

La méthode :
  - gisement ménager du mois = kg/hab/j × population × jours du mois (jusqu'à
    aujourd'hui) ;
  - gisement assimilé = gisement ménager × part ÷ (100 − part), la part étant le
    proxy national (30 %) ;
  - un voyage est attendu un jour de passage (jour ISO 1 = lundi), pour chacun des
    voyages du jour, à partir de la date de début du circuit ;
  - ODD_11_6_1_A = pesé ménager ÷ (ménager + assimilé), seulement si TOUS les
    voyages attendus sont pesés et qu'il y a une production et une population ;
  - ODD_12_3_1_B = production spécifique × part des organiques ÷ 100 (kg/hab/j),
    total = population × ce ratio ÷ 1000 (t/j) ; rien sans production, population
    ou caractérisation, et rien quand la commune a déclaré l'indicateur.
Les pourcentages s'arrondissent au dixième, moitié vers le haut ; les tonnes et
les kg/hab/j au millième.

    python3 odd_attendus.py scenario.json
"""
import calendar
import datetime as dt
import json
import sys
from decimal import ROUND_HALF_UP, Decimal


def arrondi(x, pas):
    return float(x.quantize(Decimal(pas), ROUND_HALF_UP))


def commune(s, c):
    an, mois = map(int, s['mois'].split('-'))
    debut = dt.date(an, mois, 1)
    fin = min(dt.date(an, mois, calendar.monthrange(an, mois)[1]), dt.date.fromisoformat(s['aujourdhui']))
    jours = (fin - debut).days + 1
    part = Decimal(str(s['part_assimiles_pct']))
    production = Decimal(str(c['production'])) if c.get('production') else None
    population = Decimal(c['population']) if c.get('population') else None

    attendus = set()
    for ci in c['circuits']:
        d = max(debut, dt.date.fromisoformat(ci['date_debut']))
        while d <= fin:
            if d.isoweekday() in ci['jours']:
                for v in range(1, ci['voyages'] + 1):
                    attendus.add((ci['nom'], d.isoformat(), v))
            d += dt.timedelta(days=1)
    pesees = {(p['circuit'], p['date'], p['voyage']): Decimal(p['kg']) for p in c['pesees']
              if debut <= dt.date.fromisoformat(p['date']) <= fin}

    r = {'ODD_11_6_1_A': None, 'ODD_12_3_1_B': None}
    if production and population and attendus and attendus <= set(pesees) and sum(pesees.values()) > 0:
        menager = production * population * jours
        assimile = menager * part / (100 - part)
        pese = sum(pesees.values())
        r['ODD_11_6_1_A'] = arrondi(100 * pese / (menager + assimile), '0.1')
        r['termes_11_6_1_A'] = {
            'collecte_t': arrondi(pese / 1000, '0.001'),
            'gisement_menager_t': arrondi(menager / 1000, '0.001'),
            'gisement_assimile_t': arrondi(assimile / 1000, '0.001'),
        }
    organiques = c.get('organiques')
    if production and population and organiques is not None and not c.get('declare_12_3_1_b'):
        ratio = production * Decimal(str(organiques)) / 100
        r['ODD_12_3_1_B'] = arrondi(ratio, '0.001')
        r['total_t_j'] = arrondi(population * ratio / 1000, '0.001')
    return r


def main():
    s = json.load(open(sys.argv[1], encoding='utf-8'))
    json.dump({nom: commune(s, c) for nom, c in s['communes'].items()}, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
