#!/bin/bash
###############################################################################
# Pa_mSikA — Setup Script
# Run this once to bootstrap the full system
###############################################################################
set -e

echo "🚀 Pa_mSikA Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check .env exists
if [ ! -f .env ]; then
  echo "📋 Creating .env from .env.example..."
  cp .env.example .env
  echo "⚠️  IMPORTANT: Edit .env and set your SECRET_KEY and ENCRYPTION_KEY before continuing."
  echo "   Generate SECRET_KEY:     openssl rand -hex 64"
  echo "   Generate ENCRYPTION_KEY: python3 -c \"import secrets,base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())\""
  echo ""
  read -p "Press Enter after editing .env to continue..."
fi

echo "🐳 Building and starting containers..."
docker-compose up -d --build

echo ""
echo "⏳ Waiting for API to be healthy..."
until docker-compose exec -T api curl -sf http://localhost:8000/health > /dev/null 2>&1; do
  printf "."
  sleep 3
done
echo ""

echo ""
echo "✅ Pa_mSikA is running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Frontend:  http://localhost"
echo "📡 API Docs:  http://localhost/api/docs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Default admin: admin@pamsika.mw / admin123"
echo "(Change this in backend/seed.py before production!)"
