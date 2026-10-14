"""
FastAPI Application Entrypoint for Real Estate & Building Construction ERP Suite.
Mounts routers, establishes CORS, and sets up health checking.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.real_estate_erp.controllers import api_router

app = FastAPI(
    title="Real Estate & Building Construction ERP Suite",
    description="Enterprise API-first ERP for Land Developers, Surveyors, Civil Engineers, PMs, and Finance.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health_check():
    return {
        "status": "HEALTHY",
        "service": "Real Estate & Building Construction ERP Suite",
        "version": "1.0.0"
    }
