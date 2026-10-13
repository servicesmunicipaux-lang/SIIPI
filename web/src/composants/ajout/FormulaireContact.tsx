// Un contact de la commune — ajout ou modification (TDR §3.2.7 ; registre
// des formulaires d'ajout, refonte lot 2b).
//
// Des interlocuteurs externes, sans compte sur la plateforme. Leurs
// coordonnées sont des données personnelles de tiers : l'API ne les ouvre
// qu'à la commune et à la FNCT (migration 045), jamais au prestataire. Un
// contact sans téléphone ni courriel ne sert à personne : il est refusé.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Contact } from '../../lib/api';
import { Erreur } from '../Elements';

export const CATEGORIES_CONTACT = ['administration', 'prestataire', 'association', 'fournisseur', 'elu', 'autre'] as const;
const CATEGORIES = CATEGORIES_CONTACT;
type Categorie = (typeof CATEGORIES)[number];

export function FormulaireContact({
  communeId,
  contact,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  contact?: Contact;
  onFait: () => void | Promise<void>;
  onAnnuler?: () => void;
}) {
  const { t } = useTranslation();
  const [nomComplet, setNomComplet] = useState(contact?.nom_complet ?? '');
  const [organisation, setOrganisation] = useState(contact?.organisation ?? '');
  const [fonction, setFonction] = useState(contact?.fonction ?? '');
  const [categorie, setCategorie] = useState<Categorie>((contact?.categorie as Categorie) ?? 'autre');
  const [telephone, setTelephone] = useState(contact?.telephone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const joignable = telephone.trim() !== '' || email.trim() !== '';
  const valide = nomComplet.trim().length >= 2 && joignable;

  const enregistrer = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!valide) return;
    setEnCours(true);
    setErreur(null);
    const saisie = {
      nomComplet: nomComplet.trim(),
      organisation,
      fonction,
      categorie,
      telephone,
      email,
      notes,
    };
    try {
      if (contact) await api.modifierContact(contact.id, saisie);
      else await api.creerContact(communeId, saisie);
      await onFait();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  const champ = 'mt-1 min-h-11 w-full rounded-lg border border-ardoise-300 px-3';

  return (
    <form onSubmit={enregistrer} className="space-y-3 rounded-xl border border-siipi-200 bg-siipi-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {t('communal.contacts.champNom')}
          <input required value={nomComplet} onChange={(e) => setNomComplet(e.target.value)} className={champ} />
        </label>
        <label className="text-sm">
          {t('communal.contacts.champCategorie')}
          <select
            value={categorie}
            onChange={(e) => setCategorie(e.target.value as Categorie)}
            className={`${champ} bg-white`}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`communal.contacts.categories.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t('communal.contacts.champOrganisation')}
          <input value={organisation} onChange={(e) => setOrganisation(e.target.value)} className={champ} />
        </label>
        <label className="text-sm">
          {t('communal.contacts.champFonction')}
          <input value={fonction} onChange={(e) => setFonction(e.target.value)} className={champ} />
        </label>
        <label className="text-sm">
          {t('communal.contacts.champTelephone')}
          <input
            type="tel"
            dir="ltr"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            className={champ}
          />
        </label>
        <label className="text-sm">
          {t('communal.contacts.champEmail')}
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={champ}
          />
        </label>
      </div>
      <label className="block text-sm">
        {t('communal.contacts.champNotes')}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-ardoise-300 px-3 py-2"
        />
      </label>

      {!joignable && <p className="text-xs text-amber-800">{t('communal.contacts.joignableRequis')}</p>}
      {erreur && <Erreur message={erreur} />}

      <div className="flex gap-2">
        {onAnnuler && (
          <button
            type="button"
            onClick={onAnnuler}
            className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm font-medium text-ardoise-700"
          >
            {t('commun.annuler')}
          </button>
        )}
        <button
          type="submit"
          disabled={enCours || !valide}
          className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          {enCours ? t('communal.contacts.enregistrementEnCours') : t('communal.contacts.enregistrer')}
        </button>
      </div>
    </form>
  );
}
