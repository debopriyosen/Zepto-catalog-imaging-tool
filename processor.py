import os
import pandas as pd
import requests
from PIL import Image
from io import BytesIO
import zipfile
import shutil
import json
import re
from typing import Dict, List, Set, Optional, Tuple
from datetime import datetime

UUID_RE = re.compile(r"^(?P<uuid>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})_(?P<label>.+)$")

# Vercel filesystem is read-only except for /tmp
IS_VERCEL = os.environ.get("VERCEL") == "1"
BASE_STORAGE = "/tmp" if IS_VERCEL else "."

UPLOAD_DIR = os.path.join(BASE_STORAGE, "uploads")
PROCESSED_DIR = os.path.join(BASE_STORAGE, "processed")
OUTPUT_DIR = os.path.join(BASE_STORAGE, "output")
STATUS_FILE = os.path.join(BASE_STORAGE, "tasks_status.json")

def parse_name(filename: str) -> Optional[Tuple[str, str, str]]:
    base = os.path.basename(filename)
    stem, ext = os.path.splitext(base)
    m = UUID_RE.match(stem)
    return (m.group("uuid").strip(), m.group("label").strip(), ext) if m else None

def inventory_labels_map(dir_path: str) -> Dict[str, str]:
    out = {}
    if not os.path.isdir(dir_path): return out
    for n in os.listdir(dir_path):
        p = os.path.join(dir_path, n)
        if os.path.isfile(p): out[os.path.splitext(n)[0]] = p
    return out

def list_labels(dir_path: str) -> Set[str]:
    return set(inventory_labels_map(dir_path).keys())

def unique_path(path: str) -> str:
    if not os.path.exists(path): return path
    folder, fname = os.path.split(path)
    stem, ext = os.path.splitext(fname)
    i = 2
    while True:
        cand = os.path.join(folder, f"{stem}({i}){ext}")
        if not os.path.exists(cand): return cand
        i += 1

# Naming convention mapping (supports both 'Image1' and 'image_link1' styles)
NAMING_CONVENTION = {
    "1": "_Front.jpg",
    "2": "_Back.jpg",
    "3": "_Nutri.jpg",
    "4": "_Celebration1.jpg",
    "5": "_Celebration2.jpg",
    "6": "_Celebration3.jpg",
    "7": "_Celebration4.jpg",
    "8": "_Celebration5.jpg",
    "9": "_Celebration6.jpg",
    "10": "_Celebration7.jpg",
}

def get_target_ratio(ratio_str: str):
    ratios = {
        "3:4": 3/4,
        "1:1": 1/1,
        "4:5": 4/5
    }
    return ratios.get(ratio_str, 1.0)

def resize_with_padding(img, target_ratio):
    img_w, img_h = img.size
    current_ratio = img_w / img_h
    
    if abs(current_ratio - target_ratio) < 1e-6:
        return img.convert("RGB")
    
    if current_ratio > target_ratio:
        # Image is wider than target ratio - add padding to top/bottom
        new_w = img_w
        new_h = int(img_w / target_ratio)
    else:
        # Image is taller than target ratio - add padding to left/right
        new_h = img_h
        new_w = int(img_h * target_ratio)
    
    # Create white canvas
    new_img = Image.new("RGB", (new_w, new_h), (255, 255, 255))
    
    # Center original image on canvas
    paste_x = (new_w - img_w) // 2
    paste_y = (new_h - img_h) // 2
    
    new_img.paste(img, (paste_x, paste_y))
    return new_img

