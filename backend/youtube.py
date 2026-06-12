import urllib.request
import urllib.parse
import re
import json

def is_relevant(query: str, title: str) -> bool:
    """
    Проверяет, содержит ли заголовок видео ключевые слова из запроса пользователя.
    Это исключает ручное ведение базы синонимов или брендов.
    """
    stop_words = {"vst", "plugin", "fl", "studio", "demo", "review", "sound", "test", "showcase", "presets", "tutorial", "free", "download"}
    
    # Токенизируем запрос пользователя
    query_words = [w.strip() for w in re.split(r'\W+', query.lower()) if w.strip()]
    query_keywords = [w for w in query_words if w not in stop_words]
    
    # Если все слова оказались стоп-словами, проверяем исходные слова
    if not query_keywords:
        query_keywords = query_words
        
    if not query_keywords:
        return False
        
    title_lower = title.lower()
    
    # Все ключевые слова из запроса должны быть в заголовке видео
    for kw in query_keywords:
        # Проверяем прямое вхождение
        if kw in title_lower:
            continue
        # Если ключевое слово содержит цифры на конце (например, sylenth1), 
        # пробуем отрезать их и проверить основу (sylenth)
        kw_clean = re.sub(r'\d+$', '', kw)
        if kw_clean and len(kw_clean) >= 4 and kw_clean in title_lower:
            continue
        return False
    return True

def search_youtube(query: str) -> list:
    """
    Выполняет поиск на YouTube по запросу '[Plugin Name] FL Studio demo'
    и возвращает список релевантных видео.
    """
    # Составляем поисковый запрос
    search_query = f"{query} FL Studio demo"
    url = f"https://www.youtube.com/results?search_query={urllib.parse.quote_plus(search_query)}"
    
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode('utf-8')
            
        json_search = re.search(r'var ytInitialData = ({.*?});', html)
        videos = []
        
        if json_search:
            data = json.loads(json_search.group(1))
            try:
                # Извлекаем элементы видео из структуры YouTube
                contents = data['contents']['twoColumnSearchResultsRenderer']['primaryContents']['sectionListRenderer']['contents']
                for item in contents:
                    if 'itemSectionRenderer' in item:
                        for item_content in item['itemSectionRenderer']['contents']:
                            if 'videoRenderer' in item_content:
                                vr = item_content['videoRenderer']
                                video_id = vr['videoId']
                                title = vr['title']['runs'][0]['text']
                                channel = vr['ownerText']['runs'][0]['text']
                                duration = vr.get('lengthText', {}).get('simpleText', 'Unknown')
                                
                                # Проверяем на релевантность
                                if is_relevant(query, title):
                                    videos.append({
                                        'id': video_id,
                                        'title': title,
                                        'channel': channel,
                                        'duration': duration,
                                        'url': f"https://www.youtube.com/watch?v={video_id}"
                                    })
            except Exception as e:
                # В случае изменения верстки YouTube логируем ошибку парсинга JSON
                print(f"Error parsing YouTube JSON structure: {e}")
                
        # Если парсер JSON ничего не вернул или сломался, используем регулярное выражение
        # как резервный способ получить хотя бы список ID видео (но без проверки релевантности заголовков)
        if not videos:
            video_ids = re.findall(r'/watch\?v=([a-zA-Z0-9_-]{11})', html)
            unique_ids = list(dict.fromkeys(video_ids))
            for vid in unique_ids[:3]:
                videos.append({
                    'id': vid,
                    'title': f"{query} Demo Video",
                    'channel': "YouTube",
                    'duration': "Unknown",
                    'url': f"https://www.youtube.com/watch?v={vid}"
                })
                
        return videos[:5] # Возвращаем топ-5 релевантных видео
        
    except Exception as e:
        print(f"Error requesting YouTube: {e}")
        return []
