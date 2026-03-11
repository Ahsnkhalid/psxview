#!/bin/bash

# PSXView Easy Installer for Mac
# Double-click this file or run: bash install.sh

echo ""
echo "================================================"
echo "   PSXView — Easy Installer"
echo "================================================"
echo ""

# Check if we're in the right folder
if [ ! -f "server.js" ]; then
  echo "ERROR: Please move this file into your psxview folder first!"
  echo "The psxview folder should contain server.js"
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

echo "✓ Found PSXView folder"
echo ""

# Install npm packages
echo "Installing packages (this takes 1-2 minutes)..."
npm install

if [ $? -ne 0 ]; then
  echo ""
  echo "ERROR: npm install failed."
  echo "Please send a screenshot to get help."
  read -p "Press Enter to close..."
  exit 1
fi

echo ""
echo "✓ Packages installed!"
echo ""

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "✓ Created .env file"
fi

echo ""
echo "================================================"
echo "  STRIPE SETUP (you need to do this once)"
echo "================================================"
echo ""
echo "1. Go to: https://dashboard.stripe.com"
echo "2. Sign up or log in"
echo "3. Go to: Developers > API Keys"
echo "4. Copy your Secret Key (starts with sk_test_...)"
echo ""
read -p "Paste your Stripe SECRET key here: " STRIPE_SECRET
echo ""
read -p "Paste your Stripe PUBLISHABLE key here: " STRIPE_PUB
echo ""
echo "Now create a product:"
echo "  Dashboard > Products > Add Product"
echo "  Name: PSXView Pro"  
echo "  Price: \$10 / month (recurring)"
echo "  Copy the Price ID (starts with price_...)"
echo ""
read -p "Paste your Stripe PRICE ID here: " STRIPE_PRICE
echo ""

# Write .env file
cat > .env << ENVEOF
STRIPE_SECRET_KEY=$STRIPE_SECRET
STRIPE_PUBLISHABLE_KEY=$STRIPE_PUB
STRIPE_WEBHOOK_SECRET=whsec_add_later
STRIPE_PRICE_ID=$STRIPE_PRICE
PORT=3000
ENVEOF

echo "✓ Saved your keys!"
echo ""
echo "================================================"
echo "  STARTING PSXVIEW..."
echo "================================================"
echo ""
echo "✓ Server starting on http://localhost:3000"
echo ""
echo "  Opening your browser now..."
echo ""
echo "  To STOP the server: press Ctrl + C"
echo ""

# Open browser after 2 seconds
sleep 2
open http://localhost:3000

# Start server
node server.js
