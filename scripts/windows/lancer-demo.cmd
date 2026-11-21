@echo off
rem ===========================================================================
rem  AMANAH FINANCE - lancement local en MODE DEMONSTRATION (donnees fictives)
rem
rem  Usage (depuis l'Explorateur : double-clic, ou dans une invite de commandes) :
rem      scripts\windows\lancer-demo.cmd                -> installe, compile, demarre sur le port 3000
rem      scripts\windows\lancer-demo.cmd 3001           -> autre port
rem      scripts\windows\lancer-demo.cmd 3000 rapide    -> sans reinstallation ni recompilation
rem
rem  Ce script ne contient AUCUN secret et ne lit ni n'ecrit aucun fichier .env.
rem  Le mode demo est impose par variable d'environnement du processus uniquement :
rem  aucune connexion Supabase, aucune banque, aucun paiement.
rem  Arret : Ctrl+C dans cette fenetre (puis O pour confirmer), ou fermer la fenetre.
rem ===========================================================================
setlocal EnableExtensions
chcp 65001 >nul

set "PORT=%~1"
if "%PORT%"=="" set "PORT=3000"
set "MODE_RAPIDE=%~2"

rem Racine du depot : deux niveaux au-dessus de ce script
pushd "%~dp0..\.." || (echo [ERREUR] Dossier du depot introuvable. & goto :fin_erreur)

echo.
echo === AMANAH FINANCE - demonstration locale (donnees fictives) ===
echo Dossier : %CD%
echo Port    : %PORT%
echo.

rem --- 1. Prerequis ----------------------------------------------------------
where node >nul 2>nul || (echo [ERREUR] Node.js est introuvable. Installez Node.js 22.18 ou plus recent : https://nodejs.org & goto :fin_erreur)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
for /f "tokens=2 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MINOR=%%v"
if %NODE_MAJOR% LSS 22 (echo [ERREUR] Node.js 22.18 minimum requis. Version detectee : & node -v & goto :fin_erreur)
if %NODE_MAJOR% EQU 22 if %NODE_MINOR% LSS 18 (echo [ERREUR] Node.js 22.18 minimum requis. Version detectee : & node -v & goto :fin_erreur)

set "PNPM=pnpm"
where pnpm >nul 2>nul || set "PNPM=corepack pnpm"
call %PNPM% --version >nul 2>nul || (echo [ERREUR] pnpm indisponible. Executez une fois : corepack enable  ^(invite de commandes en administrateur^) & goto :fin_erreur)

netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul && (echo [ERREUR] Le port %PORT% est deja utilise. Fermez l'autre application ou lancez : scripts\windows\lancer-demo.cmd 3001 & goto :fin_erreur)

rem --- 2. Mode demonstration impose (processus courant uniquement) ------------
set "NEXT_PUBLIC_APP_MODE=demo"
set "NEXT_TELEMETRY_DISABLED=1"
rem Aucune donnee reelle : on neutralise toute configuration Supabase heritee de la session
set "NEXT_PUBLIC_SUPABASE_URL="
set "NEXT_PUBLIC_SUPABASE_ANON_KEY="
set "SUPABASE_SERVICE_ROLE_KEY="

if /i "%MODE_RAPIDE%"=="rapide" (
  if exist "apps\web\.next\BUILD_ID" goto :demarrer
  echo [INFO] Aucune compilation trouvee : compilation complete.
)

rem --- 3. Installation ---------------------------------------------------------
echo [1/3] Installation des dependances (versions verrouillees)...
call %PNPM% install --frozen-lockfile || (echo [ERREUR] Installation echouee. Voir docs\LANCEMENT-WINDOWS.md, section Erreurs frequentes. & goto :fin_erreur)

rem --- 4. Compilation (le mode demo est fige a la compilation) -----------------
echo [2/3] Compilation de l'application en mode demonstration...
call %PNPM% build || (echo [ERREUR] Compilation echouee. Voir docs\LANCEMENT-WINDOWS.md. & goto :fin_erreur)

:demarrer
rem --- 5. Demarrage -------------------------------------------------------------
echo [3/3] Demarrage : ouvrez http://localhost:%PORT%  (Ctrl+C pour arreter)
echo.
start "Amanah - navigateur" /min cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:%PORT%/dashboard"
call %PNPM% --filter @amanah/web exec next start -p %PORT%
popd
endlocal
exit /b 0

:fin_erreur
popd 2>nul
echo.
pause
endlocal
exit /b 1
