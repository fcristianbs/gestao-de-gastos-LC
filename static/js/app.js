// ==========================================================================
// Gestão de Gastos LC - Transcrição de Voz + Gemini + Google Sheets
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
    const processBtn = document.getElementById('processBtn');
    const processBtnText = document.getElementById('processBtnText');

    // Card de Resultado Gemini
    const resultCard = document.getElementById('resultCard');
    const resValor = document.getElementById('resValor');
    const resDescricao = document.getElementById('resDescricao');
    const resCategoria = document.getElementById('resCategoria');
    const resPagamento = document.getElementById('resPagamento');
    const sheetsStatusBadge = document.getElementById('sheetsStatusBadge');

    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const toast = document.getElementById('toast');

    // Estado interno
    let isListening = false;
    let baseText = '';          // Texto existente na caixa antes da fala atual
    let sessionFinalText = '';  // Texto definitivo reconhecido durante esta sessão
    let recognition = null;

    // 1. Verificação de Suporte à Web Speech API
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
        rec.continuous = false; // Garante isolamento sem loops de buffer
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
            statusHint.textContent = "Diga o gasto (ex: Almoço 35 reais no Pix)...";
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

    // 3. Funções de Início e Parada do Microfone
    function startListening() {
        if (isListening) return;

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

    // Clique no microfone
    micBtn.addEventListener('click', () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    });

    langSelect.addEventListener('change', () => {
        if (isListening) stopListening();
    });

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

    // 4. Copiar e Limpar
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
        showToast("Caixa limpa.", "success");
    });

    // 5. Processar com Gemini e Enviar para o Google Sheets
    processBtn.addEventListener('click', async () => {
        const text = transcriptBox.innerText.trim();
        if (!text) {
            showToast("Fale ou digite um gasto antes de registrar!", "danger");
            return;
        }

        try {
            processBtn.disabled = true;
            processBtn.style.opacity = '0.7';
            processBtnText.textContent = "Processando com IA...";

            const response = await fetch('/api/processar-gasto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texto: text })
            });

            const data = await response.json();

            if (data.sucesso) {
                showToast("Gasto estruturado pelo Gemini e enviado!", "success");
                exibirResultadoGemini(data.dados, data.status_planilha);
                carregarHistorico();

                // Limpa a caixa para o próximo registro
                baseText = '';
                sessionFinalText = '';
                transcriptBox.innerHTML = '';
                updateCounters();
            } else {
                showToast(data.mensagem || "Erro ao processar gasto.", "danger");
            }
        } catch (err) {
            showToast("Erro na comunicação com o servidor.", "danger");
            console.error(err);
        } finally {
            processBtn.disabled = false;
            processBtn.style.opacity = '1';
            processBtnText.textContent = "Registrar Gasto";
        }
    });

    function exibirResultadoGemini(dados, statusPlanilha) {
        if (!dados) return;

        resultCard.classList.remove('hidden');

        // Formata valor monetário
        const valorNum = parseFloat(dados.valor) || 0;
        resValor.textContent = valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        resDescricao.textContent = dados.descricao || '-';
        resCategoria.textContent = dados.categoria || '-';
        resPagamento.textContent = dados.forma_pagamento || 'Não informada';

        if (statusPlanilha && statusPlanilha.includes("salvo")) {
            sheetsStatusBadge.textContent = "✓ Salvo no Google Sheets";
            sheetsStatusBadge.className = "sheets-badge";
        } else {
            sheetsStatusBadge.textContent = statusPlanilha || "Planilha pendente";
            sheetsStatusBadge.className = "sheets-badge badge-error";
        }

        resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 6. Histórico
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
            historyList.innerHTML = `<div class="empty-state">Nenhum gasto registrado nesta sessão. Diga algo e clique em "Registrar Gasto".</div>`;
            return;
        }

        historyList.innerHTML = itens.map(item => {
            const dados = item.dados || {};
            const valor = dados.valor ? parseFloat(dados.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';

            return `
            <div class="history-item">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <strong style="color: #F3F4F6;">${escapeHtml(dados.descricao || item.texto)}</strong>
                    <span style="color: #34D399; font-weight: 600;">${valor}</span>
                </div>
                <div style="font-size: 0.8rem; color: #94A3B8;">
                    <span>📁 ${escapeHtml(dados.categoria || 'Geral')}</span> • 
                    <span>💳 ${escapeHtml(dados.forma_pagamento || '-')}</span>
                </div>
                <div style="font-size: 0.725rem; color: #64748B; margin-top: 2px;">
                    <em>Prompt: "${escapeHtml(item.texto)}"</em> • ${escapeHtml(item.timestamp || '')}
                </div>
            </div>
            `;
        }).join('');
    }

    clearHistoryBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/limpar', { method: 'POST' });
            const data = await res.json();
            if (data.sucesso) {
                showToast("Histórico de sessão limpo!", "success");
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
        }, 4000);
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
