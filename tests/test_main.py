import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

from backend.main import app
from backend.database import Base, get_db, CustomSound
from backend.captcha import generate_captcha, verify_captcha, SECRET_KEY
from backend.youtube import is_relevant as yt_relevant
from backend.soundcloud import is_relevant as sc_relevant

# Инициализация тестовой базы данных в файле на диске для корректного шеринга соединений в SQLite
SQLALCHEMY_DATABASE_URL = "sqlite:///test_plugins.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    # Удаляем старый файл теста, если он остался
    if os.path.exists("test_plugins.db"):
        try:
            os.remove("test_plugins.db")
        except Exception:
            pass
            
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        if os.path.exists("test_plugins.db"):
            try:
                os.remove("test_plugins.db")
            except Exception:
                pass

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# 1. Тестирование капчи
def test_captcha_generation():
    question, token = generate_captcha()
    assert question is not None
    assert "+" in question
    assert token is not None
    assert len(token) == 64  # sha256 hash length

def test_captcha_verification():
    question, token = generate_captcha()
    # Разбираем пример, чтобы узнать ответ
    num1, num2 = map(int, question.split("+"))
    correct_answer = num1 + num2
    
    assert verify_captcha(str(correct_answer), token) is True
    assert verify_captcha(str(correct_answer + 1), token) is False
    assert verify_captcha("not-a-number", token) is False


# 2. Тестирование алгоритма релевантности
def test_relevance_matching():
    # YouTube
    assert yt_relevant("Serum", "Xfer Serum Factory Presets Demo") is True
    assert yt_relevant("Gross Beat", "FL Studio Gross Beat Presets Showcase") is True
    assert yt_relevant("Harmor", "Harmor Preset Bank Sound Test") is True
    
    # Обучающие материалы и обзоры с разговорами должны отсекаться (False)
    assert yt_relevant("Gross Beat", "FL Studio Gross Beat Tutorial") is False
    assert yt_relevant("Harmor", "How to design a bass in Harmor") is False
    assert yt_relevant("Serum", "FL Studio beginners tutorial 2026") is False

    # SoundCloud
    assert sc_relevant("Spire", "Reveal Sound Spire Trance Lead Demo") is True
    assert sc_relevant("Sylenth1", "Future House Lead Sylenth Preset") is True
    assert sc_relevant("Harmless", "Trap Beats using GMS in FL Studio") is False


# 3. Тестирование API эндпоинтов через TestClient
def test_get_captcha_endpoint(client):
    response = client.get("/api/captcha")
    assert response.status_code == 200
    json_data = response.json()
    assert "question" in json_data
    assert "token" in json_data

def test_search_empty_query(client):
    response = client.get("/api/search?q=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Search query cannot be empty"

def test_admin_endpoints_unauthorized(client):
    # Тест pending без авторизации
    response = client.get("/api/admin/pending")
    assert response.status_code == 401
    
    # Тест pending с неверным паролем
    response = client.get("/api/admin/pending", headers={"Authorization": "wrong-password"})
    assert response.status_code == 401

    # Тест moderate без авторизации
    response = client.post("/api/admin/moderate?sound_id=1&action=approve")
    assert response.status_code == 401


def test_upload_invalid_captcha(client):
    # Тест загрузки файла с неверной капчей
    file_content = b"fake audio content"
    files = {"file": ("test.mp3", file_content, "audio/mpeg")}
    data = {
        "plugin_name": "Serum",
        "title": "Cool Lead",
        "author_name": "ProducerOne",
        "captcha_answer": "999",  # Заведомо неверный ответ
        "captcha_token": "some-fake-token"
    }
    
    response = client.post("/api/upload", data=data, files=files)
    assert response.status_code == 400
    assert "Неверный ответ на капчу" in response.json()["detail"]


def test_full_upload_and_moderation_flow(client, db_session):
    # Сначала генерируем валидную капчу
    question, token = generate_captcha()
    num1, num2 = map(int, question.split("+"))
    correct_answer = num1 + num2

    # Загружаем корректный файл
    file_content = b"fake audio content"
    files = {"file": ("test.mp3", file_content, "audio/mpeg")}
    data = {
        "plugin_name": "Toxic Biohazard",
        "title": "Pad Demo",
        "author_name": "SoundDesigner",
        "captcha_answer": str(correct_answer),
        "captcha_token": token
    }

    response = client.post("/api/upload", data=data, files=files)
    assert response.status_code == 200
    assert response.json()["message"] == "Звук успешно загружен и отправлен на модерацию."

    # Проверяем, что в БД появился неодобренный звук
    sound = db_session.query(CustomSound).filter(CustomSound.plugin_name == "Toxic Biohazard").first()
    assert sound is not None
    assert sound.is_approved is False

    # Удаляем физически созданный файл, чтобы не мусорить на диске
    if os.path.exists(sound.file_path):
        os.remove(sound.file_path)

    # Проверяем список pending админом (пароль берем 'admin' по умолчанию)
    response = client.get("/api/admin/pending", headers={"Authorization": "admin"})
    assert response.status_code == 200
    pending_items = response.json()
    assert len(pending_items) == 1
    assert pending_items[0]["plugin_name"] == "Toxic Biohazard"

    # Одобряем звук
    response = client.post(
        f"/api/admin/moderate?sound_id={sound.id}&action=approve", 
        headers={"Authorization": "admin"}
    )
    assert response.status_code == 200
    assert "одобрен и опубликован" in response.json()["message"]

    # Проверяем статус в БД после одобрения
    db_session.refresh(sound)
    assert sound.is_approved is True
