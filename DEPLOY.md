# Deploy PV Calculator su Docker

## Requisiti
- Docker
- Docker Compose

## Setup iniziale

```bash
# 1. Clona il repository
git clone <repo-url>
cd Calcolatoreimpianti

# 2. Esegui lo script di setup
chmod +x setup.sh
./setup.sh

# 3. Avvia i container
docker-compose up -d --build
```

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

- **80**: Frontend (nginx) - Accesso pubblico
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
