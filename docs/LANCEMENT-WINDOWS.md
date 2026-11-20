# Lancer la démonstration sous Windows

Le script `scripts\windows\lancer-demo.cmd` installe, compile et démarre l’application **en mode démonstration** (données fictives) sur votre PC.

- Il ne contient aucun secret et ne lit ni ne modifie aucun fichier `.env`.
- Le mode démo est imposé par une variable d’environnement limitée à la fenêtre du script.
- Il n’y a aucune connexion à Supabase, à une banque ou à un service de paiement.

> **Honnêteté sur les tests.** Le script a été écrit et relu, mais il **n’a pas été exécuté sur Windows** : l’environnement de développement de Claude est sous Linux et ne peut pas lancer `cmd.exe` ni les binaires Windows de Next.js. Les commandes qu’il enchaîne (`pnpm install --frozen-lockfile`, `pnpm build`, `next start`) sont celles que la CI exécute à chaque modification, sous Linux. Merci de signaler toute erreur rencontrée.

## 1. Prérequis (une seule fois)

| Outil | Version | Vérification |
|---|---|---|
| Node.js | **22.18 ou plus récent** (LTS 22 ou 24) — https://nodejs.org | `node -v` |
| pnpm | 10.18.0, fourni par Corepack, inclus avec Node | `corepack enable` (invite de commandes **en administrateur**), puis `pnpm -v` |
| Git | récent — https://git-scm.com | `git --version` |

Espace disque : environ 1,5 Go pour les dépendances et la compilation.

## 2. Récupérer le code

```bat
git clone https://github.com/younslemt/amanah-finance.git
cd amanah-finance
```

Si le dépôt est déjà présent : `git pull`.

## 3. Lancer

Double-cliquez sur `scripts\windows\lancer-demo.cmd`, ou dans une invite de commandes :

```bat
scripts\windows\lancer-demo.cmd            :: installe, compile, démarre sur http://localhost:3000
scripts\windows\lancer-demo.cmd 3001       :: autre port
scripts\windows\lancer-demo.cmd 3000 rapide :: redémarrage sans réinstaller ni recompiler
```

Le script effectue quatre opérations :

1. Il vérifie Node.js (version 22.18 ou plus), pnpm et que le port est libre.
2. Il impose `NEXT_PUBLIC_APP_MODE=demo` et neutralise les variables Supabase de la session.
3. Il installe les dépendances aux versions verrouillées (`--frozen-lockfile`).
4. Il compile, puis démarre le serveur et ouvre le navigateur sur le tableau de bord.

La première fois, comptez quelques minutes. Le mode démo est figé au moment de la compilation : si vous avez compilé autrement auparavant, relancez sans l’option `rapide`.

**Depuis un smartphone sur le même Wi-Fi** : ouvrez `http://<adresse-IP-du-PC>:3000`. L’adresse IP s’obtient avec `ipconfig`. Le pare-feu Windows peut demander d’autoriser Node.js : choisissez « Réseaux privés » uniquement. L’installation sur l’écran d’accueil et le service worker nécessitent HTTPS. Ils fonctionnent sur `localhost`, mais pas via l’adresse IP.

## 4. Arrêter

Dans la fenêtre du serveur, faites **Ctrl + C**, puis `O` pour confirmer. Vous pouvez aussi simplement fermer la fenêtre.

## 5. Erreurs fréquentes

| Message | Cause | Solution |
|---|---|---|
| `Node.js est introuvable` / version insuffisante | Node absent ou trop ancien | Installer Node 22 LTS ou plus récent, rouvrir l’invite de commandes |
| `pnpm indisponible` | Corepack non activé | Invite de commandes en administrateur : `corepack enable` |
| `Le port 3000 est déjà utilisé` | Un autre serveur tourne déjà | Fermer l’autre fenêtre ou lancer `lancer-demo.cmd 3001` |
| `ERR_PNPM_OUTDATED_LOCKFILE` | Le fichier de verrouillage ne correspond pas | `git pull` puis relancer ; ne pas modifier `pnpm-lock.yaml` à la main |
| `EPERM` / `EBUSY` pendant l’installation | Antivirus ou fichier ouvert dans `node_modules` | Fermer les éditeurs, relancer. Au besoin, supprimer `node_modules` puis relancer. |
| `Configuration invalide — …` au démarrage | Variable `NEXT_PUBLIC_APP_MODE` incohérente lors d’une compilation précédente | Relancer **sans** `rapide` pour recompiler en mode démo |
| `DEMO_ACCESS_PASSWORD trop court` | La variable est définie (par exemple dans `.env.local`) avec moins de 12 caractères | La supprimer pour un usage local, ou mettre 12 caractères ou plus |
| Chemin contenant des espaces ou des accents | Certains outils gèrent mal ces chemins | Placer le dépôt dans un chemin simple, par exemple `C:\dev\amanah-finance` |
| `${PORT:-3000}` affiché en erreur | `pnpm start` utilise une syntaxe Unix | Utiliser ce script, qui appelle `next start -p <port>` directement |

## 6. Ce que le script ne fait jamais

- Il ne se connecte à aucune base de données, aucune banque ni aucun service de paiement.
- Il n’écrit aucun secret sur le disque.
- Il ne publie rien sur Internet : le serveur n’écoute que sur votre machine et votre réseau local.
