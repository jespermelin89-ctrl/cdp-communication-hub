#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CDP Communication Hub — One-Command Deploy Script
# ═══════════════════════════════════════════════════════════════
#
# This script pushes the codebase to GitHub and guides you through
# Supabase, Render, and Vercel setup.
#
# Prerequisites:
#   - Git installed
#   - GitHub CLI (gh) installed: brew install gh
#   - Node.js 18+ installed
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
# ═══════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

REPO_NAME="cdp-communication-hub"
GITHUB_USER="jespermelin89-ctrl"

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   CDP Communication Hub — Deployment Script          ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Step 1: Push to GitHub ──────────────────────────────────
echo -e "${BLUE}━━━ Step 1: Push to GitHub ━━━${NC}"

if [ -d ".git" ]; then
  echo -e "${GREEN}✓${NC} Git repo already initialized"
else
  echo "Initializing git..."
  git init
  git add -A
  git commit -m "Initial commit: CDP Communication Hub

Full-stack AI-powered email management system with:
- Multi-account support (Gmail OAuth + IMAP/SMTP)
- Draft-first approval workflow
- Category & sender rule system
- Conversational chat interface (Swedish + English)
- Command center dashboard

Stack: Next.js, Fastify, Prisma, PostgreSQL"
fi

# Check if remote exists
if git remote get-url origin &>/dev/null; then
  echo -e "${GREEN}✓${NC} Remote 'origin' already set"
else
  git remote add origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
  echo -e "${GREEN}✓${NC} Remote added: ${GITHUB_USER}/${REPO_NAME}"
fi

echo "Pushing to GitHub..."
git branch -M main
git push -u origin main --force
echo -e "${GREEN}✓ Code pushed to GitHub!${NC}"
echo ""

# ─── Step 2: Supabase Database ───────────────────────────────
echo -e "${BLUE}━━━ Step 2: Supabase Database ━━━${NC}"
echo ""
echo -e "If you haven't created a Supabase project yet:"
echo -e "  1. Go to ${CYAN}https://supabase.com/dashboard/new/ywsoykxkevowwygccwon${NC}"
echo -e "  2. Project name: ${YELLOW}cdp-communication-hub${NC}"
echo -e "  3. Generate a strong database password (save it!)"
echo -e "  4. Region: ${YELLOW}EU West (Ireland)${NC}"
echo -e "  5. Click 'Create new project'"
echo ""
echo -e "After creation, get your DATABASE_URL from:"
echo -e "  ${CYAN}Project Settings → Database → Connection string → URI${NC}"
echo -e "  Format: ${YELLOW}postgresql://postgres.[ref]:[password]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres${NC}"
echo ""
read -p "Paste your Supabase DATABASE_URL (or press Enter to skip): " DATABASE_URL

if [ -n "$DATABASE_URL" ]; then
  echo -e "${GREEN}✓${NC} Database URL captured"
else
  echo -e "${YELLOW}⚠${NC} Skipped — you'll need to set this in Render manually"
fi
echo ""

# ─── Step 3: Deploy Backend to Render ────────────────────────
echo -e "${BLUE}━━━ Step 3: Deploy Backend to Render ━━━${NC}"
echo ""
echo -e "Option A: Use Render Blueprint (automatic):"
echo -e "  1. Go to ${CYAN}https://render.com/deploy?repo=https://github.com/${GITHUB_USER}/${REPO_NAME}${NC}"
echo -e "  2. It reads render.yaml and sets up everything"
echo ""
echo -e "Option B: Manual setup:"
echo -e "  1. Go to ${CYAN}https://dashboard.render.com/new/web${NC}"
echo -e "  2. Connect your GitHub repo: ${YELLOW}${GITHUB_USER}/${REPO_NAME}${NC}"
echo -e "  3. Settings:"
echo -e "     - Name: ${YELLOW}cdp-hub-api${NC}"
echo -e "     - Region: ${YELLOW}Frankfurt (EU)${NC}"
echo -e "     - Root Directory: ${YELLOW}server${NC}"
echo -e "     - Build Command: ${YELLOW}npm install && npx prisma generate && npm run build${NC}"
echo -e "     - Start Command: ${YELLOW}npm run start${NC}"
echo ""
echo -e "  4. Environment variables to set:"
echo -e "     ${YELLOW}NODE_ENV${NC}=production"
echo -e "     ${YELLOW}HOST${NC}=0.0.0.0"
echo -e "     ${YELLOW}PORT${NC}=3001"
if [ -n "$DATABASE_URL" ]; then
  echo -e "     ${YELLOW}DATABASE_URL${NC}=${DATABASE_URL}"
