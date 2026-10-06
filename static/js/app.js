// ==========================================================================
// Aplicação de Transcrição de Voz (Web Speech API + Flask)
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Elementos do DOM
    const micCard = document.querySelector('.mic-card');
    const micBtn = document.getElementById('micBtn');
    const micIcon = document.getElementById('micIcon');
    const micStopIcon = document.getElementById('micStopIcon');
    const statusText = document.getElementById('statusText');
    const statusHint = document.getElementById('statusHint');
    const langSelect = document.getElementById('langSelect');
    const continuousToggle = document.getElementById('continuousToggle');

    const transcriptBox = document.getElementById('transcriptBox');
    const charCount = document.getElementById('charCount');
    const copyBtn = document.getElementById('copyBtn');
    const clearBtn = document.getElementById('clearBtn');
    const saveBtn = document.getElementById('saveBtn');

    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const toast = document.getElementById('toast');

    // Estado interno
    let isListening = false;
    let shouldStayListening = false;
    let finalTranscript = '';
    let recognition = null;

    // 1. Checagem de compatibilidade da Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        statusText.textContent = "Navegador incompatível";
        statusHint.textContent = "A Web Speech API funciona melhor no Google Chrome ou Microsoft Edge.";
        micBtn.disabled = true;
        micBtn.style.opacity = '0.5';
        micBtn.style.cursor = 'not-allowed';
        showToast("Seu navegador não suporta reconhecimento de voz nativo. Use o Chrome ou Edge.", "danger");
        return;
    }

    // 2. Inicialização do SpeechRecognition
    function initRecognition() {
        recognition = new SpeechRecognition();
        recognition.continuous = continuousToggle.checked;
        recognition.interimResults = true;
        recognition.lang = langSelect.value;

        recognition.onstart = () => {
            isListening = true;
            micCard.classList.add('listening');
            micIcon.classList.add('icon-hidden');
            micStopIcon.classList.remove('icon-hidden');
            statusText.textContent = "Ouvindo você...";
            statusHint.textContent = "Fale no microfone para transcrever...";
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcriptPiece = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += (finalTranscript.length > 0 && !finalTranscript.endsWith(' ') ? ' ' : '') + transcriptPiece.trim();
                } else {
                    interimTranscript += transcriptPiece;
                }
            }

            renderTranscript(interimTranscript);
            updateCounters();
        };

        recognition.onerror = (event) => {
            console.warn("Erro no reconhecimento de voz:", event.error);
            if (event.error === 'not-allowed') {
                showToast("Permissão de microfone negada no navegador.", "danger");
                stopRecognition();
            } else if (event.error === 'no-speech') {
                // Silêncio detectado; em modo contínuo apenas ignora
            } else {
                showToast(`Aviso: ${event.error}`, "danger");
            }
        };

        recognition.onend = () => {
            // Se o usuário quer continuar ouvindo e não clicou em pausar explicitamente
            if (shouldStayListening && continuousToggle.checked) {
                try {
                    recognition.start();
                    return;
                } catch (e) {
                    console.log("Reiniciando recognition...", e);
                }
            }
            stopRecognitionUI();
        };
    }

    initRecognition();

    // 3. Funções de Início / Parada
    function startRecognition() {
        try {
            recognition.lang = langSelect.value;
            recognition.continuous = continuousToggle.checked;
            shouldStayListening = true;
            recognition.start();
        } catch (err) {
            console.error("Falha ao iniciar reconhecimento:", err);
        }
    }

    function stopRecognition() {
        shouldStayListening = false;
        if (recognition) {
            try {
                recognition.stop();
            } catch (err) {
                console.error(err);
            }
        }
        stopRecognitionUI();
    }

    function stopRecognitionUI() {
        isListening = false;
        shouldStayListening = false;
        micCard.classList.remove('listening');
        micIcon.classList.remove('icon-hidden');
        micStopIcon.classList.add('icon-hidden');
        statusText.textContent = "Pronto para ouvir";
        statusHint.textContent = "Clique no microfone para voltar a falar";
        renderTranscript('');
    }

    // Alternar gravação ao clicar no botão
    micBtn.addEventListener('click', () => {
        if (isListening) {
            stopRecognition();
        } else {
            startRecognition();
        }
    });

    // Mudança de idioma ou modo contínuo
    langSelect.addEventListener('change', () => {
        if (isListening) {
            stopRecognition();
            setTimeout(startRecognition, 300);
        }
    });

    continuousToggle.addEventListener('change', () => {
        if (recognition) {
            recognition.continuous = continuousToggle.checked;
        }
    });

    // 4. Renderização do texto no box
    function renderTranscript(interim) {
        let html = escapeHtml(finalTranscript);
        if (interim) {
            html += (html.length > 0 ? ' ' : '') + `<span class="interim-text">${escapeHtml(interim)}</span>`;
        }
        transcriptBox.innerHTML = html;
        transcriptBox.scrollTop = transcriptBox.scrollHeight;
    }

    // Se o usuário digitar manualmente na caixa
    transcriptBox.addEventListener('input', () => {
        finalTranscript = transcriptBox.innerText.trim();
        updateCounters();
    });

    function updateCounters() {
        const text = transcriptBox.innerText.trim();
        const chars = text.length;
        const words = text ? text.split(/\s+/).length : 0;
        charCount.textContent = `${chars} caracteres • ${words} palavras`;
    }

    // 5. Ações (Copiar, Limpar, Salvar)
    copyBtn.addEventListener('click', async () => {
        const text = transcriptBox.innerText.trim();
        if (!text) {
            showToast("Nada para copiar!", "danger");
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            showToast("Texto copiado para a área de transferência!", "success");
        } catch (err) {
            showToast("Erro ao copiar texto.", "danger");
        }
    });

    clearBtn.addEventListener('click', () => {
        finalTranscript = '';
        transcriptBox.innerHTML = '';
        updateCounters();
        showToast("Caixa de texto limpa.", "success");
    });

    saveBtn.addEventListener('click', async () => {
        const text = transcriptBox.innerText.trim();
        if (!text) {
            showToast("Fale algo ou digite antes de salvar!", "danger");
            return;
        }

        try {
            saveBtn.disabled = true;
            saveBtn.style.opacity = '0.7';

            const response = await fetch('/api/transcricoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texto: text })
            });

            const data = await response.json();

            if (data.sucesso) {
                showToast("Transcrição salva no Flask com sucesso!", "success");
                carregarHistorico();
            } else {
                showToast(data.mensagem || "Erro ao salvar transcrição.", "danger");
            }
        } catch (err) {
            showToast("Erro de comunicação com o servidor Flask.", "danger");
            console.error(err);
        } finally {
            saveBtn.disabled = false;
            saveBtn.style.opacity = '1';
        }
    });

    // 6. Histórico no Flask
    async function carregarHistorico() {
        try {
            const res = await fetch('/api/transcricoes');
            const data = await res.json();
            if (data.sucesso && data.transcricoes) {
                renderizarHistorico(data.transcricoes);
            }
        } catch (err) {
            console.error("Erro ao carregar histórico:", err);
        }
    }

    function renderizarHistorico(itens) {
        if (!itens || itens.length === 0) {
            historyList.innerHTML = `<div class="empty-state">Nenhuma transcrição salva ainda. Fale algo e clique em "Salvar no Flask".</div>`;
            return;
        }

        historyList.innerHTML = itens.map(item => `
            <div class="history-item">
                <div class="history-text">${escapeHtml(item.texto)}</div>
                <div class="history-time">${escapeHtml(item.timestamp)}</div>
            </div>
        `).join('');
    }

    clearHistoryBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/limpar', { method: 'POST' });
            const data = await res.json();
            if (data.sucesso) {
                showToast("Histórico limpo!", "success");
                carregarHistorico();
            }
        } catch (err) {
            showToast("Erro ao limpar histórico.", "danger");
        }
    });

    // 7. Notificações Toast
    let toastTimeout;
    function showToast(msg, type = "success") {
        clearTimeout(toastTimeout);
        toast.textContent = msg;
        toast.className = `toast show toast-${type}`;
        toastTimeout = setTimeout(() => {
            toast.className = "toast";
        }, 3500);
    }

    function escapeHtml(str) {
        return (str || '')
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Carrega dados ao iniciar
    carregarHistorico();
});
