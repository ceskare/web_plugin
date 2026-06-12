import os

# Базовый путь
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Папка для загрузки аудио
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# База данных SQLite
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'plugins.db')}")

# Пароль администратора (по умолчанию 'admin', можно изменить через ENV)
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")
