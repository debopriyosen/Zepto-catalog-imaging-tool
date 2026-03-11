import os
import uuid
import shutil
import pandas as pd
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Request, Response, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image
from io import BytesIO
from pydantic import BaseModel
from typing import List, Dict, Optional
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from jose import JWTError, jwt
from datetime import datetime, timedelta
import processor
import requests

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

# Static Files and Downloads
# Note: OUTPUT_DIR and UPLOAD_DIR are retained for legacy compatibility or if the server ever needs to store temp files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse('static/index.html')

@app.get("/favicon.png")
async def favicon():
    return FileResponse('static/favicon.png')

@app.get("/logo.png")
async def logo():
    return FileResponse('static/logo.png')
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        zip_path, 
        media_type="application/zip", 
        filename=f"processed_images_{task_id[:8]}.zip"
    )

@app.get("/proxy")
async def proxy_image(url: str, email: str = Depends(get_current_user)):
    try:
        # Fetch the image on behalf of the client
        resp = requests.get(url, timeout=15, stream=True)
        resp.raise_for_status()
        
        # Load image with PIL
        img_data = resp.content
        img = Image.open(BytesIO(img_data))
        
        # Handle transparency: Convert to RGB with white background
        if img.mode in ("RGBA", "P"):
            if img.mode == "P":
                img = img.convert("RGBA")
            background = Image.new("RGB", img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3]) # 3 is the alpha channel
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")
            
        # Save processed image to bytes
        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=95)
        
        return Response(
            content=buffer.getvalue(), 
            media_type="image/jpeg"
        )
    except Exception as e:
        print(f"Proxy error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")

# Serve static files for frontend
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
