// Le découpage de la commune — son périmètre et ses secteurs de collecte —
// tel qu'il est en vigueur, tel qu'elle le propose, et tel qu'il a été
// (Jalon 7, TDR §3.2.8, C2.5 et C2.6).
//
// La commune ne modifie pas son découpage : elle le PROPOSE, et la FNCT
// valide. Un découpage décide de ce qui relève de quel secteur, donc de quel
// circuit, de quel prestataire, et de quelles adresses citoyennes ; il ne se
// retouche pas d'un clic sans que personne ne le relise.
//
// La proposition porte sur l'état voulu tout entier : le périmètre et
// l'ensemble des secteurs. Un secteur qu'on retire de la liste sera retiré à
// la validation — jamais effacé : il reviendra si l'on revient à une version
// où il figurait, sous le même identifiant, avec ses rattachements.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { api, ErreurApi, type VersionDecoupage } from '../../lib/api';
import { useFormats } from '../../lib/formats';
import { Chargement, Erreur } from '../Elements';
import { CarteDecoupage, type Geometrie } from '../decoupage/CarteDecoupage';
import { DetailVersion, HistoriqueDecoupage, PastilleVersion, TitreVersion } from '../decoupage/VersionsDecoupage';

interface Secteur {
  cle: string;
  id?: string;
  name: string;
  code: string;
  color: string;
  geometry: Geometrie;
}

type Vue = { type: 'etat' } | { type: 'edition' } | { type: 'version'; id: string };

const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#db2777', '#65a30d'];
const bouton = 'min-h-11 rounded-lg border border-ardoise-300 bg-white px-4 text-sm font-medium text-ardoise-700 hover:bg-ardoise-50 disabled:opacity-50';
const boutonPrincipal = 'min-h-11 rounded-lg bg-siipi-600 px-4 text-sm font-semibold text-white hover:bg-siipi-700 disabled:opacity-50';
const champ = 'min-h-10 rounded-lg border border-ardoise-300 bg-white px-2 text-sm';

let compteur = 0;
const nouvelleCle = () => `nouveau-${++compteur}`;

/** Les polygones d'un fichier GeoJSON, avec le nom qu'il leur donne s'il en donne un. */
function lirePolygones(contenu: unknown): { name: string | null; geometry: Geometrie }[] {
  const c = contenu as { type?: string; features?: { geometry?: Geometrie; properties?: Record<string, unknown> }[]; geometry?: Geometrie };
  const elements =
    c.type === 'FeatureCollection' ? (c.features ?? []) : c.type === 'Feature' ? [c] : [{ geometry: c as Geometrie, properties: {} }];
  return elements
    .filter((e) => e.geometry && (e.geometry.type === 'Polygon' || e.geometry.type === 'MultiPolygon'))
    .map((e) => {
      const p = (e as { properties?: Record<string, unknown> }).properties ?? {};
      const nom = p.name ?? p.nom ?? p.NAME ?? p.Nom ?? p.NOM;
      return { name: typeof nom === 'string' && nom.trim() ? nom.trim() : null, geometry: e.geometry as Geometrie };
    });
}