fi
echo -e "     ${YELLOW}FRONTEND_URL${NC}=https://your-vercel-app.vercel.app (set after Vercel deploy)"
echo -e "     ${YELLOW}GOOGLE_CLIENT_ID${NC}=from Google Cloud Console"
echo -e "     ${YELLOW}GOOGLE_CLIENT_SECRET${NC}=from Google Cloud Console"
echo -e "     ${YELLOW}GOOGLE_REDIRECT_URI${NC}=https://cdp-hub-api.onrender.com/api/v1/auth/google/callback"
echo -e "     ${YELLOW}JWT_SECRET${NC}=auto-generated (32+ chars)"
echo -e "     ${YELLOW}ENCRYPTION_KEY${NC}=auto-generated (32+ chars hex)"
echo -e "     ${YELLOW}ANTHROPIC_API_KEY${NC}=your Anthropic API key"
echo ""

read -p "Enter your Render backend URL (e.g. https://cdp-hub-api.onrender.com) or press Enter to skip: " RENDER_URL
RENDER_URL=${RENDER_URL:-"https://cdp-hub-api.onrender.com"}
echo -e "${GREEN}✓${NC} Backend URL: $RENDER_URL"
echo ""

# ─── Step 4: Deploy Frontend to Vercel ───────────────────────
echo -e "${BLUE}━━━ Step 4: Deploy Frontend to Vercel ━━━${NC}"
echo ""
echo -e "  1. Go to ${CYAN}https://vercel.com/new${NC}"
echo -e "  2. Import: ${YELLOW}${GITHUB_USER}/${REPO_NAME}${NC}"
echo -e "  3. Root Directory: ${YELLOW}client${NC}"
echo -e "  4. Framework Preset: ${YELLOW}Next.js${NC} (auto-detected)"
echo -e "  5. Environment Variables:"
echo -e "     ${YELLOW}NEXT_PUBLIC_API_URL${NC}=${RENDER_URL}"
echo -e "  6. Click 'Deploy'"
echo ""
echo -e "${GREEN}After deploy, update Render's FRONTEND_URL to your Vercel URL!${NC}"
echo ""

# ─── Step 5: Run Prisma Migrations ──────────────────────────
echo -e "${BLUE}━━━ Step 5: Initialize Database ━━━${NC}"
echo ""
if [ -n "$DATABASE_URL" ]; then
  read -p "Run Prisma migrations now? (y/N): " RUN_MIGRATE
  if [ "$RUN_MIGRATE" = "y" ] || [ "$RUN_MIGRATE" = "Y" ]; then
    cd server
    npm install
    DATABASE_URL="$DATABASE_URL" npx prisma db push
    echo -e "${GREEN}✓ Database schema pushed!${NC}"
    cd ..
  fi
else
  echo -e "${YELLOW}⚠${NC} Database URL not set — run migrations manually later:"
  echo -e "  cd server && DATABASE_URL=your_url npx prisma db push"
fi
echo ""

# ─── Step 6: Google OAuth Setup ──────────────────────────────
echo -e "${BLUE}━━━ Step 6: Google OAuth Setup ━━━${NC}"
echo ""
echo -e "You need a Google Cloud project with Gmail API enabled:"
echo -e "  1. Go to ${CYAN}https://console.cloud.google.com/apis/credentials${NC}"
echo -e "  2. Create OAuth 2.0 Client ID (Web application)"
echo -e "  3. Authorized redirect URIs:"
echo -e "     ${YELLOW}${RENDER_URL}/api/v1/auth/google/callback${NC}"
echo -e "  4. Copy Client ID and Client Secret to Render env vars"
echo ""

# ─── Summary ─────────────────────────────────────────────────
echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Deployment Checklist                               ║${NC}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC} □ GitHub repo pushed                                 ${CYAN}║${NC}"
echo -e "${CYAN}║${NC} □ Supabase project created + DATABASE_URL obtained   ${CYAN}║${NC}"
echo -e "${CYAN}║${NC} □ Render backend deployed with all env vars          ${CYAN}║${NC}"
echo -e "${CYAN}║${NC} □ Vercel frontend deployed with NEXT_PUBLIC_API_URL  ${CYAN}║${NC}"
echo -e "${CYAN}║${NC} □ Render FRONTEND_URL updated to Vercel URL          ${CYAN}║${NC}"
echo -e "${CYAN}║${NC} □ Google OAuth client configured                     ${CYAN}║${NC}"
echo -e "${CYAN}║${NC} □ Prisma migrations run (prisma db push)             ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Done! Your CDP Communication Hub is ready. 🚀${NC}"
