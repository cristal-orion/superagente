# PV Sales Calculator (MVP)

Web app minimale per calcolare se un impianto fotovoltaico “si ripaga da solo” ogni anno confrontando:

- spesa annua attuale in bolletta
- costo annuo del finanziamento
- detrazione fiscale annua (parametrica)
- risparmio annuo stimato da autoconsumo
- ricavo annuo stimato da energia immessa (GSE)

## Requisiti

- Python 3.11+

## Setup

### Windows (PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

### macOS/Linux

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
```

## Avvio backend

```bash
uvicorn backend.main:app --reload --port 8000
```

Verifica:

- `GET http://localhost:8000/health` → `{ "status": "ok" }`

## Avvio frontend

Opzione A (consigliata): server statico su `5173` (origine CORS prevista).

```bash
python -m http.server 5173 --directory frontend
```

Poi apri `http://localhost:5173/`.

Opzione B: apri `frontend/index.html` direttamente (dipende dal browser).

## Esempio payload

`POST http://localhost:8000/calc`

```json
{
  "consumo_annuo_kwh": 3500,
  "prezzo_energia_eur_kwh": 0.30,
  "quota_fissa_annua_eur": 0,
  "costo_impianto_eur": 12000,
  "anni_finanziamento": 10,
  "usa_rata_semplice": true,
  "taeg_annuo_percent": 0,
  "produzione_annua_kwh": 4500,
  "autoconsumo_percent": 40,
  "prezzo_gse_eur_kwh": 0.10,
  "aliquota_detrazione_percent": 50,
  "anni_detrazione": 10,
  "fattore_prudenza": 1.0
}
```

