# PV Sales Calculator

Web app per agenti di vendita di impianti fotovoltaici. Calcola se un impianto "si ripaga da solo" confrontando costi attuali di energia vs finanziamento + risparmio. Utilizzabile durante gli appuntamenti con i clienti.

## Funzionalità

- **Calcolo ROI** - Confronto spesa attuale vs costo finanziamento + risparmio
- **Cashflow 25 anni** - Proiezione dettagliata anno per anno
- **Generazione preventivi PDF** - Documento professionale multi-pagina
- **Catalogo prodotti** - Listino con sistemi residenziali, aziendali e industriali
- **Gestione listini** - Creazione e assegnazione listini per agente
- **Import/Export listino** - Download Excel/PDF, aggiornamento prezzi da Excel
- **Schede tecniche** - Upload e gestione PDF delle schede prodotto
- **Sistema auth** - Login JWT con ruoli admin e agenti
- **Pannello admin** - Gestione agenzie, listini e schede tecniche
- **PWA** - Funziona offline, installabile su dispositivi mobili
- **Tema chiaro/scuro** - Interfaccia adattabile

## Quick Start

### Deploy con Docker

```bash
# 1. Clona e configura
git clone https://github.com/cristal-orion/superagente.git
cd superagente
chmod +x setup.sh
./setup.sh

# 2. Configura le credenziali
nano .env

# 3. Avvia
docker-compose up -d --build
```

L'app sarà disponibile sulla porta 8081.

Vedi [DEPLOY.md](DEPLOY.md) per istruzioni dettagliate.

### Sviluppo locale

```bash
# Setup
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Avvia backend (porta 8000)
uvicorn backend.main:app --reload --port 8000

# Avvia frontend (porta 5173) - in un altro terminale
python -m http.server 5173 --directory frontend
```

## Struttura progetto

```
├── backend/
│   ├── main.py           # FastAPI app, endpoints API
│   ├── calculator.py     # Logica calcoli finanziari
│   ├── models.py         # Modelli Pydantic (request/response)
│   ├── models_db.py      # Modelli SQLAlchemy (DB)
│   ├── database.py       # Configurazione database SQLite
│   ├── auth.py           # JWT, password hashing, seed admin
│   ├── routes/
│   │   ├── auth.py       # Login endpoint
│   │   ├── users.py      # CRUD utenti (admin only)
│   │   └── listini.py    # CRUD listini e assegnazioni
│   └── requirements.txt
│
├── frontend/
│   ├── index.html        # Calcolatore (pagina principale)
│   ├── login.html        # Pagina login
│   ├── admin.html        # Pannello amministrazione
│   ├── listino.html      # Editor listino
│   ├── app.js            # Logica frontend, grafici, PDF
│   ├── auth.js           # Gestione token JWT
│   ├── styles.css        # Stili e temi
│   ├── sw.js             # Service worker per offline
│   └── manifest.json     # PWA manifest
│
├── data/                 # Dati persistenti (Docker)
│   ├── catalog.json
│   └── datasheets/
│
├── .env.example          # Template credenziali
├── docker-compose.yml
├── setup.sh
└── DEPLOY.md
```

## API Endpoints

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login, restituisce JWT |
| GET | `/api/auth/me` | Info utente corrente |
| GET | `/api/users` | Lista utenti (admin) |
| POST | `/api/users` | Crea account agente (admin) |
| GET | `/api/listini` | Lista listini |
| POST | `/api/listini` | Crea listino (admin) |
| POST | `/api/listini/{id}/assign/{uid}` | Assegna listino ad agente |
| GET | `/catalog/me` | Catalogo per utente (auth-aware) |
| GET | `/catalog/export` | Export listino Excel (auth-aware) |
| GET | `/catalog/export-pdf` | Export listino PDF (auth-aware) |
| POST | `/catalog/import` | Import listino Excel |
| POST | `/calc` | Calcola preventivo |
| GET | `/datasheets` | Lista schede tecniche |
| POST | `/datasheets/upload` | Upload scheda PDF |

## Tecnologie

- **Backend**: Python, FastAPI, SQLAlchemy, JWT (python-jose), openpyxl, fpdf2
- **Frontend**: Vanilla JS, Chart.js (canvas), jsPDF, pdf-lib
- **Deploy**: Docker, nginx, docker-compose
- **Database**: SQLite

## License

MIT
