"""Le jeu d'essai de la campagne `communication-indicateurs` (B5.5.4), et son témoin.

Un seul fichier décrit les lignes à bâtir ; il en tire, d'un côté, le SQL qui les
pose et, de l'autre, les valeurs attendues — calculées ici, en suivant la
définition des indicateurs (migration 079, en-tête), sans rien lire du code testé.

  python3 communication_indicateurs.py sql <commune> <prefixe>   # le SQL du jeu
  python3 communication_indicateurs.py attendus                   # les valeurs attendues (JSON)

La période éprouvée est le premier semestre 2026, en dates de Tunis. Deux
publications encadrent la borne de fin à une heure près : l'une le 30 juin à
23 h 30 (dedans), l'autre le 1er juillet à 0 h 30 (dehors) — un calcul en dates
UTC les aurait comptées toutes les deux.
"""
import json
import statistics
import sys
from datetime import datetime

DEBUT, FIN = '2026-01-01', '2026-06-30'


def dans(horodatage):
    """L'horodatage tombe-t-il dans la période, en date de Tunis (UTC+1) ?"""
    return DEBUT <= horodatage[:10] <= FIN  # les horodatages du jeu sont tous écrits en heure de Tunis


PUBLICATIONS = [
    # clé, type, statut, publiée le (heure de Tunis), exemple
    ('N1', 'notification', 'publiee', '2026-02-01 08:00', False),
    ('N2', 'notification', 'publiee', '2025-12-15 08:00', False),
    ('S1', 'sondage', 'publiee', '2026-03-01 08:00', False),
    ('P1', 'projet', 'publiee', '2026-06-30 23:30', False),
    ('P2', 'projet', 'publiee', '2026-07-01 00:30', False),
    ('X1', 'notification', 'brouillon', None, True),
]
ENVOIS = [
    # publication, le, destinataires, sans adresse, désabonnés
    ('N1', '2026-02-01 09:00', 40, 6, 4),
    ('S1', '2026-03-01 09:00', 20, 0, 0),
    ('S1', '2026-03-05 09:00', 25, 2, 1),
    ('N2', '2025-12-15 09:00', 100, 0, 0),
    ('X1', '2026-02-02 09:00', 50, 0, 0),
]
# Envois individuels : (le, statut, lu, nombre)
INDIVIDUELS = [
    ('2026-02-01 09:05', 'livre', True, 12),
    ('2026-02-01 09:05', 'livre', False, 18),
    ('2026-02-01 09:05', 'echec', False, 5),
    ('2026-02-01 09:05', 'non_abonne', False, 3),
    ('2026-02-01 09:05', 'non_souhaite', False, 2),
    ('2026-02-01 09:05', 'sans_souscription', False, 4),
    ('2025-12-15 09:05', 'livre', True, 10),
]
# Courriels (081) : (le, statut, nombre). Consignés lus, comme le fait le service
# d'envoi : s'ils étaient comptés avec le push, ils fausseraient la livraison ET
# la lecture — c'est ce que ces lignes éprouvent.
COURRIELS = [
    ('2026-02-01 09:06', 'livre', 4),
    ('2026-02-01 09:06', 'echec', 1),
    ('2026-02-01 09:06', 'non_configure', 2),
    ('2025-12-15 09:06', 'livre', 3),
]
# Réponses au sondage S1 : (citoyen, le)
REPONSES = [(1, '2026-03-02 10:00'), (2, '2026-03-02 11:00'), (3, '2026-03-03 10:00'), (4, '2026-07-05 10:00')]
CITOYENS = 4
# Points proposés : (clé, créé le, statut, décidé le, retiré)
SUGGESTIONS = [
    ('G1', '2026-01-10 08:00', 'valide', '2026-01-12 08:00', False),
    ('G2', '2026-02-01 08:00', 'refuse', '2026-02-01 20:00', False),
    ('G3', '2026-03-01 08:00', 'valide', '2026-03-04 08:00', False),
    ('G4', '2026-05-01 08:00', 'en_attente', None, False),
    ('G5', '2025-12-20 08:00', 'refuse', '2025-12-21 08:00', False),
    ('G6', '2026-04-01 08:00', 'en_attente', None, True),
]


