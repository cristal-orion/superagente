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
  calcAutoconsumo(produzione, autoconsumoPercent) {
    let kwhAutoconsumati = produzione * (autoconsumoPercent / 100.0);
    kwhAutoconsumati = Math.min(Math.max(kwhAutoconsumati, 0.0), produzione);
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
    if (capitaleFinanziato === 0) {
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
      request.autoconsumo_percent
    );

    let risparmio = kwhAutoconsumati * request.prezzo_energia_eur_kwh;
    let ricavoGse = this.calcGse(kwhImmessi, request.prezzo_gse_eur_kwh);

    // Applica fattore di prudenza
    risparmio *= request.fattore_prudenza;
    ricavoGse *= request.fattore_prudenza;

    const costoNetto = rataAnnua - detrazioneAnnua - risparmio - ricavoGse;
    const delta = costoNetto - spesaAttuale;

    let messaggio;
    if (delta <= 0) {
      messaggio = "Paghi uguale o meno già da subito (stimato).";
    } else {
      messaggio = `Paghi circa ${Math.round(delta)}€ in più all'anno (stimato).`;
    }

    // Genera cashflow 25 anni
    const cashflowAnni = [];
    for (let anno = 1; anno <= 25; anno++) {
      const rata = anno <= request.anni_finanziamento ? rataAnnua : 0.0;
      const detrazione = anno <= request.anni_detrazione ? detrazioneAnnua : 0.0;
      const costo = rata - detrazione - risparmio - ricavoGse;
      cashflowAnni.push({ anno, costo_netto_eur: costo });
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

const API_URL = "http://localhost:8000/calc";
const CATALOG_URL = "./catalog.json";
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
let selectedTermMonths = null;
let lastResponse = null;

// ═══════════════════════════════════════════════════════════════════════════
// Datasheet Module - Backend-based PDF Management with Drag & Drop
// ═══════════════════════════════════════════════════════════════════════════

const DATASHEETS_API_URL = "http://localhost:8000";

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
    html += `<div class="selector-category">
      <div class="selector-category-label">
        <span>${catInfo.icon}</span>
        <span>${catInfo.label}</span>
      </div>
      <div class="selector-items">`;

    for (const item of items) {
      html += `<label class="selector-item">
        <input type="checkbox" value="${item.url}" data-name="${item.name}" />
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

const CATALOG_EXPORT_URL = "http://localhost:8000/catalog/export";
const CATALOG_IMPORT_URL = "http://localhost:8000/catalog/import";

function initCatalogManagement() {
  const downloadBtn = document.getElementById("downloadCatalogBtn");
  const dropzone = document.getElementById("catalogDropzone");
  const fileInput = document.getElementById("catalogFileInput");
  const statusDiv = document.getElementById("catalogStatus");

  if (!downloadBtn || !dropzone || !fileInput) return;

  // Download button
  downloadBtn.addEventListener("click", () => {
    showCatalogStatus("Scaricamento in corso...", "info");
    window.location.href = CATALOG_EXPORT_URL;
    setTimeout(() => {
      showCatalogStatus("", "");
    }, 2000);
  });

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
  const res = await fetch(CATALOG_URL, { cache: "no-store" });
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

function populateModels() {
  const sel = document.getElementById("modello_impianto");
  sel.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Seleziona…";
  sel.appendChild(opt0);

  const grouped = groupByCategory(catalog || []);
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

  sel.addEventListener("change", () => {
    const id = sel.value;
    selectedOffer = (catalog || []).find((x) => x.id === id) || null;
    selectedTermMonths = null;
    populateTerms(selectedOffer);
    applySelectedOffer();
    debounceRecalc();
  });
}

function populateTerms(offer) {
  const sel = document.getElementById("piano_rate_mesi");
  sel.innerHTML = "";

  if (!offer) {
    sel.disabled = true;
    return;
  }

  const terms = Object.keys(offer.rate_mensili_eur || {})
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);

  for (const months of terms) {
    const opt = document.createElement("option");
    opt.value = String(months);
    const monthly = offer.rate_mensili_eur[String(months)];
    const taeg = offer.taeg_annuo_percent_by_term?.[String(months)];
    opt.textContent = `${months} mesi — ${euroMonthly(monthly)}/mese${taeg ? ` (TAEG ${taeg}%)` : ""}`;
    sel.appendChild(opt);
  }

  sel.disabled = terms.length === 0;
  if (terms.length > 0) {
    selectedTermMonths = terms.includes(120) ? 120 : terms[0];
    sel.value = String(selectedTermMonths);
  }

  sel.onchange = () => {
    selectedTermMonths = Number(sel.value);
    applySelectedOffer();
    debounceRecalc();
  };
}

function applySelectedOffer() {
  // Note: populateTerms is called separately when model changes, not here
  // to avoid resetting the dropdown when user changes the term

  if (!selectedOffer || !selectedTermMonths) {
    return;
  }

  setValue("costo_impianto_eur", selectedOffer.prezzo_eur);
  setValue("produzione_annua_kwh", selectedOffer.potenza_kw * KWH_PER_KW_PER_YEAR);

  const years = selectedTermMonths / 12;
  setValue("anni_finanziamento", years);

  const taeg = selectedOffer.taeg_annuo_percent_by_term?.[String(selectedTermMonths)];
  if (taeg && Number.isFinite(Number(taeg)) && Number(taeg) > 0) {
    setChecked("usa_rata_semplice", false);
    setValue("taeg_annuo_percent", taeg);
  }
}

function financedAmount() {
  const price = selectedOffer ? Number(selectedOffer.prezzo_eur) : null;
  if (!Number.isFinite(price)) return null;
  const anticipo = numberValue("anticipo_eur");
  if (!Number.isFinite(anticipo) || anticipo < 0) return price;
  return Math.max(price - anticipo, 0);
}

// ─── Payload Builder ───────────────────────────────────────────────────────
function buildPayload() {
  const monthlyFromCatalog =
    selectedOffer && selectedTermMonths
      ? Number(selectedOffer.rate_mensili_eur?.[String(selectedTermMonths)])
      : null;

  const financed = selectedOffer && selectedTermMonths ? financedAmount() : null;
  const taeg = selectedOffer?.taeg_annuo_percent_by_term?.[String(selectedTermMonths)] ?? null;

  let override = null;
  let costoFinanziato = null;
  let usaRataSemplice = boolValue("usa_rata_semplice");
  let taegPercent = numberValue("taeg_annuo_percent");

  if (selectedOffer && selectedTermMonths) {
    const fullPrice = Number(selectedOffer.prezzo_eur);
    const financedSafe = Number.isFinite(financed) ? financed : fullPrice;
    costoFinanziato = financedSafe;

    if (financedSafe === 0) {
      override = 0;
    } else if (taeg && Number.isFinite(Number(taeg)) && Number(taeg) > 0) {
      usaRataSemplice = false;
      taegPercent = Number(taeg);
      override = null;
    } else if (monthlyFromCatalog && Number.isFinite(monthlyFromCatalog) && monthlyFromCatalog > 0 && fullPrice > 0) {
      override = monthlyFromCatalog * (financedSafe / fullPrice);
    }
  }

  return {
    consumo_annuo_kwh: numberValue("consumo_annuo_kwh"),
    prezzo_energia_eur_kwh: numberValue("prezzo_energia_eur_kwh"),

    costo_impianto_eur: numberValue("costo_impianto_eur"),
    costo_finanziato_eur: costoFinanziato,
    anni_finanziamento: Math.trunc(numberValue("anni_finanziamento")),
    usa_rata_semplice: usaRataSemplice,
    taeg_annuo_percent: taegPercent,
    rata_mensile_override_eur: override,

    produzione_annua_kwh: numberValue("produzione_annua_kwh"),
    autoconsumo_percent: numberValue("autoconsumo_percent"),

    prezzo_gse_eur_kwh: numberValue("prezzo_gse_eur_kwh"),

    aliquota_detrazione_percent: numberValue("aliquota_detrazione_percent"),
    anni_detrazione: Math.trunc(numberValue("anni_detrazione")),

    fattore_prudenza: numberValue("fattore_prudenza"),
  };
}

// ─── Render Results ────────────────────────────────────────────────────────
function render(response) {
  lastResponse = response;

  // Hero values
  const delta = response.delta_vs_spesa_attuale_eur;
  const heroValue = document.getElementById("delta");
  const heroNumber = heroValue.querySelector(".hero-number");
  const heroMessage = document.getElementById("messaggio");

  heroNumber.textContent = euroNumber(Math.abs(delta));

  if (delta <= 0) {
    heroValue.classList.remove("negative");
    heroMessage.classList.remove("negative");
  } else {
    heroValue.classList.add("negative");
    heroMessage.classList.add("negative");
  }

  heroMessage.textContent = response.messaggio;

  // Comparison values
  document.getElementById("spesa_attuale").textContent = euro(response.spesa_annua_attuale_eur);
  document.getElementById("costo_netto").textContent = euro(response.costo_netto_annuo_eur);

  // Stats cards
  document.getElementById("rata").textContent = euro(response.rata_annua_impianto_eur);
  document.getElementById("detrazione").textContent = euro(response.detrazione_annua_eur);
  document.getElementById("risparmio").textContent = euro(response.risparmio_bolletta_eur);
  document.getElementById("ricavo_gse").textContent = euro(response.ricavo_gse_eur);

  // Anno 11 badge
  const year11 = response.cashflow_anni.find((x) => x.anno === 11);
  const anno11El = document.getElementById("anno11");
  anno11El.textContent = year11 ? euro(year11.costo_netto_eur) : "—";

  // Detailed table
  renderCashflowTable(response);

  // Charts
  drawCharts(response);

  // Animation
  heroValue.classList.add("value-updated");
  setTimeout(() => heroValue.classList.remove("value-updated"), 300);
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

function renderLegend(segments) {
  const el = document.getElementById("pieLegend");
  el.innerHTML = "";

  for (const seg of segments) {
    const item = document.createElement("div");
    item.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = seg.color;

    const label = document.createElement("span");
    label.className = "legend-label";
    label.textContent = seg.name;

    const value = document.createElement("span");
    value.className = "legend-value";
    value.textContent = euro(seg.value);

    item.appendChild(swatch);
    item.appendChild(label);
    item.appendChild(value);
    el.appendChild(item);
  }
}

function drawCharts(response) {
  const pie = document.getElementById("pieBreakdown");
  const bars = document.getElementById("cashflowChart");

  const segmentsRaw = [
    { name: "Rata annua", value: Math.max(0, Number(response.rata_annua_impianto_eur) || 0), color: COLORS.chart.rata },
    { name: "Detrazione", value: Math.max(0, Number(response.detrazione_annua_eur) || 0), color: COLORS.chart.detrazione },
    { name: "Risparmio", value: Math.max(0, Number(response.risparmio_bolletta_eur) || 0), color: COLORS.chart.risparmio },
    { name: "Ricavo GSE", value: Math.max(0, Number(response.ricavo_gse_eur) || 0), color: COLORS.chart.gse },
  ];
  const segments = segmentsRaw.filter((s) => s.value > 0.0001);

  drawDonut(pie, segments);
  renderLegend(segments);
  drawCashflowBars(bars, response.cashflow_anni || []);
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
      ["costo_impianto_eur", "anni_finanziamento", "taeg_annuo_percent", "usa_rata_semplice"].includes(id)
    ) {
      selectedOffer = null;
      selectedTermMonths = null;
      const modelSel = document.getElementById("modello_impianto");
      modelSel.value = "";
      populateTerms(null);
    }
    debounceRecalc();
  });

  form.addEventListener("change", debounceRecalc);
  debounceRecalc();
}

// ─── Initialization ────────────────────────────────────────────────────────
async function init() {
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
    setStatus("Impossibile caricare il listino (catalog.json).");
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

    // Pre-populate from main calculator if a system is selected
    if (selectedOffer) {
      // Find and check the corresponding checkbox (id format: manual-{item.id})
      const checkbox = document.getElementById(`manual-${selectedOffer.id}`);
      if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        // Add selected class to parent item
        const itemDiv = checkbox.closest('.multi-select-item');
        if (itemDiv) {
          itemDiv.classList.add('selected');
        }
        // Add to selectedManualSystems if not already present
        if (!selectedManualSystems.find(s => s.id === selectedOffer.id)) {
          selectedManualSystems.push(selectedOffer);
        }
      }

      // Pre-fill financing duration from main form
      const anniFinanziamento = numberValue("anni_finanziamento");
      if (anniFinanziamento) {
        document.getElementById("manualAnniFinanziamento").value = anniFinanziamento;
      }

      // Pre-fill TAEG from main form
      const taeg = numberValue("taeg_annuo_percent");
      if (taeg) {
        document.getElementById("manualTaegPercent").value = taeg;
      }

      // Update summary and total price
      updateManualSummary();
    }

    // If we have calculation data, suggest including savings
    const savingsCheckbox = document.getElementById("includeSavingsCalc");
    if (savingsCheckbox && lastResponse) {
      // Don't auto-check, but user can choose
      // Just ensure checkbox is visible/enabled
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

  // Populate multi-select with systems grouped by category
  const grouped = groupByCategory(catalog);
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

  await generateManualPDF(clienteName, clienteIndirizzo, clienteNote, selectedManualSystems, paymentType, anniFinanziamento, taegPercent, customTotalPrice, ivaType, includeSavings, lastResponse);

  // Close modal after generating
  const modal = document.getElementById("manualQuoteModal");
  if (modal) modal.classList.remove("active");
}

// ─── Generate Manual PDF ────────────────────────────────────────────────────
async function generateManualPDF(clienteName, clienteIndirizzo, clienteNote, systems, paymentType, anniFinanziamento, taegPercent = 0, customTotalPrice = 0, ivaType = "inclusa", includeSavings = false, savingsData = null) {
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

  // Calculate totals
  // Use custom total price if provided, otherwise sum from systems
  const systemsTotal = systems.reduce((sum, s) => sum + Number(s.prezzo_eur), 0);
  const totalPriceBase = customTotalPrice > 0 ? customTotalPrice : systemsTotal;

  // IVA calculation: catalog prices are IVA inclusa (10%)
  // If user selects "esclusa", we show the price without IVA
  const IVA_RATE = 0.10;
  let totalPrice, ivaLabel;
  if (ivaType === "esclusa") {
    totalPrice = Math.round(totalPriceBase / (1 + IVA_RATE));
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
  doc.text("Egregio Sig. " + clienteName, 27, 287);

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
    doc.setTextColor(196, 30, 58);
    doc.text(euro(sys.prezzo_eur), pageWidth - margin - 18, y + 14, { align: "right" });

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
    doc.setTextColor(196, 30, 58);
    const rataText = taegPercent > 0
      ? euroMonthly(rataMensile) + " (TAEG " + taegPercent + "%)"
      : euroMonthly(rataMensile);
    doc.text(rataText, pageWidth - margin - 18, y + 16, { align: "right" });

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
    doc.setTextColor(196, 30, 58);
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
  // OPTIONAL: Economic Analysis Page (if includeSavings is true)
  // ═══════════════════════════════════════════════════════════════════════
  if (includeSavings && savingsData) {
    doc.addPage();

    if (pdfAssets.images.pageBaseClean) {
      addBackgroundImage(pdfAssets.images.pageBaseClean);
    }

    y = 45;

    // Section title
    setFont("bold", 20);
    doc.setTextColor(255, 220, 100);
    doc.text("Analisi Economica", margin + 5, y);
    y += 18;

    // Current situation box
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, y, contentWidth - 10, 28, 4, 4, 'F');

    setFont("bold", 13);
    doc.setTextColor(59, 82, 128);
    doc.text("Spesa energetica annua attuale:", margin + 12, y + 12);

    setFont("bold", 18);
    doc.setTextColor(196, 30, 58);
    doc.text(euro(savingsData.spesa_annua_attuale_eur), pageWidth - margin - 18, y + 12, { align: "right" });

    setFont("normal", 11);
    doc.setTextColor(100, 100, 100);
    doc.text("(prima dell'installazione del fotovoltaico)", margin + 12, y + 22);

    y += 38;

    // Financial breakdown
    setFont("bold", 14);
    doc.setTextColor(...white);
    doc.text("Dettaglio costi e benefici annui:", margin + 5, y);
    y += 12;

    const savingsFinancialItems = [
      { label: "Rata annua finanziamento (" + anniFinanziamento + " anni)", value: euro(savingsData.rata_annua_impianto_eur), isNegative: true },
      { label: "Detrazione fiscale annua (recupero IRPEF)", value: "- " + euro(savingsData.detrazione_annua_eur), isNegative: false },
      { label: "Risparmio in bolletta (autoconsumo)", value: "- " + euro(savingsData.risparmio_bolletta_eur), isNegative: false },
      { label: "Ricavo vendita energia al GSE", value: "- " + euro(savingsData.ricavo_gse_eur), isNegative: false }
    ];

    savingsFinancialItems.forEach((item) => {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 5, y, contentWidth - 10, 16, 3, 3, 'F');

      setFont("normal", 11);
      doc.setTextColor(60, 60, 60);
      doc.text(item.label, margin + 12, y + 11);

      setFont("bold", 12);
      doc.setTextColor(item.isNegative ? 196 : 39, item.isNegative ? 30 : 174, item.isNegative ? 58 : 96);
      doc.text(item.value, pageWidth - margin - 18, y + 11, { align: "right" });

      y += 19;
    });

    y += 12;

    // Result box
    const delta = savingsData.delta_vs_spesa_attuale_eur;
    const isPositiveSavings = delta <= 0;

    doc.setFillColor(isPositiveSavings ? 39 : 196, isPositiveSavings ? 174 : 30, isPositiveSavings ? 96 : 58);
    doc.roundedRect(margin + 5, y, contentWidth - 10, 40, 5, 5, 'F');

    setFont("bold", 13);
    doc.setTextColor(...white);
    doc.text("COSTO NETTO ANNUO CON FOTOVOLTAICO:", margin + 12, y + 14);

    setFont("bold", 22);
    doc.text(euro(savingsData.costo_netto_annuo_eur), pageWidth - margin - 18, y + 14, { align: "right" });

    setFont("bold", 12);
    doc.text(isPositiveSavings ? "RISPARMIO RISPETTO AD OGGI:" : "DIFFERENZA:", margin + 12, y + 30);

    setFont("bold", 16);
    const savingsDeltaText = isPositiveSavings
      ? euro(Math.abs(delta)) + " ALL'ANNO!"
      : euro(delta) + " all'anno";
    doc.text(savingsDeltaText, pageWidth - margin - 18, y + 30, { align: "right" });

    y += 50;

    // After financing box
    const yearAfterFinancing = savingsData.cashflow_anni.find((x) => x.anno === anniFinanziamento + 1);
    if (yearAfterFinancing) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 5, y, contentWidth - 10, 30, 4, 4, 'F');

      setFont("bold", 12);
      doc.setTextColor(59, 82, 128);
      doc.text("DOPO IL FINANZIAMENTO (Anno " + (anniFinanziamento + 1) + " in poi):", margin + 12, y + 12);

      setFont("bold", 14);
      doc.setTextColor(39, 174, 96);
      doc.text("Risparmio netto: " + euro(Math.abs(yearAfterFinancing.costo_netto_eur)) + "/anno", margin + 12, y + 24);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OPTIONAL: 25-Year Projection Page
    // ═══════════════════════════════════════════════════════════════════════
    doc.addPage();

    if (pdfAssets.images.pageBaseClean) {
      addBackgroundImage(pdfAssets.images.pageBaseClean);
    }

    y = 45;

    // Section title
    setFont("bold", 20);
    doc.setTextColor(255, 220, 100);
    doc.text("Proiezione a 25 Anni", margin + 5, y);
    y += 20;

    // Visual bar chart for key years
    const keyYears = [1, 5, 10, 15, 20, 25];
    const chartHeight = 100;
    const chartStartY = y;
    const barWidth = 22;
    const chartLeftMargin = margin + 25;
    const barSpacing = (contentWidth - 50) / keyYears.length;

    // Find max absolute value for scaling
    const keyYearData = keyYears.map(yr => savingsData.cashflow_anni.find(r => r.anno === yr));
    const maxAbsValue = Math.max(...keyYearData.map(d => Math.abs(d?.costo_netto_eur || 0)), 100);

    // Draw chart background
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, y, contentWidth - 10, chartHeight + 70, 5, 5, 'F');

    // Draw zero line
    const zeroLineY = chartStartY + 25 + chartHeight / 2;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.5);
    doc.line(chartLeftMargin - 10, zeroLineY, pageWidth - margin - 20, zeroLineY);

    // Draw bars for key years
    keyYears.forEach((yr, i) => {
      const yearData = savingsData.cashflow_anni.find(r => r.anno === yr);
      if (!yearData) return;

      const value = yearData.costo_netto_eur;
      const barX = chartLeftMargin + i * barSpacing;
      const barHeight = Math.abs(value) / maxAbsValue * (chartHeight / 2 - 10);
      const isNegativeBar = value <= 0;

      // Bar color
      if (isNegativeBar) {
        doc.setFillColor(39, 174, 96);
      } else {
        doc.setFillColor(196, 30, 58);
      }

      // Draw bar
      if (isNegativeBar) {
        doc.roundedRect(barX, zeroLineY - barHeight, barWidth, barHeight, 2, 2, 'F');
      } else {
        doc.roundedRect(barX, zeroLineY, barWidth, barHeight, 2, 2, 'F');
      }

      // Year label
      setFont("bold", 11);
      doc.setTextColor(60, 60, 60);
      doc.text("Anno " + yr, barX + barWidth / 2, chartStartY + chartHeight + 35, { align: "center" });

      // Value label
      setFont("normal", 9);
      doc.setTextColor(isNegativeBar ? 39 : 196, isNegativeBar ? 174 : 30, isNegativeBar ? 96 : 58);
      const valueY = isNegativeBar ? zeroLineY - barHeight - 5 : zeroLineY + barHeight + 10;
      doc.text(euro(value), barX + barWidth / 2, valueY, { align: "center" });
    });

    // Legend
    const legendY = chartStartY + chartHeight + 50;

    doc.setFillColor(39, 174, 96);
    doc.rect(margin + 45, legendY, 12, 8, 'F');
    setFont("bold", 11);
    doc.setTextColor(60, 60, 60);
    doc.text("Risparmio", margin + 62, legendY + 6);

    doc.setFillColor(196, 30, 58);
    doc.rect(margin + 115, legendY, 12, 8, 'F');
    doc.text("Costo", margin + 132, legendY + 6);

    y = chartStartY + chartHeight + 80;

    // 25-year total summary box
    const total25 = savingsData.cashflow_anni.reduce((sum, row) => sum + row.costo_netto_eur, 0);

    doc.setFillColor(total25 <= 0 ? 39 : 196, total25 <= 0 ? 174 : 30, total25 <= 0 ? 96 : 58);
    doc.roundedRect(margin + 5, y, contentWidth - 10, 35, 5, 5, 'F');

    setFont("bold", 14);
    doc.setTextColor(...white);
    doc.text("BILANCIO TOTALE 25 ANNI:", margin + 15, y + 15);

    setFont("bold", 20);
    const total25Label = total25 <= 0
      ? "RISPARMIO: " + euro(Math.abs(total25))
      : "COSTO: " + euro(total25);
    doc.text(total25Label, pageWidth - margin - 18, y + 23, { align: "right" });
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
  doc.text("Tel: 800 123 456 (numero verde)", margin + 18, y + 32);
  doc.text("Email: info@techsolutions.it", margin + 18, y + 42);
  doc.text("Web: www.techsolutions.it", margin + 18, y + 52);

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
  doc.setTextColor(196, 30, 58);
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
  const taegPercent = selectedOffer?.taeg_annuo_percent_by_term?.[String(selectedTermMonths)] || "";

  setFont("bold", 18);
  doc.setTextColor(196, 30, 58);
  doc.text(euroMonthly(rataMensile) + (taegPercent ? " (TAEG " + taegPercent + "%)" : ""), pageWidth - margin - 18, y + 16, { align: "right" });

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
  // PAGE 4: Economic Analysis
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
  doc.text("Analisi Economica", margin + 5, y);
  y += 18;

  // Current situation box - white background for readability
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, contentWidth - 10, 28, 4, 4, 'F');

  setFont("bold", 13);
  doc.setTextColor(59, 82, 128);
  doc.text("Spesa energetica annua attuale:", margin + 12, y + 12);

  setFont("bold", 18);
  doc.setTextColor(196, 30, 58);
  doc.text(euro(data.spesa_annua_attuale_eur), pageWidth - margin - 18, y + 12, { align: "right" });

  setFont("normal", 11);
  doc.setTextColor(100, 100, 100);
  doc.text("(prima dell'installazione del fotovoltaico)", margin + 12, y + 22);

  y += 38;

  // Financial breakdown - clean white cards
  setFont("bold", 14);
  doc.setTextColor(...white);
  doc.text("Dettaglio costi e benefici annui:", margin + 5, y);
  y += 12;

  const financialItems = [
    { label: "Rata annua finanziamento (" + anniFinanziamento + " anni)", value: euro(data.rata_annua_impianto_eur), isNegative: true },
    { label: "Detrazione fiscale annua (recupero IRPEF)", value: "- " + euro(data.detrazione_annua_eur), isNegative: false },
    { label: "Risparmio in bolletta (autoconsumo)", value: "- " + euro(data.risparmio_bolletta_eur), isNegative: false },
    { label: "Ricavo vendita energia al GSE", value: "- " + euro(data.ricavo_gse_eur), isNegative: false }
  ];

  financialItems.forEach((item, i) => {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, y, contentWidth - 10, 16, 3, 3, 'F');

    setFont("normal", 11);
    doc.setTextColor(60, 60, 60);
    doc.text(item.label, margin + 12, y + 11);

    setFont("bold", 12);
    doc.setTextColor(item.isNegative ? 196 : 39, item.isNegative ? 30 : 174, item.isNegative ? 58 : 96);
    doc.text(item.value, pageWidth - margin - 18, y + 11, { align: "right" });

    y += 19;
  });

  y += 12;

  // Result box
  const delta = data.delta_vs_spesa_attuale_eur;
  const isPositive = delta <= 0;

  doc.setFillColor(isPositive ? 39 : 196, isPositive ? 174 : 30, isPositive ? 96 : 58);
  doc.roundedRect(margin + 5, y, contentWidth - 10, 40, 5, 5, 'F');

  setFont("bold", 13);
  doc.setTextColor(...white);
  doc.text("COSTO NETTO ANNUO CON FOTOVOLTAICO:", margin + 12, y + 14);

  setFont("bold", 22);
  doc.text(euro(data.costo_netto_annuo_eur), pageWidth - margin - 18, y + 14, { align: "right" });

  setFont("bold", 12);
  doc.text(isPositive ? "RISPARMIO RISPETTO AD OGGI:" : "DIFFERENZA:", margin + 12, y + 30);

  setFont("bold", 16);
  const deltaText = isPositive
    ? euro(Math.abs(delta)) + " ALL'ANNO!"
    : euro(delta) + " all'anno";
  doc.text(deltaText, pageWidth - margin - 18, y + 30, { align: "right" });

  y += 50;

  // After financing box - clean white style
  const year11 = data.cashflow_anni.find((x) => x.anno === anniFinanziamento + 1);
  if (year11) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 5, y, contentWidth - 10, 30, 4, 4, 'F');

    setFont("bold", 12);
    doc.setTextColor(59, 82, 128);
    doc.text("DOPO IL FINANZIAMENTO (Anno " + (anniFinanziamento + 1) + " in poi):", margin + 12, y + 12);

    setFont("bold", 14);
    doc.setTextColor(39, 174, 96);
    doc.text("Risparmio netto: " + euro(Math.abs(year11.costo_netto_eur)) + "/anno", margin + 12, y + 24);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PAGE 5: 25-Year Cashflow Summary (Visual Chart)
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
  doc.text("Proiezione a 25 Anni", margin + 5, y);
  y += 20;

  // Visual bar chart for key years
  const keyYears = [1, 5, 10, 15, 20, 25];
  const chartHeight = 100;
  const chartStartY = y;
  const barWidth = 22;
  const chartLeftMargin = margin + 25;
  const barSpacing = (contentWidth - 50) / keyYears.length;

  // Find max absolute value for scaling
  const keyYearData = keyYears.map(yr => data.cashflow_anni.find(r => r.anno === yr));
  const maxAbsValue = Math.max(...keyYearData.map(d => Math.abs(d?.costo_netto_eur || 0)), 100);

  // Draw chart background (includes legend area)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, contentWidth - 10, chartHeight + 70, 5, 5, 'F');

  // Draw zero line
  const zeroLineY = chartStartY + 25 + chartHeight / 2;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.5);
  doc.line(chartLeftMargin - 10, zeroLineY, pageWidth - margin - 20, zeroLineY);

  // Draw bars for key years
  keyYears.forEach((yr, i) => {
    const yearData = data.cashflow_anni.find(r => r.anno === yr);
    if (!yearData) return;

    const value = yearData.costo_netto_eur;
    const barX = chartLeftMargin + i * barSpacing;
    const barHeight = Math.abs(value) / maxAbsValue * (chartHeight / 2 - 10);
    const isNegative = value <= 0; // Negative = savings = green

    // Bar color
    if (isNegative) {
      doc.setFillColor(39, 174, 96); // Green for savings
    } else {
      doc.setFillColor(196, 30, 58); // Red for costs
    }

    // Draw bar (above or below zero line)
    if (isNegative) {
      doc.roundedRect(barX, zeroLineY - barHeight, barWidth, barHeight, 2, 2, 'F');
    } else {
      doc.roundedRect(barX, zeroLineY, barWidth, barHeight, 2, 2, 'F');
    }

    // Year label
    setFont("bold", 11);
    doc.setTextColor(60, 60, 60);
    doc.text("Anno " + yr, barX + barWidth / 2, chartStartY + chartHeight + 35, { align: "center" });

    // Value label
    setFont("normal", 9);
    doc.setTextColor(isNegative ? 39 : 196, isNegative ? 174 : 30, isNegative ? 96 : 58);
    const valueY = isNegative ? zeroLineY - barHeight - 5 : zeroLineY + barHeight + 10;
    doc.text(euro(value), barX + barWidth / 2, valueY, { align: "center" });
  });

  // Legend - inside the same white box
  const legendY = chartStartY + chartHeight + 50;

  doc.setFillColor(39, 174, 96);
  doc.rect(margin + 45, legendY, 12, 8, 'F');
  setFont("bold", 11);
  doc.setTextColor(60, 60, 60);
  doc.text("Risparmio", margin + 62, legendY + 6);

  doc.setFillColor(196, 30, 58);
  doc.rect(margin + 115, legendY, 12, 8, 'F');
  doc.text("Costo", margin + 132, legendY + 6);

  y = chartStartY + chartHeight + 80;

  // 25-year total summary box
  const total25 = data.cashflow_anni.reduce((sum, row) => sum + row.costo_netto_eur, 0);

  doc.setFillColor(total25 <= 0 ? 39 : 196, total25 <= 0 ? 174 : 30, total25 <= 0 ? 96 : 58);
  doc.roundedRect(margin + 5, y, contentWidth - 10, 35, 5, 5, 'F');

  setFont("bold", 14);
  doc.setTextColor(...white);
  doc.text("BILANCIO TOTALE 25 ANNI:", margin + 15, y + 15);

  setFont("bold", 20);
  const totalLabel = total25 <= 0
    ? "RISPARMIO: " + euro(Math.abs(total25))
    : "COSTO: " + euro(total25);
  doc.text(totalLabel, pageWidth - margin - 18, y + 23, { align: "right" });

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
  doc.text("Tel: 800 123 456 (numero verde)", margin + 18, y + 32);
  doc.text("Email: info@techsolutions.it", margin + 18, y + 42);
  doc.text("Web: www.techsolutions.it", margin + 18, y + 52);

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
