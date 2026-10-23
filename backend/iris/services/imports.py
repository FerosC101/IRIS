"""CSV import: preview, column mapping, validation and confirmed import.

Uploaded files are staged in memory until the user confirms or cancels. A
server restart discards staged uploads (documented prototype limitation).
"""

from __future__ import annotations

import csv
import hashlib
import io
import secrets
from dataclasses import dataclass
from datetime import datetime

import pandas as pd
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from iris import config
from iris.models import DataRecord, Dataset, ImportRecord, ReportingUnit
from iris.services import audit, datasets
from iris.services.clock import now
from iris.services.context import Actor

TARGET_FIELDS = [
    {"key": "period_start", "label": "Reporting period start date", "required": True, "kind": "date",
     "description": "First day of the reporting period."},
    {"key": "value", "label": "Reported value (count)", "required": True, "kind": "count",
     "description": "Whole number of zero or more. Leave blank where the value was not reported; blanks are kept separate from zeros."},
    {"key": "category", "label": "Reporting category / disease", "required": False, "kind": "text",
     "description": "Disease or reporting category name or code."},
    {"key": "area", "label": "Geographic area", "required": False, "kind": "text",
     "description": "Province, municipality or other area name."},
    {"key": "reporting_unit", "label": "Reporting unit ID", "required": False, "kind": "unit",
     "description": "Must match an existing reporting-unit ID (e.g. RHU-HIRAYA) if provided."},
    {"key": "period_end", "label": "Reporting period end date", "required": False, "kind": "date",
     "description": "Last day of the reporting period."},
    {"key": "due_at", "label": "Due date/time", "required": False, "kind": "datetime",
     "description": "When the report was due. Needed (with received) to calculate timeliness."},
    {"key": "received_at", "label": "Received date/time", "required": False, "kind": "datetime",
     "description": "When the report was received."},
]
FIELD_BY_KEY = {f["key"]: f for f in TARGET_FIELDS}
DATE_FORMATS = {"YYYY-MM-DD": "%Y-%m-%d", "DD/MM/YYYY": "%d/%m/%Y", "MM/DD/YYYY": "%m/%d/%Y"}
DATETIME_EXTRA = ["%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S"]
MAX_ROWS = 50_000
MAX_ERRORS = 200

SYNONYMS = {
    "period_start": ["period_start", "week_start", "date", "start_date", "period", "week"],
    "value": ["value", "cases", "count", "case_count", "n"],
    "category": ["category", "disease", "condition", "category_code"],
    "area": ["area", "province", "municipality", "location", "region"],
    "reporting_unit": ["reporting_unit", "unit", "unit_id", "facility", "facility_id"],
    "period_end": ["period_end", "week_end", "end_date"],
    "due_at": ["due_at", "due", "due_date"],
    "received_at": ["received_at", "received", "submitted_at", "date_received"],
}


@dataclass
class Staged:
    token: str
    filename: str
    uploaded_at: datetime
    by: str
    frame: pd.DataFrame
    #: SHA-256 of the uploaded file's bytes, exactly as received.
    sha256: str = ""


_staging: dict[str, Staged] = {}


def _reject(session: Session, actor: Actor, filename: str, errors: list[dict]) -> None:
    rec = ImportRecord(id=_next_import_id(session), dataset_id=None, filename=filename[:255], at=now(), by_user_id=actor.user_id,
                       status="rejected", row_count=0, errors=errors[:MAX_ERRORS], warnings=[])
    session.add(rec)
    audit.record(session, actor, "import", rec.id, "import.rejected", f"Import of '{filename}' was rejected: {errors[0]['message']}")
    session.commit()


def _next_import_id(session: Session) -> str:
    n = session.execute(select(func.count()).select_from(ImportRecord)).scalar_one()
    return f"IMP-{n + 1:04d}"


