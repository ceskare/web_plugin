import os
import shutil
import uuid
import mimetypes
import time
import hmac
from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, Header, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

# Явно регистрируем типы, чтобы исправить известный баг Windows с MIME-типами CSS/JS в FastAPI
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/javascript", ".js")

from backend.config import UPLOAD_DIR, ADMIN_PASSWORD, BASE_DIR
from backend.database import init_db, get_db, CustomSound, Plugin
from backend.youtube import search_youtube
from backend.soundcloud import search_soundcloud
from backend.captcha import generate_captcha, verify_captcha

app = FastAPI(title="FL Studio Plugin Sound Board")

# Настройка CORS для локальной разработки
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Хранилище неудачных попыток входа: {ip: {"attempts": int, "blocked_until": float}}
login_attempts = {}

def check_brute_force(ip: str):
    """
    Проверяет, не заблокирован ли IP-адрес из-за слишком большого количества попыток подбора.
    """
    now = time.time()
    if ip in login_attempts:
        record = login_attempts[ip]
        if record["blocked_until"] > now:
            minutes_left = int((record["blocked_until"] - now) // 60) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Слишком много неверных попыток. Доступ временно заблокирован. Попробуйте через {minutes_left} мин."
            )
        # Если время блокировки прошло, сбрасываем попытки
        if record["blocked_until"] > 0 and record["blocked_until"] <= now:
            login_attempts.pop(ip, None)

def register_failed_attempt(ip: str):
    """
    Регистрирует неудачную попытку входа и блокирует IP при 5 ошибках.
    """
    now = time.time()
    if ip not in login_attempts:
        login_attempts[ip] = {"attempts": 1, "blocked_until": 0}
    else:
        login_attempts[ip]["attempts"] += 1
        
    if login_attempts[ip]["attempts"] >= 5:
        login_attempts[ip]["blocked_until"] = now + 15 * 60 # Блокировка на 15 минут

# Инициализация базы данных при запуске
@app.on_event("startup")
def startup_event():
    init_db()
    # Создаем папку uploads, если её нет
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    # Создаем папку frontend, если её нет (чтобы статика не падала)
    frontend_dir = os.path.join(BASE_DIR, "frontend")
    os.makedirs(frontend_dir, exist_ok=True)

# Эндпоинт поиска плагина
@app.get("/api/search")
def search_plugin(q: str, db: Session = Depends(get_db)):
    query = q.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Search query cannot be empty")

    # 1. Поиск в SQLite среди одобренных пользовательских загрузок
    custom_sounds = (
        db.query(CustomSound)
        .filter(CustomSound.plugin_name.ilike(f"%{query}%"))
        .filter(CustomSound.is_approved == True)
        .all()
    )
    
    custom_results = []
    for s in custom_sounds:
        custom_results.append({
            "id": s.id,
            "plugin_name": s.plugin_name,
            "title": s.title,
            "author_name": s.author_name,
            "youtube_url": s.youtube_url,
            "file_url": f"/uploads/{os.path.basename(s.file_path)}"
        })

    # Если нашли одобренные авторские файлы, возвращаем их в первую очередь
    if custom_results:
        return {
            "query": query,
            "source": "custom_uploads",
            "results": custom_results
        }

    # 2. Поиск на YouTube с автоматической фильтрацией релевантности
    yt_results = search_youtube(query)
    if yt_results:
        return {
            "query": query,
            "source": "youtube",
            "results": yt_results
        }

    # 3. Поиск на SoundCloud с автоматической фильтрацией релевантности
    sc_results = search_soundcloud(query)
    if sc_results:
        return {
            "query": query,
            "source": "soundcloud",
            "results": sc_results
        }

    # 4. Если ничего не найдено
    return {
        "query": query,
        "source": "none",
        "results": []
    }

# Эндпоинт получения капчи
@app.get("/api/captcha")
def get_captcha_challenge():
    question, token = generate_captcha()
    return {"question": question, "token": token}

