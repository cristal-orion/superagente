// ═══════════════════════════════════════════════════════════════════════════
// SolarCalc - Premium Solar Calculator (PWA Edition)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Local Calculator (Offline-capable) ────────────────────────────────────
const Calculator = {
  // Spesa annua attuale = consumo × prezzo
  calcSpesaAnnuaAttuale(consumo, prezzo) {
    return consumo * prezzo;
  },

  // Rata annua semplice (senza interessi)
  calcRataAnnuaSemplice(costo, anni) {
    return costo / anni;
  },

  // Rata annua con TAEG (ammortamento francese)
  calcRataAnnuaConTaeg(costo, anni, taegPercent) {
    if (taegPercent <= 0) {
      return this.calcRataAnnuaSemplice(costo, anni);
    }

    const rMensile = (taegPercent / 100.0) / 12.0;
    const nMesi = anni * 12;

    if (rMensile === 0) {
      return this.calcRataAnnuaSemplice(costo, anni);
    }

    const rataMensile = costo * rMensile / (1.0 - Math.pow(1.0 + rMensile, -nMesi));
    return rataMensile * 12.0;
  },

  // Detrazione fiscale annua
  calcDetrazioneAnnua(costo, aliquotaPercent, anniDetrazione) {
    return (costo * (aliquotaPercent / 100.0)) / anniDetrazione;
  },

  // Autoconsumo: quanta energia si usa vs immette in rete
  calcAutoconsumo(produzione, autoconsumoPercent, consumoAnnuo) {
    let kwhAutoconsumati = produzione * (autoconsumoPercent / 100.0);
    kwhAutoconsumati = Math.min(Math.max(kwhAutoconsumati, 0.0), produzione, consumoAnnuo);
    const kwhImmessi = Math.max(produzione - kwhAutoconsumati, 0.0);
    return { kwhAutoconsumati, kwhImmessi };
  },

  // Ricavo GSE (scambio sul posto)
  calcGse(kwhImmessi, prezzoGse) {
    return kwhImmessi * prezzoGse;
  },

  // Calcolo completo - restituisce la response
  calcResponse(request) {
    const spesaAttuale = this.calcSpesaAnnuaAttuale(
      request.consumo_annuo_kwh,
      request.prezzo_energia_eur_kwh
    );

    let capitaleFinanziato = request.costo_finanziato_eur !== null && request.costo_finanziato_eur !== undefined
      ? request.costo_finanziato_eur
      : request.costo_impianto_eur;
    capitaleFinanziato = Math.max(capitaleFinanziato, 0.0);

    let rataAnnua;
    if (capitaleFinanziato === 0 || request.anni_finanziamento <= 0) {
      rataAnnua = 0.0;
    } else if (request.rata_mensile_override_eur !== null && request.rata_mensile_override_eur > 0) {
      rataAnnua = request.rata_mensile_override_eur * 12.0;
    } else if (request.usa_rata_semplice) {
      rataAnnua = this.calcRataAnnuaSemplice(capitaleFinanziato, request.anni_finanziamento);
    } else {
      rataAnnua = this.calcRataAnnuaConTaeg(
        capitaleFinanziato,
        request.anni_finanziamento,
        request.taeg_annuo_percent
      );
    }

    const detrazioneAnnua = this.calcDetrazioneAnnua(
      request.costo_impianto_eur,
      request.aliquota_detrazione_percent,
      request.anni_detrazione
    );

    const { kwhAutoconsumati, kwhImmessi } = this.calcAutoconsumo(
      request.produzione_annua_kwh,
      request.autoconsumo_percent,
      request.consumo_annuo_kwh
    );

    let risparmio = kwhAutoconsumati * request.prezzo_energia_eur_kwh;
    let ricavoGse = this.calcGse(kwhImmessi, request.prezzo_gse_eur_kwh);

    // Applica fattore di prudenza
    risparmio *= request.fattore_prudenza;
    ricavoGse *= request.fattore_prudenza;

    const costoNetto = rataAnnua - detrazioneAnnua - risparmio - ricavoGse;
    const delta = costoNetto - spesaAttuale;

    // New correct formula
    const bollettaResidua = (request.consumo_annuo_kwh - kwhAutoconsumati) * request.prezzo_energia_eur_kwh;
    const spesaNuova = bollettaResidua + rataAnnua - detrazioneAnnua - ricavoGse;
    const risparmioNetto = spesaAttuale - spesaNuova;

    let messaggio;
    if (risparmioNetto >= 0) {
      messaggio = `Risparmi circa ${Math.round(risparmioNetto)}€ all'anno (stimato).`;
    } else {
      messaggio = `Paghi circa ${Math.round(Math.abs(risparmioNetto))}€ in più all'anno (stimato).`;
    }

    // Genera cashflow 25 anni
    const cashflowAnni = [];
    for (let anno = 1; anno <= 25; anno++) {
      const rata = anno <= request.anni_finanziamento ? rataAnnua : 0.0;
      const detrazione = anno <= request.anni_detrazione ? detrazioneAnnua : 0.0;
      const costo = rata - detrazione - risparmio - ricavoGse;
      const rn = risparmio + detrazione + ricavoGse - rata;
      cashflowAnni.push({ anno, costo_netto_eur: costo, risparmio_netto_eur: rn });
    }

    return {
      spesa_annua_attuale_eur: spesaAttuale,
      rata_annua_impianto_eur: rataAnnua,
      detrazione_annua_eur: detrazioneAnnua,
      kwh_autoconsumati: kwhAutoconsumati,
      kwh_immessi: kwhImmessi,
      risparmio_bolletta_eur: risparmio,
      ricavo_gse_eur: ricavoGse,
      costo_netto_annuo_eur: costoNetto,
      delta_vs_spesa_attuale_eur: delta,
      bolletta_residua_eur: bollettaResidua,
      risparmio_netto_eur: risparmioNetto,
      spesa_nuova_totale_eur: spesaNuova,
      messaggio,
      cashflow_anni: cashflowAnni
    };
  }
};

// ─── Theme Management ──────────────────────────────────────────────────────
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

// Initialize theme immediately
initTheme();

const API_URL = "/calc";
const CATALOG_URL = "/catalog/me";
const ENERGY_PRICE_DEFAULT = 0.30;
const KWH_PER_KW_PER_YEAR = 1650;

const PROVIDERS = [
  "Seleziona…",
  "Enel Energia",
  "Eni Plenitude",
  "Edison",
  "Hera",
  "A2A Energia",
  "Iren",
  "Sorgenia",
  "Acea Energia",
  "Engie",
  "Illumia",
];

// ─── Color Palette ─────────────────────────────────────────────────────────
const COLORS = {
  accent: "#f59e0b",
  positive: "#10b981",
  negative: "#ef4444",
  chart: {
    rata: "#f59e0b",
    detrazione: "#10b981",
    risparmio: "#06b6d4",
    gse: "#8b5cf6",
  },
  text: {
    primary: "#f8fafc",
    secondary: "#94a3b8",
    muted: "#64748b",
  },
  bg: {
    surface: "#1c2333",
  }
};

// ─── Utilities ─────────────────────────────────────────────────────────────
function euro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function euroNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  return abs.toLocaleString("it-IT", { maximumFractionDigits: 0 });
}

function euroMonthly(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}

function numberValue(id) {
  const el = document.getElementById(id);
  return Number(el.value);
}

function boolValue(id) {
  const el = document.getElementById(id);
  return Boolean(el.checked);
}

function setValue(id, value) {
  const el = document.getElementById(id);
  el.value = String(value);
}

function setChecked(id, checked) {
  const el = document.getElementById(id);
  el.checked = Boolean(checked);
}

// ─── State ─────────────────────────────────────────────────────────────────
let catalog = null;
let selectedOffer = null;
let lastResponse = null;
let clientType = 'residenziale'; // 'residenziale' or 'aziendale'

// ═══════════════════════════════════════════════════════════════════════════
// Datasheet Module - Backend-based PDF Management with Drag & Drop
// ═══════════════════════════════════════════════════════════════════════════

const DATASHEETS_API_URL = "";

const datasheetConfig = {
  library: {},  // { category: [{ name, filename, url, size }] }
  loaded: false,
  categoryLabels: {
    pannelli: { label: "Pannelli", icon: "☀️" },
    inverter: { label: "Inverter", icon: "⚡" },
    batterie: { label: "Batterie", icon: "🔋" },
    pompe: { label: "Pompe di Calore", icon: "🌡️" },
    altro: { label: "Altro", icon: "📁" }
  }
};

// ─── Fetch Datasheets from Backend (with offline support) ───────────────────
async function fetchDatasheetsFromBackend() {
  try {
    const res = await fetch(`${DATASHEETS_API_URL}/datasheets`);
    if (!res.ok) throw new Error("Failed to fetch datasheets");
    datasheetConfig.library = await res.json();
    datasheetConfig.loaded = true;
    // Save to localStorage for offline use
    try {
      localStorage.setItem('datasheets_library', JSON.stringify(datasheetConfig.library));
      console.log("Datasheets loaded from backend and cached locally!");
    } catch (e) {
      console.warn("Could not cache datasheets to localStorage:", e);
    }
    return datasheetConfig.library;
  } catch (error) {
    console.warn("Network error loading datasheets, trying local cache...");
    // Try to load from localStorage (offline mode)
    try {
      const cached = localStorage.getItem('datasheets_library');
      if (cached) {
        datasheetConfig.library = JSON.parse(cached);
        datasheetConfig.loaded = true;
        console.log("Datasheets loaded from local cache (offline mode)");
        return datasheetConfig.library;
      }
    } catch (e) {
      console.error("Failed to load cached datasheets:", e);
    }
    datasheetConfig.loaded = false;
    return {};
  }
}

// ─── Upload Datasheet to Backend ────────────────────────────────────────────
async function uploadDatasheet(file, category) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);

  const response = await fetch(`${DATASHEETS_API_URL}/datasheets/upload`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Upload failed");
  }

  return await response.json();
}

