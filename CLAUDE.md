# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PV Sales Calculator - A web app for solar panel sales agents to calculate if a photovoltaic system "pays for itself" by comparing current energy costs vs. financing + savings. Used during client appointments.

## Commands

### Backend (Python/FastAPI)
```bash
# Setup virtual environment (Windows PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt

# Run backend server
uvicorn backend.main:app --reload --port 8000

# Health check
curl http://localhost:8000/health
```

### Frontend (Static files)
```bash
# Serve frontend on port 5173
python -m http.server 5173 --directory frontend
```

Then open http://localhost:5173/

## Architecture

### Backend (`backend/`)
- **main.py**: FastAPI app with CORS middleware. Two endpoints: `GET /health` and `POST /calc`
- **models.py**: Pydantic models for `CalcRequest` (input validation) and `CalcResponse` (output structure)
- **calculator.py**: Pure calculation functions for financing, deductions, self-consumption, GSE revenue, and 25-year cashflow projection

### Frontend (`frontend/`)
- **index.html**: Single-page app with accordion input sections, hero results display, charts, and PDF generation modal
- **app.js**: Vanilla JS handling form inputs, API calls (debounced 300ms), Chart.js-style canvas rendering (donut + bar charts), theme management (dark/light), and PDF generation with jsPDF
- **styles.css**: CSS variables for theming, responsive grid layout, brand colors (Tech Solutions red: #C41E3A)
- **catalog.json**: Product catalog with system configurations, pricing, financing terms (rate_mensili_eur), and TAEG rates by term

### Key Data Flow
1. User selects a system model from `catalog.json` dropdown
2. Frontend auto-populates cost, production (kW × 1650 kWh/year), financing terms
3. On any input change, `POST /calc` sends payload to backend
4. Backend calculates: annual cost, deductions (50%/10 years default), self-consumption savings, GSE revenue, net cost, 25-year cashflow
5. Frontend renders results in hero section, stat cards, charts, and expandable table
6. PDF generation creates 5-page quote document using jsPDF

### Catalog Structure
Systems organized by category:
- Residenziale - Senza accumulo
- Residenziale - Con accumulo (Huawei/Fox/Tesla)
- Aziende - Senza/Con accumulo (Compass)
- Industriale (I.E.)

Each item has: id, category, label, potenza_kw, accumulo_kwh, fase (mono/tri), prezzo_eur, rate_mensili_eur by term, taeg_annuo_percent_by_term