def process_catalog_images(task_id: str, excel_path: str, ratio: str, tasks_status: Dict):
    try:
        print(f"Starting task {task_id} with file {excel_path}")
        
        # Support both Excel and CSV
        if excel_path.endswith('.csv'):
            df = pd.read_csv(excel_path)
        else:
            df = pd.read_excel(excel_path)
            
        total_rows = len(df)
        
        # Log basic info
        print(f"Excel loaded. Shape: {df.shape}")
        print(f"Original Columns: {list(df.columns)}")
        
        # Normalize column names (ignore case, spaces, underscores, and dots)
        df.columns = [str(c).strip() for c in df.columns]
        col_map = {str(c).lower().replace(" ", "").replace("_", "").replace(".", ""): c for c in df.columns}
        print(f"Normalized Column Map: {col_map}")
        
        if total_rows > 0:
            print(f"First row data: {df.iloc[0].to_dict()}")
        
        processed_count = 0
        total_images_processed = 0
        errors = []
        failed_pvids = []  # List of dicts: {"PVID": ..., "URL": ..., "Error": ...}
        
        target_ratio = get_target_ratio(ratio)
        task_dir = os.path.join(PROCESSED_DIR, task_id)
        os.makedirs(task_dir, exist_ok=True)
        
        # Find PVID column (case-insensitive, space-insensitive)
        pvid_col = col_map.get("pvid")
        if not pvid_col:
            print("WARNING: PVID column not found. Using default 'unknown' names.")
        else:
            print(f"Found PVID column: {pvid_col}")
        
        for index, row in df.iterrows():
            pvid = str(row.get(pvid_col, f"unknown_{index}")) if pvid_col else f"unknown_{index}"
            
            for num, suffix in NAMING_CONVENTION.items():
                # Support: Image1, image_link1, image1, Image_link1, imagelink1 etc.
                possible_keys = [f"image{num}", f"image_link{num}", f"imagelink{num}"]
                
                actual_col = None
                for p_key in possible_keys:
                    # Also normalize the search keys
                    norm_p_key = p_key.lower().replace(" ", "").replace("_", "").replace(".", "")
                    if norm_p_key in col_map:
                        actual_col = col_map[norm_p_key]
                        break
                
                if not actual_col:
                    continue
                    
                url = row.get(actual_col)
                if pd.isna(url) or not str(url).strip().startswith("http"):
                    if not pd.isna(url) and str(url).strip():
                        print(f"Skipping value in {actual_col}: '{url}' (not a valid HTTP URL)")
                    continue
                
                url = str(url).strip()
                try:
                    response = requests.get(url, timeout=15, headers={'User-Agent': 'Mozilla/5.0'})
                    response.raise_for_status()
                    
                    img = Image.open(BytesIO(response.content))
                    processed_img = resize_with_padding(img, target_ratio)
                    
                    filename = f"{pvid}{suffix}"
                    save_path = os.path.join(task_dir, filename)
                    processed_img.save(save_path, "JPEG", quality=95)
                    total_images_processed += 1
                    
                except Exception as e:
                    error_msg = f"Row {index+1}, Image {num}: Error processing {url} - {str(e)}"
                    print(error_msg)
                    errors.append(error_msg)
                    failed_pvids.append({
                        "PVID": pvid,
                        "ImageSlot": num,
                        "URL": url,
                        "Error": str(e)
                    })
            
            processed_count += 1
            progress = int((processed_count / total_rows) * 100)
            tasks_status[task_id]["progress"] = progress
            tasks_status[task_id]["errors"] = errors
            
            # Save status to disk via a simple side effect (main.py's global)
            try:
                with open(STATUS_FILE, "w") as f:
                    json.dump(tasks_status, f)
            except:
                pass
        
        # Create Failed Log CSV if any failures
        if failed_pvids:
            failed_df = pd.DataFrame(failed_pvids)
            log_path = os.path.join(task_dir, "failed_log.csv")
            failed_df.to_csv(log_path, index=False)
            print(f"Created failed_log.csv with {len(failed_pvids)} entries.")
            
        if total_images_processed == 0:
            tasks_status[task_id]["errors"].insert(0, "No valid images were found in the uploaded file. Please check column names (PVID, Image1, etc.) and URLs.")
        
        # Create ZIP
        zip_path = os.path.join(OUTPUT_DIR, f"{task_id}.zip")
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(task_dir):
                for file in files:
                    zipf.write(os.path.join(root, file), file)
        
        tasks_status[task_id]["status"] = "completed"
        tasks_status[task_id]["progress"] = 100
        tasks_status[task_id].update({"zip_url": f"/download/{task_id}"})
        
        try:
            with open(STATUS_FILE, "w") as f:
                json.dump(tasks_status, f)
        except:
            pass
            
        print(f"Task {task_id} completed. Processed {total_images_processed} images.")
        
        # Cleanup processed folder
        shutil.rmtree(task_dir)
        
    except Exception as e:
        print(f"Critical error in task {task_id}: {str(e)}")
        tasks_status[task_id]["status"] = "failed"
        tasks_status[task_id]["errors"].append(f"Critical Error: {str(e)}")
    finally:
        # Cleanup uploaded excel
        if os.path.exists(excel_path):
            os.remove(excel_path)