def sql(commune, prefixe):
    q = lambda v: 'NULL' if v is None else "'" + str(v).replace("'", "''") + "'"
    ts = lambda h: 'NULL' if h is None else q(h + '+01')
    l = ['BEGIN;']
    l.append(f"INSERT INTO circuits (commune_id, nom) VALUES ({q(commune)}, {q(prefixe + ' circuit')});")
    l.append(f"INSERT INTO points_collecte (circuit_id, commune_id, ordre, geom) SELECT id, commune_id, 1, ST_SetSRID(ST_MakePoint(10.05, 36.05), 4326) FROM circuits WHERE nom = {q(prefixe + ' circuit')};")
    for cle, typ, statut, le, exemple in PUBLICATIONS:
        l.append(f"INSERT INTO publications (commune_id, type, titre_fr, statut, publiee_le, est_exemple) VALUES "
                 f"({q(commune)}, {q(typ)}, {q(prefixe + ' ' + cle)}, {q(statut)}, {ts(le)}, {str(exemple).lower()});")
    pub = lambda cle: f"(SELECT id FROM publications WHERE titre_fr = {q(prefixe + ' ' + cle)})"
    for cle, le, dest, sans, desab in ENVOIS:
        l.append(f"INSERT INTO envois_notification (publication_id, commune_id, canal, destinataires, sans_adresse, desabonnes, created_at) VALUES "
                 f"({pub(cle)}, {q(commune)}, 'push', {dest}, {sans}, {desab}, {ts(le)});")
    for le, statut, lu, n in INDIVIDUELS:
        l.append(f"INSERT INTO notifications_citoyen (commune_id, type, canal, titre, corps, statut, lu, date_envoi) "
                 f"SELECT {q(commune)}, 'notification_ciblee', 'push', {q(prefixe)}, {q(prefixe)}, {q(statut)}, {str(lu).lower()}, {ts(le)} FROM generate_series(1, {n});")
    for le, statut, n in COURRIELS:
        l.append(f"INSERT INTO notifications_citoyen (commune_id, type, canal, titre, corps, statut, lu, date_envoi) "
                 f"SELECT {q(commune)}, 'notification_ciblee', 'email', {q(prefixe)}, {q(prefixe)}, {q(statut)}, true, {ts(le)} FROM generate_series(1, {n});")
    for i in range(1, CITOYENS + 1):
        courriel = f'{prefixe.lower()}-citoyen-{i}@example.test'
        l.append(f"INSERT INTO users (email, password_hash, full_name, role) VALUES ({q(courriel)}, 'x', {q(prefixe + ' citoyen ' + str(i))}, 'citoyen');")
        l.append(f"INSERT INTO citoyens (user_id, commune_id) SELECT id, {q(commune)} FROM users WHERE email = {q(courriel)};")
    l.append(f"INSERT INTO sondage_questions (publication_id, ordre, libelle_fr, type) VALUES ({pub('S1')}, 1, {q(prefixe + ' question')}, 'texte');")
    for i, le in REPONSES:
        courriel = f'{prefixe.lower()}-citoyen-{i}@example.test'
        l.append(f"INSERT INTO sondage_reponses (question_id, publication_id, citoyen_id, texte, created_at) "
                 f"SELECT (SELECT id FROM sondage_questions WHERE publication_id = {pub('S1')}), {pub('S1')}, c.id, 'TEST', {ts(le)} "
                 f"FROM citoyens c JOIN users u ON u.id = c.user_id WHERE u.email = {q(courriel)};")
    point = f"(SELECT id FROM points_collecte WHERE circuit_id = (SELECT id FROM circuits WHERE nom = {q(prefixe + ' circuit')}))"
    for cle, cree, statut, decide, retire in SUGGESTIONS:
        l.append(f"INSERT INTO points_suggeres (commune_id, nom, geom, statut, motif_refus, decide_le, point_collecte_id, created_at, deleted_at) VALUES "
                 f"({q(commune)}, {q(prefixe + ' ' + cle)}, ST_SetSRID(ST_MakePoint(10.05, 36.05), 4326), {q(statut)}, "
                 f"{q('TEST motif') if statut == 'refuse' else 'NULL'}, {ts(decide)}, {point if statut == 'valide' else 'NULL'}, "
                 f"{ts(cree)}, {'now()' if retire else 'NULL'});")
    l.append('COMMIT;')
    return '\n'.join(l)


