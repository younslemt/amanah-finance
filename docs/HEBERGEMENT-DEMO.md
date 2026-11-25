# Étude d’hébergement — démonstration privée sur smartphone (Sprint 5, lot 5.4)

> Statut au 25 novembre 2026 : **configuration Netlify prête et testée en CI, site non encore créé** (il faut votre compte Netlify). Aucune mise en ligne sans l’autorisation explicite du fondateur.
> Faits relevés le 20 novembre 2026 sur les pages officielles listées en bas. Les offres gratuites changent souvent : il faut les revérifier le jour du déploiement.

## 1. Besoin

- Montrer l’application Next.js 15 en **mode démo** (données fictives uniquement, `NEXT_PUBLIC_APP_MODE=demo`) sur un smartphone, à quelques personnes choisies.
- Aucune base de données, aucun Supabase, aucune banque, aucun paiement.
- L’accès doit être **contrôlé côté serveur**. Un `robots.txt` ou un écran de connexion dans le navigateur ne suffisent pas.
- Coût visé : 0 €. Aucun service payant n’est activé.

## 2. Protection d’accès livrée dans le code (indépendante de l’hébergeur)

Le middleware (`src/lib/supabase/middleware.ts`, `src/lib/demo-access.ts`) protège **toutes** les pages et routes en mode démo :

- `DEMO_ACCESS_PASSWORD` (12 caractères au minimum) se règle **uniquement** dans les variables de l’hébergeur, jamais dans GitHub. Identifiant facultatif `DEMO_ACCESS_USER` (`demo` par défaut).
- Sans accès valide : une page demandée par un navigateur est redirigée vers `/acces` (formulaire de mot de passe) ; toute autre requête reçoit **401** sans contenu.
- Après saisie du bon mot de passe : cookie `amanah_acces` signé (HMAC-SHA256), `httpOnly`, `Secure` en HTTPS, `SameSite=Lax`, valable 30 jours. La clé dérive du mot de passe : **changer le mot de passe révoque tous les accès**.
- L’authentification HTTP Basic reste acceptée (outils, scripts).
- **Fermeture par défaut** : une construction faite chez l’hébergeur (Netlify détecté, ou `DEMO_ACCESS_REQUIRED=true`) exige le mot de passe. S’il manque ou est trop court, **tout** est refusé (503), jamais ouvert.
- La construction hébergée échoue si `NEXT_PUBLIC_APP_MODE` n’est pas `demo` ou si une variable Supabase ou Enable Banking est présente : le mode réel ne peut pas partir sur l’adresse de démonstration.
- Mauvais mot de passe : réponse retardée de 0,8 s ; redirection après connexion limitée aux chemins internes (pas de redirection ouverte).
- `X-Robots-Tag: noindex, nofollow` et `Cache-Control: no-store` en plus. `robots.txt` n’est **pas** considéré comme une protection.

Vérifié en CI (étape « Démonstration déployable ») : 401 sans mot de passe, 503 sans configuration, mot de passe absent des fichiers envoyés au navigateur, parcours complet sous WebKit aux tailles iPhone 375 et 390 px.

## 3. Comparaison

