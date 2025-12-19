from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .calculator import calc_response
from .models import CalcRequest, CalcResponse

app = FastAPI(title="PV Sales Calculator")

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

