"""Data package containing synthetic criminal intelligence records and data loaders."""
from pathlib import Path
import json

DATA_DIR = Path(__file__).parent
SYNTHETIC_RECORDS_FILE = DATA_DIR / "synthetic_records.json"


def load_synthetic_records():
    """Load sample synthetic criminal records from json."""
    if not SYNTHETIC_RECORDS_FILE.exists():
        return []
    with open(SYNTHETIC_RECORDS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)