| Critère | Vercel (Hobby) | Cloudflare Workers (Free) + Access | Netlify (Free) |
|---|---|---|---|
| Coût | 0 € | 0 € (Access gratuit jusqu’à 50 utilisateurs, selon la page Zero Trust) | 0 € |
| Limites de l’offre gratuite | Quotas mensuels. Une fonction dont le quota est dépassé reste bloquée jusqu’à 30 jours. | 100 000 requêtes par jour, **10 ms de CPU par requête**, Worker de 3 MB au maximum | 300 crédits par mois. À court de crédits, le projet est suspendu jusqu’au mois suivant. |
| Compatibilité Next.js 15 | Native (éditeur de Next.js) | Passe par l’adaptateur OpenNext. Le rendu serveur doit tenir dans 10 ms de CPU et 3 MB, ce qui est **à mesurer** (risque réel avec React 19 et nos pages calculées côté serveur). | Adaptateur Next.js officiel, fonctions serverless |
| Protection d’accès | Notre Basic Auth du middleware. La protection native par mot de passe de Vercel est payante. | Notre Basic Auth, **ou** Cloudflare Access (connexion par e-mail et code à usage unique) devant l’application : protection la plus forte | Notre Basic Auth. La protection par mot de passe intégrée est réservée aux offres payantes. |
| Maintenance | Très simple : import du dépôt GitHub, déploiement à chaque push | Plus technique : configuration wrangler et OpenNext, Access à paramétrer | Simple : import du dépôt GitHub |
| Conditions commerciales | **Hobby réservé à un usage personnel et non commercial.** Une démonstration d’un projet d’entreprise peut être considérée comme commerciale : risque contractuel. | L’offre gratuite n’est pas limitée à un usage non commercial (à revérifier dans les conditions générales au moment voulu) | Pas de restriction non commerciale relevée sur l’offre gratuite (à revérifier) |

## 4. Recommandation

1. **Netlify Free avec la Basic Auth du middleware.** C’est le meilleur compromis : gratuit, Next.js pris en charge, maintenance simple, pas de clause non commerciale relevée. Il faut surveiller les crédits : une démo à faible trafic consomme peu, mais chaque déploiement en production coûte des crédits (15 par déploiement selon l’annonce Netlify). On déploiera donc rarement, sur demande.
2. **Option la plus protégée : Cloudflare Workers et Access.** À retenir si l’on veut un contrôle d’identité nominatif (invitation par e-mail). Il faut d’abord **mesurer** que nos pages tiennent dans les 10 ms de CPU du plan gratuit. Sinon, il faudrait le plan Workers payant, exclu à ce stade.
3. **Vercel Hobby n’est pas recommandé.** La technique est la meilleure, mais l’usage non commercial imposé par les conditions ne convient pas à la démonstration d’un projet d’entreprise.

## 5. Mise en ligne sur Netlify Free (à faire par vous, environ 10 minutes)

La configuration est dans `apps/web/netlify.toml`. Netlify détecte Next.js et installe son adaptateur officiel automatiquement.

1. Créez un compte sur `app.netlify.com` avec GitHub, **offre Free**. N’enregistrez aucune carte ; si un écran en exige une, arrêtez-vous.
2. *Add new project* → *Import an existing project* → GitHub → `younslemt/amanah-finance` (autorisez Netlify sur ce seul dépôt).
3. Réglages de construction : **Base directory vide**, **Package directory `apps/web`**, branche `main`. Laissez la commande et le dossier de publication proposés par `netlify.toml`.
4. *Environment variables* (portée : Builds **et** Functions/Runtime) :
   - `DEMO_ACCESS_PASSWORD` : un secret d’au moins 12 caractères (par exemple produit par un gestionnaire de mots de passe) — à ne jamais copier dans GitHub, un ticket ou une capture ;
   - facultatif : `DEMO_FEEDBACK_EMAIL` (adresse qui reçoit les avis), `DEMO_ACCESS_USER` ;
   - **aucune** variable Supabase ni Enable Banking (la construction échouerait, volontairement).
5. *Deploy*. À la fin, l’adresse est du type `https://<nom>.netlify.app`.
6. Contrôles immédiats depuis un ordinateur :
   - ouvrir l’adresse : la page « Accès réservé » doit s’afficher (sinon, **supprimez le site** et prévenez-moi) ;
   - un mauvais mot de passe est refusé ; le bon ouvre le tableau de bord avec la bannière « Démonstration ».
7. Désactivez les *Deploy Previews* des pull requests si vous ne voulez pas d’adresses supplémentaires (elles sont protégées de la même façon, mais inutiles ici).
8. Pour fermer la démonstration : changez le mot de passe (tous les accès tombent) ou supprimez le site.