def preview(session: Session, actor: Actor, filename: str, content: bytes) -> dict:
    actor.require("dataset.import")
    errors: list[dict] = []
    if not filename.lower().endswith(".csv"):
        errors.append({"row": None, "column": None, "message": "Only .csv files can be imported. Save the spreadsheet as CSV (comma-separated) and try again."})
    elif len(content) == 0:
        errors.append({"row": None, "column": None, "message": "The file is empty."})
    elif len(content) > config.MAX_UPLOAD_BYTES:
        errors.append({"row": None, "column": None, "message": f"The file is larger than {config.MAX_UPLOAD_BYTES // (1024 * 1024)} MB. Split it into smaller files."})
    text = None
    if not errors:
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            errors.append({"row": None, "column": None, "message": "The file is not UTF-8 text. Re-save it as ‘CSV UTF-8’ and try again."})
    frame = None
    if text is not None:
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t") if text.strip() else None
        except csv.Error:
            dialect = None
        delim = dialect.delimiter if dialect else ","
        try:
            frame = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False, sep=delim, skipinitialspace=True)
        except Exception as exc:  # pandas raises several parser error types
            errors.append({"row": None, "column": None, "message": f"The file could not be read as CSV: {str(exc).splitlines()[0]}"})
    if frame is not None and not errors:
        # pandas silently renames duplicate headers ("a" -> "a.1"), so check the raw header row.
        raw_header = next(csv.reader(io.StringIO(text.splitlines()[0] if text else ""), delimiter=delim), [])
        cols = [str(c).strip() for c in frame.columns]
        if len({h.strip().lower() for h in raw_header}) != len(raw_header):
            errors.append({"row": 1, "column": None, "message": "Two or more columns have the same header name. Rename them so each is unique."})
        if any(c == "" or c.startswith("Unnamed:") for c in cols):
            errors.append({"row": 1, "column": None, "message": "Every column needs a header name in the first row."})
        if len(frame) == 0:
            errors.append({"row": None, "column": None, "message": "The file has a header row but no data rows."})
        if len(frame) > MAX_ROWS:
            errors.append({"row": None, "column": None, "message": f"The file has {len(frame):,} rows; the prototype accepts up to {MAX_ROWS:,}."})
        frame.columns = cols
    if errors:
        _reject(session, actor, filename, errors)
        raise HTTPException(status_code=422, detail={"message": errors[0]["message"], "errors": errors})
    assert frame is not None
    token = secrets.token_urlsafe(16)
    _staging[token] = Staged(token, filename, now(), actor.user_id, frame.map(lambda v: v.strip() if isinstance(v, str) else v),
                             hashlib.sha256(content).hexdigest())
    suggested = {}
    lower = {c.lower().replace(" ", "_"): c for c in frame.columns}
    for key, syns in SYNONYMS.items():
        for s in syns:
            if s in lower and lower[s] not in suggested.values():
                suggested[key] = lower[s]
                break
    columns = []
    for c in frame.columns:
        vals = frame[c]
        columns.append({"name": c, "blank": int((vals == "").sum()), "distinct": int(vals.nunique()),
                        "samples": [v for v in vals.head(5).tolist()]})
    return {
        "token": token, "filename": filename, "row_count": int(len(frame)), "columns": columns,
        "preview": frame.head(8).to_dict("records"), "suggested_mapping": suggested,
        "target_fields": TARGET_FIELDS, "date_formats": list(DATE_FORMATS),
    }


def _get(token: str) -> Staged:
    st = _staging.get(token)
    if st is None:
        raise HTTPException(status_code=410, detail="This upload has expired or was already used. Upload the file again.")
    return st


def _parse_dates(s: pd.Series, fmt: str, with_time: bool) -> pd.Series:
    out = pd.to_datetime(s, format=DATE_FORMATS[fmt], errors="coerce")
    if with_time:
        for f in DATETIME_EXTRA:
            missing = out.isna() & (s != "")
            if not missing.any():
                break
            out = out.where(~missing, pd.to_datetime(s.where(missing), format=f, errors="coerce"))
    return out


