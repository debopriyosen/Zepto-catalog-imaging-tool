import os
import uuid
import shutil
import pandas as pd
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict
import processor

app = FastAPI(title="Catalog Image Processor")

# Directories for processing
UPLOAD_DIR = "uploads"
PROCESSED_DIR = "processed"
OUTPUT_DIR = "output"

for d in [UPLOAD_DIR, PROCESSED_DIR, OUTPUT_DIR]:
    os.makedirs(d, exist_ok=True)

import json

# In-memory task status (for active sessions)
tasks_status: Dict[str, Dict] = {}
STATUS_FILE = "tasks_status.json"

def save_status():
    with open(STATUS_FILE, "w") as f:
        json.dump(tasks_status, f)

def load_status():
    global tasks_status
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE, "r") as f:
                tasks_status = json.load(f)
        except:
            tasks_status = {}

load_status()

class ProcessRequest(BaseModel):
    ratio: str

@app.post("/upload")
async def upload_file(background_tasks: BackgroundTasks, ratio: str, file: UploadFile = File(...)):
    print(f"Received upload request: {file.filename}, ratio: {ratio}")
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel or CSV file.")
    
    task_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{task_id}_{file.filename}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    tasks_status[task_id] = {"status": "processing", "progress": 0, "errors": [], "zip_url": None}
    save_status()
    
    background_tasks.add_task(processor.process_catalog_images, task_id, file_path, ratio, tasks_status)
    
    return {"task_id": task_id}

@app.post("/upload-pvid")
async def upload_pvid(
    background_tasks: BackgroundTasks, 
    folder1x1: Optional[List[UploadFile]] = File(None), 
    folder3x4: Optional[List[UploadFile]] = File(None)
):
    print(f"Received PVID upload: {len(folder1x1) if folder1x1 else 0} files (1x1), {len(folder3x4) if folder3x4 else 0} files (3x4)")
    
    task_id = str(uuid.uuid4())
    task_upload_dir = os.path.join(UPLOAD_DIR, task_id)
    dir1x1 = os.path.join(task_upload_dir, "1x1")
    dir3x4 = os.path.join(task_upload_dir, "3x4")
    
    os.makedirs(dir1x1, exist_ok=True)
    os.makedirs(dir3x4, exist_ok=True)
    
    # Save 1x1 files
    if folder1x1:
        for file in folder1x1:
            safe_name = os.path.basename(file.filename)
            if safe_name:
                with open(os.path.join(dir1x1, safe_name), "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
            
    # Save 3x4 files
    if folder3x4:
        for file in folder3x4:
            safe_name = os.path.basename(file.filename)
            if safe_name:
                with open(os.path.join(dir3x4, safe_name), "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
            
    tasks_status[task_id] = {"status": "processing", "progress": 0, "errors": [], "zip_url": None}
    save_status()
    
    background_tasks.add_task(processor.process_pvid_grouping, task_id, dir1x1, dir3x4, tasks_status)
    
    return {"task_id": task_id}

@app.get("/status/{task_id}")
async def get_status(task_id: str):
    if task_id not in tasks_status:
        load_status()  # Try reloading from disk
    if task_id not in tasks_status:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks_status[task_id]

@app.get("/download/{task_id}")
async def download_zip(task_id: str):
    zip_path = os.path.join(OUTPUT_DIR, f"{task_id}.zip")
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        zip_path, 
        media_type="application/zip", 
        filename=f"processed_images_{task_id[:8]}.zip"
    )

# Serve static files for frontend
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
