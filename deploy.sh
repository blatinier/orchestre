#!/usr/bin/env bash
# Put the site online on Cloudflare Pages (project orchestre-thouars).
#
# Pushing to GitHub does NOT update the site: it is uploaded directly with
# wrangler. Only the files the site needs are sent, from a clean copy, because
# `wrangler pages deploy` ignores .gitignore.
#
# Usage:
#   ./deploy.sh            # checks, confirmation, then deploy
#   ./deploy.sh --dry-run  # everything except the upload

set -euo pipefail

PROJET="orchestre-thouars"
# Everything the site needs; nothing else goes online
FICHIERS_SITE=(index.html viewer.html css js images partitions partitions.json)
FICHIERS_OPTIONNELS=(annotations)
NODE_MIN=22

DRY_RUN=false
case "${1:-}" in
    "") ;;
    --dry-run) DRY_RUN=true ;;
    *) echo "Usage : $0 [--dry-run]" >&2; exit 2 ;;
esac

cd "$(dirname "$0")"

erreur() {
    echo "🛑 $*" >&2
    exit 1
}

# 1. The deployed commit must be exactly what is online
if [ -n "$(git status --porcelain)" ]; then
    git status --short >&2
    erreur "Des modifications ne sont pas commitées : commitez-les avant de déployer."
fi
COMMIT=$(git rev-parse HEAD)
MESSAGE=$(git log -1 --format=%s)
BRANCHE=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCHE" = "main" ] || erreur "Le déploiement se fait depuis main (branche actuelle : $BRANCHE)."

# 2. Node >= 22 for wrangler: the current one, or one installed with nvm
version_majeure() {
    "$1" --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'
}
NODE_BIN=""
if command -v node >/dev/null && [ "$(version_majeure node)" -ge "$NODE_MIN" ]; then
    NODE_BIN=$(dirname "$(command -v node)")
else
    for candidat in $(ls -d "$HOME"/.nvm/versions/node/v* 2>/dev/null | sort -V -r); do
        if [ "$(version_majeure "$candidat/bin/node")" -ge "$NODE_MIN" ]; then
            NODE_BIN="$candidat/bin"
            break
        fi
    done
fi
[ -n "$NODE_BIN" ] || erreur "Wrangler demande Node $NODE_MIN ou plus : installez-le (par exemple « nvm install 24 »)."
export PATH="$NODE_BIN:$PATH"

# 3. Tests
echo "▶ Tests…"
npm test --silent >/dev/null 2>&1 || erreur "Les tests échouent (lancez « npm test ») : déploiement annulé."

# 4. Clean copy of the site
DOSSIER=$(mktemp -d)
trap 'rm -rf "$DOSSIER"' EXIT
cp -r "${FICHIERS_SITE[@]}" "$DOSSIER/"
for optionnel in "${FICHIERS_OPTIONNELS[@]}"; do
    if [ -e "$optionnel" ]; then
        cp -r "$optionnel" "$DOSSIER/"
    fi
done

# 5. Nothing that looks like secrets or personal data
SUSPECTS=$(cd "$DOSSIER" && find . -type f \( -iname '.env*' -o -iname '*.csv' -o -iname '*.xlsx' -o -iname '*.xls' \
    -o -iname '*.sql' -o -iname '*.key' -o -iname '*.pem' -o -iname '*secret*' -o -iname '*credential*' -o -iname '*.log' \))
if [ -n "$SUSPECTS" ]; then
    echo "$SUSPECTS" >&2
    erreur "PUBLICATION BLOQUÉE — fichiers potentiellement sensibles ci-dessus. Contactez l'équipe technique avant d'aller plus loin."
fi

# 6. Confirmation
echo
echo "Fichiers envoyés ($(du -sh "$DOSSIER" | cut -f1)) :"
(cd "$DOSSIER" && find . -maxdepth 1 -mindepth 1 | sed 's|^\./|  - |' | sort)
echo "Commit : ${COMMIT:0:7} — $MESSAGE"
echo
echo "⚠️  PUBLICATION PUBLIQUE — À LIRE D'ABORD"
echo "Vous êtes sur le point de publier vers une destination PUBLIQUE (Cloudflare Pages,"
echo "https://$PROJET.pages.dev). Tout ce qui est inclus peut devenir définitivement public"
echo "et rester en cache ou indexé même après suppression."
echo "Y a-t-il de vraies données de clients, de prospects ou personnelles ? Des clés,"
echo "mots de passe ou jetons ? Si vous n'en êtes pas sûr à 100 %, ARRÊTEZ et contactez"
echo "l'équipe technique."
echo

if $DRY_RUN; then
    echo "--dry-run : rien n'a été envoyé."
    exit 0
fi

read -r -p "Tapez « oui » pour publier : " reponse
[ "$reponse" = "oui" ] || erreur "Déploiement annulé."

# 7. Upload
npx -y wrangler@latest pages deploy "$DOSSIER" \
    --project-name "$PROJET" \
    --branch main \
    --commit-hash "$COMMIT" \
    --commit-message "$MESSAGE"