// ─── Delete Datasheet from Backend ──────────────────────────────────────────
async function deleteDatasheet(category, filename) {
  const response = await fetch(`${DATASHEETS_API_URL}/datasheets/${category}/${encodeURIComponent(filename)}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Delete failed");
  }

  return await response.json();
}

// ─── Format File Size ───────────────────────────────────────────────────────
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ─── Render Datasheet Library ───────────────────────────────────────────────
function renderDatasheetLibrary() {
  const container = document.getElementById("datasheetLibrary");
  if (!container) return;

  const library = datasheetConfig.library;
  const categories = Object.keys(datasheetConfig.categoryLabels);
  let hasAny = false;

  let html = "";
  for (const cat of categories) {
    const items = library[cat] || [];
    if (items.length === 0) continue;
    hasAny = true;

    const catInfo = datasheetConfig.categoryLabels[cat];
    html += `<div class="datasheet-category">
      <div class="datasheet-category-header">
        <span class="category-icon">${catInfo.icon}</span>
        <span>${catInfo.label}</span>
      </div>`;

    for (const item of items) {
      html += `<div class="datasheet-item" data-category="${cat}" data-filename="${item.filename}">
        <span class="datasheet-item-name">${item.name}</span>
        <span class="datasheet-item-size">${formatFileSize(item.size)}</span>
        <button class="datasheet-item-delete" title="Elimina">🗑️</button>
      </div>`;
    }

    html += `</div>`;
  }

  if (!hasAny) {
    html = `<div class="datasheet-empty">Nessuna scheda caricata</div>`;
  }

  container.innerHTML = html;

  // Add delete handlers
  container.querySelectorAll(".datasheet-item-delete").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const item = btn.closest(".datasheet-item");
      const category = item.dataset.category;
      const filename = item.dataset.filename;

      if (confirm(`Eliminare "${filename}"?`)) {
        try {
          await deleteDatasheet(category, filename);
          await fetchDatasheetsFromBackend();
          renderDatasheetLibrary();
          renderDatasheetSelector("datasheetSelector");
          renderDatasheetSelector("manualDatasheetSelector");
        } catch (error) {
          alert("Errore eliminazione: " + error.message);
        }
      }
    });
  });
}

// ─── Render Datasheet Selector (for quote modals) ───────────────────────────
function renderDatasheetSelector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const library = datasheetConfig.library;
  const categories = Object.keys(datasheetConfig.categoryLabels);
  let hasAny = false;

  let html = "";
  for (const cat of categories) {
    const items = library[cat] || [];
    if (items.length === 0) continue;
    hasAny = true;

    const catInfo = datasheetConfig.categoryLabels[cat];
    html += `<div class="selector-category" data-category="${cat}">
      <div class="selector-category-header" onclick="toggleDatasheetCategory(this)">
        <div class="selector-category-label">
          <span class="category-icon">${catInfo.icon}</span>
          <span class="category-name">${catInfo.label}</span>
          <span class="category-count" data-cat="${cat}">0/${items.length}</span>
        </div>
        <span class="category-toggle">▼</span>
      </div>
      <div class="selector-items collapsed">`;

    for (const item of items) {
      html += `<label class="selector-item">
        <input type="checkbox" value="${item.url}" data-name="${item.name}" data-cat="${cat}" onchange="updateDatasheetCount('${containerId}', '${cat}')" />
        <span class="selector-item-label">${item.name}</span>
      </label>`;
    }

    html += `</div></div>`;
  }

  if (!hasAny) {
    html = `<div class="selector-empty">Nessuna scheda disponibile. Carica schede nella sezione "Gestione Schede Tecniche".</div>`;
  }

  container.innerHTML = html;
}

// Toggle category expansion
function toggleDatasheetCategory(headerEl) {
  const category = headerEl.closest('.selector-category');
  const items = category.querySelector('.selector-items');
  const toggle = headerEl.querySelector('.category-toggle');

  items.classList.toggle('collapsed');
  toggle.classList.toggle('expanded');
}

// Update selected count for a category
function updateDatasheetCount(containerId, cat) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const checkboxes = container.querySelectorAll(`input[data-cat="${cat}"]`);
  const checked = container.querySelectorAll(`input[data-cat="${cat}"]:checked`).length;
  const total = checkboxes.length;

  const countEl = container.querySelector(`.category-count[data-cat="${cat}"]`);
  if (countEl) {
    countEl.textContent = `${checked}/${total}`;
    countEl.classList.toggle('has-selection', checked > 0);
  }
}

// ─── Get Selected Datasheets from Selector ──────────────────────────────────
function getSelectedDatasheetsFromSelector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];

  const selected = [];
  container.querySelectorAll("input[type='checkbox']:checked").forEach(cb => {
    selected.push({
      url: cb.value,
      name: cb.dataset.name
    });
  });

  return selected;
}

// ─── Fetch PDF from URL ─────────────────────────────────────────────────────
async function fetchPdfFromUrl(url) {
  const fullUrl = DATASHEETS_API_URL + url;
  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`Failed to load PDF: ${url}`);
  }
  return await response.arrayBuffer();
}

// ─── Merge Quote PDF with Selected Datasheets ───────────────────────────────
async function mergeQuoteWithDatasheets(quotePdfBytes, datasheets) {
  const { PDFDocument } = PDFLib;

  // Create new merged PDF
  const mergedPdf = await PDFDocument.create();

  // 1. Add the quote PDF pages first
  const quotePdf = await PDFDocument.load(quotePdfBytes);
  const quotePages = await mergedPdf.copyPages(quotePdf, quotePdf.getPageIndices());
  quotePages.forEach(page => mergedPdf.addPage(page));

  // 2. Add each selected datasheet
  for (const datasheet of datasheets) {
    try {
      console.log(`Loading datasheet: ${datasheet.name}`);
      const pdfBytes = await fetchPdfFromUrl(datasheet.url);
      const datasheetPdf = await PDFDocument.load(pdfBytes);
      const pages = await mergedPdf.copyPages(datasheetPdf, datasheetPdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
      console.log(`Added ${pages.length} pages from ${datasheet.name}`);
    } catch (error) {
      console.warn(`Could not load datasheet: ${datasheet.url}`, error);
    }
  }

  // 3. Return merged PDF bytes
  return await mergedPdf.save();
}

// ─── Download PDF Blob ──────────────────────────────────────────────────────
function downloadPdfBlob(pdfBytes, fileName) {
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Initialize Datasheet Dropzone ──────────────────────────────────────────
function initDatasheetDropzone() {
  const dropzone = document.getElementById("datasheetDropzone");
  const fileInput = document.getElementById("datasheetFileInput");
  const categorySelect = document.getElementById("uploadCategory");

  if (!dropzone || !fileInput) return;

  // Click to open file dialog
  dropzone.addEventListener("click", () => fileInput.click());

  // File input change
  fileInput.addEventListener("change", async () => {
    if (fileInput.files.length > 0) {
      await handleFileUpload(fileInput.files, categorySelect.value);
      fileInput.value = "";
    }
  });

  // Drag & drop events
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");

    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );

    if (files.length > 0) {
      await handleFileUpload(files, categorySelect.value);
    } else {
      alert("Solo file PDF sono accettati.");
    }
  });
}

// ─── Handle File Upload ─────────────────────────────────────────────────────
async function handleFileUpload(files, category) {
  const dropzone = document.getElementById("datasheetDropzone");
  dropzone.classList.add("uploading");

  try {
    for (const file of files) {
      console.log(`Uploading ${file.name} to ${category}...`);
      await uploadDatasheet(file, category);
    }

    // Refresh library
    await fetchDatasheetsFromBackend();
    renderDatasheetLibrary();
    renderDatasheetSelector("datasheetSelector");
    renderDatasheetSelector("manualDatasheetSelector");

    console.log("Upload completed!");
  } catch (error) {
    alert("Errore upload: " + error.message);
  } finally {
    dropzone.classList.remove("uploading");
  }
}

// Initialize datasheet system
async function initDatasheetSystem() {
  await fetchDatasheetsFromBackend();
  renderDatasheetLibrary();
  renderDatasheetSelector("datasheetSelector");
  renderDatasheetSelector("manualDatasheetSelector");
  initDatasheetDropzone();
}

// Initialize after DOM is ready
document.addEventListener("DOMContentLoaded", initDatasheetSystem);

// ═══════════════════════════════════════════════════════════════════════════
// Catalog Excel Export/Import
// ═══════════════════════════════════════════════════════════════════════════

const CATALOG_EXPORT_URL = "/catalog/export";
const CATALOG_EXPORT_PDF_URL = "/catalog/export-pdf";
const CATALOG_IMPORT_URL = "/catalog/import";

async function downloadCatalogFile(url, fallbackName) {
  showCatalogStatus("Scaricamento in corso...", "info");
  try {
    const res = await authFetch(url);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      showCatalogStatus(d.detail || "Errore nel download", "error");
      return;
    }
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename=(.+)/);
    const filename = match ? match[1].replace(/"/g, "") : fallbackName;
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    showCatalogStatus("", "");
  } catch {
    showCatalogStatus("Errore di connessione al server", "error");
  }
}

function initCatalogManagement() {
  const downloadBtn = document.getElementById("downloadCatalogBtn");
  const downloadPdfBtn = document.getElementById("downloadCatalogPdfBtn");
  const dropzone = document.getElementById("catalogDropzone");
  const fileInput = document.getElementById("catalogFileInput");
  const statusDiv = document.getElementById("catalogStatus");

  if (!downloadBtn || !dropzone || !fileInput) return;

  // Download Excel button
  downloadBtn.addEventListener("click", () => {
    downloadCatalogFile(CATALOG_EXPORT_URL, "listino.xlsx");
  });

  // Download PDF button
  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener("click", () => {
      downloadCatalogFile(CATALOG_EXPORT_PDF_URL, "listino.pdf");
    });
  }

  // Dropzone click to trigger file input
  dropzone.addEventListener("click", () => {
    fileInput.click();
  });

  // Drag and drop events
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadCatalogFile(files[0]);
    }
  });

  // File input change
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
      uploadCatalogFile(fileInput.files[0]);
      fileInput.value = ""; // Reset for next upload
    }
  });
}

function showCatalogStatus(message, type) {
  const statusDiv = document.getElementById("catalogStatus");
  if (!statusDiv) return;

  statusDiv.textContent = message;
  statusDiv.className = "catalog-status";
  if (type) {
    statusDiv.classList.add(`status-${type}`);
  }
}

async function uploadCatalogFile(file) {
  // Validate file type
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    showCatalogStatus("Errore: Il file deve essere in formato Excel (.xlsx)", "error");
    return;
  }

  showCatalogStatus("Caricamento in corso...", "info");

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(CATALOG_IMPORT_URL, {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      showCatalogStatus(`Errore: ${result.detail || "Caricamento fallito"}`, "error");
      return;
    }

    // Success - reload catalog
    showCatalogStatus(
      `Listino aggiornato: ${result.items_imported} prodotti importati`,
      "success"
    );

    // Reload the catalog and refresh UI
    await loadCatalog();
    populateModels();
    populateManualSystemsSelector();

    // Clear status after a few seconds
    setTimeout(() => {
      showCatalogStatus("", "");
    }, 5000);

  } catch (error) {
    console.error("Catalog upload error:", error);
    showCatalogStatus("Errore di connessione al server", "error");
  }
}

// Initialize catalog management after DOM is ready
document.addEventListener("DOMContentLoaded", initCatalogManagement);

// ─── Catalog Loading ───────────────────────────────────────────────────────
async function loadCatalog() {
  const res = await authFetch(CATALOG_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("catalog load failed");
  const data = await res.json();
  catalog = data?.items || [];
}

function populateProviders() {
  const sel = document.getElementById("fornitore");
  sel.innerHTML = "";
  for (const name of PROVIDERS) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
  sel.value = PROVIDERS[0];
  sel.addEventListener("change", () => {
    setValue("prezzo_energia_eur_kwh", ENERGY_PRICE_DEFAULT);
    debounceRecalc();
  });
}

function groupByCategory(items) {
  const map = new Map();
  for (const it of items) {
    const cat = it.category || "Altro";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(it);
  }
  for (const [cat, list] of map.entries()) {
    list.sort((a, b) => String(a.label).localeCompare(String(b.label), "it"));
    map.set(cat, list);
  }
  return map;
}

// ─── Client Type Logic ────────────────────────────────────────────────────
function filterCatalogItems(type) {
  return (catalog || []);
}

function onClientTypeChange(newType) {
  clientType = newType;
  const isAziendale = (newType === 'aziendale');

  // Toggle deduction fields
  const detrazioneInput = document.getElementById('aliquota_detrazione_percent');
  const anniDetrazioneInput = document.getElementById('anni_detrazione');

  if (isAziendale) {
    detrazioneInput.dataset.prevValue = detrazioneInput.value;
    anniDetrazioneInput.dataset.prevValue = anniDetrazioneInput.value;
    detrazioneInput.value = '0';
    detrazioneInput.disabled = true;
    anniDetrazioneInput.disabled = true;
  } else {
    detrazioneInput.value = detrazioneInput.dataset.prevValue || '50';
    anniDetrazioneInput.value = anniDetrazioneInput.dataset.prevValue || '10';
    detrazioneInput.disabled = false;
    anniDetrazioneInput.disabled = false;
  }

  // Dim deduction fields visually
  const detrazioneField = detrazioneInput.closest('.field');
  const anniField = anniDetrazioneInput.closest('.field');
  if (detrazioneField) detrazioneField.classList.toggle('deduction-fields-hidden', isAziendale);
  if (anniField) anniField.classList.toggle('deduction-fields-hidden', isAziendale);

  // Toggle aziendale-only fields (if any remain)
  document.querySelectorAll('.aziendale-only').forEach(el => {
    el.style.display = isAziendale ? '' : 'none';
  });

  // Update stat card visibility
  const detrazioneCard = document.getElementById('detrazione')?.closest('.stat-card');
  if (detrazioneCard) detrazioneCard.classList.toggle('stat-card-hidden', isAziendale);

  // Re-populate catalog dropdown with filtered items
  populateModelsFiltered();

  // Reset selection
  selectedOffer = null;

  // Re-initialize manual quote modal with filtered catalog
  selectedManualSystems = [];
  if (catalog && catalog.length > 0) {
    const container = document.getElementById("manualSystemsContainer");
    if (container) initManualQuote();
  }

  debounceRecalc();
}

function populateModelsFiltered() {
  const sel = document.getElementById("modello_impianto");
  sel.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Seleziona…";
  sel.appendChild(opt0);

  const filtered = filterCatalogItems(clientType);
  const grouped = groupByCategory(filtered);
  for (const [cat, items] of grouped.entries()) {
    const grp = document.createElement("optgroup");
    grp.label = cat;
    for (const it of items) {
      const opt = document.createElement("option");
      opt.value = it.id;
      opt.textContent = `${it.label} — ${euro(it.prezzo_eur)}`;
      grp.appendChild(opt);
    }
    sel.appendChild(grp);
  }
}

function populateModels() {
  populateModelsFiltered();

  const sel = document.getElementById("modello_impianto");
  sel.addEventListener("change", () => {
    const id = sel.value;
    selectedOffer = (catalog || []).find((x) => x.id === id) || null;
    applySelectedOffer();
    debounceRecalc();
  });
}

function applySelectedOffer() {
  if (!selectedOffer) return;

  setValue("costo_impianto_eur", selectedOffer.prezzo_eur);
  setValue("produzione_annua_kwh", selectedOffer.potenza_kw * KWH_PER_KW_PER_YEAR);

  // Auto-set autoconsumo to 80% when system has battery storage
  if (selectedOffer.accumulo_kwh && selectedOffer.accumulo_kwh > 0) {
    setValue("autoconsumo_percent", 80);
  }
}

function financedAmount() {
  const price = numberValue("costo_impianto_eur");
  if (!Number.isFinite(price) || price <= 0) return null;
  const anticipo = numberValue("anticipo_eur");
  if (!Number.isFinite(anticipo) || anticipo < 0) return price;
  return Math.max(price - anticipo, 0);
}

// ─── Payload Builder ───────────────────────────────────────────────────────
function buildPayload() {
  return {
    consumo_annuo_kwh: numberValue("consumo_annuo_kwh"),
    prezzo_energia_eur_kwh: numberValue("prezzo_energia_eur_kwh"),

    costo_impianto_eur: numberValue("costo_impianto_eur"),
    costo_finanziato_eur: financedAmount(),
    anni_finanziamento: Math.trunc(numberValue("anni_finanziamento")),
    usa_rata_semplice: boolValue("usa_rata_semplice"),
    taeg_annuo_percent: numberValue("taeg_annuo_percent"),
    rata_mensile_override_eur: null,

    produzione_annua_kwh: numberValue("produzione_annua_kwh"),
    autoconsumo_percent: numberValue("autoconsumo_percent"),

    prezzo_gse_eur_kwh: numberValue("prezzo_gse_eur_kwh"),

    aliquota_detrazione_percent: clientType === 'aziendale' ? 0 : numberValue("aliquota_detrazione_percent"),
    anni_detrazione: Math.trunc(numberValue("anni_detrazione")),

    fattore_prudenza: numberValue("fattore_prudenza"),
  };
}

// ─── Render Results ────────────────────────────────────────────────────────
function render(response) {
  lastResponse = response;

  // Extract response values
  const spesaAttuale = response.spesa_annua_attuale_eur;
  const spesaNuova = response.spesa_nuova_totale_eur;
  const risparmioNetto = response.risparmio_netto_eur;
  const risparmio = response.risparmio_bolletta_eur;
  const gse = response.ricavo_gse_eur;
  const rata = response.rata_annua_impianto_eur;
  const detrazione = response.detrazione_annua_eur;

  // Detect cash purchase (no financing)
  const anniFinanziamento = Math.trunc(numberValue("anni_finanziamento"));
  const costoImpianto = numberValue("costo_impianto_eur");
  const isContanti = anniFinanziamento <= 0 && costoImpianto > 0;

  // Calculate percentage savings
  const percentSaved = spesaAttuale > 0 ? Math.round((Math.abs(risparmioNetto) / spesaAttuale) * 100) : 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 1: Comparison Cards
  // ═══════════════════════════════════════════════════════════════════════════

  // Card PRIMA (today)
  document.getElementById("spesaTotaleAnno").textContent = euroNumber(spesaAttuale);
  document.getElementById("bollettaMensile").textContent = euro(spesaAttuale / 12);
  document.getElementById("emissioneCO2").textContent = ((spesaAttuale / 0.30) * 0.000233).toFixed(1) + " T";

  // Card DOPO (with solar)
  document.getElementById("nuovaSpesaAnno").textContent = euroNumber(Math.max(0, spesaNuova));
  document.getElementById("savingsPercent").textContent = "-" + percentSaved + "%";

  // Stacked bar segments
  const totalFlows = risparmio + gse + detrazione + rata;
  if (totalFlows > 0) {
    document.getElementById("segmentRisparmio").style.width = (risparmio / totalFlows * 100) + "%";
    document.getElementById("segmentGse").style.width = (gse / totalFlows * 100) + "%";
    document.getElementById("segmentDetrazione").style.width = (detrazione / totalFlows * 100) + "%";
    document.getElementById("segmentRata").style.width = (rata / totalFlows * 100) + "%";
  }

  // Breakdown list
  document.getElementById("risparmioReale").textContent = "+ " + euro(risparmio);
  document.getElementById("guadagnoGSE").textContent = "+ " + euro(gse);
  document.getElementById("detrazioneFiscale").textContent = "+ " + euro(detrazione);
  document.getElementById("rataPrestito").textContent = "- " + euro(rata);

  // Show/hide detrazione row and segment based on value
  const detrazioneRow = document.getElementById("detrazioneRow");
  const segmentDetrazione = document.getElementById("segmentDetrazione");
  if (detrazioneRow) {
    detrazioneRow.style.display = detrazione > 0 ? "flex" : "none";
  }
  if (segmentDetrazione) {
    segmentDetrazione.style.display = detrazione > 0 ? "block" : "none";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 2: Status Bar
  // ═══════════════════════════════════════════════════════════════════════════

  const statusValue = document.getElementById("statusValue");
  const statusCursor = document.getElementById("statusCursor");
  const guadagnoAnnuale = document.getElementById("guadagnoAnnuale");

  if (risparmioNetto >= 0) {
    statusValue.textContent = "IN ATTIVO";
    statusValue.classList.remove("negative");
    guadagnoAnnuale.textContent = "+ " + euro(risparmioNetto);
    guadagnoAnnuale.classList.remove("negative");
    // Position cursor in positive zone (50-100%)
    const cursorPos = 50 + Math.min(50, (risparmioNetto / 1000) * 10);
    statusCursor.style.left = cursorPos + "%";
    statusCursor.style.background = "#10b981";
  } else {
    statusValue.textContent = "IN PASSIVO";
    statusValue.classList.add("negative");
    guadagnoAnnuale.textContent = "- " + euro(Math.abs(risparmioNetto));
    guadagnoAnnuale.classList.add("negative");
    // Position cursor in negative zone (0-50%)
    const cursorPos = 50 - Math.min(50, (Math.abs(risparmioNetto) / 1000) * 10);
    statusCursor.style.left = cursorPos + "%";
    statusCursor.style.background = "#ef4444";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 3: Waterfall Chart
  // ═══════════════════════════════════════════════════════════════════════════

  const maxWaterfall = Math.max(spesaAttuale, rata, risparmio, gse, detrazione, Math.abs(spesaNuova));

  document.getElementById("wfBolletta").style.width = Math.max(20, (spesaAttuale / maxWaterfall * 100)) + "%";
  document.getElementById("wfBollettaVal").textContent = euro(spesaAttuale);

  document.getElementById("wfRisparmio").style.width = Math.max(20, (risparmio / maxWaterfall * 100)) + "%";
  document.getElementById("wfRisparmioVal").textContent = "- " + euro(risparmio);

  document.getElementById("wfGSE").style.width = Math.max(20, (gse / maxWaterfall * 100)) + "%";
  document.getElementById("wfGSEVal").textContent = "- " + euro(gse);

  // Detrazione row - show/hide based on value
  const wfDetrazioneRow = document.getElementById("wfDetrazioneRow");
  const wfDetrazione = document.getElementById("wfDetrazione");
  const wfDetrazioneVal = document.getElementById("wfDetrazioneVal");
  if (wfDetrazioneRow) {
    wfDetrazioneRow.style.display = detrazione > 0 ? "flex" : "none";
  }
  if (wfDetrazione) {
    wfDetrazione.style.width = Math.max(20, (detrazione / maxWaterfall * 100)) + "%";
  }
  if (wfDetrazioneVal) {
    wfDetrazioneVal.textContent = "- " + euro(detrazione);
  }

  document.getElementById("wfRata").style.width = Math.max(20, (rata / maxWaterfall * 100)) + "%";
  document.getElementById("wfRataVal").textContent = "+ " + euro(rata);

  document.getElementById("wfNuova").style.width = Math.max(20, (Math.max(0, spesaNuova) / maxWaterfall * 100)) + "%";
  document.getElementById("wfNuovaVal").textContent = euro(Math.max(0, spesaNuova));

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 3: Investment Return Summary
  // ═══════════════════════════════════════════════════════════════════════════

  // Calculate breakeven year
  let breakevenYear;
  if (isContanti && risparmioNetto > 0) {
    // Real payback: years to recover upfront investment via annual savings
    breakevenYear = Math.min(Math.ceil(costoImpianto / risparmioNetto), 25);
  } else {
    let cumulative = 0;
    breakevenYear = 25;
    for (const year of response.cashflow_anni) {
      cumulative += year.risparmio_netto_eur;
      if (cumulative > 0 && breakevenYear === 25) {
        breakevenYear = year.anno;
      }
    }
  }
  document.getElementById("breakevenYear").textContent = "ANNO " + breakevenYear;

  // Calculate 25-year totals
  const total25 = response.cashflow_anni.reduce((sum, y) => sum + y.risparmio_netto_eur, 0);
  document.getElementById("guadagno25Anni").textContent = (total25 >= 0 ? "+ " : "- ") + euro(Math.abs(total25));

  // Calculate average annual return (rough estimate)
  const rendimento = costoImpianto > 0 ? ((total25 / costoImpianto) / 25 * 100).toFixed(1) : 0;
  document.getElementById("rendimentoAnnuo").textContent = rendimento + "%";

  // Detailed table
  renderCashflowTable(response);

  // Charts
  drawCharts(response);

  // Animation - animate the savings badge
  const savingsBadge = document.getElementById("savingsBadge");
  if (savingsBadge) {
    savingsBadge.classList.add("value-updated");
    setTimeout(() => savingsBadge.classList.remove("value-updated"), 300);
  }
}

function renderCashflowTable(response) {
  const tbody = document.getElementById("cashflowBody");
  tbody.innerHTML = "";

  for (const row of response.cashflow_anni) {
    const tr = document.createElement("tr");

    const tdYear = document.createElement("td");
    tdYear.textContent = row.anno;

    const tdNetto = document.createElement("td");
    tdNetto.textContent = euro(row.costo_netto_eur);
    tdNetto.classList.add(row.costo_netto_eur <= 0 ? "positive" : "negative");

    tr.appendChild(tdYear);
    tr.appendChild(tdNetto);
    tbody.appendChild(tr);
  }
}

function setStatus(text) {
  document.getElementById("apiStatus").textContent = text || "";
}

// ─── Chart Drawing ─────────────────────────────────────────────────────────
function sizeCanvasToCssPixels(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * ratio));
  const h = Math.max(1, Math.floor(rect.height * ratio));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, ratio };
}

function drawDonut(canvas, segments) {
  const { w, h, ratio } = sizeCanvasToCssPixels(canvas);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total || total <= 0) {
    ctx.fillStyle = COLORS.text.muted;
    ctx.font = `${Math.round(14 * ratio)}px 'DM Sans', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("—", w / 2, h / 2);
    return;
  }

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.42;
  const inner = radius * 0.58;

  // Draw segments with smooth edges
  let start = -Math.PI / 2;
  for (const seg of segments) {
    const angle = (seg.value / total) * (Math.PI * 2);
    const end = start + angle;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();

    // Gradient fill for each segment
    const midAngle = start + angle / 2;
    const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, radius);
    gradient.addColorStop(0, seg.color);
    gradient.addColorStop(1, adjustBrightness(seg.color, -20));
    ctx.fillStyle = gradient;
    ctx.fill();

    start = end;
  }

  // Inner circle (donut hole)
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // Inner glow effect
  ctx.beginPath();
  ctx.arc(cx, cy, inner + 2, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function adjustBrightness(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function drawCashflowBars(canvas, cashflowYears) {
  const { w, h, ratio } = sizeCanvasToCssPixels(canvas);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const values = (cashflowYears || []).map((x) => Number(x.costo_netto_eur)).filter((n) => Number.isFinite(n));
  if (values.length === 0) return;

  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const pad = Math.round(20 * ratio);
  const top = pad;
  const left = Math.round(50 * ratio);
  const right = pad;
  const bottom = Math.round(40 * ratio);

  const plotW = w - left - right;
  const plotH = h - top - bottom;
  const zeroY = top + plotH / 2;

  // Grid lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;

  // Horizontal grid lines
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = top + (plotH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + plotW, y);
    ctx.stroke();
  }

  // Zero line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, zeroY);
  ctx.lineTo(left + plotW, zeroY);
  ctx.stroke();

  // Y-axis labels
  ctx.fillStyle = COLORS.text.muted;
  ctx.font = `${Math.round(11 * ratio)}px 'Space Mono', monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const maxLabel = Math.ceil(maxAbs / 100) * 100;
  ctx.fillText(`+${maxLabel}€`, left - 10, top);
  ctx.fillText(`0€`, left - 10, zeroY);
  ctx.fillText(`-${maxLabel}€`, left - 10, top + plotH);

  // Bars
  const barCount = Math.min(25, cashflowYears.length);
  const gap = Math.max(2, Math.round(4 * ratio));
  const barW = Math.max(4, Math.floor((plotW - gap * (barCount - 1)) / barCount));

  for (let i = 0; i < barCount; i++) {
    const v = Number(cashflowYears[i].costo_netto_eur);
    const x = left + i * (barW + gap);
    const barH = (Math.abs(v) / maxAbs) * (plotH / 2);
    const y = v <= 0 ? zeroY - barH : zeroY;

    // Bar gradient
    const gradient = ctx.createLinearGradient(x, y, x, y + barH);
    if (v <= 0) {
      gradient.addColorStop(0, COLORS.positive);
      gradient.addColorStop(1, adjustBrightness(COLORS.positive, -30));
    } else {
      gradient.addColorStop(0, COLORS.negative);
      gradient.addColorStop(1, adjustBrightness(COLORS.negative, -30));
    }

    // Draw bar with rounded top
    const cornerRadius = Math.min(4 * ratio, barW / 2);
    ctx.beginPath();
    if (v <= 0) {
      ctx.moveTo(x, y + barH);
      ctx.lineTo(x, y + cornerRadius);
      ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
      ctx.lineTo(x + barW - cornerRadius, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + cornerRadius);
      ctx.lineTo(x + barW, y + barH);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + barH - cornerRadius);
      ctx.quadraticCurveTo(x, y + barH, x + cornerRadius, y + barH);
      ctx.lineTo(x + barW - cornerRadius, y + barH);
      ctx.quadraticCurveTo(x + barW, y + barH, x + barW, y + barH - cornerRadius);
      ctx.lineTo(x + barW, y);
    }
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Highlight for year 11
    if (i === 10) {
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2 * ratio;
      ctx.stroke();
    }
  }

  // X-axis labels
  ctx.fillStyle = COLORS.text.muted;
  ctx.font = `${Math.round(11 * ratio)}px 'Space Mono', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (const year of [1, 5, 10, 15, 20, 25]) {
    if (year > barCount) continue;
    const i = year - 1;
    const x = left + i * (barW + gap) + barW / 2;
    ctx.fillText(String(year), x, top + plotH + Math.round(12 * ratio));
  }

  // "Anno" label
  ctx.fillStyle = COLORS.text.secondary;
  ctx.font = `${Math.round(10 * ratio)}px 'DM Sans', sans-serif`;
  ctx.fillText("Anno", left + plotW / 2, h - 8 * ratio);
}

function drawCharts(response) {
  const canvas = document.getElementById("cashflowChart");
  const _anni = Math.trunc(numberValue("anni_finanziamento"));
  const _costo = numberValue("costo_impianto_eur");
  const initialCost = (_anni <= 0 && _costo > 0) ? _costo : 0;

  // Draw cumulative investment return chart
  drawInvestmentChart(canvas, response.cashflow_anni || [], initialCost);
}

// Draw cumulative savings chart (area chart style)
function drawInvestmentChart(canvas, cashflowYears, initialCost = 0) {
  if (!canvas || !cashflowYears.length) return;

  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  canvas.width = w * ratio;
  canvas.height = h * ratio;
  ctx.scale(ratio, ratio);

  // Calculate cumulative values (start at -initialCost for cash purchases)
  let cumulative = -initialCost;
  const cumulativeData = cashflowYears.map(y => {
    cumulative += y.risparmio_netto_eur;
    return { anno: y.anno, value: cumulative };
  });

  const values = cumulativeData.map(d => d.value);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values);
  const range = maxVal - minVal || 1;

  const padding = { top: 20, right: 20, bottom: 30, left: 10 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Zero line position
  const zeroY = padding.top + (maxVal / range) * plotH;

  // Draw zero line (dashed)
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(w - padding.right, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw area fill
  const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
  gradient.addColorStop(0, "rgba(16, 185, 129, 0.3)");
  gradient.addColorStop(1, "rgba(16, 185, 129, 0.05)");

  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);

  cumulativeData.forEach((d, i) => {
    const x = padding.left + (i / (cumulativeData.length - 1)) * plotW;
    const y = padding.top + ((maxVal - d.value) / range) * plotH;
    ctx.lineTo(x, y);
  });

  ctx.lineTo(w - padding.right, zeroY);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw line
  ctx.beginPath();
  cumulativeData.forEach((d, i) => {
    const x = padding.left + (i / (cumulativeData.length - 1)) * plotW;
    const y = padding.top + ((maxVal - d.value) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw breakeven point marker
  const breakevenIdx = cumulativeData.findIndex(d => d.value > 0);
  if (breakevenIdx > 0) {
    const x = padding.left + (breakevenIdx / (cumulativeData.length - 1)) * plotW;
    const y = padding.top + ((maxVal - cumulativeData[breakevenIdx].value) / range) * plotH;

    // Vertical line to zero
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Marker dot
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // X-axis labels
  ctx.fillStyle = "#6b7280";
  ctx.font = "10px 'DM Sans', sans-serif";
  ctx.textAlign = "center";
  [0, 5, 10, 15, 20, 25].forEach(anno => {
    if (anno === 0) return;
    const idx = anno - 1;
    if (idx < cumulativeData.length) {
      const x = padding.left + (idx / (cumulativeData.length - 1)) * plotW;
      ctx.fillText("Anno " + anno, x, h - 8);
    }
  });
}

// ─── Calculation (Local - PWA Offline-capable) ─────────────────────────────
let timer = null;

function recalc() {
  const payload = buildPayload();

  try {
    // Use local calculator (works offline)
    const data = Calculator.calcResponse(payload);
    setStatus("");
    render(data);
  } catch (err) {
    console.error("Calculation error:", err);
    setStatus("Errore nel calcolo: controlla i valori.");
    document.getElementById("messaggio").textContent = "Errore nei dati inseriti.";
  }
}

function debounceRecalc() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(recalc, 300);
}

// ─── Event Binding ─────────────────────────────────────────────────────────
function bind() {
  const form = document.getElementById("calcForm");

  form.addEventListener("input", (e) => {
    const id = e?.target?.id;
    if (
      selectedOffer &&
      clientType === 'residenziale' &&
      ["costo_impianto_eur", "anni_finanziamento", "taeg_annuo_percent", "usa_rata_semplice"].includes(id)
    ) {
      selectedOffer = null;
      const modelSel = document.getElementById("modello_impianto");
      modelSel.value = "";
    }

    // Auto-calculate production from manual potenza kW
    if (id === 'potenza_kw_manuale') {
      const kw = Number(document.getElementById('potenza_kw_manuale').value);
      if (Number.isFinite(kw) && kw > 0) {
        setValue('produzione_annua_kwh', Math.round(kw * KWH_PER_KW_PER_YEAR));
      }
    }

    // Auto-set autoconsumo to 80% when battery storage is added
    if (id === 'accumulo_kwh_manuale') {
      const accumulo = Number(document.getElementById('accumulo_kwh_manuale').value);
      if (accumulo > 0) {
        setValue('autoconsumo_percent', 80);
      }
    }

    debounceRecalc();
  });

  form.addEventListener("change", debounceRecalc);

  // Client type selector
  document.querySelectorAll('input[name="clientType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      onClientTypeChange(e.target.value);
    });
  });

  debounceRecalc();
}

// ─── Initialization ────────────────────────────────────────────────────────
async function init() {
  // Auth check - redirect to /login if not authenticated
  if (typeof checkAuth === "function") {
    const user = await checkAuth();
    if (!user) return; // redirected
    if (typeof renderUserBadge === "function") renderUserBadge("userBadge");
  }

  // Theme toggle
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }

  populateProviders();
  setValue("prezzo_energia_eur_kwh", ENERGY_PRICE_DEFAULT);

  try {
    await loadCatalog();
    populateModels();
  } catch (e) {
    setStatus("Impossibile caricare il listino.");
  }

  // Resize handler for charts
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (lastResponse) drawCharts(lastResponse);
    }, 100);
  });

  bind();
}