def process_pvid_grouping(task_id: str, dir1x1: str, dir3x4: str, tasks_status: Dict):
    try:
        print(f"Starting PVID grouping task {task_id}")
        dest_root = os.path.join(PROCESSED_DIR, task_id)
        group_root = os.path.join(dest_root, "Group by PVID")
        os.makedirs(group_root, exist_ok=True)
        
        errors = []
        
        # Phase 1: Group files from 1x1 folder
        p1 = os.path.join(group_root, "1x1")
        os.makedirs(p1, exist_ok=True)
        files_1x1 = os.listdir(dir1x1)
        
        count_1x1 = 0
        for fname in files_1x1:
            if fname.startswith('.') or fname == 'Thumbs.db':
                continue
            fpath = os.path.join(dir1x1, fname)
            parsed = parse_name(fname)
            if not parsed:
                errors.append(f"1x1 Folder: Invalid name format: {fname}")
                continue
            
            uuid, label, ext = parsed
            u_dir = os.path.join(p1, uuid)
            os.makedirs(u_dir, exist_ok=True)
            dst = unique_path(os.path.join(u_dir, f"{label}{ext}"))
            shutil.copy2(fpath, dst)
            count_1x1 += 1
            
        tasks_status[task_id]["progress"] = 25
        
        # Phase 2: Group files from 3x4 folder
        p2 = os.path.join(group_root, "3x4")
        os.makedirs(p2, exist_ok=True)
        files_3x4 = os.listdir(dir3x4)
        
        count_3x4 = 0
        for fname in files_3x4:
            if fname.startswith('.') or fname == 'Thumbs.db':
                continue
            fpath = os.path.join(dir3x4, fname)
            parsed = parse_name(fname)
            if not parsed:
                errors.append(f"3x4 Folder: Invalid name format: {fname}")
                continue
            
            uuid, label, ext = parsed
            u_dir = os.path.join(p2, uuid)
            os.makedirs(u_dir, exist_ok=True)
            dst = unique_path(os.path.join(u_dir, f"{label}{ext}"))
            shutil.copy2(fpath, dst)
            count_3x4 += 1

        tasks_status[task_id]["progress"] = 50
        
        if count_1x1 == 0 and count_3x4 == 0:
             errors.append("No valid images found in either folder. Please ensure files follow the 'UUID_Label.jpg' format.")
        
        # Phase 3: Build GTG (Good To Go)
        gtg_1 = os.path.join(group_root, "1x1_GTG")
        gtg_3 = os.path.join(group_root, "3x4_GTG")
        os.makedirs(gtg_1, exist_ok=True)
        os.makedirs(gtg_3, exist_ok=True)
        
        uuids1 = set(os.listdir(p1)) if os.path.isdir(p1) else set()
        uuids2 = set(os.listdir(p2)) if os.path.isdir(p2) else set()
        common_uuids = sorted(uuids1.intersection(uuids2))
        
        total_common = len(common_uuids)
        for i, u in enumerate(common_uuids):
            src1 = os.path.join(p1, u)
            src3 = os.path.join(p2, u)
            L1 = list_labels(src1)
            L3 = list_labels(src3)
            
            # If labels match, copy to GTG
            if L1 == L3 and len(L1) > 0:
                d1 = os.path.join(gtg_1, u)
                d3 = os.path.join(gtg_3, u)
                os.makedirs(d1, exist_ok=True)
                os.makedirs(d3, exist_ok=True)
                
                for name in os.listdir(src1):
                    shutil.copy2(os.path.join(src1, name), os.path.join(d1, name))
                for name in os.listdir(src3):
                    shutil.copy2(os.path.join(src3, name), os.path.join(d3, name))
            
            if i % 10 == 0:
                prog = 50 + int((i / total_common) * 40)
                tasks_status[task_id]["progress"] = prog
                save_current_status(tasks_status)

        tasks_status[task_id]["progress"] = 90
        
        # Final Phase: ZIP creation
        zip_path = os.path.join(OUTPUT_DIR, f"{task_id}.zip")
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # We only want to include "Group by PVID" and its subdirs
            for root, dirs, files in os.walk(group_root):
                for file in files:
                    abs_path = os.path.join(root, file)
                    rel_path = os.path.relpath(abs_path, dest_root)
                    zipf.write(abs_path, rel_path)
        
        tasks_status[task_id]["status"] = "completed"
        tasks_status[task_id]["progress"] = 100
        tasks_status[task_id]["zip_url"] = f"/download/{task_id}"
        tasks_status[task_id]["errors"] = errors
        save_current_status(tasks_status)
        
        print(f"Task {task_id} completed. Grouped {total_common} UUIDs.")
        
        # Cleanup
        shutil.rmtree(dest_root)
        upload_dir = os.path.dirname(dir1x1)
        if os.path.exists(upload_dir):
            shutil.rmtree(upload_dir)
            
    except Exception as e:
        print(f"Critical error in PVID task {task_id}: {str(e)}")
        tasks_status[task_id]["status"] = "failed"
        tasks_status[task_id]["errors"].append(f"Critical Error: {str(e)}")
        save_current_status(tasks_status)

def save_current_status(tasks_status):
    try:
        with open(STATUS_FILE, "w") as f:
            json.dump(tasks_status, f)
    except:
        pass
