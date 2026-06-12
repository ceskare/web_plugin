// Элементы страницы
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsSection = document.getElementById('resultsSection');
const resultsTitle = document.getElementById('resultsTitle');
const resultsSource = document.getElementById('resultsSource');

// Контейнеры плеера
const youtubePlayerWrapper = document.getElementById('youtubePlayerWrapper');
const customPlayerContainer = document.getElementById('customPlayerContainer');
const playerPluginTitle = document.getElementById('playerPluginTitle');
const playerAuthor = document.getElementById('playerAuthor');
const playerCategory = document.getElementById('playerCategory');

// Кастомный плеер
const playBtn = document.getElementById('playBtn');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const timeDisplay = document.getElementById('timeDisplay');

// Сетки результатов
const secondaryResultsSection = document.getElementById('secondaryResultsSection');
const embedsContainer = document.getElementById('embedsContainer');

// Панели
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

    // Сброс состояния плееров и очистка контента
    pauseCustomAudio();
    resultsSection.style.display = 'none';
    notFoundPanel.style.display = 'none';
    
    youtubePlayerWrapper.style.display = 'none';
    youtubePlayerWrapper.innerHTML = '';
    customPlayerContainer.style.display = 'none';
    embedsContainer.innerHTML = '';
    secondaryResultsSection.style.display = 'none';

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error('Ошибка при выполнении поиска');
        }

        const data = await response.json();
        
        if (data.source === 'none' || !data.results || data.results.length === 0) {
            notFoundPanel.style.display = 'flex';
            showToast('Звук не найден в сети. Вы можете загрузить его первым!');
            notFoundPanel.scrollIntoView({ behavior: 'smooth' });
        } else {
            resultsSection.style.display = 'block';
            resultsTitle.textContent = `Результаты: "${query}"`;
            
            if (data.source === 'custom_uploads') {
                resultsSource.textContent = 'Официальный звук';
                playerCategory.textContent = 'Подтвержденный звук автора';
                
                // Настраиваем кастомный плеер для первого файла
                const firstSound = data.results[0];
                setupCustomPlayer(firstSound);
                
                // Если есть другие файлы, выводим их в сетку
                if (data.results.length > 1) {
                    secondaryResultsSection.style.display = 'block';
                    renderCustomSoundsGrid(data.results.slice(1));
                }
            } else if (data.source === 'youtube') {
                resultsSource.textContent = 'YouTube';
                playerCategory.textContent = 'YouTube видео-превью';
                
                // Встраиваем первое видео с автоплеем и без звука (чтобы браузер разрешил автовоспроизведение)
                const firstVideo = data.results[0];
                youtubePlayerWrapper.style.display = 'block';
                youtubePlayerWrapper.innerHTML = `
                    <iframe src="https://www.youtube.com/embed/${firstVideo.id}?autoplay=1&mute=1&enablejsapi=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
                `;
                playerPluginTitle.textContent = firstVideo.title;
                playerAuthor.textContent = `Канал: ${firstVideo.channel} • Длительность: ${firstVideo.duration}`;
                
                // Остальные видео выводим в сетку ниже
                if (data.results.length > 1) {
                    secondaryResultsSection.style.display = 'block';
                    renderYoutubeEmbeds(data.results.slice(1));
                }
            } else if (data.source === 'soundcloud') {
                resultsSource.textContent = 'SoundCloud';
                playerCategory.textContent = 'SoundCloud трек';
                
                const firstTrack = data.results[0];
                youtubePlayerWrapper.style.display = 'block';
                // Включаем auto_play=true для SoundCloud виджета
                youtubePlayerWrapper.innerHTML = `
                    <iframe width="100%" height="166" scrolling="no" frameborder="no" allow="autoplay" src="${firstTrack.embed_url}&auto_play=true"></iframe>
                `;
                playerPluginTitle.textContent = firstTrack.title;
                playerAuthor.textContent = 'SoundCloud превью';
                
                if (data.results.length > 1) {
                    secondaryResultsSection.style.display = 'block';
                    renderSoundCloudEmbeds(data.results.slice(1));
                }
            }
            
            // Скроллим к результатам поиска
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (err) {
        showToast('Ошибка поиска: ' + err.message);
    }
}

// Настройка кастомного плеера для загруженных аудиофайлов
function setupCustomPlayer(sound) {
    customPlayerContainer.style.display = 'block';
    playerPluginTitle.textContent = sound.title;
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

        ctx.fillStyle = '#08090b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i];

            // Наш кораллово-красный цвет: #ff4c25
            const red = 255;
            const green = Math.max(0, 76 - (barHeight * 0.15));
            const blue = Math.max(37, 37 + (barHeight * 0.2));

            ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
            ctx.fillRect(x, canvas.height - (barHeight * 0.45), barWidth - 2, barHeight * 0.45);
            x += barWidth;
        }
    }

    draw();
}

// Рендеринг YouTube роликов в сетку ниже
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
                <iframe src="https://www.youtube.com/embed/${video.id}?autoplay=0&enablejsapi=1" allowfullscreen></iframe>
            </div>
        `;
        embedsContainer.appendChild(item);
    });
}

// Рендеринг SoundCloud треков в сетку ниже
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

// Рендеринг кастомных пользовательских файлов в сетку ниже
function renderCustomSoundsGrid(sounds) {
    sounds.forEach(sound => {
        const item = document.createElement('div');
        item.className = 'embed-item';
        item.style.cursor = 'pointer';
        item.innerHTML = `
            <div class="embed-item-header">
                <div class="card-category">Пользовательский звук</div>
                <div class="embed-item-title" style="margin-top:0.5rem;">${sound.title}</div>
                <div class="embed-item-channel" style="margin-top:0.5rem;">Автор: ${sound.author_name}</div>
            </div>
            <div class="card-action" style="margin-top:auto;">Выбрать превью →</div>
        `;
        item.onclick = () => {
            pauseCustomAudio();
            setupCustomPlayer(sound);
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        };
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
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        showToast('Ошибка отправки: ' + err.message);
        loadCaptcha();
    }
});
