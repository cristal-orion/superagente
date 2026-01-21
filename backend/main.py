from __future__ import annotations

import json
import os
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

from .calculator import calc_response
from .models import CalcRequest, CalcResponse

app = FastAPI(title="PV Sales Calculator")

# Datasheets configuration (use env var for Docker, fallback for local dev)
DATASHEETS_DIR = Path(os.environ.get("DATASHEETS_DIR", Path(__file__).parent / "datasheets"))
VALID_CATEGORIES = ["pannelli", "inverter", "batterie", "pompe", "altro"]
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Catalog configuration (use env var for Docker, fallback for local dev)
CATALOG_PATH = Path(os.environ.get("CATALOG_PATH", Path(__file__).parent.parent / "frontend" / "catalog.json"))
RATE_TERMS = ["60", "72", "84", "120"]  # Possible financing terms in months

# Ensure datasheets directories exist
for category in VALID_CATEGORIES:
    (DATASHEETS_DIR / category).mkdir(parents=True, exist_ok=True)

# Mount static files for serving datasheets
app.mount("/datasheets-files", StaticFiles(directory=str(DATASHEETS_DIR)), name="datasheets-files")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/calc", response_model=CalcResponse)
def calc(request: CalcRequest) -> CalcResponse:
    return calc_response(request)


# ═══════════════════════════════════════════════════════════════════════════
# Datasheets Management Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/datasheets")
def list_datasheets() -> dict[str, list[dict]]:
    """List all datasheets organized by category."""
    result = {}
    for category in VALID_CATEGORIES:
        category_path = DATASHEETS_DIR / category
        files = []
        if category_path.exists():
            for file in category_path.iterdir():
                if file.is_file() and file.suffix.lower() == ".pdf":
                    files.append({
                        "name": file.stem,
                        "filename": file.name,
                        "category": category,
                        "size": file.stat().st_size,
                        "url": f"/datasheets-files/{category}/{file.name}"
                    })
        # Sort by name
        files.sort(key=lambda x: x["name"].lower())
        result[category] = files
    return result


@app.post("/datasheets/upload")
async def upload_datasheet(
    file: UploadFile,
    category: str = Form(...)
) -> dict:
    """Upload a PDF datasheet to a specific category."""
    # Validate category
    if category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(VALID_CATEGORIES)}"
        )

    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed"
        )

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB"
        )

    # Sanitize filename
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in "._- ").strip()
    if not safe_filename.lower().endswith(".pdf"):
        safe_filename += ".pdf"

    # Handle duplicate filenames
    target_path = DATASHEETS_DIR / category / safe_filename
    if target_path.exists():
        # Add timestamp to make unique
        import time
        name_part = safe_filename[:-4]  # Remove .pdf
        safe_filename = f"{name_part}_{int(time.time())}.pdf"
        target_path = DATASHEETS_DIR / category / safe_filename

    # Save file
    with open(target_path, "wb") as f:
        f.write(content)

    return {
        "status": "success",
        "filename": safe_filename,
        "category": category,
        "size": len(content),
        "url": f"/datasheets-files/{category}/{safe_filename}"
    }


@app.delete("/datasheets/{category}/{filename}")
def delete_datasheet(category: str, filename: str) -> dict:
    """Delete a datasheet."""
    # Validate category
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")

    # Validate filename (prevent path traversal)
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = DATASHEETS_DIR / category / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="Not a file")

    os.remove(file_path)

    return {"status": "deleted", "filename": filename, "category": category}


