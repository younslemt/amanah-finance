# Étude d’hébergement — démonstration privée sur smartphone (Sprint 5, lot 5.4)

> Statut : **étude seulement. Rien n’est déployé.** Aucune mise en ligne sans l’autorisation explicite du fondateur.
> Faits relevés le 20 novembre 2026 sur les pages officielles listées en bas. Les offres gratuites changent souvent : il faut les revérifier le jour du déploiement.

## 1. Besoin

- Montrer l’application Next.js 15 en **mode démo** (données fictives uniquement, `NEXT_PUBLIC_APP_MODE=demo`) sur un smartphone, à quelques personnes choisies.
- Aucune base de données, aucun Supabase, aucune banque, aucun paiement.
- L’accès doit être **contrôlé côté serveur**. Un `robots.txt` ou un écran de connexion dans le navigateur ne suffisent pas.
- Coût visé : 0 €. Aucun service payant n’est activé.

## 2. Protection d’accès livrée dans le code (indépendante de l’hébergeur)

Le middleware Next.js (`src/lib/supabase/middleware.ts` et `src/lib/demo-access.ts`) applique une **authentification HTTP Basic côté serveur** sur toutes les pages en mode démo, dès que la variable `DEMO_ACCESS_PASSWORD` est définie :

- 12 caractères au minimum. Si le mot de passe est plus court, le serveur refuse toutes les requêtes (erreur), sans jamais ouvrir l’accès.
- Identifiant par défaut : `demo`, modifiable avec `DEMO_ACCESS_USER`.
- Les identifiants sont comparés en temps constant.
- Sans identifiants valides, le serveur répond **401** et aucune page ni donnée n’est envoyée.
- En-tête `X-Robots-Tag: noindex, nofollow` en plus.
- Le secret se règle dans les variables d’environnement de l’hébergeur. Il n’est jamais écrit dans le dépôt.

Basic Auth ne protège réellement qu’en **HTTPS**, et les trois hébergeurs étudiés fournissent HTTPS. Ce verrou suffit pour une démo à données fictives. Pour une version avec données réelles, il faudra un vrai contrôle d’identité (Cloudflare Access ou équivalent) en plus de l’authentification Supabase.

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

## 5. Étapes le jour où le fondateur autorise la mise en ligne (non réalisées)

1. Créer le projet chez l’hébergeur retenu, sans moyen de paiement enregistré.
2. Définir `NEXT_PUBLIC_APP_MODE=demo`, `DEMO_ACCESS_PASSWORD` (un secret fort, transmis hors du dépôt) et éventuellement `DEMO_ACCESS_USER`.
3. Ne définir **aucune** variable Supabase.
4. Déployer la branche `main`.
5. Vérifier depuis un smartphone :
   - le 401 sans mot de passe ;
   - la bannière « Démonstration » ;
   - l’installation sur l’écran d’accueil ;
   - la page hors ligne.
6. Révoquer l’accès (supprimer le projet ou changer le mot de passe) après la démonstration.

## 6. Incertitudes

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
