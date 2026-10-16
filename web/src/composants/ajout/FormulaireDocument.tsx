// Émettre un document à numérotation scellée (lot 16.2) : ordre de mission,
// bon de travail, déclaration de panne. Le bon de carburant s'émet depuis le
// carnet, qui enregistre le plein dans la même transaction.
//
// LE FORMULAIRE EST LE GABARIT. Les champs, leurs libellés (FR/AR), ce qui est
// obligatoire : tout vient de l'API (/documents/gabarits), qui vérifie le même
// gabarit à l'émission. Un champ ajouté au gabarit apparaît ici sans autre
// changement — un second formulaire écrit à la main finirait par dire autre
// chose que le document imprimé.
//
// ÉMETTRE EST DÉFINITIF : le numéro est attribué, le contenu figé. L'écran le
// dit avant le clic ; une erreur se corrige par une annulation motivée et un
// nouveau document, jamais par une modification.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type GabaritDocument, type Vehicule } from '../../lib/api';
import { CadreAjout, champAjout } from './CadreAjout';

export type TypeDocumentEmis = 'ordre_mission' | 'bon_travail' | 'declaration_panne';

export function FormulaireDocument({
  communeId,
  type,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  type: TypeDocumentEmis;
  onFait: () => void | Promise<void>;
  onAnnuler: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [gabarit, setGabarit] = useState<GabaritDocument | null>(null);
  const [engins, setEngins] = useState<Vehicule[]>([]);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [enginId, setEnginId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const arabe = i18n.language === 'ar';

  useEffect(() => {
    void Promise.all([api.gabaritsDocuments(), api.engins(communeId)])
      .then(([g, e]) => {
        setGabarit(g.find((x) => x.type === type) ?? null);
        setEngins(e);
      })
      .catch((err) => setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur')));
  }, [communeId, type, t]);

  if (!gabarit) return erreur ? <p role="alert" className="text-sm text-red-800">{erreur}</p> : null;

  const libelle = (c: { fr: string; ar: string }) => (arabe ? c.ar : c.fr);
  const manquants = gabarit.champs.filter((c) => c.requis && c.cle !== 'engin' && !(valeurs[c.cle] ?? '').trim());
  const enginRequis = gabarit.champs.some((c) => c.cle === 'engin' && c.requis);
  const enregistrable = manquants.length === 0 && (!enginRequis || !!enginId);

  const emettre = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const contenu: Record<string, unknown> = {};
      for (const c of gabarit.champs) {
        if (c.cle === 'engin') {
          const e = engins.find((x) => x.id === enginId);
          if (e) contenu.engin = e.registration;
          continue;
        }
        const v = (valeurs[c.cle] ?? '').trim();
        // Un champ vide n'est pas écrit : il restera une case vide à l'impression.
        if (!v) continue;
        contenu[c.cle] = c.nature === 'nombre' ? Number(v.replace(',', '.')) : c.nature === 'oui_non' ? v === 'oui' : v;
      }
      await api.emettreDocument(communeId, {
        type,
        contenu,
        ...(enginId ? { objet: { type: 'vehicule' as const, id: enginId } } : {}),
      });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <CadreAjout
      id={`document-${type}`}
      titre={t('ajout.document.titre', { document: libelle(gabarit) })}
      aide={t('ajout.document.aide')}
      erreur={erreur}
      enregistrable={enregistrable}
      envoi={envoi}
      onEnregistrer={emettre}
      onAnnuler={onAnnuler}
    >
      {gabarit.statut === 'provisoire' && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">{t('ajout.document.provisoire')}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {gabarit.champs.map((c) => {
          const etiquette = `${libelle(c)}${c.unite ? ` (${c.unite})` : ''}${c.requis ? ' *' : ''}`;
          if (c.cle === 'engin') {
            return (
              <label key={c.cle} className="text-sm">
                <span className="block text-ardoise-700">{etiquette}</span>
                <select value={enginId} onChange={(e) => setEnginId(e.target.value)} className={champAjout}>
                  <option value="">{t('ajout.document.choisirEngin')}</option>
                  {engins.map((e) => (
                    <option key={e.id} value={e.id}>{e.registration}</option>
                  ))}
                </select>
              </label>
            );
          }
          const commun = {
            value: valeurs[c.cle] ?? '',
            onChange: (e: { target: { value: string } }) => setValeurs((v) => ({ ...v, [c.cle]: e.target.value })),
            className: champAjout,
          };
          return (
            <label key={c.cle} className={`text-sm ${c.nature === 'texte_long' ? 'sm:col-span-2' : ''}`}>
              <span className="block text-ardoise-700">{etiquette}</span>
              {c.nature === 'texte_long' ? (
                <textarea rows={3} maxLength={2000} {...commun} className={`${champAjout} py-2`} />
              ) : c.nature === 'oui_non' ? (
                <select {...commun}>
                  <option value="">—</option>
                  <option value="oui">{t('commun.oui')}</option>
                  <option value="non">{t('commun.non')}</option>
                </select>
              ) : (
                <input
                  type={c.nature === 'date' ? 'date' : 'text'}
                  inputMode={c.nature === 'nombre' ? 'decimal' : undefined}
                  maxLength={200}
                  {...commun}
                />
              )}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-ardoise-600">{t('ajout.document.definitif')}</p>
    </CadreAjout>
  );
}
