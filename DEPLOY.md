# Deploy PV Calculator su Docker

## Requisiti
- Docker
- Docker Compose

## Setup iniziale

```bash
# 1. Clona il repository
git clone https://github.com/cristal-orion/superagente.git
cd superagente

# 2. Esegui lo script di setup
chmod +x setup.sh
./setup.sh

# 3. Configura le credenziali
nano .env
# Imposta: JWT_SECRET_KEY, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_AGENCY

# 4. Avvia i container
docker-compose up -d --build
```

## Configurazione (.env)

Il file `.env` contiene le credenziali del sistema. Viene creato automaticamente da `setup.sh` copiando `.env.example`. **Modifica i valori prima di avviare.**

| Variabile | Descrizione |
|-----------|-------------|
| `JWT_SECRET_KEY` | Chiave segreta per i token JWT (usa una stringa lunga e casuale) |
| `SUPERADMIN_EMAIL` | Email dell'account amministratore |
| `SUPERADMIN_PASSWORD` | Password dell'account amministratore |
| `SUPERADMIN_AGENCY` | Nome dell'agenzia admin |

## Comandi utili

```bash
# Avvia i container
docker-compose up -d

# Ricostruisci e avvia (dopo modifiche al codice)
docker-compose up -d --build

# Visualizza i log
docker-compose logs -f

# Visualizza log di un servizio specifico
docker-compose logs -f backend
docker-compose logs -f frontend

# Ferma i container
docker-compose down

# Ferma e rimuovi i volumi (ATTENZIONE: cancella i dati)
docker-compose down -v
```

## Struttura dati

```
data/
├── catalog.json          # Listino prodotti (modificabile)
└── datasheets/           # Schede tecniche PDF
    ├── pannelli/
    ├── inverter/
    ├── batterie/
    ├── pompe/
    └── altro/
```

## Porte

- **8081**: Frontend (nginx) - Accesso pubblico
- **8000**: Backend (interno, non esposto)

## Aggiornamento del listino

1. Usa l'interfaccia web per importare un nuovo file Excel
2. Oppure modifica direttamente `data/catalog.json`

## Backup

Per fare backup dei dati:
```bash
# Backup catalog
cp data/catalog.json backup/catalog-$(date +%Y%m%d).json

# Backup datasheets
tar -czvf backup/datasheets-$(date +%Y%m%d).tar.gz data/datasheets/

# Backup database (utenti e listini)
docker cp pv-calculator-backend:/app/db/app.db backup/app-$(date +%Y%m%d).db
```

## Troubleshooting

### Container non si avvia
```bash
docker-compose logs backend
```

### Errori di permessi sui file
```bash
chmod -R 755 data/
```

### Ricostruire da zero
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```
