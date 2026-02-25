#!/bin/bash
# BitBit Demo Setup Check
# Run this before the demo to verify everything works

echo "🔍 BitBit Demo Setup Check"
echo "=========================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

# Check node
echo -n "Checking Node.js... "
if command -v node &> /dev/null; then
    echo -e "${GREEN}✓${NC} $(node --version)"
else
    echo -e "${RED}✗ Node.js not found${NC}"
    ERRORS=$((ERRORS+1))
fi

# Check npm
echo -n "Checking npm... "
if command -v npm &> /dev/null; then
    echo -e "${GREEN}✓${NC} $(npm --version)"
else
    echo -e "${RED}✗ npm not found${NC}"
    ERRORS=$((ERRORS+1))
fi

# Check .env.local
echo -n "Checking .env.local... "
if [ -f .env.local ]; then
    if grep -q "ANTHROPIC_API_KEY=sk-" .env.local; then
        echo -e "${GREEN}✓${NC} API key configured"
    else
        echo -e "${YELLOW}⚠ API key may not be set correctly${NC}"
    fi
else
    echo -e "${RED}✗ Missing .env.local${NC}"
    echo "   Create with: cp .env.example .env.local"
    echo "   Then add your Anthropic API key"
    ERRORS=$((ERRORS+1))
fi

# Check node_modules
echo -n "Checking dependencies... "
if [ -d node_modules ]; then
    echo -e "${GREEN}✓${NC} Installed"
else
    echo -e "${YELLOW}⚠ Not installed${NC}"
    echo "   Run: npm install"
fi

# Check database
echo -n "Checking database... "
if [ -f data/bitbit.db ]; then
    # Count products
    PRODUCTS=$(sqlite3 data/bitbit.db "SELECT COUNT(*) FROM products" 2>/dev/null || echo "0")
    ORDERS=$(sqlite3 data/bitbit.db "SELECT COUNT(*) FROM orders" 2>/dev/null || echo "0")
    echo -e "${GREEN}✓${NC} $PRODUCTS products, $ORDERS orders"
else
    echo -e "${YELLOW}⚠ Database not initialized${NC}"
    echo "   Run: npm run db:init && npm run db:seed"
fi

# Check if port 3000 is available
echo -n "Checking port 3000... "
if lsof -i :3000 &> /dev/null; then
    echo -e "${YELLOW}⚠ Port 3000 in use${NC}"
    echo "   Stop existing process or use different port"
else
    echo -e "${GREEN}✓${NC} Available"
fi

echo ""
echo "=========================="

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Start the demo with:"
    echo "  npm run dev"
    echo ""
    echo "Then open: http://localhost:3000/demo"
else
    echo -e "${RED}✗ $ERRORS issue(s) found${NC}"
    echo "Fix the issues above before running the demo."
fi
