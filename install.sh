#!/usr/bin/env sh
set -e

# ── colours ──────────────────────────────────────────────────────────────────
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  CY='\033[36m' GR='\033[32m' YE='\033[33m' RE='\033[31m'
  BO='\033[1m'  DI='\033[2m'  NC='\033[0m'
else
  CY='' GR='' YE='' RE='' BO='' DI='' NC=''
fi

say()  { printf "${CY}${BO}soltinel${NC} %s\n" "$*"; }
ok()   { printf "${GR}✓${NC} %s\n" "$*"; }
warn() { printf "${YE}!${NC} %s\n" "$*"; }
die()  { printf "${RE}✗${NC} %s\n" "$*"; exit 1; }

echo ""
say "installer"
echo ""

# ── Node.js ───────────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || \
  die "Node.js not found. Install Node.js 18+ from https://nodejs.org and re-run."

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
[ "$NODE_MAJOR" -ge 18 ] 2>/dev/null || \
  die "Node.js 18+ required (found $(node --version)). Upgrade at https://nodejs.org"

ok "Node.js $(node --version)"

# ── npm ───────────────────────────────────────────────────────────────────────
command -v npm >/dev/null 2>&1 || \
  die "npm not found. Re-install Node.js from https://nodejs.org"

ok "npm $(npm --version)"

# ── install ───────────────────────────────────────────────────────────────────
say "installing via npm..."
npm install -g soltinel

# verify the binary landed in PATH
if ! command -v soltinel >/dev/null 2>&1; then
  NPM_BIN=$(npm bin -g 2>/dev/null || npm prefix -g)/bin
  warn "soltinel installed but not found in PATH."
  warn "Add this to your shell profile and restart your terminal:"
  warn "  export PATH=\"\$PATH:${NPM_BIN}\""
  echo ""
fi

ok "soltinel $(soltinel --version 2>/dev/null || echo installed)"

# ── config directory ──────────────────────────────────────────────────────────
CONF_DIR="${HOME}/soltinel"
ENV_FILE="${CONF_DIR}/.env"

mkdir -p "$CONF_DIR"

if [ ! -f "$ENV_FILE" ]; then
  say "downloading .env template..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL \
      https://raw.githubusercontent.com/saadzimat430/soltinel/main/.env.example \
      -o "$ENV_FILE" 2>/dev/null && ok "Created ${ENV_FILE}" \
      || warn "Could not fetch .env template — create ${ENV_FILE} manually."
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$ENV_FILE" \
      https://raw.githubusercontent.com/saadzimat430/soltinel/main/.env.example \
      && ok "Created ${ENV_FILE}" \
      || warn "Could not fetch .env template — create ${ENV_FILE} manually."
  else
    warn "curl/wget not found. Create ${ENV_FILE} manually."
  fi
else
  ok "${ENV_FILE} already exists — skipping."
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
printf "${BO}Setup complete!${NC}\n"
echo ""
printf "  1. Add your keys:    ${DI}nano ~/soltinel/.env${NC}\n"
printf "                       ${DI}SOLANA_PRIVATE_KEY=<base58 hot wallet>${NC}\n"
printf "                       ${DI}OPENROUTER_API_KEY=<your llm key>${NC}\n"
echo ""
printf "  2. Run the bot:      ${DI}soltinel${NC}\n"
printf "     Specific token:   ${DI}soltinel <TOKEN_MINT>${NC}\n"
printf "     Help:             ${DI}soltinel --help${NC}\n"
echo ""
printf "${DI}Config lives at: ~/soltinel/.env  (run soltinel from any directory)${NC}\n"
printf "${DI}Docs: https://github.com/saadzimat430/soltinel#readme${NC}\n"
echo ""