# ═══════════════════════════════════════════════════════════════════════════
# Catalog Excel Export/Import Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/catalog/export")
def export_catalog_excel():
    """Export the catalog as an Excel file for editing."""
    if not CATALOG_PATH.exists():
        raise HTTPException(status_code=404, detail="Catalog file not found")

    # Load catalog
    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    # Create workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Listino"

    # Define headers
    headers = [
        "ID", "Categoria", "Label", "Potenza (kW)", "Accumulo (kWh)", "Fase",
        "Prezzo (EUR)", "Rata 60 mesi", "Rata 72 mesi", "Rata 84 mesi", "Rata 120 mesi",
        "TAEG 60 mesi", "TAEG 72 mesi", "TAEG 84 mesi", "TAEG 120 mesi"
    ]

    # Style settings
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="C41E3A", end_color="C41E3A", fill_type="solid")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )

    # Write headers with styling
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border

    # Write data rows
    for row_idx, item in enumerate(catalog.get("items", []), 2):
        rate_mensili = item.get("rate_mensili_eur", {})
        taeg = item.get("taeg_annuo_percent_by_term", {})

        row_data = [
            item.get("id", ""),
            item.get("category", ""),
            item.get("label", ""),
            item.get("potenza_kw", 0),
            item.get("accumulo_kwh", 0),
            item.get("fase", ""),
            item.get("prezzo_eur", 0),
            rate_mensili.get("60", ""),
            rate_mensili.get("72", ""),
            rate_mensili.get("84", ""),
            rate_mensili.get("120", ""),
            taeg.get("60", ""),
            taeg.get("72", ""),
            taeg.get("84", ""),
            taeg.get("120", ""),
        ]

        for col, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col, value=value)
            cell.border = thin_border
            if col >= 4:  # Numeric columns
                cell.alignment = Alignment(horizontal="right")

    # Set column widths
    column_widths = [20, 40, 20, 12, 14, 8, 14, 12, 12, 12, 12, 12, 12, 12, 12]
    for col, width in enumerate(column_widths, 1):
        ws.column_dimensions[ws.cell(row=1, column=col).column_letter].width = width

    # Freeze header row
    ws.freeze_panes = "A2"

    # Add metadata sheet
    ws_meta = wb.create_sheet("Info")
    ws_meta["A1"] = "Versione Listino:"
    ws_meta["B1"] = catalog.get("version", "")
    ws_meta["A2"] = "PDF Sorgente:"
    ws_meta["B2"] = catalog.get("source_pdf", "")
    ws_meta["A4"] = "ISTRUZIONI:"
    ws_meta["A5"] = "1. Modifica i prezzi e le rate nella scheda 'Listino'"
    ws_meta["A6"] = "2. Non modificare la colonna ID"
    ws_meta["A7"] = "3. Puoi aggiungere nuove righe copiando il formato esistente"
    ws_meta["A8"] = "4. Salva il file e ricaricalo nell'applicazione"
    ws_meta.column_dimensions["A"].width = 25
    ws_meta.column_dimensions["B"].width = 50

    # Save to bytes
    output = BytesIO()
    wb.save(output)
    output.seek(0)

    # Get version for filename
    version = catalog.get("version", "export").replace(" ", "_")
    filename = f"listino_{version}.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.post("/catalog/import")