Coût : 0 €. L’offre Free donne 300 crédits par mois ; un déploiement en production en consomme 15 ; la navigation de quelques testeurs consomme peu. À court de crédits, le site est suspendu jusqu’au mois suivant : aucune facturation n’est possible sans carte enregistrée.

## 7. Ouvrir la démonstration sur iPhone

1. Ouvrez **Safari** et saisissez l’adresse `https://<nom>.netlify.app`.
2. Saisissez le mot de passe reçu, touchez « Entrer ».
3. Pour l’installer : bouton **Partager** → **Sur l’écran d’accueil** → **Ajouter**.
4. Ouvrez l’icône « Amanah » : l’application installée a son propre stockage, **saisissez le mot de passe une fois de plus** dans l’application installée.
5. Les données saisies restent sur ce téléphone, dans ce navigateur (voir § 9).

Sur Android : Chrome → menu ⋮ → **Installer l’application** (ou « Ajouter à l’écran d’accueil »).

## 8. Inviter des testeurs

1. Envoyez l’adresse par un canal et le mot de passe par un **autre** (par exemple e-mail + SMS), uniquement aux personnes choisies.
2. Joignez ce message : « Démonstration avec données fictives. N’y saisissez aucune donnée bancaire réelle, aucun identifiant, aucun code. Vos saisies restent sur votre téléphone. »
3. Demandez-leur d’utiliser le menu **Profil → Donner mon avis** pour répondre aux 7 questions.
4. Fin des tests ou fuite du mot de passe : changez `DEMO_ACCESS_PASSWORD` dans Netlify puis redéployez ; tous les accès sont révoqués.

## 9. Limites du stockage de la démonstration

- Les données de chaque testeur sont dans un cookie `httpOnly` de **son** navigateur : chacun ne voit et ne modifie que ses propres données (vérifié en CI avec deux testeurs simultanés).
- **Aucune synchronisation** entre appareils ni entre Safari et l’application installée.
- Effacer les cookies, utiliser la navigation privée ou « Réinitialiser la démonstration » remet les données d’exemple.
- La taille d’un cookie est limitée : la démonstration convient à quelques dizaines de projets et d’opérations, pas à un usage prolongé.
- Rien n’est stocké sur le serveur : il n’y a pas de sauvegarde.

## 10. Retours des testeurs

Page **Donner mon avis** (`/avis`, démonstration seulement) : 7 questions simples et un bouton qui prépare un e-mail vers `DEMO_FEEDBACK_EMAIL`. Rien n’est envoyé automatiquement ni stocké sur le serveur ; la page rappelle de n’inclure aucune donnée bancaire.

## 11. Incertitudes

- Lecture des variables d’environnement par le middleware chez Netlify : vérifiée sous `next start` en CI, **à confirmer** au premier déploiement (contrôle du § 5.6). En cas d’échec, le site renvoie 503 (fermé), jamais ouvert.
- Les quotas gratuits évoluent. Le coût en crédits d’une visite sur Netlify dépend du nombre de requêtes et du calcul consommé, ce qui n’a pas été mesuré.
- La compatibilité de Next.js 15 et React 19 avec OpenNext sous la limite de 10 ms de CPU n’a pas été testée.
- La qualification « commerciale » d’une démonstration n’est pas un avis juridique. Il faut relire les conditions de l’hébergeur choisi avant de déployer.

## Sources officielles

- Vercel — Fair use guidelines (usage commercial) : https://vercel.com/docs/limits/fair-use-guidelines
- Vercel — Hobby plan : https://vercel.com/docs/plans/hobby
- Cloudflare — Workers limits : https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare — Workers pricing : https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare — Next.js sur Workers (OpenNext) : https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- Cloudflare — Zero Trust plans (Access) : https://www.cloudflare.com/plans/zero-trust-services/
- Netlify — Pricing : https://www.netlify.com/pricing/
- Netlify — Credit-based plans : https://www.netlify.com/changelog/netlify-pricing-update-introducing-credit-based-plans/
- Netlify — Password protection (offres payantes) : https://www.netlify.com/blog/restricting-access-to-netlify-sites-with-passwords/
