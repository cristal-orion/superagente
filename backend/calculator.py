from __future__ import annotations

import math

from models import CalcRequest, CalcResponse, CashflowYear


def calc_spesa_annua_attuale(consumo: float, prezzo: float) -> float:
    return consumo * prezzo


def calc_rata_annua_semplice(costo: float, anni: float) -> float:
    return costo / anni


def calc_rata_annua_con_taeg(costo: float, anni: float, taeg_percent: float) -> float:
    if taeg_percent <= 0:
        return calc_rata_annua_semplice(costo, anni)

    r_mensile = (taeg_percent / 100.0) / 12.0
    n_mesi = round(anni * 12)

    if r_mensile == 0:
        return calc_rata_annua_semplice(costo, anni)

    rata_mensile = costo * r_mensile / (1.0 - (1.0 + r_mensile) ** (-n_mesi))
    return rata_mensile * 12.0


def calc_detrazione_annua(costo: float, aliquota_percent: float, anni_detrazione: int) -> float:
    return (costo * (aliquota_percent / 100.0)) / anni_detrazione


def calc_autoconsumo(produzione: float, autoconsumo_percent: float, consumo_annuo: float) -> tuple[float, float]:
    kwh_autoconsumati = produzione * (autoconsumo_percent / 100.0)
    kwh_autoconsumati = min(max(kwh_autoconsumati, 0.0), produzione, consumo_annuo)
    kwh_immessi = max(produzione - kwh_autoconsumati, 0.0)
    return kwh_autoconsumati, kwh_immessi


def calc_gse(kwh_immessi: float, prezzo_gse: float) -> float:
    return kwh_immessi * prezzo_gse


def calc_response(request: CalcRequest) -> CalcResponse:
    spesa_attuale = calc_spesa_annua_attuale(
        request.consumo_annuo_kwh,
        request.prezzo_energia_eur_kwh,
    )

    capitale_finanziato = (
        request.costo_finanziato_eur
        if request.costo_finanziato_eur is not None
        else request.costo_impianto_eur
    )
    capitale_finanziato = max(capitale_finanziato, 0.0)

    # Use mesi_finanziamento if provided, otherwise fall back to anni_finanziamento
    if request.mesi_finanziamento is not None:
        anni_fin = request.mesi_finanziamento / 12.0
    else:
        anni_fin = float(request.anni_finanziamento)

    if capitale_finanziato == 0 or anni_fin <= 0:
        rata_annua = 0.0
    elif request.rata_mensile_override_eur is not None and request.rata_mensile_override_eur > 0:
        rata_annua = request.rata_mensile_override_eur * 12.0
    elif request.usa_rata_semplice:
        rata_annua = calc_rata_annua_semplice(capitale_finanziato, anni_fin)
    else:
        rata_annua = calc_rata_annua_con_taeg(
            capitale_finanziato, anni_fin, request.taeg_annuo_percent
        )

    detrazione_annua = calc_detrazione_annua(
        request.costo_impianto_eur, request.aliquota_detrazione_percent, request.anni_detrazione
    )

    kwh_autoconsumati, kwh_immessi = calc_autoconsumo(
        request.produzione_annua_kwh, request.autoconsumo_percent, request.consumo_annuo_kwh
    )

    risparmio = kwh_autoconsumati * request.prezzo_energia_eur_kwh
    ricavo_gse = calc_gse(kwh_immessi, request.prezzo_gse_eur_kwh)

    risparmio *= request.fattore_prudenza
    ricavo_gse *= request.fattore_prudenza

    costo_netto = rata_annua - detrazione_annua - risparmio - ricavo_gse
    delta = costo_netto - spesa_attuale

    # New correct formula
    bolletta_residua = (request.consumo_annuo_kwh - kwh_autoconsumati) * request.prezzo_energia_eur_kwh
    spesa_nuova = bolletta_residua + rata_annua - detrazione_annua - ricavo_gse
    risparmio_netto = spesa_attuale - spesa_nuova  # = risparmio + detrazione + ricavo_gse - rata

    if risparmio_netto >= 0:
        messaggio = f"Risparmi circa {risparmio_netto:.0f}€ all'anno (stimato)."
    else:
        messaggio = f"Paghi circa {abs(risparmio_netto):.0f}€ in più all'anno (stimato)."

    anni_fin_ceil = math.ceil(anni_fin)

    cashflow_anni: list[CashflowYear] = []
    for anno in range(1, 26):
        rata = rata_annua if anno <= anni_fin_ceil else 0.0
        detrazione = detrazione_annua if anno <= request.anni_detrazione else 0.0
        costo = rata - detrazione - risparmio - ricavo_gse
        rn = risparmio + detrazione + ricavo_gse - rata
        cashflow_anni.append(CashflowYear(anno=anno, costo_netto_eur=costo, risparmio_netto_eur=rn))

    return CalcResponse(
        spesa_annua_attuale_eur=spesa_attuale,
        rata_annua_impianto_eur=rata_annua,
        detrazione_annua_eur=detrazione_annua,
        kwh_autoconsumati=kwh_autoconsumati,
        kwh_immessi=kwh_immessi,
        risparmio_bolletta_eur=risparmio,
        ricavo_gse_eur=ricavo_gse,
        costo_netto_annuo_eur=costo_netto,
        delta_vs_spesa_attuale_eur=delta,
        bolletta_residua_eur=bolletta_residua,
        risparmio_netto_eur=risparmio_netto,
        spesa_nuova_totale_eur=spesa_nuova,
        messaggio=messaggio,
        cashflow_anni=cashflow_anni,
    )
