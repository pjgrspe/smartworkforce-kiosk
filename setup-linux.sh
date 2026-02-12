#!/bin/bash

##############################################
# Apollo - Linux/WSL Quick Setup Script
##############################################

set -e

echo "🚀 Apollo Facial Recognition System - Linux Setup"
echo "=================================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
   echo "❌ Please do not run as root"
   exit 1
fi

# Install system dependencies
echo "📦 Installing system dependencies..."
sudo apt update
sudo apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    python-is-python3 \
    build-essential \
    cmake \
    libopencv-dev \
    libboost-all-dev \
    v4l-utils

echo "✅ System dependencies installed"
echo ""

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    echo "✅ Node.js installed"
else
    echo "✅ Node.js already installed: $(node --version)"
fi
echo ""

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install
echo "✅ Root dependencies installed"
echo ""

# Install server dependencies
echo "📦 Installing server dependencies..."
cd server
npm install
cd ..
echo "✅ Server dependencies installed"
echo ""

# Install web dependencies
echo "📦 Installing web dependencies..."
cd web
npm install
cd ..
echo "✅ Web dependencies installed"
echo ""

# Install Python dependencies
echo "📦 Installing Python dependencies..."
cd ai

# Create virtual environment
python3 -m venv venv

# Activate and install
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
echo "   Installing Python packages (this may take 5-10 minutes)..."
pip install cmake
pip install dlib
pip install -r requirements.txt

deactivate
cd ..

echo "✅ Python dependencies installed"
echo ""

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env with your Supabase credentials"
else
    echo "✅ .env file already exists"
fi
echo ""

# Create web .env file if it doesn't exist
if [ ! -f web/.env ]; then
    echo "📝 Creating web/.env file..."
    cp web/.env.example web/.env
    echo "⚠️  Please edit web/.env with your Supabase credentials"
else
    echo "✅ web/.env file already exists"
fi
echo ""

# Create logs directory
mkdir -p logs
echo "✅ Logs directory created"
echo ""

# Check for camera
echo "🎥 Checking for camera devices..."
if ls /dev/video* 1> /dev/null 2>&1; then
    echo "✅ Camera devices found:"
    ls -la /dev/video*
    echo ""
    echo "   You may need to add your user to the 'video' group:"
    echo "   sudo usermod -a -G video $USER"
    echo "   Then log out and log back in"
else
    echo "⚠️  No camera devices found at /dev/video*"
    echo "   Please connect a USB camera before running the AI engine"
fi
echo ""

echo "=================================================="
echo "✅ Setup Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Edit .env with your Supabase credentials"
echo "2. Edit web/.env with your Supabase credentials"
echo "3. Follow SETUP_GUIDE.md to create Supabase project"
echo "4. Test individual components:"
echo "   - Server: cd server && npm start"
echo "   - Web:    cd web && npm run dev"
echo "   - AI:     cd ai && source venv/bin/activate && python main.py"
echo "5. Or start all with PM2: pm2 start pm2.ecosystem.config.js"
echo ""
echo "📖 For detailed instructions, see SETUP_GUIDE.md"
echo ""
