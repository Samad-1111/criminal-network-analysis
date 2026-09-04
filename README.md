# Criminal Network Analysis System

A lightweight, beginner-friendly, and evidence-preserving Python project for analyzing criminal networks, suspect associations, and intelligence records.

Built using **FastAPI**, **spaCy**, **RapidFuzz**, and **NetworkX**.

---

## Key Capabilities

1. **Multi-Entity Graph Representation**:
   - Graph nodes support multiple distinct entity types: **`Person`**, **`Phone`**, **`Location`**, **`Vehicle`**, and **`Event`**.
2. **Evidence-Preserving Graph Edges**:
   - Edges maintain full intelligence provenance:
     - `source_record_id` (e.g. `FIR-2024-101`, `LOG-2024-204`)
     - `relationship_type` (e.g. `CO_ACCUSED`, `COMMUNICATED_WITH`, `LOCATED_AT`, `OPERATES_VEHICLE`, `INVOLVED_IN`)
     - `timestamp` (e.g. `2024-03-15T14:30:00Z`)
     - `confidence` (score between `0.0` and `1.0`)
3. **Status-Based Identity Resolution**:
   - Does **not** blindly merge fuzzy matches.
   - Evaluates similarity using RapidFuzz and assigns explicit confidence scores with 4 status levels:
     - **`CONFIRMED`**: Exact match on primary identifier (matching phone number, exact name match).
     - **`POSSIBLE`**: High fuzzy similarity (e.g., 85%–99% name/alias similarity).
     - **`AMBIGUOUS`**: Moderate fuzzy similarity (e.g., 70%–84% similarity or multiple candidates).
     - **`UNKNOWN`**: Low similarity (< 70%) or incompatible entity types.
4. **Network Intelligence & Centrality**:
   - Calculates **Degree Centrality** (most active nodes) and **Betweenness Centrality** (key brokers/connectors).
   - Traces shortest connection paths and evidence chains between any two suspects.
5. **Interactive REST API**:
   - Clean FastAPI endpoints with auto-generated interactive OpenAPI docs at `/docs`.

---

## Project Structure

```text
criminal-network-analysis/
├── data/
│   ├── __init__.py                 # Data loader utilities
│   └── synthetic_records.json      # Sample synthetic FIRs & surveillance records
├── pipeline/
│   ├── __init__.py                 # Pipeline module exports
│   ├── entity_extraction.py        # Extracts Person, Phone, Location, Vehicle, Event
│   ├── identity_resolution.py      # Fuzzy matching with CONFIRMED/POSSIBLE/AMBIGUOUS/UNKNOWN
│   └── graph_builder.py            # NetworkX graph builder with evidence metadata on edges
├── api/
│   ├── __init__.py
│   └── main.py                     # FastAPI application endpoints
├── tests/
│   ├── __init__.py
│   ├── test_entity_extraction.py   # Unit tests for multi-entity extraction
│   ├── test_identity_resolution.py # Unit tests for fuzzy resolution statuses
│   ├── test_graph_builder.py       # Unit tests for graph construction & metadata
│   └── test_api.py                 # FastAPI integration tests with TestClient
├── .gitignore                      # Standard Python gitignore
├── requirements.txt                # Python package dependencies
└── README.md                       # Setup and documentation guide
```

---

## Quickstart & Setup

### 1. Prerequisites
- Python 3.9+ installed on your system.

### 2. Create and Activate Virtual Environment

**Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. (Optional) Download spaCy English Model
The extractor includes a built-in fallback tokenizer, but downloading the small English model provides enhanced Named Entity Recognition (NER):
```bash
python -m spacy download en_core_web_sm
```

---

## Running the API Server

Start the FastAPI development server with live reload:

```bash
uvicorn api.main:app --reload --port 8000
```

Once started, open your browser and navigate to:
- **Interactive Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc Alternative**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

## API Endpoints Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | API status and supported features |
| `GET` | `/data/synthetic` | Retrieve the bundled sample synthetic FIR dataset |
| `POST` | `/pipeline/extract-entities` | Extract Person, Phone, Location, Vehicle, and Event from text |
| `POST` | `/pipeline/compare-identities` | Compare two entity mentions and return status (`CONFIRMED`, `POSSIBLE`, `AMBIGUOUS`, `UNKNOWN`) + score |
| `POST` | `/pipeline/resolve-dataset` | Find potential identity matches across a list of entities without destructive merging |
| `POST` | `/pipeline/build-graph` | Build multi-entity NetworkX graph with evidence metadata on edges |
| `POST` | `/pipeline/find-connection` | Trace shortest evidence connection path between two suspects |
| `POST` | `/pipeline/analyze-network` | Run end-to-end intelligence analysis on the dataset |

---

## Example API Requests

### 1. Extract Entities from Narrative
```bash
curl -X POST "http://127.0.0.1:8000/pipeline/extract-entities" \
     -H "Content-Type: application/json" \
     -d '{"text": "Suspect Vikram Sharma alias Vicky was driving DL-01-AB-1234 in Sector 18 Noida and called +91-9876543210."}'
```

### 2. Compare Two Identities (No Blind Merging)
```bash
curl -X POST "http://127.0.0.1:8000/pipeline/compare-identities" \
     -H "Content-Type: application/json" \
     -d '{
       "entity_a": {"entity_type": "Person", "name": "Vikram Sharma", "aliases": ["Vicky"], "phone": "+91-9876543210"},
       "entity_b": {"entity_type": "Person", "name": "Vikram S.", "aliases": ["Vicky"], "phone": "+91-9876543210"}
     }'
```

**Sample Response:**
```json
{
  "entity_a": {"entity_type": "Person", "name": "Vikram Sharma", "phone": "+91-9876543210"},
  "entity_b": {"entity_type": "Person", "name": "Vikram S.", "phone": "+91-9876543210"},
  "confidence": 1.0,
  "status": "CONFIRMED",
  "reasons": [
    "Exact phone number match: +91-9876543210"
  ]
}
```

### 3. Trace Evidence Chain Between Suspects
```bash
curl -X POST "http://127.0.0.1:8000/pipeline/find-connection" \
     -H "Content-Type: application/json" \
     -d '{"source": "Vikram Sharma", "target": "Amit Verma"}'
```

---

## Running the Automated Test Suite

Run all unit and integration tests using `pytest`:

```bash
pytest -v
```

Tests verify:
- Multi-entity extraction across all 5 entity types (`Person`, `Phone`, `Location`, `Vehicle`, `Event`)
- Identity resolution score calculations and status determination (`CONFIRMED`, `POSSIBLE`, `AMBIGUOUS`, `UNKNOWN`)
- Multi-entity node typing and edge evidence metadata preservation (`source_record_id`, `relationship_type`, `timestamp`, `confidence`)
- Full FastAPI endpoint routing and responses using `TestClient`
