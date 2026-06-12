// Элементы страницы
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsSection = document.getElementById('resultsSection');
const resultsTitle = document.getElementById('resultsTitle');
const resultsSource = document.getElementById('resultsSource');
const customPlayerContainer = document.getElementById('customPlayerContainer');
const playerPluginTitle = document.getElementById('playerPluginTitle');
const playerAuthor = document.getElementById('playerAuthor');
const playBtn = document.getElementById('playBtn');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const timeDisplay = document.getElementById('timeDisplay');
const embedsContainer = document.getElementById('embedsContainer');
const notFoundPanel = document.getElementById('notFoundPanel');
const scrollToUploadBtn = document.getElementById('scrollToUploadBtn');
const uploadSection = document.getElementById('uploadSection');
const uploadForm = document.getElementById('uploadForm');
const dropzone = document.getElementById('dropzone');
const dropzoneText = document.getElementById('dropzoneText');
const formFile = document.getElementById('formFile');
const captchaQuestion = document.getElementById('captchaQuestion');
const formCaptchaAnswer = document.getElementById('formCaptchaAnswer');
const formCaptchaToken = document.getElementById('formCaptchaToken');
const toast = document.getElementById('toast');

// Аудио объекты для кастомного плеера
let audio = new Audio();
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let animationFrameId = null;

// Показ тостов
function showToast(message) {
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}

// Загрузка капчи
async function loadCaptcha() {
    try {
        const response = await fetch('/api/captcha');
        const data = await response.json();
        captchaQuestion.textContent = data.question;
        formCaptchaToken.value = data.token;
        formCaptchaAnswer.value = '';
    } catch (err) {
        console.error('Ошибка загрузки капчи:', err);
    }
}

// Скролл к загрузке
scrollToUploadBtn.addEventListener('click', () => {
    uploadSection.scrollIntoView({ behavior: 'smooth' });
    const pluginNameVal = searchInput.value.trim();
    if (pluginNameVal) {
        document.getElementById('formPluginName').value = pluginNameVal;
    }
});

// Инициализация при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    loadCaptcha();
});

// Клик по поиску
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

// Основная функция поиска
async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
        showToast('Пожалуйста, введите название плагина!');
        return;
    }

    // Сброс состояния плеера
    pauseCustomAudio();
    resultsSection.style.display = 'none';
    notFoundPanel.style.display = 'none';
    customPlayerContainer.style.display = 'none';
    embedsContainer.innerHTML = '';

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error('Ошибка при выполнении поиска');
        }

        const data = await response.json();
        
        if (data.source === 'none' || !data.results || data.results.length === 0) {
            // Звук не найден
            notFoundPanel.style.display = 'flex';
            showToast('Звук не найден в сети. Вы можете загрузить его первым!');
        } else {
            // Отображаем результаты
            resultsSection.style.display = 'block';
            resultsTitle.textContent = `Результаты по запросу: "${query}"`;
            
            if (data.source === 'custom_uploads') {
                resultsSource.textContent = 'Официальный демо-звук';
                setupCustomPlayer(data.results[0]); // Воспроизводим первый одобренный файл
            } else if (data.source === 'youtube') {
                resultsSource.textContent = 'YouTube видео-демо';
                renderYoutubeEmbeds(data.results);
            } else if (data.source === 'soundcloud') {
                resultsSource.textContent = 'SoundCloud трек-демо';
                renderSoundCloudEmbeds(data.results);
            }
        }
    } catch (err) {
        showToast('Ошибка поиска: ' + err.message);
    }
}

// Настройка кастомного плеера для загруженных аудиофайлов
function setupCustomPlayer(sound) {
    customPlayerContainer.style.display = 'block';
    playerPluginTitle.textContent = `${sound.plugin_name} — ${sound.title}`;
    playerAuthor.textContent = `Загрузил: ${sound.author_name}`;

    audio.src = sound.file_url;
    audio.load();

    // Сброс прогресс-бара
    progressFill.style.width = '0%';
    timeDisplay.textContent = '00:00 / 00:00';
    playBtn.textContent = 'Play';

    // Обновление прогресс-бара при воспроизведении
    audio.ontimeupdate = () => {
        if (audio.duration) {
            const pct = (audio.currentTime / audio.duration) * 100;
            progressFill.style.width = `${pct}%`;
            timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
        }
    };

    audio.onended = () => {
        playBtn.textContent = 'Play';
        progressFill.style.width = '0%';
    };
}

