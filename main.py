import os
import uuid
import shutil
import pandas as pd
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Request, Response, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Optional
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from jose import JWTError, jwt
from datetime import datetime, timedelta
import processor

app = FastAPI(title="Catalog Image Processor")

# JWT Settings
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "zepto-catalog-imaging-tool-secret-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "") 

# Session dependency
async def get_current_user(request: Request):
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid session")
        return email
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expired or invalid")

# Directories for processing
# Vercel filesystem is read-only except for /tmp
IS_VERCEL = os.environ.get("VERCEL") == "1"
BASE_STORAGE = "/tmp" if IS_VERCEL else "."

UPLOAD_DIR = os.path.join(BASE_STORAGE, "uploads")
PROCESSED_DIR = os.path.join(BASE_STORAGE, "processed")
OUTPUT_DIR = os.path.join(BASE_STORAGE, "output")
STATUS_FILE = os.path.join(BASE_STORAGE, "tasks_status.json")

for d in [UPLOAD_DIR, PROCESSED_DIR, OUTPUT_DIR]:
    os.makedirs(d, exist_ok=True)

import json

# In-memory task status (for active sessions)
tasks_status: Dict[str, Dict] = {}

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

@app.post("/auth/login")
async def login(response: Response, data: dict):
    credential = data.get("credential")
    if not credential:
        raise HTTPException(status_code=400, detail="Missing credential")
    
    try:
        # GOOGLE_CLIENT_ID must be set in env vars
        idinfo = id_token.verify_oauth2_token(credential, google_requests.Request(), GOOGLE_CLIENT_ID)
        
        email = idinfo['email'].lower()
        allowed_domains = ["@zepto.com", "@zeptonow.com"]
        allowed_individual_emails = ["debopriyosensupu@gmail.com"]
        
        is_allowed_domain = any(email.endswith(domain) for domain in allowed_domains)
        is_allowed_individual = email in allowed_individual_emails
        
        if not (is_allowed_domain or is_allowed_individual):
            raise HTTPException(status_code=403, detail="Access Denied – Unauthorized User")
        
        # Create JWT session
        expires = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode = {"sub": email, "exp": expires}
        token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        
        response.set_cookie(
            key="session_token", 
            value=token, 
            httponly=True, 
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            samesite="lax",
            secure=IS_VERCEL
        )
        return {"status": "success", "email": email}
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

@app.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("session_token")
    return {"status": "success"}

@app.get("/auth/user")
async def get_user_info(email: str = Depends(get_current_user)):
    return {"email": email}

@app.get("/auth/config")
async def get_auth_config():
    return {"google_client_id": GOOGLE_CLIENT_ID}

class ProcessRequest(BaseModel):
    ratio: str

@app.post("/upload-metadata")
async def upload_metadata(
    ratio: str, 
    file: UploadFile = File(...), 
    email: str = Depends(get_current_user)
):
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file format")
    
    task_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{task_id}_{file.filename}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        # Extract work items without processing images yet
        work_items, col_map = processor.get_work_items(file_path, ratio)
        
        tasks_status[task_id] = {
            "status": "batch_processing", 
            "progress": 0, 
            "errors": [], 
            "zip_url": None,
            "total_items": len(work_items)
        }
        save_status()
        
        return {
            "task_id": task_id, 
            "work_items": work_items,
            "total_items": len(work_items)
        }
    except Exception as e:
        if os.path.exists(file_path): os.remove(file_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process-batch")
async def process_batch(
    task_id: str,
    ratio: str,
    items: List[dict],
    email: str = Depends(get_current_user)
):
    try:
        results = processor.process_batch_items(task_id, items, ratio)
        return {"status": "success", "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/finalize-task")
async def finalize_task(
    task_id: str,
    conversion_results: List[dict],
    email: str = Depends(get_current_user)
):
    try:
        zip_url = processor.finalize_conversion_task(task_id, conversion_results)
        tasks_status[task_id].update({
            "status": "completed",
            "progress": 100,
            "zip_url": zip_url
        })
        save_status()
        return {"zip_url": zip_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/pvid/init")
async def pvid_init(email: str = Depends(get_current_user)):
    task_id = str(uuid.uuid4())
    task_upload_dir = os.path.join(UPLOAD_DIR, task_id)
    os.makedirs(os.path.join(task_upload_dir, "1x1"), exist_ok=True)
    os.makedirs(os.path.join(task_upload_dir, "3x4"), exist_ok=True)
    
    tasks_status[task_id] = {"status": "uploading", "progress": 0, "errors": [], "zip_url": None}
    save_status()
    return {"task_id": task_id}

@app.post("/pvid/upload-file")
async def pvid_upload_single(
    task_id: str,
    folder: str,
    file: UploadFile = File(...),
    email: str = Depends(get_current_user)
):
    if folder not in ["1x1", "3x4"]:
        raise HTTPException(status_code=400, detail="Invalid folder name")
    
    task_upload_dir = os.path.join(UPLOAD_DIR, task_id)
    target_dir = os.path.join(task_upload_dir, folder)
    
    if not os.path.exists(target_dir):
        os.makedirs(target_dir, exist_ok=True)
    
    safe_name = os.path.basename(file.filename)
    if safe_name:
        with open(os.path.join(target_dir, safe_name), "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
    return {"status": "success"}

@app.post("/pvid/process")
async def pvid_process_trigger(
    task_id: str,
    background_tasks: BackgroundTasks,
    email: str = Depends(get_current_user)
):
    if task_id not in tasks_status:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_upload_dir = os.path.join(UPLOAD_DIR, task_id)
    dir1x1 = os.path.join(task_upload_dir, "1x1")
    dir3x4 = os.path.join(task_upload_dir, "3x4")
    
    tasks_status[task_id]["status"] = "processing"
    save_status()
    
    background_tasks.add_task(processor.process_pvid_grouping, task_id, dir1x1, dir3x4, tasks_status)
    return {"status": "started"}

@app.post("/upload-pvid")
async def upload_pvid_legacy(
    background_tasks: BackgroundTasks, 
    folder1x1: Optional[List[UploadFile]] = File(None), 
    folder3x4: Optional[List[UploadFile]] = File(None),
    email: str = Depends(get_current_user)
):
    # This remains for single-batch small uploads (Legacy)
    task_id = str(uuid.uuid4())
    task_upload_dir = os.path.join(UPLOAD_DIR, task_id)
    dir1x1 = os.path.join(task_upload_dir, "1x1")
    dir3x4 = os.path.join(task_upload_dir, "3x4")
    
    os.makedirs(dir1x1, exist_ok=True)
    os.makedirs(dir3x4, exist_ok=True)
    
    if folder1x1:
        for file in folder1x1:
            safe_name = os.path.basename(file.filename)
            if safe_name:
                with open(os.path.join(dir1x1, safe_name), "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
            
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
async def get_status(task_id: str, email: str = Depends(get_current_user)):
    if task_id not in tasks_status:
        load_status()  # Try reloading from disk
    if task_id not in tasks_status:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks_status[task_id]

@app.get("/download/{task_id}")
async def download_zip(task_id: str, email: str = Depends(get_current_user)):
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
