# PV Sales Calculator

Web app per agenti di vendita di impianti fotovoltaici. Calcola se un impianto "si ripaga da solo" confrontando costi attuali di energia vs finanziamento + risparmio. Utilizzabile durante gli appuntamenti con i clienti.

## Funzionalità

- **Calcolo ROI** - Confronto spesa attuale vs costo finanziamento + risparmio
- **Cashflow 25 anni** - Proiezione dettagliata anno per anno
- **Generazione preventivi PDF** - Documento professionale multi-pagina
- **Catalogo prodotti** - Listino con sistemi residenziali, aziendali e industriali
- **Import listino Excel** - Aggiornamento prezzi da file Excel
- **Schede tecniche** - Upload e gestione PDF delle schede prodotto
- **PWA** - Funziona offline, installabile su dispositivi mobili
- **Tema chiaro/scuro** - Interfaccia adattabile

## Quick Start

### Sviluppo locale

```bash
# Setup
python -m venv .venv
.\.venv\Scripts\Activate.ps1  # Windows
# source .venv/bin/activate   # Linux/macOS
pip install -r backend/requirements.txt

# Avvia backend (porta 8000)
uvicorn backend.main:app --reload --port 8000

# Avvia frontend (porta 5173) - in un altro terminale
python -m http.server 5173 --directory frontend
```

Apri http://localhost:5173/

### Deploy con Docker

```bash
# Setup iniziale
chmod +x setup.sh
./setup.sh

# Avvia
docker-compose up -d --build

# Log
docker-compose logs -f

# Stop
docker-compose down
```

L'app sarà disponibile sulla porta 80.

Vedi [DEPLOY.md](DEPLOY.md) per istruzioni dettagliate.

## Struttura progetto

```
├── backend/
│   ├── main.py           # FastAPI app, endpoints API
│   ├── calculator.py     # Logica calcoli finanziari
│   ├── models.py         # Modelli Pydantic
│   └── requirements.txt
│
├── frontend/
│   ├── index.html        # Single-page app
│   ├── app.js            # Logica frontend, grafici, PDF
│   ├── styles.css        # Stili e temi
│   ├── catalog.json      # Catalogo prodotti
│   ├── datasheets.json   # Mapping schede tecniche
│   ├── sw.js             # Service worker per offline
│   └── manifest.json     # PWA manifest
│
├── data/                 # Dati persistenti (Docker)
│   ├── catalog.json
│   └── datasheets/
│
├── docker-compose.yml
└── DEPLOY.md
```

## API Endpoints

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/calc` | Calcola preventivo |
| GET | `/datasheets` | Lista schede tecniche |
| POST | `/datasheets/upload` | Upload scheda PDF |
| DELETE | `/datasheets/{cat}/{file}` | Elimina scheda |
| POST | `/catalog/import` | Import listino Excel |
| GET | `/catalog/export` | Export listino Excel |

## Catalogo prodotti

Il catalogo (`catalog.json`) contiene sistemi organizzati per categoria:

- **Residenziale** - Senza accumulo
- **Residenziale** - Con accumulo (Huawei/Fox/Tesla)
- **Aziende** - Senza/Con accumulo (Compass)
- **Industriale** (I.E.)

Ogni prodotto include: potenza kW, accumulo kWh, fase (mono/tri), prezzo, rate mensili per durata, TAEG.

## Tecnologie

- **Backend**: Python, FastAPI, uvicorn, openpyxl
- **Frontend**: Vanilla JS, Chart.js (canvas), jsPDF, pdf-lib
- **Deploy**: Docker, nginx, docker-compose

## License

MIT
