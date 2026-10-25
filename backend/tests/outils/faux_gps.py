"""Un faux fournisseur GPS, le temps d'une campagne (campagne `gps`, lot 17.4a).

Générique : il ne ressemble à aucun fournisseur réel, et c'est voulu — le
connecteur ne doit rien savoir d'un fournisseur. Il rend des positions dans une
forme imbriquée (« data.positions », la latitude sous « pos.lat », l'horodatage
en millisecondes), que la commune décrit par sa correspondance.

Tout se pilote par des fichiers du dossier donné :
  positions.json   le corps rendu tel quel ;
  mode             ok (défaut) · 500 · lent (15 s) · casse (pas du JSON) ;
  jeton            s'il existe, l'en-tête « Authorization: Bearer <jeton> » est
                   exigé (401 sinon) ;
  appels           le nombre d'interrogations reçues (écrit par le serveur) ;
  derniere_autorisation  l'en-tête Authorization de la dernière (écrit).

Ce fichier n'est pas une campagne : il est rangé sous tests/outils/.

  python3 faux_gps.py <port> <dossier>
"""
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

port, dossier = int(sys.argv[1]), sys.argv[2]


def lire(nom, defaut=''):
    try:
        with open(os.path.join(dossier, nom), encoding='utf-8') as f:
            return f.read().strip()
    except FileNotFoundError:
        return defaut


def ecrire(nom, texte):
    with open(os.path.join(dossier, nom + '.tmp'), 'w', encoding='utf-8') as f:
        f.write(texte)
    os.replace(os.path.join(dossier, nom + '.tmp'), os.path.join(dossier, nom))


class Fournisseur(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def repondre(self, code, corps, type_='application/json'):
        donnees = corps.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', type_)
        self.send_header('Content-Length', str(len(donnees)))
        self.end_headers()
        self.wfile.write(donnees)

    def do_GET(self):
        if not self.path.startswith('/positions'):
            return self.repondre(404, '{"erreur":"inconnu"}')
        ecrire('appels', str(int(lire('appels', '0') or 0) + 1))
        autorisation = self.headers.get('Authorization', '')
        ecrire('derniere_autorisation', autorisation)
        jeton = lire('jeton')
        if jeton and autorisation != f'Bearer {jeton}':
            return self.repondre(401, '{"erreur":"jeton refusé"}')
        mode = lire('mode', 'ok') or 'ok'
        if mode == '500':
            return self.repondre(500, '{"erreur":"panne"}')
        if mode == 'lent':
            time.sleep(15)
        if mode == 'casse':
            return self.repondre(200, '<html>maintenance</html>', 'text/html')
        self.repondre(200, lire('positions.json', '{"data":{"positions":[]}}'))


ThreadingHTTPServer(('127.0.0.1', port), Fournisseur).serve_forever()