# Эндпоинт загрузки звука
@app.post("/api/upload")
async def upload_sound(
    plugin_name: str = Form(...),
    title: str = Form(...),
    author_name: str = Form(...),
    youtube_url: str = Form(None),
    captcha_answer: str = Form(...),
    captcha_token: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # 1. Проверка капчи
    if not verify_captcha(captcha_answer, captcha_token):
        raise HTTPException(status_code=400, detail="Неверный ответ на капчу. Пожалуйста, попробуйте еще раз.")

    # 2. Валидация файла (размер и формат)
    MAX_SIZE = 5 * 1024 * 1024  # 5MB
    
    # Считываем часть файла для проверки размера (не загружая весь файл в ОЗУ сразу)
    content = await file.read(MAX_SIZE + 100)
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Файл слишком большой. Максимальный размер 5MB.")
    
    # Возвращаем указатель в начало файла
    await file.seek(0)

    # Проверка расширения файла
    filename = file.filename.lower()
    allowed_extensions = {".mp3", ".wav", ".ogg"}
    file_ext = os.path.splitext(filename)[1]
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Недопустимый формат файла. Разрешены только .mp3, .wav, .ogg")

    # 3. Сохранение файла с уникальным именем
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    dest_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при сохранении файла: {str(e)}")

    # 4. Добавление записи в бд в статусе ожидания модерации
    new_sound = CustomSound(
        plugin_name=plugin_name.strip(),
        file_path=dest_path,
        title=title.strip(),
        author_name=author_name.strip(),
        youtube_url=youtube_url.strip() if youtube_url else None,
        is_approved=False
    )
    db.add(new_sound)
    db.commit()
    db.refresh(new_sound)

    return {"message": "Звук успешно загружен и отправлен на модерацию."}

# Роут для секретной админ-панели (скрыта от обычных пользователей)
@app.get("/control-room")
def get_control_room():
    return FileResponse(os.path.join(BASE_DIR, "frontend", "control-room.html"))

# Эндпоинты администрирования
@app.get("/api/admin/pending")
def get_pending_sounds(request: Request, authorization: str = Header(None), db: Session = Depends(get_db)):
    client_ip = request.client.host
    check_brute_force(client_ip)
    
    if not authorization or not hmac.compare_digest(authorization, ADMIN_PASSWORD):
        register_failed_attempt(client_ip)
        raise HTTPException(status_code=401, detail="Неверный пароль администратора")
    
    # Сбрасываем счетчик неудачных попыток при успешном входе
    login_attempts.pop(client_ip, None)
    
    pending = db.query(CustomSound).filter(CustomSound.is_approved == False).all()
    results = []
    for s in pending:
        results.append({
            "id": s.id,
            "plugin_name": s.plugin_name,
            "title": s.title,
            "author_name": s.author_name,
            "youtube_url": s.youtube_url,
            "file_url": f"/uploads/{os.path.basename(s.file_path)}",
            "created_at": s.created_at.strftime("%Y-%m-%d %H:%M:%S")
        })
    return results

@app.post("/api/admin/moderate")
def moderate_sound(
    request: Request,
    sound_id: int,
    action: str,  # "approve" or "reject"
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    client_ip = request.client.host
    check_brute_force(client_ip)
    
    if not authorization or not hmac.compare_digest(authorization, ADMIN_PASSWORD):
        register_failed_attempt(client_ip)
        raise HTTPException(status_code=401, detail="Неверный пароль администратора")
    
    login_attempts.pop(client_ip, None)
    
    sound = db.query(CustomSound).filter(CustomSound.id == sound_id).first()
    if not sound:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    if action == "approve":
        sound.is_approved = True
        
        plugin_exists = db.query(Plugin).filter(Plugin.name.ilike(sound.plugin_name)).first()
        if not plugin_exists:
            new_plugin = Plugin(name=sound.plugin_name)
            db.add(new_plugin)
            
        db.commit()
        return {"message": "Звук одобрен и опубликован."}
        
    elif action == "reject":
        if os.path.exists(sound.file_path):
            try:
                os.remove(sound.file_path)
            except Exception as e:
                print(f"Error deleting file {sound.file_path}: {e}")
                
        db.delete(sound)
        db.commit()
        return {"message": "Звук отклонен и удален."}
    
    else:
        raise HTTPException(status_code=400, detail="Недопустимое действие. Только 'approve' или 'reject'.")

# Монтирование папки загрузок для раздачи статических файлов
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Монтирование папки фронтенда
app.mount("/", StaticFiles(directory=os.path.join(BASE_DIR, "frontend"), html=True), name="frontend")
