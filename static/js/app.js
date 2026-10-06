// ==========================================================================
// Transcritor de Voz com Web Speech API (Versão Corrigida e Blindada)
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
    let baseText = '';          // Texto existente na caixa antes da fala atual
    let sessionFinalText = '';  // Texto definitivo reconhecido durante esta sessão
    let recognition = null;

    // 1. Verificação de Suporte
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

    // 2. Criação do Reconhecedor
    function createRecognition() {
        const rec = new SpeechRecognition();
        rec.continuous = false; // False garante que o Chrome não entre em loop de buffer
        rec.interimResults = true;
        rec.lang = langSelect.value;
        rec.maxAlternatives = 1;

        rec.onstart = () => {
            isListening = true;
            sessionFinalText = '';
            micCard.classList.add('listening');
            micIcon.classList.add('icon-hidden');
            micStopIcon.classList.remove('icon-hidden');
            statusText.textContent = "Ouvindo você...";
            statusHint.textContent = "Fale agora no microfone...";
        };

        rec.onresult = (event) => {
            let currentFinal = '';
            let currentInterim = '';

            for (let i = 0; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    currentFinal += (currentFinal ? ' ' : '') + transcript.trim();
                } else {
                    currentInterim += (currentInterim ? ' ' : '') + transcript.trim();
                }
            }

            if (currentFinal) {
                sessionFinalText = currentFinal;
            }

            // Monta o texto completo sem duplicação
            const consolidated = combineTexts(baseText, sessionFinalText);
            renderBox(consolidated, currentInterim);
        };

        rec.onerror = (event) => {
            console.warn("Aviso SpeechRecognition:", event.error);
            if (event.error === 'not-allowed') {
                showToast("Permissão de microfone negada no navegador.", "danger");
            } else if (event.error !== 'no-speech') {
                showToast(`Status: ${event.error}`, "danger");
            }
            stopListening();
        };

        rec.onend = () => {
            stopListening();
        };

        return rec;
    }

    // 3. Funções de Início e Parada
    function startListening() {
        if (isListening) return;

        // Guarda o que já existe na caixa de texto
        baseText = transcriptBox.innerText.trim();
        sessionFinalText = '';

        try {
            recognition = createRecognition();
            recognition.start();
        } catch (err) {
            console.error("Erro ao iniciar reconhecimento:", err);
            stopListening();
        }
    }

    function stopListening() {
        isListening = false;
        micCard.classList.remove('listening');
        micIcon.classList.remove('icon-hidden');
        micStopIcon.classList.add('icon-hidden');
        statusText.textContent = "Pronto para ouvir";
        statusHint.textContent = "Clique no microfone para falar novamente";

        // Consolida o texto final na caixa sem spans provisórios
        const finalText = combineTexts(baseText, sessionFinalText);
        baseText = finalText;
        sessionFinalText = '';
        renderBox(finalText, '');

        if (recognition) {
            try {
                recognition.abort();
            } catch (e) {}
            recognition = null;
        }
    }

    function combineTexts(first, second) {
        const p1 = (first || '').trim();
        const p2 = (second || '').trim();
        if (p1 && p2) return `${p1} ${p2}`;
        return p1 || p2;
    }

    function renderBox(finalText, interimText) {
        let html = escapeHtml(finalText);
        if (interimText) {
            const separator = finalText ? ' ' : '';
            html += `${separator}<span class="interim-text">${escapeHtml(interimText)}</span>`;
        }
        transcriptBox.innerHTML = html;
        transcriptBox.scrollTop = transcriptBox.scrollHeight;
        updateCounters();
    }

    // Clique no botão de microfone
    micBtn.addEventListener('click', () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    });

    // Idioma
    langSelect.addEventListener('change', () => {
        if (isListening) {
            stopListening();
        }
    });

    // Edição manual na caixa
    transcriptBox.addEventListener('input', () => {
        baseText = transcriptBox.innerText.trim();
        sessionFinalText = '';
        updateCounters();
    });

    function updateCounters() {
        const text = transcriptBox.innerText.trim();
        const chars = text.length;
        const words = text ? text.split(/\s+/).filter(w => w.length > 0).length : 0;
        charCount.textContent = `${chars} caracteres • ${words} palavras`;
    }

    // 4. Ações: Copiar, Limpar, Salvar
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
        if (isListening) stopListening();
        baseText = '';
        sessionFinalText = '';
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

    // 5. Histórico no Flask
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

    // 6. Toasts e Helpers
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

    // Início
    carregarHistorico();
});
