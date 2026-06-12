import hashlib
import random

SECRET_KEY = "fl_pulse_captcha_secret_key"

def generate_captcha() -> tuple:
    """
    Генерирует математический пример и токен с правильным ответом.
    Возвращает (строка_примера, токен).
    """
    num1 = random.randint(1, 12)
    num2 = random.randint(1, 10)
    question = f"{num1} + {num2}"
    answer = num1 + num2
    
    # Хэшируем правильный ответ вместе с секретным ключом
    token_input = f"{answer}:{SECRET_KEY}"
    token = hashlib.sha256(token_input.encode('utf-8')).hexdigest()
    
    return question, token

def verify_captcha(user_answer: str, token: str) -> bool:
    """
    Проверяет ответ пользователя. Сверяет хэш ответа с токеном.
    """
    try:
        clean_answer = int(user_answer.strip())
        token_input = f"{clean_answer}:{SECRET_KEY}"
        expected_token = hashlib.sha256(token_input.encode('utf-8')).hexdigest()
        return expected_token == token
    except Exception:
        return False
