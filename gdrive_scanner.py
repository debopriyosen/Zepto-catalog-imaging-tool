import os
import re
import time
import random
import traceback
import sys
import pandas as pd
from typing import Dict, List, Optional
from functools import lru_cache

# We need these from requirements
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.service_account import Credentials

IMG_EXT_RE = re.compile(r"\.(png|jpg|jpeg|webp|tif|tiff|bmp|gif|heic|heif)$", re.I)

TARGET_KEYS = ["front", "back", "nutri"] + [f"celebration{i}" for i in range(1, 8)]
COLUMNS = ["PVID"] + [f"{k}_id" for k in TARGET_KEYS] + ["other_images_count", "other_images"]
BATCH_SIZE = 50

# Normalize image keys
def normalize_key(filename: str) -> Optional[str]:
    base = IMG_EXT_RE.sub("", filename).strip().lower()
    cleaned = re.sub(r"[^a-z0-9]+", " ", base).strip()
    tokens = set(cleaned.split())

    if "front" in tokens or "frontside" in tokens or "fronts" in tokens: return "front"
    if re.search(r"\bfront\b", cleaned): return "front"

    if "back" in tokens or "backside" in tokens or "reverse" in tokens or "rear" in tokens: return "back"
    if re.search(r"\bback\b", cleaned): return "back"

    if any(t in tokens for t in ["nutri","nutrition","nutritionfacts","nf","facts","nutritional"]): return "nutri"
    if re.search(r"\bnutri", cleaned) or "nutrition facts" in cleaned: return "nutri"

    m = re.search(r"celebration\s*0*([1-7])\b", cleaned)
    if m: return f"celebration{m.group(1)}"

    m2 = re.search(r"\bcele\b\s*0*([1-7])\b", cleaned)
    if m2: return f"celebration{m2.group(1)}"

    return None

def _sleep_backoff(attempt):
    time.sleep(min(30, (2 ** attempt) + random.random()))

class GDriveScanner:
    def __init__(self, credentials_info: dict):
        scopes = ["https://www.googleapis.com/auth/drive.readonly"]
        creds = Credentials.from_service_account_info(credentials_info, scopes=scopes)
        self.drive = build("drive", "v3", credentials=creds)

    def drive_list(self, q, fields, page_token=None):
        return self.drive.files().list(
            q=q,
            fields=f"nextPageToken, files({fields})",
            pageSize=1000,
            pageToken=page_token,
            corpora="allDrives",
            includeItemsFromAllDrives=True,
            supportsAllDrives=True
        ).execute()

    def drive_get(self, file_id, fields):
        return self.drive.files().get(
            fileId=file_id,
            fields=fields,
            supportsAllDrives=True
        ).execute()

    def safe_paged_list(self, q, fields, retries=7):
        results, token = [], None
        while True:
            attempt = 0
            while True:
                try:
                    resp = self.drive_list(q, fields, page_token=token)
                    break
                except HttpError as e:
                    status = getattr(e.resp, "status", None)
                    if status in (429, 500, 503) and attempt < retries:
                        print(f"⚠️ list retry status={status} attempt {attempt+1}/{retries}")
                        _sleep_backoff(attempt); attempt += 1; continue
                    raise
            results.extend(resp.get("files", []))
            token = resp.get("nextPageToken")
            if not token:
                return results

    def safe_get(self, file_id, fields="id,name,mimeType", retries=7):
        attempt = 0
        while True:
            try:
                return self.drive_get(file_id, fields)
            except HttpError as e:
                status = getattr(e.resp, "status", None)
                if status in (429, 500, 503) and attempt < retries:
                    print(f"⚠️ get retry status={status} attempt {attempt+1}/{retries} for {file_id}")
                    _sleep_backoff(attempt); attempt += 1; continue
                raise

    def list_children(self, folder_id):
        q = f"'{folder_id}' in parents and trashed=false"
        fields = "id,name,mimeType,shortcutDetails(targetId,targetMimeType)"
        return self.safe_paged_list(q, fields)

    @lru_cache(maxsize=100000)
    def resolve_shortcut_target(self, target_id):
        info = self.safe_get(target_id, fields="id,name,mimeType")
        return info.get("id"), info.get("name"), info.get("mimeType")

    def effective_file(self, file_obj):
        mt = file_obj.get("mimeType")
        name = file_obj.get("name","")
        if mt == "application/vnd.google-apps.shortcut":
            sd = file_obj.get("shortcutDetails", {}) or {}
            tid = sd.get("targetId")
            if tid:
                tid, tname, tmt = self.resolve_shortcut_target(tid)
                return tid, (tname or name), (tmt or mt)
            return file_obj["id"], name, mt
        return file_obj["id"], name, mt

    def recursive_list_images(self, folder_id, max_depth=1):
        out = []
        children = self.list_children(folder_id)
        subfolders = []
        for c in children:
            if c.get("mimeType") == "application/vnd.google-apps.folder":
                subfolders.append(c)
            else:
                out.append(c)
        if max_depth > 0:
            for sf in subfolders:
                out.extend(self.recursive_list_images(sf["id"], max_depth=max_depth-1))
        return out


