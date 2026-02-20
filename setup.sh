#!/bin/bash
# Setup script for PV Calculator Docker deployment

echo "Setting up PV Calculator..."

# Create data directories
mkdir -p data/datasheets/{pannelli,inverter,batterie,pompe,altro}

# Copy catalog.json if not exists
if [ ! -f data/catalog.json ]; then
    cp frontend/catalog.json data/catalog.json
    echo "Created data/catalog.json"
fi

# Create .env from example if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env — MODIFICA LE CREDENZIALI prima di avviare!"
    echo ""
    echo "  nano .env"
    echo ""
else
    echo ".env già presente"
fi

echo "Setup complete!"
echo ""
echo "To start the application:"
echo "  docker-compose up -d --build"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f"
echo ""
echo "To stop:"
echo "  docker-compose down"
