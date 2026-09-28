// Les découpages à valider — la file de la FNCT (Jalon 7, C2.5).
//
// Placée en tête de l'observatoire : une proposition qui attend bloque la
// commune (elle ne peut pas en soumettre une autre), et c'est ici que la FNCT
// ouvre sa journée. Ne s'affiche que s'il y a quelque chose à instruire.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type VersionDecoupage } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { DetailVersion } from '../decoupage/VersionsDecoupage';

export function PropositionsDecoupage() {
  const { t } = useTranslation();
  const f = useFormats();
  const [liste, setListe] = useState<VersionDecoupage[] | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = () =>
    api
      .versionsDecoupage({ statut: 'soumise' })
      // Les actions directes de la FNCT sont validées dans la même transaction :
      // elles ne passent jamais par cette file.
      .then((l) => setListe(l.filter((v) => !v.directe)))
      // La file est utile, pas indispensable : son échec n'empêche pas de lire
      // l'observatoire.
      .catch(() => setListe([]));

  useEffect(() => {
    void charger();
  }, []);

  if (ouverte) {
    return (
      <section className="mb-8">
        <DetailVersion
          id={ouverte}
          fnct
          onFermer={() => setOuverte(null)}
          onDecide={(texte) => {
            setMessage(texte);
            setOuverte(null);
            void charger();
          }}
        />
      </section>
    );
  }

  if (!liste || (liste.length === 0 && !message)) return null;

  return (
    <section className="mb-8 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h2 className="font-semibold text-amber-900">{t('decoupage.aValider', { count: liste.length })}</h2>
      {message && (
        <p role="status" className="text-sm text-siipi-800">
          {message}
        </p>
      )}
      <ul className="space-y-2">
        {liste.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setOuverte(v.id);
              }}
              className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-3 text-start hover:border-amber-400"
            >
              <span>
                <span className="block font-medium text-ardoise-900">
                  {v.commune_nom}
                  {v.origine === 'restauration' && v.restaure_de_numero
                    ? ` — ${t('decoupage.demandeRetour', { n: v.restaure_de_numero })}`
                    : ''}
                </span>
                <span className="text-xs text-ardoise-500">
                  {t('decoupage.soumise', { date: f.date(v.soumise_le, { heure: true }), auteur: v.soumise_par_nom ?? '—' })}
                </span>
                {v.note && <span className="block text-xs text-ardoise-600">{v.note}</span>}
              </span>
              <span className="text-sm font-medium text-siipi-700">{t('decoupage.instruire')}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
