// Contacts (TDR §3.2.7) — l'annuaire de travail de la commune.
//
// Des interlocuteurs externes, sans compte sur la plateforme. Leurs
// coordonnées sont des données personnelles de tiers : l'API ne les ouvre
// qu'à la commune et à la FNCT (migration 045), jamais au prestataire.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ErreurApi, type Contact } from '../../lib/api';
import { Chargement, Erreur } from '../Elements';

const CATEGORIES = ['administration', 'prestataire', 'association', 'fournisseur', 'elu', 'autre'] as const;
type Categorie = (typeof CATEGORIES)[number];

export function Contacts({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<string>('tous');
  const [recherche, setRecherche] = useState('');
  // null : aucun formulaire ouvert ; 'nouveau' : ajout ; sinon l'id édité.
  const [edition, setEdition] = useState<string | null>(null);

  const charger = async () => {
    try {
      setContacts(
        await api.contacts(communeId, {
          categorie: filtre === 'tous' ? undefined : filtre,
          q: recherche.trim() || undefined,
        })
      );
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    // La recherche part après une courte pause de frappe, pas à chaque touche.
    const minuteur = window.setTimeout(() => void charger(), 250);
    return () => window.clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId, filtre, recherche]);

  const retirer = async (c: Contact) => {
    if (!window.confirm(t('communal.contacts.confirmerRetrait', { nom: c.nom_complet }))) return;
    try {
      await api.retirerContact(c.id);
      await charger();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  if (erreur && !contacts) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!contacts) return <Chargement />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('communal.contacts.titre')}</h1>
          <p className="mt-1 text-sm text-ardoise-500">{t('communal.contacts.chapeau')}</p>
        </div>
        <button
          type="button"
          onClick={() => setEdition((e) => (e === 'nouveau' ? null : 'nouveau'))}
          className="min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-medium text-white"
        >
          {edition === 'nouveau' ? t('commun.annuler') : t('communal.contacts.ajouter')}
        </button>
      </header>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {erreur}
        </p>
      )}

      {edition === 'nouveau' && (
        <FormulaireContact
          communeId={communeId}
          onFait={async () => {
            setEdition(null);
            await charger();
          }}
        />
      )}

      <input
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder={t('communal.contacts.rechercher')}
        className="min-h-11 w-full rounded-lg border border-ardoise-300 px-3 text-sm"
      />

      <div className="flex flex-wrap gap-1.5">
        {['tous', ...CATEGORIES].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFiltre(c)}
            className={`min-h-11 rounded-full px-3 text-sm font-medium ${
              filtre === c ? 'bg-ardoise-900 text-white' : 'border border-ardoise-300 bg-white text-ardoise-700'
            }`}
          >
            {t(`communal.contacts.categories.${c}`)}
          </button>
        ))}
      </div>

      {contacts.length === 0 ? (
        <p className="rounded-xl border border-ardoise-200 bg-white p-6 text-sm text-ardoise-500">
          {t('communal.contacts.aucun')}
        </p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) =>
            edition === c.id ? (
              <li key={c.id}>
                <FormulaireContact
                  communeId={communeId}
                  contact={c}
                  onAnnuler={() => setEdition(null)}
                  onFait={async () => {
                    setEdition(null);
                    await charger();
                  }}
                />
              </li>
            ) : (
              <li
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-ardoise-200 bg-white p-4"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-ardoise-900">{c.nom_complet}</p>
                  <p className="text-xs text-ardoise-500">
                    {t(`communal.contacts.categories.${c.categorie}`)}
                    {c.organisation ? ` · ${c.organisation}` : ''}
                    {c.fonction ? ` · ${c.fonction}` : ''}
                  </p>
                  <p className="flex flex-wrap gap-x-3 text-sm">
                    {c.telephone && (
                      <a href={`tel:${c.telephone}`} dir="ltr" className="text-siipi-700 underline">
                        {c.telephone}
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} dir="ltr" className="text-siipi-700 underline">
                        {c.email}
                      </a>
                    )}
                  </p>
                  {c.notes && <p className="text-sm text-ardoise-600">{c.notes}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setEdition(c.id)}
                    className="min-h-11 rounded-lg border border-ardoise-300 bg-white px-3 text-sm font-medium text-ardoise-700"
                  >
                    {t('communal.contacts.modifier')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void retirer(c)}
                    className="min-h-11 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-800"
                  >
                    {t('communal.contacts.retirer')}
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

function FormulaireContact({
  communeId,
  contact,
  onFait,
  onAnnuler,
}: {
  communeId: string;
  contact?: Contact;
  onFait: () => Promise<void>;
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
