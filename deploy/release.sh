#!/usr/bin/env bash
# One-command release for the PRESS Journals app. Run from your Mac, in the repo:
#
#   npm run release
#
# It does, in order:
#   1. preflight  — clean tree, typecheck, production build
#   2. publish    — push the current branch, merge it into main, push main
#   3. backup     — pull the server's data volume down to ./backups/
#   4. deploy     — run deploy/setup-server.sh on the VM over SSH
#   5. verify     — poll the live site until it answers 200
#
# Every value it needs lives in deploy/release.env (gitignored). Nothing is
# typed by hand, so there are no placeholders left to mistype — which is what
# the "zsh: parse error near `>'" was: a literal <PUBLIC_IP> in a command.
#
# Flags:
#   --yes            don't prompt before merging/deploying (for unattended runs)
#   --skip-build     skip typecheck + next build (faster; use only if just built)
#   --skip-backup    skip the data snapshot (not recommended)
#   --backup-only    take a backup and stop
#   --no-merge       deploy the current branch's commit without touching main
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
REPO_ROOT="$PWD"
ENV_FILE="$REPO_ROOT/deploy/release.env"

ASSUME_YES=0; SKIP_BUILD=0; SKIP_BACKUP=0; BACKUP_ONLY=0; DO_MERGE=1
for arg in "$@"; do
  case "$arg" in
    --yes|-y)      ASSUME_YES=1 ;;
    --skip-build)  SKIP_BUILD=1 ;;
    --skip-backup) SKIP_BACKUP=1 ;;
    --backup-only) BACKUP_ONLY=1 ;;
    --no-merge)    DO_MERGE=0 ;;
    -h|--help)     sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown flag: $arg (try --help)" >&2; exit 2 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!  %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗  %s\033[0m\n' "$*" >&2; exit 1; }

confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  printf '\033[1m%s\033[0m [y/N] ' "$1"
  read -r reply </dev/tty
  [[ "$reply" =~ ^[Yy]$ ]]
}

# ── Config ───────────────────────────────────────────────────────────────────
[ -f "$ENV_FILE" ] || die "No deploy/release.env found.
   Create it once:  cp deploy/release.env.example deploy/release.env
   then edit it and fill in VM_HOST, SSH_KEY and ADMIN_PASSWORD."

# Scan the file as TEXT before sourcing it. An unquoted <PUBLIC_IP> placeholder is
# a redirection to bash, so sourcing would fail with an opaque "syntax error near
# unexpected token" instead of telling the user what is actually wrong.
BAD=$(grep -n '[<>]' "$ENV_FILE" | grep -v '^[0-9][0-9]*:[[:space:]]*#' | head -3 || true)
if [ -n "$BAD" ]; then
  die "deploy/release.env still has angle-bracket placeholders:

$BAD

   Replace them with real values and no < >, e.g.
     VM_HOST=129.213.0.0"
fi

set -a; . "$ENV_FILE"; set +a
VM_USER="${VM_USER:-ubuntu}"
APP_DOMAIN="${APP_DOMAIN:-}"

[ -n "${VM_HOST:-}" ]        || die "VM_HOST is not set in deploy/release.env"
[ -n "${SSH_KEY:-}" ]        || die "SSH_KEY is not set in deploy/release.env"
[ -n "${ADMIN_PASSWORD:-}" ] || die "ADMIN_PASSWORD is not set in deploy/release.env"

SSH_KEY_PATH="${SSH_KEY/#\~/$HOME}"          # expand a leading ~
[ -f "$SSH_KEY_PATH" ] || die "SSH key not found at: $SSH_KEY_PATH"
chmod 600 "$SSH_KEY_PATH" 2>/dev/null || true

SSH=(ssh -i "$SSH_KEY_PATH" -o ServerAliveInterval=30 -o ConnectTimeout=15 "$VM_USER@$VM_HOST")
SITE_URL="${APP_DOMAIN:+https://$APP_DOMAIN}"
SITE_URL="${SITE_URL:-http://$VM_HOST}"

bold "Releasing to $VM_USER@$VM_HOST  →  $SITE_URL"