def attendus():
    reelles = {cle: (typ, le) for cle, typ, statut, le, ex in PUBLICATIONS if not ex}
    pubs = {t: sum(1 for cle, (typ, le) in reelles.items() if typ == t and le and dans(le)) for t in ('notification', 'sondage', 'projet')}
    envois = [e for e in ENVOIS if e[0] in reelles and dans(e[1])]
    dest, sans, desab = (sum(e[i] for e in envois) for i in (2, 3, 4))
    ind = [x for x in INDIVIDUELS if dans(x[0])]
    compte = lambda s: sum(n for le, st, lu, n in ind if st == s)
    livre, echec = compte('livre'), compte('echec')
    lu = sum(n for le, st, l_, n in ind if st == 'livre' and l_)
    cou = [x for x in COURRIELS if dans(x[0])]
    compte_c = lambda s: sum(n for le, st, n in cou if st == s)
    recues = [s for s in SUGGESTIONS if not s[4] and dans(s[1])]
    decidees = [s for s in SUGGESTIONS if not s[4] and s[3] and s[2] in ('valide', 'refuse') and dans(s[3])]
    heures = [(datetime.fromisoformat(s[3]) - datetime.fromisoformat(s[1])).total_seconds() / 3600 for s in decidees]
    validees = sum(1 for s in decidees if s[2] == 'valide')
    sondages = {e[0] for e in envois if reelles[e[0]][0] == 'sondage'}
    invites = sum(max(e[2] for e in envois if e[0] == s) for s in sondages)
    repondants_tous = len({c for c, le in REPONSES}) if 'S1' in sondages else 0
    taux = lambda n, d: {'numerateur': n, 'denominateur': d, 'valeur': None if d == 0 else round(n / d, 4)}
    return {
        'volumetrie': {
            'publications': pubs, 'envois': len(envois), 'destinataires': dest, 'sans_adresse': sans, 'desabonnes': desab,
            'envois_individuels': {'total': sum(x[3] for x in ind), 'livre': livre, 'echec': echec,
                                   'non_abonne': compte('non_abonne'), 'non_souhaite': compte('non_souhaite'),
                                   'sans_souscription': compte('sans_souscription')},
            'courriels': {'total': sum(x[2] for x in cou), 'envoye': compte_c('livre'), 'echec': compte_c('echec'),
                          'non_configure': compte_c('non_configure')},
            'suggestions_recues': len(recues),
            'repondants_sondage': len({c for c, le in REPONSES if dans(le)}),
        },
        'delais': {'decision_suggestion_h': {'mediane': round(statistics.median(heures), 1) if heures else None, 'decisions': len(decidees)},
                   'suggestions_en_attente': {'nombre': sum(1 for s in SUGGESTIONS if not s[4] and s[2] == 'en_attente')}},
        'taux': {
            'livraison': taux(livre, livre + echec),
            'lecture': taux(lu, livre),
            'portee': taux(dest, dest + sans + desab),
            'validation_suggestions': taux(validees, len(decidees)),
            'participation_sondages': taux(repondants_tous, invites),
        },
    }


if __name__ == '__main__':
    if sys.argv[1] == 'sql':
        print(sql(sys.argv[2], sys.argv[3]))
    else:
        print(json.dumps(attendus()))