async def import_catalog_excel(file: UploadFile):
    """Import an Excel file to update the catalog."""
    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are allowed")

    # Read file
    content = await file.read()

    try:
        wb = load_workbook(BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Excel file: {str(e)}")

    # Find the data sheet
    if "Listino" not in wb.sheetnames:
        raise HTTPException(status_code=400, detail="Sheet 'Listino' not found in Excel file")

    ws = wb["Listino"]

    # Read existing catalog for metadata
    if CATALOG_PATH.exists():
        with open(CATALOG_PATH, "r", encoding="utf-8") as f:
            existing_catalog = json.load(f)
    else:
        existing_catalog = {"version": "imported", "source_pdf": ""}

    # Parse header row to get column indices
    headers = {}
    for col in range(1, ws.max_column + 1):
        header = ws.cell(row=1, column=col).value
        if header:
            headers[header.strip().lower()] = col

    # Map expected headers to column indices
    col_map = {
        "id": headers.get("id"),
        "category": headers.get("categoria"),
        "label": headers.get("label"),
        "potenza_kw": headers.get("potenza (kw)"),
        "accumulo_kwh": headers.get("accumulo (kwh)"),
        "fase": headers.get("fase"),
        "prezzo_eur": headers.get("prezzo (eur)"),
        "rata_60": headers.get("rata 60 mesi"),
        "rata_72": headers.get("rata 72 mesi"),
        "rata_84": headers.get("rata 84 mesi"),
        "rata_120": headers.get("rata 120 mesi"),
        "taeg_60": headers.get("taeg 60 mesi"),
        "taeg_72": headers.get("taeg 72 mesi"),
        "taeg_84": headers.get("taeg 84 mesi"),
        "taeg_120": headers.get("taeg 120 mesi"),
    }

    # Validate required columns exist
    required = ["id", "category", "label", "potenza_kw", "prezzo_eur"]
    missing = [col for col in required if not col_map.get(col)]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing)}"
        )

    # Parse items
    items = []
    errors = []

    for row in range(2, ws.max_row + 1):
        # Skip empty rows
        id_val = ws.cell(row=row, column=col_map["id"]).value
        if not id_val:
            continue

        try:
            # Build rate_mensili_eur dict (only include non-empty values)
            rate_mensili = {}
            for term in ["60", "72", "84", "120"]:
                col_key = f"rata_{term}"
                if col_map.get(col_key):
                    val = ws.cell(row=row, column=col_map[col_key]).value
                    if val is not None and val != "":
                        rate_mensili[term] = float(val)

            # Build taeg dict (only include non-empty values)
            taeg = {}
            for term in ["60", "72", "84", "120"]:
                col_key = f"taeg_{term}"
                if col_map.get(col_key):
                    val = ws.cell(row=row, column=col_map[col_key]).value
                    if val is not None and val != "":
                        taeg[term] = float(val)

            # Build item
            item = {
                "id": str(id_val).strip(),
                "category": str(ws.cell(row=row, column=col_map["category"]).value or "").strip(),
                "label": str(ws.cell(row=row, column=col_map["label"]).value or "").strip(),
                "potenza_kw": float(ws.cell(row=row, column=col_map["potenza_kw"]).value or 0),
                "accumulo_kwh": float(ws.cell(row=row, column=col_map.get("accumulo_kwh", 0)).value or 0) if col_map.get("accumulo_kwh") else 0.0,
                "fase": str(ws.cell(row=row, column=col_map.get("fase", 0)).value or "mono").strip() if col_map.get("fase") else "mono",
                "prezzo_eur": float(ws.cell(row=row, column=col_map["prezzo_eur"]).value or 0),
                "rate_mensili_eur": rate_mensili,
                "taeg_annuo_percent_by_term": taeg,
            }

            items.append(item)

        except Exception as e:
            errors.append(f"Row {row}: {str(e)}")

    if not items:
        raise HTTPException(status_code=400, detail="No valid items found in Excel file")

    # Check for duplicate IDs
    seen_ids = set()
    duplicates = []
    for item in items:
        if item["id"] in seen_ids:
            duplicates.append(item["id"])
        seen_ids.add(item["id"])

    if duplicates:
        raise HTTPException(
            status_code=400,
            detail=f"Duplicate IDs found: {', '.join(duplicates)}"
        )

    # Update metadata from Info sheet if present
    version = existing_catalog.get("version", "imported")
    source_pdf = existing_catalog.get("source_pdf", "")

    if "Info" in wb.sheetnames:
        ws_info = wb["Info"]
        if ws_info["B1"].value:
            version = str(ws_info["B1"].value)
        if ws_info["B2"].value:
            source_pdf = str(ws_info["B2"].value)

    # Build new catalog
    new_catalog = {
        "version": version,
        "source_pdf": source_pdf,
        "items": items
    }

    # Backup existing catalog
    if CATALOG_PATH.exists():
        backup_path = CATALOG_PATH.with_suffix(".json.backup")
        with open(CATALOG_PATH, "r", encoding="utf-8") as f:
            backup_content = f.read()
        with open(backup_path, "w", encoding="utf-8") as f:
            f.write(backup_content)

    # Save new catalog
    with open(CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(new_catalog, f, indent=2, ensure_ascii=False)

    result = {
        "status": "success",
        "items_imported": len(items),
        "version": version
    }

    if errors:
        result["warnings"] = errors

    return result

