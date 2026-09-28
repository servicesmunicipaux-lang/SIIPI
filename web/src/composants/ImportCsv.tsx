// Import CSV en deux temps (Jalon 4, lot 2) : on choisit le fichier, l'API
// rend un aperçu ligne par ligne SANS RIEN ÉCRIRE, et l'on valide ensuite.
// C'est le même principe que l'import KML des arrêts : un fichier de deux cents
// lignes ne s'écrit pas au premier clic, sans quoi on défait à la main ce qu'on
// n'a pas pu relire.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErreurApi, lireFichierLocal, type ApercuImportCsv } from '../lib/api';

type Envoi = (saisie: { nomFichier: string; contenu: string; valider: boolean }) => Promise<ApercuImportCsv>;

const STYLE_ACTION: Record<string, string> = {
  creer: 'bg-siipi-100 text-siipi-800',
  maj: 'bg-sky-100 text-sky-900',
  inchange: 'bg-ardoise-100 text-ardoise-600',
  doublon: 'bg-ardoise-100 text-ardoise-600',
  erreur: 'bg-red-100 text-red-900',
};

// Au-delà, l'aperçu ne sert plus à relire : il montre les erreurs d'abord.
const LIGNES_AFFICHEES = 200;

export function ImportCsv({ envoyer, onFait }: { envoyer: Envoi; onFait: () => Promise<void> | void }) {
  const { t } = useTranslation();
  const [fichier, setFichier] = useState<{ nomFichier: string; contenu: string } | null>(null);
  const [apercu, setApercu] = useState<ApercuImportCsv | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);

  const choisir = async (f: File) => {
    setOccupe(true);
    setErreur(null);
    setBilan(null);
    try {
      const lu = await lireFichierLocal(f);
      setFichier(lu);
      setApercu(await envoyer({ ...lu, valider: false }));
    } catch (err) {
      setApercu(null);
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setOccupe(false);
    }
  };

  const valider = async () => {
    if (!fichier) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await envoyer({ ...fichier, valider: true });
      setBilan(t('import.bilan', { crees: r.crees ?? 0, modifies: r.modifies ?? 0 }));
      setApercu(null);
      setFichier(null);
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setOccupe(false);
    }
  };

  const aEcrire = apercu ? (apercu.resume.creer ?? 0) + (apercu.resume.maj ?? 0) : 0;
  const lignes = apercu
    ? [...apercu.lignes].sort((a, b) => Number(b.action === 'erreur') - Number(a.action === 'erreur'))
    : [];

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <label
        className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700 ${
          occupe ? 'opacity-50' : ''
        }`}
      >
        {occupe && !apercu ? t('import.lecture') : t('import.choisir')}
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          disabled={occupe}
          onChange={(e) => {
            const f = e.target.files?.[0];
            // Remis à zéro : rechoisir le même fichier après correction doit
            // relancer l'aperçu.
            e.target.value = '';
            if (f) void choisir(f);
          }}
        />
      </label>

      {bilan && <p className="text-sm text-siipi-800">{bilan}</p>}
      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-900">
          {erreur}
        </p>
      )}

      {apercu && (
        <section className="w-full space-y-3 rounded-xl border border-siipi-200 bg-siipi-50/40 p-3 text-start">
          <p className="text-sm font-medium text-ardoise-900">
            {t('import.apercuDe', { fichier: apercu.fichier })} — {t('import.rienEcrit')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(apercu.resume)
              .filter(([, n]) => n > 0)
              .map(([action, n]) => (
                <span key={action} className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLE_ACTION[action] ?? ''}`}>
                  {t(`import.actions.${action}`)} : <span className="chiffres">{n}</span>
                </span>
              ))}
          </div>
          {apercu.avertissements.map((a) => (
            <p key={a} className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              {a}
            </p>
          ))}
          {apercu.colonnesIgnorees.length > 0 && (
            <p className="text-xs text-ardoise-500">
              {t('import.colonnesIgnorees', { colonnes: apercu.colonnesIgnorees.join(', ') })}
            </p>
          )}
          <div className="max-h-72 overflow-auto rounded-lg border border-ardoise-200 bg-white">
            <table className="w-full text-sm">
              <tbody>
                {lignes.slice(0, LIGNES_AFFICHEES).map((l) => (
                  <tr key={l.numero} className="border-b border-ardoise-100 align-top last:border-0">
                    <td className="chiffres p-2 text-xs text-ardoise-500">{t('import.ligne', { n: l.numero })}</td>
                    <td className="p-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLE_ACTION[l.action] ?? ''}`}>
                        {t(`import.actions.${l.action}`)}
                      </span>
                    </td>
                    <td className="p-2">
                      <span className="font-medium text-ardoise-900">{l.libelle || '—'}</span>
                      {l.champs && l.champs.length > 0 && (
                        <span className="block text-xs text-ardoise-500">{l.champs.join(', ')}</span>
                      )}
                      {l.erreurs.map((e) => (
                        <span key={e} className="block text-xs text-red-800">
                          {e}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lignes.length > LIGNES_AFFICHEES && (
              <p className="p-2 text-xs text-ardoise-500">
                {t('import.lignesMasquees', { n: lignes.length - LIGNES_AFFICHEES })}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void valider()}
              disabled={occupe || aEcrire === 0}
              className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              {occupe ? t('import.ecriture') : t('import.valider', { n: aEcrire })}
            </button>
            <button
              type="button"
              onClick={() => {
                setApercu(null);
                setFichier(null);
              }}
              disabled={occupe}
              className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm font-medium text-ardoise-700"
            >
              {t('commun.annuler')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