// Форматирование времени в MM:SS
function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// Обработка клика по прогресс-бару
progressBar.addEventListener('click', (e) => {
    if (!audio.src || !audio.duration) return;
    const rect = progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pos * audio.duration;
});

// Клик по кнопке Play/Pause
playBtn.addEventListener('click', () => {
    if (audio.paused) {
        playCustomAudio();
    } else {
        pauseCustomAudio();
    }
});

function playCustomAudio() {
    audio.play().then(() => {
        playBtn.textContent = 'Pause';
        initVisualizer();
    }).catch(err => {
        showToast('Ошибка воспроизведения: ' + err.message);
    });
}

function pauseCustomAudio() {
    audio.pause();
    playBtn.textContent = 'Play';
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
}

// Инициализация Canvas визуализатора спектра
function initVisualizer() {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    
    // Регулируем разрешение под размер дисплея
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    if (!audioCtx) {
        // Создаем AudioContext при первом воспроизведении
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        sourceNode = audioCtx.createMediaElementSource(audio);
        sourceNode.connect(analyser);
        analyser.connect(audioCtx.destination);
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        animationFrameId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = '#080808';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i];

            // Цвет: Spotify x Pitchfork Красный с зависимостью от частоты
            const red = 255;
            const green = Math.max(0, 40 - (barHeight * 0.1));
            const blue = Math.max(51, 51 + (barHeight * 0.2));

            ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
            
            // Отрисовка плоских neo-brutalist баров
            ctx.fillRect(x, canvas.height - (barHeight * 0.4), barWidth - 2, barHeight * 0.4);
            x += barWidth;
        }
    }

    draw();
}

// Рендеринг YouTube роликов
function renderYoutubeEmbeds(videos) {
    videos.forEach(video => {
        const item = document.createElement('div');
        item.className = 'embed-item';
        item.innerHTML = `
            <div class="embed-item-header">
                <div class="embed-item-title">${video.title}</div>
                <div class="embed-item-channel">${video.channel} • [${video.duration}]</div>
            </div>
            <div class="iframe-wrapper">
                <iframe src="https://www.youtube.com/embed/${video.id}" allowfullscreen></iframe>
            </div>
        `;
        embedsContainer.appendChild(item);
    });
}

// Рендеринг SoundCloud треков
function renderSoundCloudEmbeds(tracks) {
    tracks.forEach(track => {
        const item = document.createElement('div');
        item.className = 'embed-item';
        item.innerHTML = `
            <div class="embed-item-header">
                <div class="embed-item-title">${track.title}</div>
            </div>
            <iframe width="100%" height="166" scrolling="no" frameborder="no" allow="autoplay" src="${track.embed_url}"></iframe>
        `;
        embedsContainer.appendChild(item);
    });
}

// Drag and drop для формы загрузки
['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
    }, false);
});

dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        formFile.files = files;
        updateDropzoneText(files[0].name);
    }
});

dropzone.addEventListener('click', () => {
    formFile.click();
});

formFile.addEventListener('change', () => {
    if (formFile.files.length > 0) {
        updateDropzoneText(formFile.files[0].name);
    }
});

function updateDropzoneText(name) {
    dropzoneText.textContent = `Выбран файл: ${name} (нажмите для замены)`;
    dropzoneText.style.fontWeight = 'bold';
}

// Отправка формы загрузки звука
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const file = formFile.files[0];
    if (!file) {
        showToast('Пожалуйста, выберите аудиофайл!');
        return;
    }

    // Проверяем размер файла на клиенте
    if (file.size > 5 * 1024 * 1024) {
        showToast('Размер файла превышает 5MB!');
        return;
    }

    const formData = new FormData();
    formData.append('plugin_name', document.getElementById('formPluginName').value);
    formData.append('author_name', document.getElementById('formAuthorName').value);
    formData.append('title', document.getElementById('formSoundTitle').value);
    formData.append('youtube_url', document.getElementById('formYoutubeUrl').value);
    formData.append('captcha_answer', formCaptchaAnswer.value);
    formData.append('captcha_token', formCaptchaToken.value);
    formData.append('file', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const res = await response.json();
        
        if (!response.ok) {
            throw new Error(res.detail || 'Не удалось отправить файл');
        }

        showToast(res.message);
        uploadForm.reset();
        dropzoneText.textContent = 'Перетащите файл сюда или нажмите для выбора';
        dropzoneText.style.fontWeight = 'normal';
        loadCaptcha();
        
        // Скроллим наверх
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        showToast('Ошибка отправки: ' + err.message);
        loadCaptcha(); // Перезагружаем капчу при ошибке
    }
});
