from __future__ import annotations

from pydantic import BaseModel, Field


class CalcRequest(BaseModel):
    consumo_annuo_kwh: float = Field(..., gt=0)
    prezzo_energia_eur_kwh: float = Field(0.30, gt=0)
    quota_fissa_annua_eur: float = Field(0.0, ge=0)

    costo_impianto_eur: float = Field(..., gt=0)
    costo_finanziato_eur: float | None = Field(
        None,
        ge=0,
        description="Se valorizzato, viene usato per calcolare le rate (detrazione resta sul costo impianto).",
    )
    anni_finanziamento: int = Field(10, ge=1, le=30)
    usa_rata_semplice: bool = Field(True)
    taeg_annuo_percent: float = Field(0.0, ge=0)

    produzione_annua_kwh: float = Field(..., gt=0)
    autoconsumo_percent: float = Field(40.0, ge=0, le=100)

    prezzo_gse_eur_kwh: float = Field(0.10, ge=0)

    aliquota_detrazione_percent: float = Field(50.0, ge=0, le=100)
    anni_detrazione: int = Field(10, ge=1, le=20)

    fattore_prudenza: float = Field(1.0, ge=0.5, le=1.2)
    rata_mensile_override_eur: float | None = Field(
        None,
        ge=0,
        description="Se valorizzata, forza la rata mensile (rata annua = rata_mensile*12).",
    )


class CashflowYear(BaseModel):
    anno: int = Field(..., ge=1)
    costo_netto_eur: float


class CalcResponse(BaseModel):
    spesa_annua_attuale_eur: float
    rata_annua_impianto_eur: float
    detrazione_annua_eur: float
    kwh_autoconsumati: float
    kwh_immessi: float
    risparmio_bolletta_eur: float
    ricavo_gse_eur: float
    costo_netto_annuo_eur: float
    delta_vs_spesa_attuale_eur: float
    messaggio: str
    cashflow_anni: list[CashflowYear]
