"""Un serveur SMTP d'essai, le temps d'une campagne (campagne `courriel`).

Il accepte tout ce qu'on lui envoie, ne le relaie nulle part, et écrit chaque
courriel reçu, décodé, dans un fichier JSON du dossier donné : expéditeur,
destinataires, sujet, texte. La campagne y lit ce qui est parti — et vérifie,
par exemple, qu'un mot de passe provisoire arrive dans le courriel et nulle
part ailleurs.

Ce fichier n'est pas une campagne : il est rangé sous tests/outils/.

  python3 serveur_smtp.py <port> <dossier>

Ni TLS ni authentification : l'API d'essai s'y adresse avec SMTP_SECURITE=aucune.
Le module smtpd n'existe plus depuis Python 3.12 ; ce serveur parle le strict
nécessaire du protocole (RFC 5321) : EHLO/HELO, MAIL, RCPT, DATA, RSET, NOOP, QUIT.
"""
import asyncio
import json
import os
import sys
from email import message_from_bytes, policy

port, dossier = int(sys.argv[1]), sys.argv[2]
os.makedirs(dossier, exist_ok=True)
compteur = 0


def enregistrer(expediteur, destinataires, brut):
    global compteur
    compteur += 1
    m = message_from_bytes(brut, policy=policy.default)
    corps = m.get_body(preferencelist=('plain',))
    fiche = {
        'de': expediteur,
        'a': destinataires,
        'sujet': str(m['subject'] or ''),
        'texte': corps.get_content() if corps is not None else '',
    }
    chemin = os.path.join(dossier, f'{compteur:04d}.json')
    with open(chemin + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(fiche, f, ensure_ascii=False)
    os.replace(chemin + '.tmp', chemin)  # la campagne ne lit jamais un fichier à moitié écrit


async def session(lecteur, ecrivain):
    def dire(ligne):
        ecrivain.write((ligne + '\r\n').encode())

    dire('220 siipi-essai SMTP')
    expediteur, destinataires = None, []
    while True:
        ligne = await lecteur.readline()
        if not ligne:
            break
        commande = ligne.decode(errors='replace').strip()
        verbe = commande[:4].upper()
        if verbe == 'EHLO':
            dire('250-siipi-essai')
            dire('250-8BITMIME')
            dire('250 SMTPUTF8')
        elif verbe == 'HELO':
            dire('250 siipi-essai')
        elif verbe == 'MAIL':
            expediteur, destinataires = commande.split(':', 1)[1].strip().split(' ')[0].strip('<>'), []
            dire('250 OK')
        elif verbe == 'RCPT':
            destinataires.append(commande.split(':', 1)[1].strip().split(' ')[0].strip('<>'))
            dire('250 OK')
        elif verbe == 'DATA':
            dire('354 Fin par <CRLF>.<CRLF>')
            lignes = []
            while True:
                l = await lecteur.readline()
                if not l or l in (b'.\r\n', b'.\n'):
                    break
                lignes.append(l[1:] if l.startswith(b'..') else l)
            enregistrer(expediteur, destinataires, b''.join(lignes))
            dire('250 OK')
        elif verbe == 'RSET':
            expediteur, destinataires = None, []
            dire('250 OK')
        elif verbe == 'NOOP':
            dire('250 OK')
        elif verbe == 'QUIT':
            dire('221 Au revoir')
            await ecrivain.drain()
            break
        else:
            dire('502 Commande non prise en charge')
        await ecrivain.drain()
    ecrivain.close()


async def principal():
    serveur = await asyncio.start_server(session, '127.0.0.1', port)
    async with serveur:
        await serveur.serve_forever()


asyncio.run(principal())