# ── 1. Preflight ─────────────────────────────────────────────────────────────
if [ "$BACKUP_ONLY" = 0 ]; then
  step "[1/5] Preflight"
  git diff --quiet && git diff --cached --quiet \
    || die "You have uncommitted changes. Commit or stash them first."

  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  [ "$BRANCH" != "HEAD" ] || die "Detached HEAD — check out a branch first."
  echo "    branch: $BRANCH  ($(git rev-parse --short HEAD))"

  if [ "$SKIP_BUILD" = 0 ]; then
    echo "    typecheck…"; npx tsc --noEmit
    echo "    production build…"; npx next build >/dev/null
    echo "    build OK"
  else
    warn "skipping typecheck + build (--skip-build)"
  fi

  # Fail here rather than half-way through a deploy.
  "${SSH[@]}" true || die "Cannot SSH to $VM_USER@$VM_HOST. Check the VM is running and SSH_KEY is right."
fi

# ── 2. Publish ───────────────────────────────────────────────────────────────
if [ "$BACKUP_ONLY" = 0 ]; then
  step "[2/5] Publishing to GitHub"
  # The installer clones main, so main is what actually ships.
  git push -u origin "$BRANCH"

  if [ "$DO_MERGE" = 1 ] && [ "$BRANCH" != "main" ]; then
    if confirm "Merge $BRANCH into main and push? (this is what gets deployed)"; then
      git checkout main
      git pull --ff-only
      git merge --no-edit "$BRANCH"
      git push
      git checkout "$BRANCH"
      echo "    main updated"
    else
      die "Aborted — main unchanged, so a deploy would ship the previous code."
    fi
  elif [ "$BRANCH" = "main" ]; then
    git push
  else
    warn "--no-merge: main is unchanged, the deploy will ship whatever main already has"
  fi
fi

# ── 3. Backup ────────────────────────────────────────────────────────────────
if [ "$SKIP_BACKUP" = 0 ]; then
  step "[3/5] Backing up the server's data volume"
  mkdir -p "$REPO_ROOT/backups"
  STAMP="$(date +%Y-%m-%d-%H%M%S)"
  DEST="$REPO_ROOT/backups/press-backup-$STAMP.tar.gz"
  # Streams the volume straight to disk here; nothing is stored on the VM.
  if "${SSH[@]}" 'sudo docker run --rm -v press-data:/d alpine tar cz -C /d .' > "$DEST" 2>/dev/null; then
    SIZE=$(wc -c < "$DEST" | tr -d ' ')
    if [ "$SIZE" -lt 100 ]; then
      rm -f "$DEST"
      warn "Backup came back empty — the press-data volume probably doesn't exist yet (first deploy). Continuing."
    else
      echo "    saved $DEST ($(du -h "$DEST" | cut -f1))"
    fi
  else
    rm -f "$DEST"
    warn "Backup failed (first deploy, or docker not installed yet). Continuing."
  fi
else
  warn "skipping backup (--skip-backup)"
fi

[ "$BACKUP_ONLY" = 1 ] && { bold "Backup only — done."; exit 0; }

# ── 4. Deploy ────────────────────────────────────────────────────────────────
step "[4/5] Deploying"
confirm "Run the installer on $VM_HOST now?" || die "Aborted before deploying."

# Secrets travel inside the script on stdin, never in argv — so they don't show
# up in the VM's process list. printf %q keeps quoting safe for any password.
{
  printf 'set -euo pipefail\n'
  printf 'export ADMIN_PASSWORD=%q\n' "$ADMIN_PASSWORD"
  printf 'export APP_DOMAIN=%q\n'     "$APP_DOMAIN"
  for v in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM; do
    val="${!v:-}"
    [ -n "$val" ] && printf 'export %s=%q\n' "$v" "$val"
  done
  printf 'curl -fsSL https://raw.githubusercontent.com/ellayee168-create/press-journals-app/main/deploy/setup-server.sh | bash\n'
} | "${SSH[@]}" 'bash -s'

# ── 5. Verify ────────────────────────────────────────────────────────────────
step "[5/5] Verifying the site is up"
for i in $(seq 1 30); do
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$SITE_URL/" 2>/dev/null || echo 000)"
  if [ "$CODE" = "200" ]; then
    bold ""
    bold "✅ Live at $SITE_URL   (admin: $SITE_URL/admin)"
    exit 0
  fi
  printf '    attempt %02d/30 → HTTP %s\n' "$i" "$CODE"
  sleep 5
done

die "Deployed, but $SITE_URL never returned 200.
   If you just enabled HTTPS, the Let's Encrypt certificate can take a minute — retry the URL in a browser.
   Otherwise check the container:  ssh -i $SSH_KEY_PATH $VM_USER@$VM_HOST 'sudo docker logs --tail 50 press-journals'"