def process_gdrive_folder(task_id: str, main_folder_id: str, tasks_status: dict):
    """
    Background worker for Google Drive Image Scanner.
    Writes progress and final results according to specific template directly into tasks_status map.
    """
    try:
        # Load Google Credentials from Env Vars
        credentials_info = {
            "type": "service_account",
            "project_id": os.environ.get("GCP_PROJECT_ID"),
            "private_key_id": os.environ.get("GCP_PRIVATE_KEY_ID"),
            "private_key": os.environ.get("GCP_PRIVATE_KEY", "").replace("\\n", "\n"),
            "client_email": os.environ.get("GCP_CLIENT_EMAIL"),
            "client_id": os.environ.get("GCP_CLIENT_ID"),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{os.environ.get('GCP_CLIENT_EMAIL', '').replace('@', '%40')}",
            "universe_domain": "googleapis.com"
        }

        # Check missing creds
        missing = [k for k, v in credentials_info.items() if not v and k in ["project_id", "private_key_id", "private_key", "client_email", "client_id"]]
        if missing:
            raise ValueError(f"Missing Service Account credentials in environment variables: {', '.join(missing)}")

        tasks_status[task_id]["progress"] = 5
        
        scanner = GDriveScanner(credentials_info)
        
        tasks_status[task_id]["progress"] = 10
        
        print(f"[{task_id}] Listing base folders in {main_folder_id}...")
        base_children = scanner.list_children(main_folder_id)
        base_folders = [c for c in base_children if c.get("mimeType") == "application/vnd.google-apps.folder"]
        
        total_base = len(base_folders)
        tasks_status[task_id]["progress"] = 15
        
        template = "1:1"
        folder_1x1 = None
        folder_3x4 = None

        if total_base == 0:
            tasks_status[task_id]["status"] = "completed"
            tasks_status[task_id]["progress"] = 100
            tasks_status[task_id]["results"] = []
            tasks_status[task_id]["template"] = "1:1"
            return
        elif total_base == 1:
            template = "1:1"
            folder_1x1 = base_folders[0]
        else:
            f1 = next((c for c in base_folders if "1x1" in c.get("name", "").lower()), None)
            f3 = next((c for c in base_folders if "3x4" in c.get("name", "").lower()), None)
            if f1 and f3:
                template = "3:4"
                folder_1x1 = f1
                folder_3x4 = f3
            else:
                template = "1:1"
                folder_1x1 = base_folders[0]

        data = {}
        processed_count = [0]

        # Helper to process a given folder of PVIDs
        def process_pvid_parent(parent_folder, source_key):
            children = scanner.list_children(parent_folder["id"])
            pvid_folders = [c for c in children if c.get("mimeType") == "application/vnd.google-apps.folder"]
            total_folders = len(pvid_folders)
            
            for i in range(0, total_folders, BATCH_SIZE):
                batch = pvid_folders[i:i+BATCH_SIZE]
                for pf in batch:
                    try:
                        pvid = (pf.get("name") or "").strip()
                        if not pvid: continue
                        if pvid not in data:
                            data[pvid] = {"1x1": {}, "3x4": {}}
                            
                        files = scanner.recursive_list_images(pf["id"], max_depth=1)
                        for f in files:
                            fid, fname, mime = scanner.effective_file(f)
                            is_image = (mime or "").startswith("image/") or bool(IMG_EXT_RE.search(fname)) or mime == "application/octet-stream"
                            if not is_image: continue
                            key = normalize_key(fname)
                            if key is None: continue
                            if key not in data[pvid][source_key]:
                                data[pvid][source_key][key] = fid
                    except Exception as ex:
                        print(f"[{task_id}] Error in folder '{pf.get('name')}': {ex}")
                        tasks_status[task_id]["errors"].append(f"Folder '{pf.get('name')}' error: {ex}")
                processed_count[0] += len(batch)
                expected_total = total_folders * (2 if folder_3x4 else 1)
                safe_total = max(1, expected_total)
                tasks_status[task_id]["progress"] = min(90, 15 + int((processed_count[0] / safe_total) * 75))

        process_pvid_parent(folder_1x1, "1x1")
        if template == "3:4" and folder_3x4:
            process_pvid_parent(folder_3x4, "3x4")
            
        tasks_status[task_id]["progress"] = 95

        # Template definition logic
        HEADERS_1x1 = [
            "product_variant_id", "primary_attachment_id", "secondary_attachment_id", "descriptive_attachment_id",
            "attachment_id_4", "attachment_id_5", "attachment_id_6", "attachment_id_7", "attachment_id_8",
            "attachment_id_9", "attachment_id_10", "primary_attachment_thumbnail_id", "secondary_attachment_thumbnail_id",
            "descriptive_attachment_thumbnail_id", "attachment_thumbnail_id_4", "attachment_thumbnail_id_5",
            "attachment_thumbnail_id_6", "attachment_thumbnail_id_7", "attachment_thumbnail_id_8",
            "attachment_thumbnail_id_9", "attachment_thumbnail_id_10", "unlisted", "show_only_in_bundles",
            "max_allowed_quantity", "primary_attachment_id_hide_padding_flag", "secondary_attachment_id_hide_padding_flag",
            "descriptive_attachment_id_hide_padding_flag", "attachment_id_4_hide_padding_flag", "attachment_id_5_hide_padding_flag",
            "attachment_id_6_hide_padding_flag", "attachment_id_7_hide_padding_flag", "attachment_id_8_hide_padding_flag",
            "attachment_id_9_hide_padding_flag", "attachment_id_10_hide_padding_flag", "length_in_mm", "breadth_in_mm",
            "height_in_mm", "weight_in_gms", "product_classification", "product_sub_classification", "shelf_life_on_receiving",
            "shelf_life_receiving_dh_in_hours", "shelf_life_receiving_mh_in_hours", "shelf_life_on_picking",
            "shelf_life_picking_dh_in_hours", "shelf_life_picking_mh_in_hours", "is_mrp_required", "is_expirable",
            "is_fragile", "is_external_vendor_returnable", "contract_type", "v_score", "storage_zone", "raw_title",
            "brand_name", "is_bulky", "is_super_store_sku", "is_hrv", "commingle_blocking_expiry_dh",
            "commingle_blocking_mrp_dh", "sub_storage_zone", "rate_card_type", "mh_bin_type"
        ]

        HEADERS_3x4_ADDITIONS = [
            "primary_attachment_id_3x4", "secondary_attachment_id_3x4", "descriptive_attachment_id_3x4",
            "attachment_id_4_3x4", "attachment_id_5_3x4", "attachment_id_6_3x4", "attachment_id_7_3x4",
            "attachment_id_8_3x4", "attachment_id_9_3x4", "attachment_id_10_3x4"
        ]
        
        hide_padding_cols = [
            "primary_attachment_id_hide_padding_flag", "secondary_attachment_id_hide_padding_flag",
            "descriptive_attachment_id_hide_padding_flag", "attachment_id_4_hide_padding_flag",
            "attachment_id_5_hide_padding_flag", "attachment_id_6_hide_padding_flag", "attachment_id_7_hide_padding_flag",
            "attachment_id_8_hide_padding_flag", "attachment_id_9_hide_padding_flag", "attachment_id_10_hide_padding_flag"
        ]

        # Format into rows
        rows = []
        for pvid, d in data.items():
            row = {col: "" for col in HEADERS_1x1}
            row["product_variant_id"] = pvid
            
            image_mapping = {
                "front": "primary_attachment_id",
                "back": "secondary_attachment_id",
                "nutri": "descriptive_attachment_id",
                "celebration1": "attachment_id_4",
                "celebration2": "attachment_id_5",
                "celebration3": "attachment_id_6",
                "celebration4": "attachment_id_7",
                "celebration5": "attachment_id_8",
                "celebration6": "attachment_id_9",
                "celebration7": "attachment_id_10"
            }
            
            # Setup 1x1 image columns
            for key, target_col in image_mapping.items():
                if d["1x1"].get(key):
                    row[target_col] = d["1x1"][key]
            
            # Always populate TRUE for hide_padding_flags
            for pad_col in hide_padding_cols:
                row[pad_col] = "TRUE"

            # Add any 3x4 specific empty columns if needed
            if template == "3:4":
                for extra_col in HEADERS_3x4_ADDITIONS:
                    row[extra_col] = ""
                    
                # Setup 3x4 extra images
                for key, target_col in image_mapping.items():
                    if d["3x4"].get(key):
                        row[f"{target_col}_3x4"] = d["3x4"][key]

            rows.append(row)

        tasks_status[task_id]["status"] = "completed"
        tasks_status[task_id]["progress"] = 100
        tasks_status[task_id]["results"] = rows
        tasks_status[task_id]["template"] = template
        
    except Exception as e:
        traceback.print_exc(file=sys.stdout)
        tasks_status[task_id]["status"] = "failed"
        tasks_status[task_id]["errors"].append(str(e))