// Start the app
init();

// ═══════════════════════════════════════════════════════════════════════════
// Manual Quote Module - Direct Quote Generation
// ═══════════════════════════════════════════════════════════════════════════

let selectedManualSystems = [];

function initManualQuoteModal() {
  const modal = document.getElementById("manualQuoteModal");
  const openBtn = document.getElementById("openManualModal");
  const closeBtn = document.getElementById("manualModalClose");
  const cancelBtn = document.getElementById("manualModalCancel");

  if (!modal || !openBtn) return;

  function openModal() {
    modal.classList.add("active");
    // Refresh datasheet selector when modal opens
    renderDatasheetSelector("manualDatasheetSelector");

    // Pre-select "Spett." for business clients
    if (clientType === 'aziendale') {
      const spettRadio = document.querySelector('input[name="clientTitle"][value="spett"]');
      if (spettRadio) spettRadio.checked = true;
    }

    // Pre-fill financing and price from main form
    const anniFinanziamento = numberValue("anni_finanziamento");
    if (anniFinanziamento) {
      document.getElementById("manualAnniFinanziamento").value = anniFinanziamento;
    }
    const taeg = numberValue("taeg_annuo_percent");
    if (taeg) {
      document.getElementById("manualTaegPercent").value = taeg;
    }

    // Pre-populate from main calculator if a catalog system is selected
    if (selectedOffer) {
      // Find and check the corresponding checkbox (id format: manual-{item.id})
      const checkbox = document.getElementById(`manual-${selectedOffer.id}`);
      if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        const itemDiv = checkbox.closest('.multi-select-item');
        if (itemDiv) {
          itemDiv.classList.add('selected');
        }
        if (!selectedManualSystems.find(s => s.id === selectedOffer.id)) {
          selectedManualSystems.push(selectedOffer);
        }
      }
      updateManualSummary();
    } else if (!selectedOffer) {
      // No catalog selection: build virtual system from manual fields
      const potenza = Number(document.getElementById('potenza_kw_manuale')?.value) || 0;
      const accumulo = Number(document.getElementById('accumulo_kwh_manuale')?.value) || 0;
      const prezzo = numberValue("costo_impianto_eur");

      let label = `${potenza} kW`;
      if (accumulo > 0) label += ` + ${accumulo} kWh acc`;

      const virtualSystem = {
        id: '_custom_' + clientType,
        category: 'Personalizzato',
        label,
        potenza_kw: potenza,
        accumulo_kwh: accumulo,
        prezzo_eur: prezzo,
      };

      selectedManualSystems = [virtualSystem];
      const totalPriceInput = document.getElementById("manualTotalPrice");
      if (totalPriceInput) totalPriceInput.value = prezzo;

      const summaryEl = document.getElementById("selectedSystemsSummary");
      if (summaryEl) {
        summaryEl.innerHTML = `
          <span class="summary-count">Impianto personalizzato: ${label}</span>
          <span class="summary-total">Totale: ${euro(prezzo)}</span>
        `;
      }
    }
  }

  function closeModal() {
    modal.classList.remove("active");
  }

  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      closeModal();
    }
  });

  // Pre-load PDF assets in background
  initPdfAssets();
}

