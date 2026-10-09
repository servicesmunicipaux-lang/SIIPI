import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, signToken, type UserRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { completer } from '../preferences.js';
import { natureInstance } from '../instance.js';
import {
  COMPTES_DE_DEMONSTRATION,
  MESSAGE_COMPTE_DEMONSTRATION,
  MESSAGE_MOT_DE_PASSE_PUBLIC,
  MOT_DE_PASSE_PUBLIC,
} from '../motDePassePublic.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  commune_id: string | null;
  is_active: boolean;
  mot_de_passe_provisoire?: boolean;
  preferences?: unknown;
  compte_demonstration?: boolean;
}

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    // La nature de l'instance, telle que la base la garde (src/instance.ts) :
    // une base de production le reste même servie avec une configuration de
    // développement.
    const production = (await natureInstance()) === 'production';

    // En production, le mot de passe publié avec le code n'ouvre aucun compte
    // (src/motDePassePublic.ts). Le refus précède la recherche du compte : il
    // ne dit donc rien de son existence, et vaut pour tout compte qui aurait
    // gardé ce mot de passe, pas seulement ceux du seed.
    if (production && password === MOT_DE_PASSE_PUBLIC) {
      throw new ApiError(403, MESSAGE_MOT_DE_PASSE_PUBLIC);
    }
    // Les comptes de démonstration eux-mêmes, quel que soit leur mot de passe
    // (D-FNCT-5). Leurs adresses sont publiques : les nommer ne renseigne
    // personne. La base les cache déjà à la connexion (migration 067) ; ce refus
    // dit pourquoi, et quoi faire.
    if (production && (COMPTES_DE_DEMONSTRATION as readonly string[]).includes(email.trim().toLowerCase())) {
      throw new ApiError(403, MESSAGE_COMPTE_DEMONSTRATION);
    }

    // La table users est cloisonnée par RLS et n'est donc pas lisible avant
    // authentification. app.find_user_for_login est l'unique porte d'entrée
    // prévue pour ce cas (fonction SECURITY DEFINER, migration 013).
    const user = await queryOne<UserRow>('SELECT * FROM app.find_user_for_login($1)', [email]);

    if (!user || !user.is_active) {
      // Message volontairement identique pour email inconnu / mot de passe faux (anti-énumération de comptes)
      throw new ApiError(401, 'Identifiants incorrects.');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new ApiError(401, 'Identifiants incorrects.');
    }
    // Un compte marqué « démonstration » sous une autre adresse que celles du
    // seed : la base ne l'aurait pas rendu en production ; la route ne s'y fie
    // pas seule.
    if (production && user.compte_demonstration) {
      throw new ApiError(403, MESSAGE_COMPTE_DEMONSTRATION);
    }

    // Un mot de passe provisoire n'ouvre que son propre remplacement : le jeton
    // le porte, et le contexte de requête refuse tout le reste (D-FNCT-5).
    const provisoire = user.mot_de_passe_provisoire === true;
    const token = signToken({
      sub: user.id,
      role: user.role,
      communeId: user.commune_id,
      ...(provisoire ? { provisoire: true } : {}),
    });
    // Un compte ouvert il y a six mois et jamais utilisé se ferme ; encore
    // faut-il pouvoir le voir.
    await query('SELECT app.enregistrer_connexion($1)', [user.id]);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        communeId: user.commune_id,
        motDePasseProvisoire: user.mot_de_passe_provisoire === true,
        preferences: completer(user.preferences),
      },
    });
  })
);

// GET /auth/me — permet au front-end de restaurer une session à partir d'un token stocké.
// Le jeton a déjà été vérifié par attachRequestContext ; requireAuth ne fait que
// refuser les requêtes sans jeton valide.
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await queryOne<UserRow>(
      'SELECT id, email, full_name, role, commune_id, mot_de_passe_provisoire, preferences FROM users WHERE id = $1',
      [req.user!.sub]
    );
    if (!user) throw new ApiError(401, 'Utilisateur introuvable.');
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      communeId: user.commune_id,
      motDePasseProvisoire: user.mot_de_passe_provisoire === true,
      preferences: completer(user.preferences),
    });
  })
);

// Schémas exposés à la documentation OpenAPI (src/openapi/document.ts).
// La documentation importe les schémas de validation EUX-MÊMES : elle ne peut
// donc pas décrire un format différent de celui réellement contrôlé à l'exécution.
export {
  loginSchema as loginSchema,
};