def validate(session: Session, token: str, mapping: dict[str, str], date_format: str = "YYYY-MM-DD", keep_last_duplicate: bool = False) -> dict:
    st = _get(token)
    df = st.frame
    errors: list[dict] = []
    warnings: list[dict] = []
    mapping = {k: v for k, v in (mapping or {}).items() if v}
    for k in mapping:
        if k not in FIELD_BY_KEY:
            errors.append({"row": None, "column": None, "message": f"Unknown target field '{k}'."})
    for f in TARGET_FIELDS:
        if f["required"] and f["key"] not in mapping:
            errors.append({"row": None, "column": None, "message": f"Map a column to the required field ‘{f['label']}’."})
    used = list(mapping.values())
    for c in set(used):
        if c not in df.columns:
            errors.append({"row": None, "column": c, "message": f"Column '{c}' is not in the file."})
        elif used.count(c) > 1:
            errors.append({"row": None, "column": c, "message": f"Column '{c}' is mapped to more than one field."})
    if date_format not in DATE_FORMATS:
        errors.append({"row": None, "column": None, "message": "Choose a supported date format."})
    if errors:
        return {"can_accept": False, "errors": errors, "warnings": warnings, "error_count": len(errors), "summary": None}

    def row_err(idx, col, value, msg, bucket=errors):
        if len(bucket) < MAX_ERRORS:
            bucket.append({"row": int(idx) + 2, "column": col, "value": value, "message": msg})

    parsed = pd.DataFrame(index=df.index)
    err_count = 0
    for key, col in mapping.items():
        f = FIELD_BY_KEY[key]
        raw = df[col]
        if f["kind"] in ("date", "datetime"):
            vals = _parse_dates(raw, date_format, f["kind"] == "datetime")
            bad = vals.isna() & (raw != "")
            for i in raw[bad].index:
                row_err(i, col, raw[i], f"Could not read ‘{raw[i]}’ as a date in {date_format} format.")
            err_count += int(bad.sum())
            if key == "period_start":
                blank = raw == ""
                for i in raw[blank].index:
                    row_err(i, col, "", "Reporting period start date is required.")
                err_count += int(blank.sum())
            parsed[key] = vals
        elif f["kind"] == "count":
            num = pd.to_numeric(raw.str.replace(",", "", regex=False), errors="coerce")
            bad = num.isna() & (raw != "")
            for i in raw[bad].index:
                row_err(i, col, raw[i], f"‘{raw[i]}’ is not a number.")
            neg = num < 0
            for i in raw[neg].index:
                row_err(i, col, raw[i], "Counts cannot be negative.")
            frac = num.notna() & (num != num.round())
            for i in raw[frac].index:
                row_err(i, col, raw[i], "Counts must be whole numbers.")
            err_count += int(bad.sum() + neg.sum() + frac.sum())
            parsed[key] = num
            parsed["value_status"] = ["blank" if r == "" else ("zero" if n == 0 else "reported") for r, n in zip(raw, num)]
        elif f["kind"] == "unit":
            known = {u.id for u in session.execute(select(ReportingUnit)).scalars()}
            bad = (raw != "") & ~raw.isin(known)
            for i in raw[bad].index:
                row_err(i, col, raw[i], f"Unknown reporting unit ‘{raw[i]}’. Use an ID from Data Management → Reporting units.")
            err_count += int(bad.sum())
            parsed[key] = raw.where(raw != "", None)
        else:
            parsed[key] = raw.where(raw != "", None)
    if "period_end" in parsed and "period_start" in parsed:
        bad = parsed["period_end"].notna() & parsed["period_start"].notna() & (parsed["period_end"] < parsed["period_start"])
        for i in parsed[bad].index:
            row_err(i, mapping["period_end"], df[mapping["period_end"]][i], "Period end is before period start.")
        err_count += int(bad.sum())
    if "received_at" in parsed and "period_start" in parsed:
        early = parsed["received_at"].notna() & (parsed["received_at"] < parsed["period_start"])
        for i in parsed[early].index:
            row_err(i, mapping["received_at"], df[mapping["received_at"]][i], "Received before the reporting period started — check the date.", warnings)

    keys = [k for k in ("period_start", "category", "area", "reporting_unit") if k in parsed]
    dup_mask = parsed.duplicated(subset=keys, keep=False) if keys else pd.Series(False, index=parsed.index)
    dup_rows = [int(i) + 2 for i in parsed[dup_mask].index]
    if dup_rows:
        msg = f"{len(dup_rows)} rows share the same period/category/area/unit (rows {', '.join(map(str, dup_rows[:12]))}{'…' if len(dup_rows) > 12 else ''})."
        if keep_last_duplicate:
            warnings.append({"row": None, "column": None, "value": None, "message": msg + " Only the last occurrence of each will be imported."})
        else:
            errors.append({"row": None, "column": None, "value": None, "message": msg + " Remove duplicates, or choose to keep the last occurrence."})
            err_count += 1

    missing = []
    for key, col in mapping.items():
        blank = int((df[col] == "").sum())
        missing.append({"field": key, "label": FIELD_BY_KEY[key]["label"], "column": col, "blank": blank, "share": blank / len(df)})
    vs = parsed.get("value_status")
    starts = parsed["period_start"].dropna()
    summary = {
        "rows": int(len(df)),
        "rows_to_import": int(len(df) - (dup_mask.sum() - parsed[dup_mask].drop_duplicates(subset=keys, keep="last").shape[0] if keep_last_duplicate and dup_rows else 0)),
        "coverage_start": starts.min().date().isoformat() if len(starts) else None,
        "coverage_end": starts.max().date().isoformat() if len(starts) else None,
        "missingness": missing,
        "value_status": {"reported": int((vs == "reported").sum()), "zero": int((vs == "zero").sum()), "blank": int((vs == "blank").sum())} if vs is not None else None,
        "duplicates": len(dup_rows),
        "has_timestamps": "due_at" in mapping and "received_at" in mapping,
        "has_units": "reporting_unit" in mapping,
    }
    st.frame.attrs["parsed"] = parsed
    st.frame.attrs["keys"] = keys
    return {"can_accept": err_count == 0 and not any(e["row"] is None for e in errors), "errors": errors, "warnings": warnings,
            "error_count": max(err_count, len(errors)), "summary": summary}