export function DecoupageCommune({ communeId }: { communeId: string }) {
  const { t } = useTranslation();
  const f = useFormats();
  const { utilisateur } = useAuth();
  const fnct = utilisateur?.role === 'super_admin_fnct';

  const [vue, setVue] = useState<Vue>({ type: 'etat' });
  const [versions, setVersions] = useState<VersionDecoupage[] | null>(null);
  const [perimetre, setPerimetre] = useState<Geometrie | null>(null);
  const [surface, setSurface] = useState<number | null>(null);
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = async () => {
    try {
      const [v, frontieres, zones] = await Promise.all([
        api.versionsDecoupage({ communeId }),
        // Tolérance nulle : on propose à partir du tracé réel, pas de sa
        // version simplifiée pour l'affichage.
        api.frontieres([communeId], 0),
        api.zones(communeId),
      ]);
      setVersions(v);
      setPerimetre((frontieres.features[0]?.geometry as Geometrie | undefined) ?? null);
      setSurface(frontieres.features[0]?.properties.areaKm2 ?? null);
      setSecteurs(
        zones.map((z: { id: string; name: string; code: string | null; color: string | null; geometry: Geometrie }) => ({
          cle: z.id,
          id: z.id,
          name: z.name,
          code: z.code ?? '',
          color: z.color ?? PALETTE[0],
          geometry: z.geometry,
        }))
      );
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communeId]);

  if (erreur && !versions) return <Erreur message={erreur} onReessayer={() => void charger()} />;
  if (!versions) return <Chargement />;

  const enVigueur = versions.find((v) => v.en_vigueur);
  const enAttente = versions.find((v) => v.statut === 'soumise' && !v.directe);
  // Le refus ne se montre que s'il répond à la DERNIÈRE proposition : un
  // refus ancien, suivi depuis d'une proposition validée, n'a plus rien à dire.
  const derniere = versions
    .filter((v) => !v.directe && v.origine !== 'initiale' && v.statut !== 'retiree')
    .sort((a, b) => b.soumise_le.localeCompare(a.soumise_le))[0];
  const dernierRefus = derniere?.statut === 'refusee' ? derniere : undefined;

  if (vue.type === 'version') {
    return (
      <DetailVersion
        id={vue.id}
        fnct={fnct}
        onFermer={() => setVue({ type: 'etat' })}
        onDecide={(texte) => {
          setMessage(texte);
          setVue({ type: 'etat' });
          void charger();
        }}
      />
    );
  }

  if (vue.type === 'edition') {
    return (
      <EditeurProposition
        communeId={communeId}
        perimetreInitial={perimetre}
        secteursInitiaux={secteurs}
        onAnnuler={() => setVue({ type: 'etat' })}
        onSoumis={(texte) => {
          setMessage(texte);
          setVue({ type: 'etat' });
          void charger();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ardoise-900">{t('decoupage.titre')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('decoupage.chapeau')}</p>
        </div>
        <button
          type="button"
          disabled={!!enAttente}
          onClick={() => {
            setMessage(null);
            setVue({ type: 'edition' });
          }}
          className={boutonPrincipal}
          title={enAttente ? t('decoupage.dejaEnAttente') : undefined}
        >
          {t('decoupage.proposer')}
        </button>
      </header>

      {message && (
        <p role="status" className="rounded-lg border border-siipi-200 bg-siipi-50 p-3 text-sm text-siipi-800">
          {message}
        </p>
      )}

      {enAttente && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            {t('decoupage.bandeauAttente', { date: f.date(enAttente.soumise_le, { heure: true }) })}
            {enAttente.note && <span className="block text-xs">{enAttente.note}</span>}
          </span>
          <button type="button" className={bouton} onClick={() => setVue({ type: 'version', id: enAttente.id })}>
            {t('decoupage.voir')}
          </button>
        </div>
      )}
      {!enAttente && dernierRefus && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {t('decoupage.bandeauRefus', { date: f.date(dernierRefus.decidee_le), motif: dernierRefus.motif_refus })}
        </p>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-ardoise-900">{t('decoupage.etatEnVigueur')}</h2>
          <p className="chiffres text-sm text-ardoise-600">
            {enVigueur ? (
              <>
                <TitreVersion v={enVigueur} /> · <PastilleVersion v={enVigueur} />
              </>
            ) : (
              t('decoupage.jamaisVersionne')
            )}
          </p>
        </div>
        <CarteDecoupage perimetre={perimetre} secteurs={secteurs} />
        <p className="chiffres text-sm text-ardoise-600">
          {surface != null ? f.surface(surface, 2) : t('decoupage.sansPerimetre')} · {t('decoupage.nbSecteurs', { count: secteurs.length })}
          {secteurs.length > 0 && ` : ${secteurs.map((s) => s.name).join(', ')}`}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ardoise-900">{t('decoupage.historique')}</h2>
        <p className="text-sm text-ardoise-500">{t('decoupage.historiqueAide')}</p>
        <HistoriqueDecoupage versions={versions} onOuvrir={(id) => setVue({ type: 'version', id })} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L'éditeur d'une proposition
// ---------------------------------------------------------------------------

function EditeurProposition({
  communeId,
  perimetreInitial,
  secteursInitiaux,
  onAnnuler,
  onSoumis,
}: {
  communeId: string;
  perimetreInitial: Geometrie | null;
  secteursInitiaux: Secteur[];
  onAnnuler: () => void;
  onSoumis: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [perimetre, setPerimetre] = useState<Geometrie | null>(perimetreInitial);
  const [perimetreModifie, setPerimetreModifie] = useState(false);
  const [editerPerimetre, setEditerPerimetre] = useState(false);
  const [secteurs, setSecteurs] = useState<Secteur[]>(secteursInitiaux);
  const [secteursModifies, setSecteursModifies] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [dessiner, setDessiner] = useState(false);
  const [revision, setRevision] = useState(0);
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const structure = (maj: (s: Secteur[]) => Secteur[]) => {
    setSecteurs(maj);
    setSecteursModifies(true);
    setRevision((r) => r + 1);
  };
  const changer = (cle: string, champs: Partial<Secteur>) => {
    setSecteurs((l) => l.map((s) => (s.cle === cle ? { ...s, ...champs } : s)));
    setSecteursModifies(true);
    if (champs.color) setRevision((r) => r + 1);
  };

  const edition = useMemo(
    () => ({
      perimetre: editerPerimetre,
      secteurs: !editerPerimetre,
      dessiner,
      onPerimetre: (g: Geometrie) => {
        setPerimetre(g);
        setPerimetreModifie(true);
      },
      onSecteur: (cle: string, g: Geometrie) => changer(cle, { geometry: g }),
      onNouveau: (g: Geometrie) => {
        const cle = nouvelleCle();
        structure((l) => [
          ...l,
          { cle, name: t('decoupage.nouveauSecteur', { n: l.length + 1 }), code: '', color: PALETTE[l.length % PALETTE.length], geometry: g },
        ]);
        setSelection(cle);
        setDessiner(false);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editerPerimetre, dessiner]
  );

  const importer = async (fichier: File, cible: 'perimetre' | 'secteurs') => {
    setErreur(null);
    try {
      const polygones = lirePolygones(JSON.parse(await fichier.text()));
      if (polygones.length === 0) throw new Error(t('decoupage.fichierSansPolygone'));
      if (cible === 'perimetre') {
        setPerimetre(polygones[0].geometry);
        setPerimetreModifie(true);
        setRevision((r) => r + 1);
      } else {
        structure((l) => [
          ...l,
          ...polygones.map((p, i) => ({
            cle: nouvelleCle(),
            name: p.name ?? t('decoupage.nouveauSecteur', { n: l.length + i + 1 }),
            code: '',
            color: PALETTE[(l.length + i) % PALETTE.length],
            geometry: p.geometry,
          })),
        ]);
      }
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('decoupage.fichierSansPolygone'));
    }
  };

  const soumettre = async () => {
    if (!perimetreModifie && !secteursModifies) {
      setErreur(t('decoupage.rienAProposer'));
      return;
    }
    if (secteurs.some((s) => s.name.trim().length < 2)) {
      setErreur(t('decoupage.nomRequis'));
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await api.proposerDecoupage(communeId, {
        ...(perimetreModifie && perimetre ? { perimetre: perimetre as never } : {}),
        ...(secteursModifies
          ? {
              zones: secteurs.map((s) => ({
                ...(s.id ? { id: s.id } : {}),
                name: s.name.trim(),
                code: s.code.trim() || null,
                color: s.color,
                geometry: s.geometry as never,
              })),
            }
          : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onSoumis(t('decoupage.soumiseMessage'));
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : t('commun.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onAnnuler} className="text-sm font-medium text-siipi-700 hover:underline">
        ← {t('decoupage.abandonnerProposition')}
      </button>
      <header>
        <h1 className="text-xl font-semibold text-ardoise-900">{t('decoupage.nouvelleProposition')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ardoise-500">{t('decoupage.aideEdition')}</p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('decoupage.outils')}>
        <button
          type="button"
          className={editerPerimetre ? boutonPrincipal : bouton}
          aria-pressed={editerPerimetre}
          disabled={!perimetre}
          onClick={() => {
            setEditerPerimetre((x) => !x);
            setDessiner(false);
            setRevision((r) => r + 1);
          }}
        >
          {t('decoupage.retoucherPerimetre')}
        </button>
        <button
          type="button"
          className={dessiner ? boutonPrincipal : bouton}
          aria-pressed={dessiner}
          onClick={() => {
            setEditerPerimetre(false);
            setDessiner((x) => !x);
          }}
        >
          {/* Libellé fixe : un bouton qui s'allonge décalerait la carte sous le
              doigt de celui qui commence à tracer. La consigne est sous la carte. */}
          {t('decoupage.dessinerSecteur')}
        </button>
        <label className={`${bouton} inline-flex cursor-pointer items-center`}>
          {t('decoupage.importerSecteurs')}
          <input
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="hidden"
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) void importer(fichier, 'secteurs');
              e.target.value = '';
            }}
          />
        </label>
        <label className={`${bouton} inline-flex cursor-pointer items-center`}>
          {t('decoupage.importerPerimetre')}
          <input
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="hidden"
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) void importer(fichier, 'perimetre');
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <CarteDecoupage
        perimetre={perimetre}
        secteurs={secteurs}
        edition={edition}
        selection={selection}
        onSelection={setSelection}
        revision={revision}
      />
      <p className="text-xs text-ardoise-500">
        {editerPerimetre ? t('decoupage.aidePerimetre') : dessiner ? t('decoupage.aideDessin') : t('decoupage.aideSommets')}
      </p>

      <section className="space-y-2">
        <h2 className="font-semibold text-ardoise-900">{t('decoupage.secteursProposes', { count: secteurs.length })}</h2>
        {secteurs.length === 0 && <p className="text-sm text-ardoise-500">{t('decoupage.aucunSecteur')}</p>}
        <ul className="space-y-2">
          {secteurs.map((s) => (
            <li
              key={s.cle}
              className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${selection === s.cle ? 'border-siipi-500 bg-siipi-50' : 'border-ardoise-200 bg-white'}`}
              onClick={() => setSelection(s.cle)}
            >
              <input
                type="color"
                value={s.color}
                onChange={(e) => changer(s.cle, { color: e.target.value })}
                aria-label={t('decoupage.couleur', { nom: s.name })}
                className="h-10 w-12 cursor-pointer rounded border border-ardoise-300"
              />
              <input
                value={s.name}
                onChange={(e) => changer(s.cle, { name: e.target.value })}
                aria-label={t('decoupage.nom')}
                maxLength={120}
                className={`${champ} min-w-48 flex-1`}
              />
              <input
                value={s.code}
                onChange={(e) => changer(s.cle, { code: e.target.value })}
                aria-label={t('decoupage.code')}
                placeholder={t('decoupage.code')}
                maxLength={40}
                className={`${champ} w-28`}
              />
              {!s.id && <span className="text-xs font-medium text-siipi-700">{t('decoupage.nouveau')}</span>}
              <button
                type="button"
                className={bouton}
                onClick={(e) => {
                  e.stopPropagation();
                  structure((l) => l.filter((x) => x.cle !== s.cle));
                }}
              >
                {t('decoupage.retirerSecteur')}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <label className="block text-sm">
        <span className="block font-medium text-ardoise-700">{t('decoupage.note')}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t('decoupage.noteExemple')}
          className="mt-1 w-full rounded-lg border border-ardoise-300 p-2 text-base"
        />
      </label>

      {erreur && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={enCours} className={boutonPrincipal} onClick={() => void soumettre()}>
          {t('decoupage.soumettre')}
        </button>
        <button type="button" className={bouton} onClick={onAnnuler}>
          {t('commun.annuler')}
        </button>
      </div>
      <p className="text-xs text-ardoise-500">
        {perimetreModifie ? t('decoupage.perimetreModifie') : t('decoupage.perimetreInchange')} ·{' '}
        {secteursModifies ? t('decoupage.secteursModifies') : t('decoupage.secteursInchanges')}
      </p>
    </div>
  );
}