function initManualQuote() {
  const container = document.getElementById("manualSystemsContainer");
  const summaryEl = document.getElementById("selectedSystemsSummary");
  const rateOptionsEl = document.getElementById("manualRateOptions");
  const paymentTypeRadios = document.querySelectorAll('input[name="paymentType"]');
  const generateBtn = document.getElementById("generateManualQuote");

  if (!container || !catalog) return;

  // Initialize modal management
  initManualQuoteModal();

  // Populate multi-select with systems grouped by category, filtered by client type
  const filteredCatalog = filterCatalogItems(clientType);
  const grouped = groupByCategory(filteredCatalog);
  container.innerHTML = "";

  for (const [cat, items] of grouped.entries()) {
    const groupDiv = document.createElement("div");
    groupDiv.className = "multi-select-group";

    const headerDiv = document.createElement("div");
    headerDiv.className = "multi-select-group-header";
    headerDiv.textContent = cat;
    groupDiv.appendChild(headerDiv);

    for (const item of items) {
      const itemDiv = document.createElement("div");
      itemDiv.className = "multi-select-item";
      itemDiv.dataset.id = item.id;
      itemDiv.dataset.price = item.prezzo_eur;
      itemDiv.dataset.label = item.label;
      itemDiv.dataset.potenza = item.potenza_kw;
      itemDiv.dataset.accumulo = item.accumulo_kwh || "";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `manual-${item.id}`;

      const label = document.createElement("span");
      label.className = "item-label";
      label.textContent = item.label;

      const price = document.createElement("span");
      price.className = "item-price";
      price.textContent = euro(item.prezzo_eur);

      itemDiv.appendChild(checkbox);
      itemDiv.appendChild(label);
      itemDiv.appendChild(price);

      // Click handler
      itemDiv.addEventListener("click", (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
        toggleManualSystem(item, checkbox.checked, itemDiv);
      });

      checkbox.addEventListener("change", (e) => {
        toggleManualSystem(item, e.target.checked, itemDiv);
      });

      groupDiv.appendChild(itemDiv);
    }

    container.appendChild(groupDiv);
  }

  // Payment type toggle
  const taegOptionsEl = document.getElementById("manualTaegOptions");
  paymentTypeRadios.forEach(radio => {
    radio.addEventListener("change", (e) => {
      if (e.target.value === "rate") {
        rateOptionsEl.style.display = "block";
        if (taegOptionsEl) taegOptionsEl.style.display = "block";
      } else {
        rateOptionsEl.style.display = "none";
        if (taegOptionsEl) taegOptionsEl.style.display = "none";
      }
    });
  });

  // Generate button
  generateBtn.addEventListener("click", generateManualQuote);
}

function toggleManualSystem(item, isSelected, itemDiv) {
  if (isSelected) {
    if (!selectedManualSystems.find(s => s.id === item.id)) {
      selectedManualSystems.push(item);
    }
    itemDiv.classList.add("selected");
  } else {
    selectedManualSystems = selectedManualSystems.filter(s => s.id !== item.id);
    itemDiv.classList.remove("selected");
  }
  updateManualSummary();
}

function updateManualSummary() {
  const summaryEl = document.getElementById("selectedSystemsSummary");
  const totalPriceInput = document.getElementById("manualTotalPrice");
  const count = selectedManualSystems.length;
  const total = selectedManualSystems.reduce((sum, s) => sum + Number(s.prezzo_eur), 0);

  const countText = count === 0 ? "Nessun impianto selezionato" :
                   count === 1 ? "1 impianto selezionato" :
                   `${count} impianti selezionati`;

  summaryEl.innerHTML = `
    <span class="summary-count">${countText}</span>
    <span class="summary-total">Totale: ${euro(total)}</span>
  `;

  // Auto-update total price field
  if (totalPriceInput) {
    totalPriceInput.value = total;
  }
}

async function generateManualQuote() {
  if (selectedManualSystems.length === 0) {
    alert("Seleziona almeno un impianto!");
    return;
  }

  const clienteTitle = document.querySelector('input[name="clientTitle"]:checked')?.value || "sig";
  const clienteName = document.getElementById("manualClienteName").value.trim() || "Cliente";
  const clienteIndirizzo = document.getElementById("manualClienteIndirizzo").value.trim();
  const clienteNote = document.getElementById("manualClienteNote").value.trim();
  const paymentType = document.querySelector('input[name="paymentType"]:checked').value;
  const anniFinanziamento = paymentType === "rate" ? Number(document.getElementById("manualAnniFinanziamento").value) : 0;
  const taegPercent = paymentType === "rate" ? Number(document.getElementById("manualTaegPercent").value) : 0;
  const customTotalPrice = Number(document.getElementById("manualTotalPrice").value) || 0;
  const ivaType = document.getElementById("manualIvaType").value; // "inclusa" or "esclusa"
  const includeSavings = document.getElementById("includeSavingsCalc").checked;

  // If savings is requested but no calculation data available, warn user
  if (includeSavings && !lastResponse) {
    alert("Per includere il calcolo del risparmio, configura prima i dati della bolletta nella sezione 'Impianto Fotovoltaico'");
    return;
  }

  if (!pdfAssets.loaded) {
    await initPdfAssets();
  }

  await generateManualPDF(clienteTitle, clienteName, clienteIndirizzo, clienteNote, selectedManualSystems, paymentType, anniFinanziamento, taegPercent, customTotalPrice, ivaType, includeSavings, lastResponse, clientType);

  // Close modal after generating
  const modal = document.getElementById("manualQuoteModal");
  if (modal) modal.classList.remove("active");
}

