import urllib.request
import urllib.parse
import re

def is_relevant(query: str, title: str) -> bool:
    """
    Проверяет, содержит ли заголовок трека ключевые слова из запроса пользователя,
    и отсекает обучающие материалы (tutorial, guide и т.д.).
    """
    title_lower = title.lower()
    
    # Исключаем обучающие материалы и уроки
    exclude_words = {"tutorial", "guide", "how to", "how do", "beginners", "course", "workflow", "learn", "basics"}
    for ew in exclude_words:
        if ew in title_lower:
            return False

    stop_words = {"vst", "plugin", "fl", "studio", "demo", "review", "sound", "test", "showcase", "presets", "tutorial", "free", "download"}
    
    query_words = [w.strip() for w in re.split(r'\W+', query.lower()) if w.strip()]
    query_keywords = [w for w in query_words if w not in stop_words]
    
    if not query_keywords:
        query_keywords = query_words
        
    if not query_keywords:
        return False
    
    for kw in query_keywords:
        if kw in title_lower:
            continue
        kw_clean = re.sub(r'\d+$', '', kw)
        if kw_clean and len(kw_clean) >= 4 and kw_clean in title_lower:
            continue
        return False
    return True

def search_soundcloud(query: str) -> list:
    """
    Выполняет поиск на SoundCloud по запросу '[Plugin Name] presets demo'
    с исключением обучающих материалов и возвращает список релевантных треков.
    """
    search_query = f"{query} presets demo"
    url = f"https://soundcloud.com/search/sounds?q={urllib.parse.quote_plus(search_query)}"
    
    req = urllib.request.Request(
        url,
        headers={
            # Используем юзер-агент для получения стандартной HTML-версии (noscript)
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode('utf-8')
            
        # Ищем ссылки в noscript-разделе SoundCloud
        # Обычные ссылки на треки имеют вид: <h2><a href="/username/track-slug">Track Title</a></h2>
        matches = re.findall(r'<h2><a href="([^"]+)">([^<]+)</a></h2>', html)
        
        tracks = []
        ignored_paths = {'/', '/terms', '/privacy', '/pages', '/explore', '/popular', '/mobile'}
        
        for path, title in matches:
            # Ссылки на треки имеют вид /username/track-slug (без дополнительных слэшей)
            path = path.strip()
            title = title.strip()
            
            # Проверяем, что путь похож на трек: "/user/track"
            parts = [p for p in path.split('/') if p]
            if len(parts) == 2 and path not in ignored_paths:
                # Проверяем на релевантность
                if is_relevant(query, title):
                    tracks.append({
                        'id': path, # e.g. "xfer-records/serum-demo"
                        'title': title,
                        'url': f"https://soundcloud.com{path}",
                        'embed_url': f"https://w.soundcloud.com/player/?url=https%3A//soundcloud.com{path}&color=%23ff0033&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false"
                    })
                    
        # Резервный поиск по регулярке, если верстка изменилась
        if not tracks:
            # Находим любые пути вида /user/track-slug в кавычках href="/user/track"
            raw_paths = re.findall(r'href="/([a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+)"', html)
            unique_paths = list(dict.fromkeys(raw_paths))
            
            for path in unique_paths[:3]:
                parts = path.split('/')
                if parts[0] not in {'pages', 'terms', 'privacy', 'explore', 'popular', 'charts', 'search'}:
                    tracks.append({
                        'id': f"/{path}",
                        'title': f"{query} SoundCloud Demo",
                        'url': f"https://soundcloud.com/{path}",
                        'embed_url': f"https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/{path}&color=%23ff0033&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false"
                    })
                    
        return tracks[:5]
        
    except Exception as e:
        print(f"Error requesting SoundCloud: {e}")
        return []