def commit(session: Session, actor: Actor, token: str, mapping: dict[str, str], date_format: str, keep_last_duplicate: bool, meta: dict) -> Dataset:
    actor.require("dataset.import")
    name = (meta.get("name") or "").strip()
    if len(name) < 3:
        raise HTTPException(status_code=422, detail="Give the dataset a name (at least 3 characters).")
    if meta.get("designation") not in ("real", "synthetic", "unknown"):
        raise HTTPException(status_code=422, detail="Declare whether the data is real, synthetic or of unknown origin.")
    if meta.get("geographic_level") not in ("facility", "municipality", "province", "region"):
        raise HTTPException(status_code=422, detail="Choose the geographic level of the data.")
    if not (meta.get("source") or "").strip():
        raise HTTPException(status_code=422, detail="Describe the data source.")
    st = _get(token)
    report = validate(session, token, mapping, date_format, keep_last_duplicate)
    if not report["can_accept"]:
        _reject(session, actor, st.filename, report["errors"] or [{"row": None, "column": None, "message": "Validation failed."}])
        raise HTTPException(status_code=422, detail={"message": "The file still has validation errors. Nothing was imported.", "errors": report["errors"]})
    parsed: pd.DataFrame = st.frame.attrs["parsed"]
    keys = st.frame.attrs["keys"]
    if keep_last_duplicate and keys:
        parsed = parsed.drop_duplicates(subset=keys, keep="last")
    n = session.execute(select(func.count()).select_from(Dataset).where(Dataset.is_demo.is_(False))).scalar_one()
    ds_id = f"DS-IMP-{n + 1:04d}"
    while session.get(Dataset, ds_id) is not None:
        n += 1
        ds_id = f"DS-IMP-{n + 1:04d}"
    limitations = [l.strip() for l in (meta.get("known_limitations") or "").split("\n") if l.strip()]
    if meta["designation"] == "real":
        limitations.append("Declared as real data by the importer. IRIS has not verified the source.")
    if meta["designation"] == "unknown":
        limitations.append("Origin unknown: treat results as unverified.")
    if "due_at" not in mapping or "received_at" not in mapping:
        limitations.append("No due/received timestamps: timeliness cannot be calculated.")
    limitations.append("No reporting schedule (expected submissions) is defined: completeness cannot be calculated.")
    if "reporting_unit" not in mapping:
        limitations.append("No reporting-unit column: facility-level views and network analysis are not available.")
    dictionary = [{"field": k, "source_column": c, "label": FIELD_BY_KEY[k]["label"], "description": FIELD_BY_KEY[k]["description"]} for k, c in mapping.items()]
    starts = parsed["period_start"].dropna()
    ds = Dataset(
        id=ds_id, name=name, description=(meta.get("description") or "").strip(), source=meta["source"].strip(),
        designation=meta["designation"], geographic_level=meta["geographic_level"], imported_at=now(), imported_by=actor.user_id,
        coverage_start=starts.min().date() if len(starts) else None, coverage_end=starts.max().date() if len(starts) else None,
        row_count=int(len(parsed)), validation_status="valid_with_warnings" if report["warnings"] else "valid",
        known_limitations=limitations, has_expectations=False, has_timestamps="due_at" in mapping and "received_at" in mapping,
        has_units="reporting_unit" in mapping, data_dictionary=dictionary, column_mapping=mapping, is_demo=False,
    )
    session.add(ds)
    session.flush()

    def _v(row, k):
        v = row.get(k)
        return None if v is None or (isinstance(v, float) and pd.isna(v)) or v is pd.NaT else v

    for idx, row in parsed.iterrows():
        ps = _v(row, "period_start")
        pe = _v(row, "period_end")
        due, rec_at = _v(row, "due_at"), _v(row, "received_at")
        session.add(DataRecord(
            dataset_id=ds_id, reporting_unit_id=_v(row, "reporting_unit"), area=_v(row, "area"), category_code=_v(row, "category"),
            period_start=ps.date(), period_end=pe.date() if pe is not None else None,
            value=None if pd.isna(row["value"]) else float(row["value"]), value_status=row["value_status"],
            due_at=due.to_pydatetime() if due is not None else None, received_at=rec_at.to_pydatetime() if rec_at is not None else None,
            fields_complete=None, source_row=int(idx) + 2,
        ))
    session.flush()
    ds.checksum, ds.checksum_basis = st.sha256 or None, "uploaded_file" if st.sha256 else None
    ds.records_checksum = datasets.records_checksum(session, ds_id)
    imp = ImportRecord(id=_next_import_id(session), dataset_id=ds_id, filename=st.filename[:255], at=now(), by_user_id=actor.user_id,
                       status="accepted", row_count=int(len(parsed)), errors=[], warnings=report["warnings"])
    session.add(imp)
    audit.record(session, actor, "dataset", ds_id, "dataset.imported", f"{actor.display_name} imported '{name}' ({len(parsed)} rows) from {st.filename}.")
    _staging.pop(token, None)
    datasets.bump(ds_id)
    return ds


def cancel(token: str) -> None:
    _staging.pop(token, None)
