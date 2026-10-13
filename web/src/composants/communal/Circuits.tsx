// Aiguilleur du module « circuits » : liste, création, fiche détaillée.
//
// Le formulaire de création est celui du registre (ajout/FormulaireCircuit),
// le même que celui du catalogue « + Ajouter ». Ici, une fois le circuit créé,
// sa fiche s'ouvre — sur l'onglet géographique si des fichiers ont été joints.

import { useState } from 'react';
import type { Circuit } from '../../lib/api';
import { FormulaireCircuit } from '../ajout/FormulaireCircuit';
import { CircuitsListe } from './CircuitsListe';
import { CircuitDetail, type OngletCircuit } from './CircuitDetail';

export function Circuits({ communeId }: { communeId: string }) {
  const [ouvert, setOuvert] = useState<Circuit | null>(null);
  const [ongletOuvert, setOngletOuvert] = useState<OngletCircuit>('fiche');
  // Ce que l'import des fichiers joints à la création n'a pas pu faire : dit
  // en tête de la fiche, plutôt que perdu avec le formulaire.
  const [avisCreation, setAvisCreation] = useState<string[]>([]);
  const [creation, setCreation] = useState(false);
  const [rechargement, setRechargement] = useState(0);

  if (ouvert) {
    return (
      <div className="space-y-3">
        {avisCreation.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">
            {avisCreation.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
        <CircuitDetail
          key={ouvert.id}
          circuit={ouvert}
          communeId={communeId}
          ongletInitial={ongletOuvert}
          onFerme={() => {
            setOuvert(null);
            setOngletOuvert('fiche');
            setAvisCreation([]);
            setRechargement((n) => n + 1);
          }}
          onModifie={() => setRechargement((n) => n + 1)}
        />
      </div>
    );
  }

  if (creation) {
    return (
      <FormulaireCircuit
        communeId={communeId}
        onAnnuler={() => setCreation(false)}
        onFait={(cree) => {
          if (!cree) return;
          const { circuit: c, avecFichiers, avis } = cree;
          setCreation(false);
          setRechargement((n) => n + 1);
          // On ouvre directement la fiche : c'est là que se règlent les points
          // de collecte et l'import, qui sont l'étape suivante évidente — sur
          // l'onglet des données géographiques si des fichiers ont été joints.
          setOngletOuvert(avecFichiers ? 'geo' : 'fiche');
          setAvisCreation(avis);
          setOuvert(c);
        }}
      />
    );
  }

  return (
    <CircuitsListe
      communeId={communeId}
      rechargement={rechargement}
      onOuvrir={setOuvert}
      onAjouter={() => setCreation(true)}
    />
  );
}