// ─── Generate Manual PDF ────────────────────────────────────────────────────
async function generateManualPDF(clienteTitle, clienteName, clienteIndirizzo, clienteNote, systems, paymentType, anniFinanziamento, taegPercent = 0, customTotalPrice = 0, ivaType = "inclusa", includeSavings = false, savingsData = null, clientTypeParam = "residenziale") {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Register custom fonts
  const fontsRegistered = registerFonts(doc);
  const fontFamily = fontsRegistered ? 'ProductSans' : 'helvetica';

  // Colors
  const white = [255, 255, 255];
  const darkBlue = [59, 82, 128];
  const lightText = [200, 210, 230];

  // Helper functions
  function setFont(style, size) {
    doc.setFontSize(size);
    doc.setFont(fontFamily, style);
  }

  function addBackgroundImage(imageData) {
    if (imageData) {
      doc.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight);
    }
  }

  // Build greeting based on title
  let greeting;
  switch (clienteTitle) {
    case "sigra":
      greeting = "Gentile Sig.ra " + clienteName;
      break;
    case "spett":
      greeting = "Spettabile " + clienteName;
      break;
    case "sig":
    default:
      greeting = "Egregio Sig. " + clienteName;
      break;
  }

  // Calculate totals
  // Use custom total price if provided, otherwise sum from systems
  const systemsTotal = systems.reduce((sum, s) => sum + Number(s.prezzo_eur), 0);
  const totalPriceBase = customTotalPrice > 0 ? customTotalPrice : systemsTotal;

  // Calculate price ratio for proportional pricing when custom price is set
  const priceRatio = customTotalPrice > 0 && systemsTotal > 0 ? customTotalPrice / systemsTotal : 1;

  // IVA handling:
  // The user enters the price they want shown on the quote.
  // "IVA inclusa" = price already includes 10% IVA
  // "IVA esclusa" = price is net (business client handles IVA separately)
  let totalPrice, ivaLabel;
  if (ivaType === "esclusa") {
    totalPrice = totalPriceBase;
    ivaLabel = "IVA esclusa";
  } else {
    totalPrice = totalPriceBase;
    ivaLabel = "IVA inclusa";
  }

  const totalPotenza = systems.reduce((sum, s) => sum + Number(s.potenza_kw || 0), 0);
  const mesiFinanziamento = anniFinanziamento * 12;

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE 1: Cover Page with Background Image
  // ═══════════════════════════════════════════════════════════════════════

  if (pdfAssets.images.cover) {
    addBackgroundImage(pdfAssets.images.cover);
  }

  // Client name on the white line at bottom
  setFont("normal", 12);
  doc.setTextColor(59, 82, 128);
  doc.text(greeting, 27, 287);

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE 2: Company Info & Guarantees
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage();

  if (pdfAssets.images.pageBaseClean) {
    addBackgroundImage(pdfAssets.images.pageBaseClean);
  }

  let y = 45;

  // Company description
  setFont("normal", 11);
  doc.setTextColor(...white);
  const companyText = "Siamo lieti di presentarvi Tech Solutions, leader nell'energia fotovoltaica, che offre soluzioni innovative ed ecocompatibili per le vostre esigenze energetiche. Con esperienza e passione per l'innovazione, forniamo servizi di alta qualità per la produzione di energia solare, dalla progettazione all'installazione di impianti fotovoltaici, dall'integrazione di sistemi di accumulo alla manutenzione preventiva e correttiva. Lavoriamo con le tecnologie più avanzate per garantire ai nostri clienti soluzioni all'avanguardia.";

  const companyLines = doc.splitTextToSize(companyText, contentWidth - 10);
  doc.text(companyLines, margin + 5, y);
  y += companyLines.length * 6 + 14;

  // Guarantees section
  setFont("bold", 16);
  doc.setTextColor(255, 220, 100);
  doc.text("Garanzie:", margin + 5, y);
  y += 10;

  const guarantees = [
    "Garanzie rendimento impianto Fv 30 anni.",
    "Smaltimento moduli fine ciclo vita (contributo Raee compreso)",
    "Garanzia moduli 15 anni del Costruttore/Fornitore su difetti e mal funzionamento dei moduli",
    "Garanzia inverter e batterie 20 anni"
  ];

  setFont("normal", 11);
  doc.setTextColor(...white);
  guarantees.forEach(g => {
    doc.text("•  " + g, margin + 8, y);
    y += 7;
  });

  y += 10;

  // Included items
  setFont("bold", 12);
  doc.setTextColor(...lightText);
  doc.text("Sono inclusi inoltre:", margin + 5, y);
  y += 8;

  const included = [
    "Quadri di campo e manovra con gruppi scaricatori sovratensione",
    "Sezionatori bipolari",
    "Morsetti di terra",
    "Quadri di interfaccia e protezione per la rete elettrica",
    "Protezioni magnetotermiche trifasi",
    "Interruttori generali magnetotermici",
    "Cavi unipolari per collegare i moduli FV agli inverter e ai gruppi di conversione",
    "Cavi di terra unipolari in rame flessibile isolati in PVC",
    "Accessori per i collegamenti elettrici",
    "Materiale necessario per garantire il regolare funzionamento dell'impianto fotovoltaico"
  ];

  setFont("normal", 10);
  doc.setTextColor(...white);
  included.forEach(item => {
    const lines = doc.splitTextToSize("•  " + item, contentWidth - 20);
    doc.text(lines, margin + 8, y);
    y += lines.length * 5;
  });

  y += 10;

  // Optional components (excluded)
  setFont("bold", 16);
  doc.setTextColor(255, 220, 100);
  doc.text("Componenti opzionali:", margin + 5, y);
  y += 8;

  setFont("normal", 10);
  doc.setTextColor(...lightText);
  doc.text("Sono esclusi dalla presente offerta e, se necessari, da quotare separatamente:", margin + 5, y);
  y += 8;

  const excluded = [
    "Ponteggi o Mezzi di sollevamento ove necessario",
    "Impiantistica elettrica primaria e fino al punto di consegna",
    "Eventuale adeguamento cabina MT lato utente",
    "Scavi, reinterri, cavidotti, importanti opere murarie",
    "Altro non espressamente previsto"
  ];

  setFont("normal", 10);
  doc.setTextColor(...white);
  excluded.forEach(item => {
    doc.text("•  " + item, margin + 8, y);
    y += 6;
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE 3: Solution Proposed (Systems & Pricing)
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage();

  if (pdfAssets.images.pageBaseClean) {
    addBackgroundImage(pdfAssets.images.pageBaseClean);
  }

  y = 45;

  // Section title
  setFont("bold", 20);
  doc.setTextColor(255, 220, 100);
  doc.text("Soluzione proposta", margin + 5, y);
  y += 14;

  // Intro text
  setFont("normal", 11);
  doc.setTextColor(...white);
  const introText = "L'offerta include, senza alcun costo aggiuntivo, l'assistenza tecnica completa per il progetto, compresi i requisiti tecnico-amministrativi necessari per la realizzazione dell'intervento presso il Comune, Enel, ecc. Inoltre, forniamo la supervisione del cantiere e gestiamo la procedura di collegamento dell'impianto alla rete elettrica.";
  const introLines = doc.splitTextToSize(introText, contentWidth - 10);
  doc.text(introLines, margin + 5, y);
  y += introLines.length * 6 + 18;

  // Address if provided
  if (clienteIndirizzo && clienteIndirizzo.length > 0) {
    setFont("bold", 12);
    doc.setTextColor(...lightText);
    doc.text("Indirizzo installazione:", margin + 5, y);
    y += 8;

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, y, contentWidth - 10, 18, 3, 3, 'F');

    setFont("normal", 11);
    doc.setTextColor(60, 60, 60);
    doc.text(clienteIndirizzo, margin + 12, y + 12);
    y += 26;
  }

  // Systems list
  const colWidth1 = 25;
  const rowHeight = 22;

  // List each system
  systems.forEach((sys, idx) => {
    const systemLabel = sys.accumulo_kwh
      ? `Impianto fotovoltaico ${sys.potenza_kw} kW con accumulo ${sys.accumulo_kwh} kWh`
      : `Impianto fotovoltaico ${sys.potenza_kw} kW`;

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, y, contentWidth - 10, rowHeight, 4, 4, 'F');

    setFont("bold", 13);
    doc.setTextColor(59, 82, 128);
    doc.text("N°" + (idx + 1), margin + 14, y + 14);

    setFont("normal", 10);
    doc.setTextColor(60, 60, 60);
    const sysLines = doc.splitTextToSize(systemLabel, 90);
    doc.text(sysLines, margin + colWidth1 + 12, y + (sysLines.length > 1 ? 9 : 14));

    setFont("bold", 14);
    doc.setTextColor(39, 174, 96); // Green
    // Use proportional price when custom price is set
    const displayPrice = Math.round(Number(sys.prezzo_eur) * priceRatio);
    doc.text(euro(displayPrice), pageWidth - margin - 18, y + 14, { align: "right" });

    y += rowHeight + 6;
  });

  // Installation row
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, contentWidth - 10, rowHeight, 4, 4, 'F');

  setFont("normal", 11);
  doc.setTextColor(60, 60, 60);
  doc.text("Installazione pratica e messa in opera", margin + colWidth1 + 12, y + 14);

  setFont("bold", 14);
  doc.setTextColor(39, 174, 96);
  doc.text("INCLUSA", pageWidth - margin - 18, y + 14, { align: "right" });

  y += rowHeight + 15;

  // Totals section
  if (paymentType === "rate") {
    // Financing - show total and monthly rate
    doc.setFillColor(59, 82, 128);
    doc.roundedRect(margin + 5, y, contentWidth - 10, 16, 3, 3, 'F');

    setFont("bold", 12);
    doc.setTextColor(...white);
    doc.text("Importo Totale", margin + 28, y + 11);
    doc.text("Rata mensile (" + mesiFinanziamento + " mesi)", pageWidth - margin - 65, y + 11);

    y += 20;

    // Calculate monthly rate (with TAEG if provided)
    let rataMensile;
    if (taegPercent > 0) {
      // PMT formula with TAEG
      const taegMensile = taegPercent / 100 / 12;
      rataMensile = totalPrice * (taegMensile * Math.pow(1 + taegMensile, mesiFinanziamento)) / (Math.pow(1 + taegMensile, mesiFinanziamento) - 1);
    } else {
      rataMensile = totalPrice / mesiFinanziamento;
    }

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, y, contentWidth - 10, 24, 4, 4, 'F');

    setFont("bold", 14);
    doc.setTextColor(60, 60, 60);
    doc.text(euro(totalPrice) + " " + ivaLabel, margin + 18, y + 16);

    setFont("bold", 18);
    doc.setTextColor(39, 174, 96); // Green
    doc.text(euroMonthly(rataMensile), pageWidth - margin - 18, y + 16, { align: "right" });

    y += 35;

  } else {
    // Direct payment - show only total
    doc.setFillColor(59, 82, 128);
    doc.roundedRect(margin + 5, y, contentWidth - 10, 16, 3, 3, 'F');

    setFont("bold", 12);
    doc.setTextColor(...white);
    doc.text("PAGAMENTO DIRETTO", margin + 28, y + 11);

    y += 20;

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, y, contentWidth - 10, 28, 4, 4, 'F');

    setFont("bold", 11);
    doc.setTextColor(60, 60, 60);
    doc.text("Importo Totale:", margin + 18, y + 12);

    setFont("bold", 20);
    doc.setTextColor(16, 185, 129);
    doc.text(euro(totalPrice) + " " + ivaLabel, margin + 18, y + 24);

    y += 40;
  }

  // Notes section - only show if there's content
  if (clienteNote && clienteNote.length > 0) {
    setFont("bold", 14);
    doc.setTextColor(...white);
    doc.text("Note:", margin + 5, y);
    y += 10;

    const noteLines = doc.splitTextToSize(clienteNote, contentWidth - 30);
    const noteBoxHeight = Math.max(28, noteLines.length * 7 + 18);

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, y, contentWidth - 10, noteBoxHeight, 4, 4, 'F');

    setFont("normal", 12);
    doc.setTextColor(60, 60, 60);
    doc.text(noteLines, margin + 14, y + 14);
  }

  // Partner section
  setFont("bold", 12);
  doc.setTextColor(...white);
  doc.text("Partner finanziari:", margin + 5, pageHeight - 28);

  setFont("bold", 11);
  doc.setTextColor(...white);
  doc.text("Findomestic  |  COMPASS  |  FIDITALIA  |  Banca Sella", pageWidth / 2, pageHeight - 16, { align: "center" });

  // ═══════════════════════════════════════════════════════════════════════
  // OPTIONAL: Solar Analytics Dashboard Page (single page)
  // ═══════════════════════════════════════════════════════════════════════
  if (includeSavings && savingsData) {
    doc.addPage();

    if (pdfAssets.images.pageBaseClean) {
      addBackgroundImage(pdfAssets.images.pageBaseClean);
    }

    y = 40;

    // Page title
    setFont("bold", 18);
    doc.setTextColor(255, 220, 100);
    doc.text("Analisi Risparmio Energetico", margin + 5, y);
    y += 14;

    // ─── Section 1: Comparison Cards (PRIMA | DOPO) ───────────────────────
    const cardWidth = (contentWidth - 15) / 2;
    const cardHeight = 52;
    const cardLeftX = margin + 5;
    const cardRightX = margin + 10 + cardWidth;

    // Card PRIMA (left)
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(cardLeftX, y, cardWidth, cardHeight, 4, 4, 'F');

    // Red top bar
    doc.setFillColor(239, 68, 68);
    doc.rect(cardLeftX, y, cardWidth, 3, 'F');

    setFont("bold", 9);
    doc.setTextColor(239, 68, 68);
    doc.text("PRIMA (OGGI)", cardLeftX + 8, y + 12);

    setFont("normal", 8);
    doc.setTextColor(100, 100, 100);
    doc.text("SPESA ENERGETICA TOTALE", cardLeftX + 8, y + 20);

    setFont("bold", 22);
    doc.setTextColor(239, 68, 68);
    const primaAmountText = euro(savingsData.spesa_annua_attuale_eur);
    const primaAmountWidth = doc.getTextWidth(primaAmountText);
    doc.text(primaAmountText, cardLeftX + 8, y + 36);

    setFont("normal", 10);
    doc.setTextColor(100, 100, 100);
    doc.text("/anno", cardLeftX + 8 + primaAmountWidth + 2, y + 36);

    // Card DOPO (right)
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(cardRightX, y, cardWidth, cardHeight, 4, 4, 'F');

    // Green top bar
    doc.setFillColor(16, 185, 129);
    doc.rect(cardRightX, y, cardWidth, 3, 'F');

    setFont("bold", 9);
    doc.setTextColor(16, 185, 129);
    doc.text("DOPO (CON SOLARE)", cardRightX + 8, y + 12);

    setFont("normal", 8);
    doc.setTextColor(100, 100, 100);
    doc.text("NUOVA SPESA NETTA", cardRightX + 8, y + 20);

    setFont("bold", 22);
    doc.setTextColor(16, 185, 129);
    const dopoAmountText = euro(Math.max(0, savingsData.spesa_nuova_totale_eur));
    const dopoAmountWidth = doc.getTextWidth(dopoAmountText);
    doc.text(dopoAmountText, cardRightX + 8, y + 36);

    setFont("normal", 10);
    doc.setTextColor(100, 100, 100);
    doc.text("/anno", cardRightX + 8 + dopoAmountWidth + 2, y + 36);

    // Savings badge
    const risparmioNetto = savingsData.risparmio_netto_eur;
    const percentSaved = savingsData.spesa_annua_attuale_eur > 0
      ? Math.round((risparmioNetto / savingsData.spesa_annua_attuale_eur) * 100)
      : 0;
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(cardRightX + cardWidth - 28, y + 8, 22, 12, 3, 3, 'F');
    setFont("bold", 9);
    doc.setTextColor(255, 255, 255);
    doc.text("-" + Math.abs(percentSaved) + "%", cardRightX + cardWidth - 17, y + 16, { align: "center" });

    y += cardHeight + 8;

    // ─── Section 2: Status Bar (Bilancio Annuale Netto) ───────────────────
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, y, contentWidth - 10, 28, 4, 4, 'F');

    setFont("bold", 8);
    doc.setTextColor(100, 100, 100);
    doc.text("BILANCIO ANNUALE NETTO", margin + 12, y + 8);

    const isPositive = risparmioNetto >= 0;
    setFont("bold", 12);
    doc.setTextColor(isPositive ? 16 : 239, isPositive ? 185 : 68, isPositive ? 129 : 68);
    doc.text("Status: " + (isPositive ? "IN ATTIVO" : "IN PASSIVO"), margin + 12, y + 20);

    // Status track
    const trackX = margin + 75;
    const trackWidth = 70;
    const trackY = y + 14;

    // Red to green gradient track (simplified)
    doc.setFillColor(254, 202, 202);
    doc.roundedRect(trackX, trackY, trackWidth / 2, 6, 2, 2, 'F');
    doc.setFillColor(167, 243, 208);
    doc.roundedRect(trackX + trackWidth / 2, trackY, trackWidth / 2, 6, 2, 2, 'F');

    // Cursor position
    const cursorPos = isPositive
      ? 0.5 + Math.min(0.5, risparmioNetto / 2000)
      : 0.5 - Math.min(0.5, Math.abs(risparmioNetto) / 2000);
    doc.setFillColor(isPositive ? 16 : 239, isPositive ? 185 : 68, isPositive ? 129 : 68);
    doc.circle(trackX + trackWidth * cursorPos, trackY + 3, 4, 'F');

    // Guadagno annuale
    setFont("bold", 8);
    doc.setTextColor(100, 100, 100);
    doc.text("GUADAGNO ANNUALE", pageWidth - margin - 45, y + 8);

    setFont("bold", 14);
    doc.setTextColor(isPositive ? 16 : 239, isPositive ? 185 : 68, isPositive ? 129 : 68);
    const guadagnoText = (isPositive ? "+ " : "- ") + euro(Math.abs(risparmioNetto));
    doc.text(guadagnoText, pageWidth - margin - 12, y + 21, { align: "right" });

    y += 36;

    // ─── Section 3: Two Column Layout (Waterfall | Investment Chart) ──────
    const colWidth = (contentWidth - 15) / 2;
    const colLeftX = margin + 5;
    const colRightX = margin + 10 + colWidth;
    const colHeight = 95;

    // ─── Left Column: Annual Costs Detail ─────────────────────────────────────
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(colLeftX, y, colWidth, colHeight, 4, 4, 'F');

    setFont("bold", 10);
    doc.setTextColor(50, 50, 50);
    doc.text("Dettaglio Flussi Annuali", colLeftX + 6, y + 10);

    // Cost detail data
    const wfData = [
      { label: "Bolletta attuale", value: savingsData.spesa_annua_attuale_eur, color: [239, 68, 68], prefix: "" },
      { label: "Risparmio energia", value: savingsData.risparmio_bolletta_eur, color: [16, 185, 129], prefix: "- " },
      { label: "Ricavo GSE", value: savingsData.ricavo_gse_eur, color: [5, 150, 105], prefix: "- " },
    ];
    if (clientTypeParam === 'residenziale' && savingsData.detrazione_annua_eur > 0) {
      wfData.push({ label: "Detrazione fiscale", value: savingsData.detrazione_annua_eur, color: [59, 130, 246], prefix: "- " });
    }
    wfData.push(
      { label: "Rata finanziamento", value: savingsData.rata_annua_impianto_eur, color: [245, 158, 11], prefix: "+ " },
      { label: "NUOVA SPESA", value: Math.max(0, savingsData.spesa_nuova_totale_eur), color: [55, 65, 81], prefix: "", isFinal: true }
    );

    let rowY = y + 20;
    const rowHeight = 12;

    wfData.forEach((item) => {
      // Color indicator dot
      doc.setFillColor(...item.color);
      doc.circle(colLeftX + 8, rowY - 1, 2, 'F');

      // Label
      setFont(item.isFinal ? "bold" : "normal", item.isFinal ? 9 : 8);
      doc.setTextColor(80, 80, 80);
      doc.text(item.label, colLeftX + 14, rowY);

      // Value - right aligned, larger and bolder
      setFont("bold", item.isFinal ? 11 : 9);
      doc.setTextColor(...item.color);
      const valueText = item.prefix + euro(item.value);
      doc.text(valueText, colLeftX + colWidth - 8, rowY, { align: "right" });

      rowY += rowHeight;
    });

    // ─── Right Column: Investment Return Chart ────────────────────────────
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(colRightX, y, colWidth, colHeight, 4, 4, 'F');

    setFont("bold", 10);
    doc.setTextColor(50, 50, 50);
    doc.text("Rientro Investimento", colRightX + 6, y + 10);

    // Breakeven badge
    let cumulative = 0;
    let breakevenYear = 25;
    for (const year of savingsData.cashflow_anni) {
      cumulative += year.risparmio_netto_eur;
      if (cumulative > 0 && breakevenYear === 25) {
        breakevenYear = year.anno;
      }
    }

    doc.setFillColor(254, 243, 199);
    doc.roundedRect(colRightX + colWidth - 45, y + 4, 40, 10, 2, 2, 'F');
    setFont("bold", 6);
    doc.setTextColor(180, 83, 9);
    doc.text("PAREGGIO: ANNO " + breakevenYear, colRightX + colWidth - 25, y + 11, { align: "center" });

    // Simple area chart
    const chartX = colRightX + 10;
    const chartY = y + 20;
    const chartW = colWidth - 20;
    const chartH = 50;

    // Calculate cumulative data
    cumulative = 0;
    const cumulativeData = savingsData.cashflow_anni.map(yr => {
      cumulative += yr.risparmio_netto_eur;
      return cumulative;
    });
    const minCum = Math.min(0, ...cumulativeData);
    const maxCum = Math.max(0, ...cumulativeData);
    const range = maxCum - minCum || 1;

    // Zero line
    const zeroY = chartY + (maxCum / range) * chartH;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.line(chartX, zeroY, chartX + chartW, zeroY);

    // Draw area fill using lines (simplified)
    doc.setFillColor(167, 243, 208);
    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(1.5);

    // Start path from zero line
    let lastX = chartX;
    let lastY = zeroY;

    for (let i = 0; i < cumulativeData.length; i++) {
      const x = chartX + (i / (cumulativeData.length - 1)) * chartW;
      const yVal = chartY + ((maxCum - cumulativeData[i]) / range) * chartH;

      if (i > 0) {
        doc.line(lastX, lastY, x, yVal);
      }
      lastX = x;
      lastY = yVal;
    }

    // Breakeven marker
    if (breakevenYear < 25) {
      const bX = chartX + ((breakevenYear - 1) / 24) * chartW;
      doc.setFillColor(245, 158, 11);
      doc.circle(bX, zeroY, 3, 'F');
    }

    // X-axis labels
    setFont("normal", 6);
    doc.setTextColor(100, 100, 100);
    [5, 10, 15, 20, 25].forEach(yr => {
      const x = chartX + ((yr - 1) / 24) * chartW;
      doc.text("" + yr, x, chartY + chartH + 8, { align: "center" });
    });

    y += colHeight + 8;

    // ─── Section 4: Summary Cards ─────────────────────────────────────────
    const summaryWidth = (contentWidth - 15) / 2;

    // Total 25 years box
    const total25 = savingsData.cashflow_anni.reduce((sum, row) => sum + row.risparmio_netto_eur, 0);
    const isTotal25Positive = total25 >= 0;

    doc.setFillColor(isTotal25Positive ? 167 : 254, isTotal25Positive ? 243 : 202, isTotal25Positive ? 208 : 202);
    doc.roundedRect(margin + 5, y, summaryWidth, 24, 4, 4, 'F');

    setFont("bold", 7);
    doc.setTextColor(isTotal25Positive ? 6 : 153, isTotal25Positive ? 95 : 27, isTotal25Positive ? 70 : 27);
    doc.text("GUADAGNO FINALE (25 ANNI)", margin + 12, y + 9);

    setFont("bold", 14);
    doc.text((isTotal25Positive ? "+ " : "- ") + euro(Math.abs(total25)), margin + 12, y + 20);

    // Annual return box
    const costoImpianto = parseFloat(customTotalPrice) || 12000;
    const rendimento = costoImpianto > 0 ? ((total25 / costoImpianto) / 25 * 100).toFixed(1) : 0;

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin + 10 + summaryWidth, y, summaryWidth, 24, 4, 4, 'F');

    setFont("bold", 7);
    doc.setTextColor(100, 100, 100);
    doc.text("RENDIMENTO MEDIO ANNUO", margin + 17 + summaryWidth, y + 9);

    setFont("bold", 14);
    doc.setTextColor(50, 50, 50);
    doc.text(rendimento + "%", margin + 17 + summaryWidth, y + 20);

    y += 32;

    // After financing note
    const yearAfterFinancing = savingsData.cashflow_anni.find((x) => x.anno === anniFinanziamento + 1);
    if (yearAfterFinancing) {
      setFont("normal", 9);
      doc.setTextColor(255, 255, 255);
      doc.text("Dopo il finanziamento (Anno " + (anniFinanziamento + 1) + "+): risparmio netto " + euro(yearAfterFinancing.risparmio_netto_eur) + "/anno", margin + 10, y);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE: Terms & Contact (final page)
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage();

  if (pdfAssets.images.pageBaseClean) {
    addBackgroundImage(pdfAssets.images.pageBaseClean);
  }

  y = 45;

  // Notes section
  setFont("bold", 18);
  doc.setTextColor(255, 220, 100);
  doc.text("Note Importanti", margin + 5, y);
  y += 14;

  const notes = [
    "I valori indicati sono stime e possono variare in base alle condizioni reali.",
    "La produzione effettiva dipende dall'orientamento, inclinazione e ombreggiature del tetto.",
  ];
  if (clientTypeParam === 'residenziale') {
    notes.push("La detrazione fiscale del 50% è soggetta alle normative vigenti al momento dell'installazione.");
  }
  notes.push(
    "Il preventivo ha validità di 30 giorni dalla data di emissione.",
    "I prezzi indicati sono IVA inclusa dove applicabile."
  );

  // Calculate total height needed for notes
  let totalNotesHeight = 15;
  const noteTextLines = [];
  notes.forEach(note => {
    const lines = doc.splitTextToSize("•  " + note, contentWidth - 25);
    noteTextLines.push(lines);
    totalNotesHeight += lines.length * 6 + 4;
  });

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, contentWidth - 10, totalNotesHeight, 4, 4, 'F');

  setFont("normal", 11);
  doc.setTextColor(60, 60, 60);
  let noteY = y + 12;
  noteTextLines.forEach(lines => {
    doc.text(lines, margin + 12, noteY);
    noteY += lines.length * 6 + 4;
  });

  y += totalNotesHeight + 12;

  // Contact box
  setFont("bold", 18);
  doc.setTextColor(255, 220, 100);
  doc.text("Contattaci", margin + 5, y);
  y += 12;

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, contentWidth - 10, 55, 5, 5, 'F');

  if (pdfAssets.images.logo) {
    doc.addImage(pdfAssets.images.logo, 'PNG', margin + 12, y + 8, 45, 16);
  } else {
    setFont("bold", 16);
    doc.setTextColor(196, 30, 58);
    doc.text("TECH SOLUTIONS", margin + 18, y + 18);
  }

  setFont("normal", 12);
  doc.setTextColor(60, 60, 60);
  doc.text("Tel: 379 113 7065", margin + 18, y + 32);
  doc.text("Email: info@gruppotech.it", margin + 18, y + 42);
  doc.text("Web: techsolutionssrl.com", margin + 18, y + 52);

  y += 70;

  // Signature area
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, 70, 35, 4, 4, 'F');
  doc.roundedRect(pageWidth - margin - 75, y, 70, 35, 4, 4, 'F');

  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.5);
  doc.line(margin + 15, y + 25, margin + 65, y + 25);
  doc.line(pageWidth - margin - 65, y + 25, pageWidth - margin - 15, y + 25);

  setFont("normal", 10);
  doc.setTextColor(80, 80, 80);
  doc.text("Firma Cliente", margin + 40, y + 32, { align: "center" });
  doc.text("Firma Tech Solutions", pageWidth - margin - 40, y + 32, { align: "center" });

  y += 50;

  // Footer with date
  const today = new Date();
  const dateStr = today.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  setFont("italic", 10);
  doc.setTextColor(...lightText);
  doc.text("Documento generato il " + dateStr, pageWidth / 2, y, { align: "center" });

  // Save the PDF
  const fileName = `Preventivo_Manuale_${clienteName.replace(/\s+/g, "_")}_${today.toISOString().split('T')[0]}.pdf`;

  // Check if datasheets should be included (from selector)
  const selectedDatasheets = getSelectedDatasheetsFromSelector("manualDatasheetSelector");

  if (selectedDatasheets.length > 0) {
    try {
      console.log(`Merging ${selectedDatasheets.length} datasheets with manual quote...`);
      const quotePdfBytes = doc.output("arraybuffer");
      const mergedPdfBytes = await mergeQuoteWithDatasheets(quotePdfBytes, selectedDatasheets);
      downloadPdfBlob(mergedPdfBytes, fileName);
      console.log("Manual PDF with datasheets generated successfully!");
      return;
    } catch (error) {
      console.error("Error merging datasheets, falling back to quote only:", error);
    }
  }

  // Fallback: save quote only
  doc.save(fileName);
}

// Initialize manual quote after catalog is loaded
document.addEventListener("DOMContentLoaded", () => {
  // Wait for catalog to load
  const checkCatalog = setInterval(() => {
    if (catalog && catalog.length > 0) {
      clearInterval(checkCatalog);
      initManualQuote();
    }
  }, 100);
});

// ═══════════════════════════════════════════════════════════════════════════
// PDF Generation Module - Professional Template with Custom Assets
// ═══════════════════════════════════════════════════════════════════════════

// ─── PDF Assets (loaded at startup) ─────────────────────────────────────────
const pdfAssets = {
  fonts: {
    regular: null,
    bold: null,
    italic: null,
    boldItalic: null
  },
  images: {
    cover: null,
    pageBase: null,
    pageBaseClean: null,
    logo: null
  },
  loaded: false
};

// ─── Load font as base64 ────────────────────────────────────────────────────
async function loadFontAsBase64(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove the data:application/... prefix, keep only base64
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Load image as base64 data URL ──────────────────────────────────────────
async function loadImageAsDataURL(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Initialize PDF Assets ──────────────────────────────────────────────────
async function initPdfAssets() {
  try {
    console.log("Loading PDF assets...");

    // Load fonts
    const [fontRegular, fontBold, fontItalic, fontBoldItalic] = await Promise.all([
      loadFontAsBase64('./Product Sans Regular.ttf'),
      loadFontAsBase64('./Product Sans Bold.ttf'),
      loadFontAsBase64('./Product Sans Italic.ttf'),
      loadFontAsBase64('./Product Sans Bold Italic.ttf')
    ]);

    pdfAssets.fonts.regular = fontRegular;
    pdfAssets.fonts.bold = fontBold;
    pdfAssets.fonts.italic = fontItalic;
    pdfAssets.fonts.boldItalic = fontBoldItalic;

    // Load images
    const [imgCover, imgPageBase, imgPageBaseClean, imgLogo] = await Promise.all([
      loadImageAsDataURL('./Primapaginapreventivo.png'),
      loadImageAsDataURL('./Paginabasevuota.png'),
      loadImageAsDataURL('./Paginabasecompletamentevuota.png'),
      loadImageAsDataURL('./logotech.png')
    ]);

    pdfAssets.images.cover = imgCover;
    pdfAssets.images.pageBase = imgPageBase;
    pdfAssets.images.pageBaseClean = imgPageBaseClean;
    pdfAssets.images.logo = imgLogo;

    pdfAssets.loaded = true;
    console.log("PDF assets loaded successfully!");

  } catch (error) {
    console.error("Error loading PDF assets:", error);
    pdfAssets.loaded = false;
  }
}

// ─── Register fonts with jsPDF ──────────────────────────────────────────────
function registerFonts(doc) {
  if (!pdfAssets.loaded) return false;

  // Add fonts to VFS
  doc.addFileToVFS('ProductSans-Regular.ttf', pdfAssets.fonts.regular);
  doc.addFileToVFS('ProductSans-Bold.ttf', pdfAssets.fonts.bold);
  doc.addFileToVFS('ProductSans-Italic.ttf', pdfAssets.fonts.italic);
  doc.addFileToVFS('ProductSans-BoldItalic.ttf', pdfAssets.fonts.boldItalic);

  // Register fonts
  doc.addFont('ProductSans-Regular.ttf', 'ProductSans', 'normal');
  doc.addFont('ProductSans-Bold.ttf', 'ProductSans', 'bold');
  doc.addFont('ProductSans-Italic.ttf', 'ProductSans', 'italic');
  doc.addFont('ProductSans-BoldItalic.ttf', 'ProductSans', 'bolditalic');

  return true;
}


// ─── PDF Generation ────────────────────────────────────────────────────────
async function generatePDF(clienteName, clienteIndirizzo, clienteNote, data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Register custom fonts
  const fontsRegistered = registerFonts(doc);
  const fontFamily = fontsRegistered ? 'ProductSans' : 'helvetica';

  // Colors
  const white = [255, 255, 255];
  const darkBlue = [59, 82, 128];
  const lightText = [200, 210, 230];

  // Helper functions
  function setFont(style, size) {
    doc.setFontSize(size);
    doc.setFont(fontFamily, style);
  }

  function addBackgroundImage(imageData) {
    if (imageData) {
      doc.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE 1: Cover Page with Background Image
  // ═══════════════════════════════════════════════════════════════════════

  // Add cover background
  if (pdfAssets.images.cover) {
    addBackgroundImage(pdfAssets.images.cover);
  }

  // Client name on the white line at bottom (positioned on the line in the image)
  // The white line is at approximately 93% of the page height (around Y=277mm on A4)
  setFont("normal", 12);
  doc.setTextColor(59, 82, 128); // Dark blue to match the design
  doc.text("Egregio Sig. " + clienteName, 27, 287);

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE 2: Company Info & Guarantees
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage();

  // Add page background (clean version without white bands)
  if (pdfAssets.images.pageBaseClean) {
    addBackgroundImage(pdfAssets.images.pageBaseClean);
  }

  let y = 45;

  // Company description - larger font
  setFont("normal", 11);
  doc.setTextColor(...white);
  const companyText = "Siamo lieti di presentarvi Tech Solutions, leader nell'energia fotovoltaica, che offre soluzioni innovative ed ecocompatibili per le vostre esigenze energetiche. Con esperienza e passione per l'innovazione, forniamo servizi di alta qualità per la produzione di energia solare, dalla progettazione all'installazione di impianti fotovoltaici, dall'integrazione di sistemi di accumulo alla manutenzione preventiva e correttiva. Lavoriamo con le tecnologie più avanzate per garantire ai nostri clienti soluzioni all'avanguardia.";

  const companyLines = doc.splitTextToSize(companyText, contentWidth - 10);
  doc.text(companyLines, margin + 5, y);
  y += companyLines.length * 6 + 14;

  // Guarantees section
  setFont("bold", 16);
  doc.setTextColor(255, 220, 100); // Golden yellow for headers
  doc.text("Garanzie:", margin + 5, y);
  y += 10;

  const guarantees = [
    "Garanzie rendimento impianto Fv 30 anni.",
    "Smaltimento moduli fine ciclo vita (contributo Raee compreso)",
    "Garanzia moduli 15 anni del Costruttore/Fornitore su difetti e mal funzionamento dei moduli",
    "Garanzia inverter e batterie 20 anni"
  ];

  setFont("normal", 11);
  doc.setTextColor(...white);
  guarantees.forEach(g => {
    doc.text("•  " + g, margin + 8, y);
    y += 7;
  });

  y += 10;

  // Included items
  setFont("bold", 12);
  doc.setTextColor(...lightText);
  doc.text("Sono inclusi inoltre:", margin + 5, y);
  y += 8;

  const included = [
    "Quadri di campo e manovra con gruppi scaricatori sovratensione",
    "Sezionatori bipolari",
    "Morsetti di terra",
    "Quadri di interfaccia e protezione per la rete elettrica",
    "Protezioni magnetotermiche trifasi",
    "Interruttori generali magnetotermici",
    "Cavi unipolari per collegare i moduli FV agli inverter e ai gruppi di conversione",
    "Cavi di terra unipolari in rame flessibile isolati in PVC",
    "Accessori per i collegamenti elettrici",
    "Materiale necessario per garantire il regolare funzionamento dell'impianto fotovoltaico"
  ];

  setFont("normal", 10);
  doc.setTextColor(...white);
  included.forEach(item => {
    const lines = doc.splitTextToSize("•  " + item, contentWidth - 20);
    doc.text(lines, margin + 8, y);
    y += lines.length * 5;
  });

  y += 10;

  // Optional components (excluded)
  setFont("bold", 16);
  doc.setTextColor(255, 220, 100);
  doc.text("Componenti opzionali:", margin + 5, y);
  y += 8;

  setFont("normal", 10);
  doc.setTextColor(...lightText);
  doc.text("Sono esclusi dalla presente offerta e, se necessari, da quotare separatamente:", margin + 5, y);
  y += 8;

  const excluded = [
    "Ponteggi o Mezzi di sollevamento ove necessario",
    "Impiantistica elettrica primaria e fino al punto di consegna",
    "Eventuale adeguamento cabina MT lato utente",
    "Scavi, reinterri, cavidotti, importanti opere murarie",
    "Altro non espressamente previsto"
  ];

  setFont("normal", 10);
  doc.setTextColor(...white);
  excluded.forEach(item => {
    doc.text("•  " + item, margin + 8, y);
    y += 6;
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE 3: Solution Proposed (Pricing)
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage();

  // Add page background (clean version without white bands)
  if (pdfAssets.images.pageBaseClean) {
    addBackgroundImage(pdfAssets.images.pageBaseClean);
  }

  y = 45;

  // Section title
  setFont("bold", 20);
  doc.setTextColor(255, 220, 100);
  doc.text("Soluzione proposta", margin + 5, y);
  y += 14;

  // Intro text - larger font
  setFont("normal", 11);
  doc.setTextColor(...white);
  const introText = "L'offerta include, senza alcun costo aggiuntivo, l'assistenza tecnica completa per il progetto, compresi i requisiti tecnico-amministrativi necessari per la realizzazione dell'intervento presso il Comune, Enel, ecc. Inoltre, forniamo la supervisione del cantiere e gestiamo la procedura di collegamento dell'impianto alla rete elettrica.";
  const introLines = doc.splitTextToSize(introText, contentWidth - 10);
  doc.text(introLines, margin + 5, y);
  y += introLines.length * 6 + 18;

  // Get system info
  const costoImpianto = numberValue("costo_impianto_eur");
  const anticipoEur = numberValue("anticipo_eur");
  const costoFinanziato = Math.max(0, costoImpianto - anticipoEur);
  const anniFinanziamento = numberValue("anni_finanziamento");
  const mesiFinanziamento = anniFinanziamento * 12;

  // Product table - clean white cards
  const colWidth1 = 25;
  const colWidth2 = 100;
  const rowHeight = 22;

  // Get selected system info
  let systemLabel = "Impianto fotovoltaico";
  let systemPower = "";
  let systemStorage = "";

  if (selectedOffer) {
    systemPower = selectedOffer.potenza_kw + " kW";
    systemStorage = selectedOffer.accumulo_kwh ? selectedOffer.accumulo_kwh + " kWh" : "";
    systemLabel = selectedOffer.accumulo_kwh
      ? `Impianto fotovoltaico ${systemPower} con sistema di accumulo ${systemStorage}`
      : `Impianto fotovoltaico ${systemPower}`;
  }

  // Row 1: System - clean white background
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, contentWidth - 10, rowHeight, 4, 4, 'F');

  setFont("bold", 13);
  doc.setTextColor(59, 82, 128);
  doc.text("N°1", margin + 14, y + 14);

  setFont("normal", 11);
  doc.setTextColor(60, 60, 60);
  const sysLines = doc.splitTextToSize(systemLabel, colWidth2 - 5);
  doc.text(sysLines, margin + colWidth1 + 12, y + 10);

  setFont("bold", 16);
  doc.setTextColor(39, 174, 96); // Green
  doc.text(euro(costoImpianto), pageWidth - margin - 18, y + 14, { align: "right" });

  y += rowHeight + 8;

  // Row 2: Anticipo (if present)
  if (anticipoEur > 0) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, y, contentWidth - 10, rowHeight, 4, 4, 'F');

    setFont("normal", 11);
    doc.setTextColor(60, 60, 60);
    doc.text("Anticipo versato", margin + colWidth1 + 12, y + 14);

    setFont("bold", 14);
    doc.setTextColor(39, 174, 96);
    doc.text("- " + euro(anticipoEur), pageWidth - margin - 18, y + 14, { align: "right" });

    y += rowHeight + 8;
  }

  // Row 3: Installation - clean white background
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, contentWidth - 10, rowHeight, 4, 4, 'F');

  setFont("normal", 11);
  doc.setTextColor(60, 60, 60);
  doc.text("Installazione pratica e messa in opera", margin + colWidth1 + 12, y + 14);

  setFont("bold", 14);
  doc.setTextColor(39, 174, 96);
  doc.text("INCLUSA", pageWidth - margin - 18, y + 14, { align: "right" });

  y += rowHeight + 15;

  // Totals section - header bar
  doc.setFillColor(59, 82, 128);
  doc.roundedRect(margin + 5, y, contentWidth - 10, 16, 3, 3, 'F');

  setFont("bold", 12);
  doc.setTextColor(...white);
  doc.text(anticipoEur > 0 ? "Importo da Finanziare" : "Importo Totale", margin + 28, y + 11);
  doc.text("Rata mensile (" + mesiFinanziamento + " mesi)", pageWidth - margin - 65, y + 11);

  y += 20;

  // Values row - clean white background
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, contentWidth - 10, 24, 4, 4, 'F');

  setFont("bold", 14);
  doc.setTextColor(60, 60, 60);
  doc.text(euro(costoFinanziato) + " iva esc al 10%", margin + 18, y + 16);

  // Monthly rate calculation - use the actual rate from response (already accounts for anticipo)
  const rataMensile = data.rata_annua_impianto_eur / 12;
  const taegPercent = numberValue("taeg_annuo_percent") || "";

  setFont("bold", 18);
  doc.setTextColor(39, 174, 96); // Green
  doc.text(euroMonthly(rataMensile), pageWidth - margin - 18, y + 16, { align: "right" });

  y += 35;

  // Notes section - only show if there's content
  if (clienteNote && clienteNote.length > 0) {
    setFont("bold", 14);
    doc.setTextColor(...white);
    doc.text("Note:", margin + 5, y);
    y += 10;

    // Calculate note box height based on content
    const noteLines = doc.splitTextToSize(clienteNote, contentWidth - 30);
    const noteBoxHeight = Math.max(28, noteLines.length * 7 + 18);

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, y, contentWidth - 10, noteBoxHeight, 4, 4, 'F');

    setFont("normal", 12);
    doc.setTextColor(60, 60, 60);
    doc.text(noteLines, margin + 14, y + 14);
  }

  // Partner section - white bold text on blue background (no box)
  setFont("bold", 12);
  doc.setTextColor(...white);
  doc.text("Partner finanziari:", margin + 5, pageHeight - 28);

  setFont("bold", 11);
  doc.setTextColor(...white);
  doc.text("Findomestic  |  COMPASS  |  FIDITALIA  |  Banca Sella", pageWidth / 2, pageHeight - 16, { align: "center" });

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE 4: Solar Analytics Dashboard (single page)
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage();

  if (pdfAssets.images.pageBaseClean) {
    addBackgroundImage(pdfAssets.images.pageBaseClean);
  }

  y = 40;

  // Page title
  setFont("bold", 18);
  doc.setTextColor(255, 220, 100);
  doc.text("Analisi Risparmio Energetico", margin + 5, y);
  y += 14;

  // ─── Section 1: Comparison Cards (PRIMA | DOPO) ───────────────────────
  const cardWidth = (contentWidth - 15) / 2;
  const cardHeight = 52;
  const cardLeftX = margin + 5;
  const cardRightX = margin + 10 + cardWidth;

  // Card PRIMA (left)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(cardLeftX, y, cardWidth, cardHeight, 4, 4, 'F');

  // Red top bar
  doc.setFillColor(239, 68, 68);
  doc.rect(cardLeftX, y, cardWidth, 3, 'F');

  setFont("bold", 9);
  doc.setTextColor(239, 68, 68);
  doc.text("PRIMA (OGGI)", cardLeftX + 8, y + 12);

  setFont("normal", 8);
  doc.setTextColor(100, 100, 100);
  doc.text("SPESA ENERGETICA TOTALE", cardLeftX + 8, y + 20);

  setFont("bold", 22);
  doc.setTextColor(239, 68, 68);
  const primaAmountTextPdf = euro(data.spesa_annua_attuale_eur);
  const primaAmountWidthPdf = doc.getTextWidth(primaAmountTextPdf);
  doc.text(primaAmountTextPdf, cardLeftX + 8, y + 36);

  setFont("normal", 10);
  doc.setTextColor(100, 100, 100);
  doc.text("/anno", cardLeftX + 8 + primaAmountWidthPdf + 2, y + 36);

  // Card DOPO (right)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(cardRightX, y, cardWidth, cardHeight, 4, 4, 'F');

  // Green top bar
  doc.setFillColor(16, 185, 129);
  doc.rect(cardRightX, y, cardWidth, 3, 'F');

  setFont("bold", 9);
  doc.setTextColor(16, 185, 129);
  doc.text("DOPO (CON SOLARE)", cardRightX + 8, y + 12);

  setFont("normal", 8);
  doc.setTextColor(100, 100, 100);
  doc.text("NUOVA SPESA NETTA", cardRightX + 8, y + 20);

  setFont("bold", 22);
  doc.setTextColor(16, 185, 129);
  const dopoAmountTextPdf = euro(Math.max(0, data.spesa_nuova_totale_eur));
  const dopoAmountWidthPdf = doc.getTextWidth(dopoAmountTextPdf);
  doc.text(dopoAmountTextPdf, cardRightX + 8, y + 36);

  setFont("normal", 10);
  doc.setTextColor(100, 100, 100);
  doc.text("/anno", cardRightX + 8 + dopoAmountWidthPdf + 2, y + 36);

  // Savings badge
  const risparmioNettoPdf = data.risparmio_netto_eur;
  const percentSavedPdf = data.spesa_annua_attuale_eur > 0
    ? Math.round((risparmioNettoPdf / data.spesa_annua_attuale_eur) * 100)
    : 0;
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(cardRightX + cardWidth - 28, y + 8, 22, 12, 3, 3, 'F');
  setFont("bold", 9);
  doc.setTextColor(255, 255, 255);
  doc.text("-" + Math.abs(percentSavedPdf) + "%", cardRightX + cardWidth - 17, y + 16, { align: "center" });

  y += cardHeight + 8;

  // ─── Section 2: Status Bar (Bilancio Annuale Netto) ───────────────────
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, contentWidth - 10, 28, 4, 4, 'F');

  setFont("bold", 8);
  doc.setTextColor(100, 100, 100);
  doc.text("BILANCIO ANNUALE NETTO", margin + 12, y + 8);

  const isPositive = risparmioNettoPdf >= 0;
  setFont("bold", 12);
  doc.setTextColor(isPositive ? 16 : 239, isPositive ? 185 : 68, isPositive ? 129 : 68);
  doc.text("Status: " + (isPositive ? "IN ATTIVO" : "IN PASSIVO"), margin + 12, y + 20);

  // Status track
  const trackX = margin + 75;
  const trackWidth = 70;
  const trackY = y + 14;

  doc.setFillColor(254, 202, 202);
  doc.roundedRect(trackX, trackY, trackWidth / 2, 6, 2, 2, 'F');
  doc.setFillColor(167, 243, 208);
  doc.roundedRect(trackX + trackWidth / 2, trackY, trackWidth / 2, 6, 2, 2, 'F');

  const cursorPos = isPositive
    ? 0.5 + Math.min(0.5, risparmioNettoPdf / 2000)
    : 0.5 - Math.min(0.5, Math.abs(risparmioNettoPdf) / 2000);
  doc.setFillColor(isPositive ? 16 : 239, isPositive ? 185 : 68, isPositive ? 129 : 68);
  doc.circle(trackX + trackWidth * cursorPos, trackY + 3, 4, 'F');

  setFont("bold", 8);
  doc.setTextColor(100, 100, 100);
  doc.text("GUADAGNO ANNUALE", pageWidth - margin - 45, y + 8);

  setFont("bold", 14);
  doc.setTextColor(isPositive ? 16 : 239, isPositive ? 185 : 68, isPositive ? 129 : 68);
  const guadagnoText = (isPositive ? "+ " : "- ") + euro(Math.abs(risparmioNettoPdf));
  doc.text(guadagnoText, pageWidth - margin - 12, y + 21, { align: "right" });

  y += 36;

  // ─── Section 3: Two Column Layout (Waterfall | Investment Chart) ──────
  const colWidth = (contentWidth - 15) / 2;
  const colLeftX = margin + 5;
  const colRightX = margin + 10 + colWidth;
  const colHeight = 95;

  // ─── Left Column: Annual Costs Detail ─────────────────────────────────────
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(colLeftX, y, colWidth, colHeight, 4, 4, 'F');

  setFont("bold", 10);
  doc.setTextColor(50, 50, 50);
  doc.text("Dettaglio Flussi Annuali", colLeftX + 6, y + 10);

  const wfData = [
    { label: "Bolletta attuale", value: data.spesa_annua_attuale_eur, color: [239, 68, 68], prefix: "" },
    { label: "Risparmio energia", value: data.risparmio_bolletta_eur, color: [16, 185, 129], prefix: "- " },
    { label: "Ricavo GSE", value: data.ricavo_gse_eur, color: [5, 150, 105], prefix: "- " },
  ];
  if (data.detrazione_annua_eur > 0) {
    wfData.push({ label: "Detrazione fiscale", value: data.detrazione_annua_eur, color: [59, 130, 246], prefix: "- " });
  }
  wfData.push(
    { label: "Rata finanziamento", value: data.rata_annua_impianto_eur, color: [245, 158, 11], prefix: "+ " },
    { label: "NUOVA SPESA", value: Math.max(0, data.spesa_nuova_totale_eur), color: [55, 65, 81], prefix: "", isFinal: true }
  );

  let flowRowY = y + 20;
  const flowRowHeight = 12;

  wfData.forEach((item) => {
    // Color indicator dot
    doc.setFillColor(...item.color);
    doc.circle(colLeftX + 8, flowRowY - 1, 2, 'F');

    // Label
    setFont(item.isFinal ? "bold" : "normal", item.isFinal ? 9 : 8);
    doc.setTextColor(80, 80, 80);
    doc.text(item.label, colLeftX + 14, flowRowY);

    // Value - right aligned, larger and bolder
    setFont("bold", item.isFinal ? 11 : 9);
    doc.setTextColor(...item.color);
    const valueText = item.prefix + euro(item.value);
    doc.text(valueText, colLeftX + colWidth - 8, flowRowY, { align: "right" });

    flowRowY += flowRowHeight;
  });

  // ─── Right Column: Investment Return Chart ────────────────────────────
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(colRightX, y, colWidth, colHeight, 4, 4, 'F');

  setFont("bold", 10);
  doc.setTextColor(50, 50, 50);
  doc.text("Rientro Investimento", colRightX + 6, y + 10);

  let cumulative = 0;
  let breakevenYear = 25;
  for (const year of data.cashflow_anni) {
    cumulative += year.risparmio_netto_eur;
    if (cumulative > 0 && breakevenYear === 25) {
      breakevenYear = year.anno;
    }
  }

  doc.setFillColor(254, 243, 199);
  doc.roundedRect(colRightX + colWidth - 45, y + 4, 40, 10, 2, 2, 'F');
  setFont("bold", 6);
  doc.setTextColor(180, 83, 9);
  doc.text("PAREGGIO: ANNO " + breakevenYear, colRightX + colWidth - 25, y + 11, { align: "center" });

  const chartX = colRightX + 10;
  const chartY = y + 20;
  const chartW = colWidth - 20;
  const chartH = 50;

  cumulative = 0;
  const cumulativeData = data.cashflow_anni.map(yr => {
    cumulative += yr.risparmio_netto_eur;
    return cumulative;
  });
  const minCum = Math.min(0, ...cumulativeData);
  const maxCum = Math.max(0, ...cumulativeData);
  const range = maxCum - minCum || 1;

  const zeroYChart = chartY + (maxCum / range) * chartH;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.line(chartX, zeroYChart, chartX + chartW, zeroYChart);

  doc.setFillColor(167, 243, 208);
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(1.5);

  let lastX = chartX;
  let lastY = zeroYChart;

  for (let i = 0; i < cumulativeData.length; i++) {
    const x = chartX + (i / (cumulativeData.length - 1)) * chartW;
    const yVal = chartY + ((maxCum - cumulativeData[i]) / range) * chartH;

    if (i > 0) {
      doc.line(lastX, lastY, x, yVal);
    }
    lastX = x;
    lastY = yVal;
  }

  if (breakevenYear < 25) {
    const bX = chartX + ((breakevenYear - 1) / 24) * chartW;
    doc.setFillColor(245, 158, 11);
    doc.circle(bX, zeroYChart, 3, 'F');
  }

  setFont("normal", 6);
  doc.setTextColor(100, 100, 100);
  [5, 10, 15, 20, 25].forEach(yr => {
    const x = chartX + ((yr - 1) / 24) * chartW;
    doc.text("" + yr, x, chartY + chartH + 8, { align: "center" });
  });

  y += colHeight + 8;

  // ─── Section 4: Summary Cards ─────────────────────────────────────────
  const summaryWidth = (contentWidth - 15) / 2;

  const total25 = data.cashflow_anni.reduce((sum, row) => sum + row.risparmio_netto_eur, 0);
  const isTotal25Positive = total25 >= 0;

  doc.setFillColor(isTotal25Positive ? 167 : 254, isTotal25Positive ? 243 : 202, isTotal25Positive ? 208 : 202);
  doc.roundedRect(margin + 5, y, summaryWidth, 24, 4, 4, 'F');

  setFont("bold", 7);
  doc.setTextColor(isTotal25Positive ? 6 : 153, isTotal25Positive ? 95 : 27, isTotal25Positive ? 70 : 27);
  doc.text("GUADAGNO FINALE (25 ANNI)", margin + 12, y + 9);

  setFont("bold", 14);
  doc.text((isTotal25Positive ? "+ " : "- ") + euro(Math.abs(total25)), margin + 12, y + 20);

  const costoImpiantoPdf = parseFloat(prezzoImpianto) || 12000;
  const rendimentoPdf = costoImpiantoPdf > 0 ? ((total25 / costoImpiantoPdf) / 25 * 100).toFixed(1) : 0;

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin + 10 + summaryWidth, y, summaryWidth, 24, 4, 4, 'F');

  setFont("bold", 7);
  doc.setTextColor(100, 100, 100);
  doc.text("RENDIMENTO MEDIO ANNUO", margin + 17 + summaryWidth, y + 9);

  setFont("bold", 14);
  doc.setTextColor(50, 50, 50);
  doc.text(rendimentoPdf + "%", margin + 17 + summaryWidth, y + 20);

  y += 32;

  const year11 = data.cashflow_anni.find((x) => x.anno === anniFinanziamento + 1);
  if (year11) {
    setFont("normal", 9);
    doc.setTextColor(255, 255, 255);
    doc.text("Dopo il finanziamento (Anno " + (anniFinanziamento + 1) + "+): risparmio netto " + euro(year11.risparmio_netto_eur) + "/anno", margin + 10, y);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE 6: Terms & Contact
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage();

  // Add page background (clean version without white bands)
  if (pdfAssets.images.pageBaseClean) {
    addBackgroundImage(pdfAssets.images.pageBaseClean);
  }

  y = 45;

  // Notes section
  setFont("bold", 18);
  doc.setTextColor(255, 220, 100);
  doc.text("Note Importanti", margin + 5, y);
  y += 14;

  const notes = [
    "I valori indicati sono stime basate sui dati forniti e possono variare in base alle condizioni reali.",
    "La produzione effettiva dipende dall'orientamento, inclinazione e ombreggiature del tetto.",
    "Il risparmio in bolletta dipende dalle abitudini di consumo e dal profilo di utilizzo.",
    "La detrazione fiscale del 50% è soggetta alle normative vigenti al momento dell'installazione.",
    "Il preventivo ha validità di 30 giorni dalla data di emissione.",
    "I prezzi indicati sono IVA inclusa dove applicabile."
  ];

  // Calculate total height needed for notes
  let totalNotesHeight = 15;
  const noteTextLines = [];
  notes.forEach(note => {
    const lines = doc.splitTextToSize("•  " + note, contentWidth - 25);
    noteTextLines.push(lines);
    totalNotesHeight += lines.length * 6 + 4;
  });

  // Notes in white card for readability
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, contentWidth - 10, totalNotesHeight, 4, 4, 'F');

  setFont("normal", 11);
  doc.setTextColor(60, 60, 60);
  let noteY = y + 12;
  noteTextLines.forEach(lines => {
    doc.text(lines, margin + 12, noteY);
    noteY += lines.length * 6 + 4;
  });

  y += totalNotesHeight + 12;

  // Contact box
  setFont("bold", 18);
  doc.setTextColor(255, 220, 100);
  doc.text("Contattaci", margin + 5, y);
  y += 12;

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, contentWidth - 10, 55, 5, 5, 'F');

  // Add logo if available
  if (pdfAssets.images.logo) {
    doc.addImage(pdfAssets.images.logo, 'PNG', margin + 12, y + 8, 45, 16);
  } else {
    setFont("bold", 16);
    doc.setTextColor(196, 30, 58);
    doc.text("TECH SOLUTIONS", margin + 18, y + 18);
  }

  setFont("normal", 12);
  doc.setTextColor(60, 60, 60);
  doc.text("Tel: 379 113 7065", margin + 18, y + 32);
  doc.text("Email: info@gruppotech.it", margin + 18, y + 42);
  doc.text("Web: techsolutionssrl.com", margin + 18, y + 52);

  y += 70;

  // Signature area - clean white background
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, 70, 35, 4, 4, 'F');
  doc.roundedRect(pageWidth - margin - 75, y, 70, 35, 4, 4, 'F');

  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.5);
  doc.line(margin + 15, y + 25, margin + 65, y + 25);
  doc.line(pageWidth - margin - 65, y + 25, pageWidth - margin - 15, y + 25);

  setFont("normal", 10);
  doc.setTextColor(80, 80, 80);
  doc.text("Firma Cliente", margin + 40, y + 32, { align: "center" });
  doc.text("Firma Tech Solutions", pageWidth - margin - 40, y + 32, { align: "center" });

  y += 50;

  // Footer with date
  const today = new Date();
  const dateStr = today.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  setFont("italic", 10);
  doc.setTextColor(...lightText);
  doc.text("Documento generato il " + dateStr, pageWidth / 2, y, { align: "center" });

  // Save the PDF
  const fileName = `Preventivo_${clienteName.replace(/\s+/g, "_")}_${today.toISOString().split('T')[0]}.pdf`;

  // Check if datasheets should be included (from selector)
  const selectedDatasheets = getSelectedDatasheetsFromSelector("datasheetSelector");

  if (selectedDatasheets.length > 0) {
    try {
      console.log(`Merging ${selectedDatasheets.length} datasheets with quote...`);
      const quotePdfBytes = doc.output("arraybuffer");
      const mergedPdfBytes = await mergeQuoteWithDatasheets(quotePdfBytes, selectedDatasheets);
      downloadPdfBlob(mergedPdfBytes, fileName);
      console.log("PDF with datasheets generated successfully!");
      return;
    } catch (error) {
      console.error("Error merging datasheets, falling back to quote only:", error);
    }
  }

  // Fallback: save quote only
  doc.save(fileName);
}
