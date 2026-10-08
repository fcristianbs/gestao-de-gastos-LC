// ==========================================================================
// Gestão de Gastos LC - Transcrição de Voz + Gemini + Google Sheets
// Processamento Assíncrono Não-Bloqueante (Microfone Liberado Instantaneamente)
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

    const bgProcessingIndicator = document.getElementById('bgProcessingIndicator');
    const bgProcessingText = document.getElementById('bgProcessingText');

    const transcriptBox = document.getElementById('transcriptBox');
    const charCount = document.getElementById('charCount');
    const copyBtn = document.getElementById('copyBtn');
    const clearBtn = document.getElementById('clearBtn');
    const processBtn = document.getElementById('processBtn');
    const processBtnText = document.getElementById('processBtnText');

    // Card de Resultado Gemini
    const resultCard = document.getElementById('resultCard');
    const resTitle = document.getElementById('resTitle');
    const resultItemsContainer = document.getElementById('resultItemsContainer');
    const sheetsStatusBadge = document.getElementById('sheetsStatusBadge');

    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const toast = document.getElementById('toast');

    // Estado interno
    let isListening = false;
    let baseText = '';          // Texto existente na caixa antes da fala atual
    let sessionFinalText = '';  // Texto definitivo reconhecido durante esta sessão
    let recognition = null;
    let filaEnviosAtivos = 0;   // Contador de envios assíncronos em segundo plano

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
        rec.continuous = false; // Garante que o fim da fala dispare onend suavemente
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
            statusHint.textContent = "Fale o gasto. Ao silenciar, ele envia sozinho em segundo plano!";
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
            stopListening(false);
        };

        rec.onend = () => {
            // Quando a pessoa termina de falar (silêncio), para e despacha em segundo plano!
            stopListening(true);
        };

        return rec;
    }

    // 3. Funções de Início e Parada do Microfone (NUNCA BLOQUEANTES)
    function startListening() {
        if (isListening) return;

        baseText = transcriptBox.innerText.trim();
        sessionFinalText = '';

        try {
            recognition = createRecognition();
            recognition.start();
        } catch (err) {
            console.error("Erro ao iniciar reconhecimento:", err);
            stopListening(false);
        }
    }

    function stopListening(autoSend = true) {
        if (!isListening) return;

        isListening = false;
        micCard.classList.remove('listening');
        micIcon.classList.remove('icon-hidden');
        micStopIcon.classList.add('icon-hidden');

        // Captura o texto definitivo desta fala
        const textoCapturado = combineTexts(baseText, sessionFinalText).trim();

        // Limpa IMEDIATAMENTE a caixa e os estados para liberar o microfone instantaneamente!
        baseText = '';
        sessionFinalText = '';
        renderBox('', '');

        if (recognition) {
            try {
                recognition.abort();
            } catch (e) {}
            recognition = null;
        }

        // Feedback imediato: Microfone 100% livre para a próxima inclusão
        statusText.textContent = "Pronto para ouvir";
        statusHint.textContent = "Microfone liberado! Fale outro gasto quando quiser.";

        // Despacha o processamento em segundo plano sem bloquear o microfone!
        if (autoSend && textoCapturado && textoCapturado.length >= 2) {
            // Checagem rápida local: se o usuário falou apenas uma ordem direta de cancelamento
            const termoLimpo = textoCapturado.toLowerCase().replace(/[.,!?;:]/g, '').trim();
            const termosCancelamentoDireto = [
                'cancela', 'cancelar', 'cancela isso', 'cancelar isso',
                'esquece', 'esquece isso', 'descarta', 'descartar',
                'não grava', 'nao grava', 'não salva', 'nao salva',
                'apaga', 'apagar', 'deixa pra lá', 'deixa pra la'
            ];

            if (termosCancelamentoDireto.includes(termoLimpo)) {
                showToast("🚫 Gravação cancelada por comando de voz!", "danger");
                statusText.textContent = "Cancelado!";
                statusHint.textContent = "Nada foi gravado. Fale outro gasto quando quiser.";
                return;
            }

            enviarGastoEmSegundoPlano(textoCapturado);
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
            stopListening(true); // Se clicar para parar, também processa em segundo plano e libera
        } else {
            startListening();
        }
    });

    langSelect.addEventListener('change', () => {
        if (isListening) stopListening(false);
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
        if (isListening) stopListening(false);
        baseText = '';
        sessionFinalText = '';
        transcriptBox.innerHTML = '';
        updateCounters();
        showToast("Caixa limpa.", "success");
    });

    // 5. Envio Assíncrono em Segundo Plano (Fila Não-Bloqueante)
    function atualizarIndicadorFila() {
        if (!bgProcessingIndicator) return;
        if (filaEnviosAtivos > 0) {
            bgProcessingIndicator.classList.remove('hidden');
            bgProcessingText.textContent = `Processando e enviando ${filaEnviosAtivos} registro(s) em segundo plano...`;
        } else {
            bgProcessingIndicator.classList.add('hidden');
        }
    }

    async function enviarGastoEmSegundoPlano(text) {
        if (!text) return;

        filaEnviosAtivos++;
        atualizarIndicadorFila();

        try {
            const response = await fetch('/api/processar-gasto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texto: text })
            });

            const data = await response.json();

            // Se o Gemini detectou comando de cancelamento contextual na frase
            if (data.cancelado) {
                showToast(`🚫 ${data.mensagem || 'Envio cancelado por comando de voz!'}`, "danger");
                statusText.textContent = "Cancelado!";
                statusHint.textContent = data.motivo || "Nada foi gravado na planilha.";
                return;
            }

            if (data.sucesso) {
                const qtd = data.quantidade || (data.itens ? data.itens.length : 1);
                showToast(`✓ ${qtd} gasto(s) salvo(s) na planilha!`, "success");
                exibirResultadoGemini(data.itens || [], data.valor_total || 0, data.status_planilha);
                carregarHistorico();
            } else {
                showToast(data.mensagem || "Erro ao processar gasto em segundo plano.", "danger");
            }
        } catch (err) {
            showToast("Falha na comunicação ao salvar gasto.", "danger");
            console.error(err);
        } finally {
            filaEnviosAtivos = Math.max(0, filaEnviosAtivos - 1);
            atualizarIndicadorFila();
        }
    }

    // Clique manual no botão Registrar Gasto
    processBtn.addEventListener('click', () => {
        const text = transcriptBox.innerText.trim();
        if (!text) {
            showToast("Fale ou digite um gasto antes de registrar!", "danger");
            return;
        }
        // Limpa a caixa imediatamente e envia em segundo plano
        baseText = '';
        sessionFinalText = '';
        transcriptBox.innerHTML = '';
        updateCounters();
        enviarGastoEmSegundoPlano(text);
    });

    function formatMoeda(val) {
        const num = parseFloat(val) || 0;
        return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function exibirResultadoGemini(itens, valorTotal, statusPlanilha) {
        if (!itens || itens.length === 0) return;

        resultCard.classList.remove('hidden');

        // Título dinâmico
        if (itens.length > 1) {
            resTitle.textContent = `${itens.length} gastos estruturados (Total: ${formatMoeda(valorTotal)})`;
        } else {
            resTitle.textContent = `1 gasto estruturado pelo Gemini`;
        }

        // Status da planilha
        if (statusPlanilha && statusPlanilha.includes("salvo")) {
            sheetsStatusBadge.textContent = "✓ Salvo no Google Sheets";
            sheetsStatusBadge.className = "sheets-badge";
        } else {
            sheetsStatusBadge.textContent = statusPlanilha || "Planilha pendente";
            sheetsStatusBadge.className = "sheets-badge badge-error";
        }

        // Renderiza cada item individualmente
        resultItemsContainer.innerHTML = itens.map((item, idx) => {
            return `
            <div class="result-item-card">
                <div class="result-item-top">
                    <span class="result-badge-tipo">${escapeHtml(item.tipo || 'Despesa')} ${itens.length > 1 ? `#${idx + 1}` : ''}</span>
                    <span class="valor-highlight">${formatMoeda(item.valor)}</span>
                </div>
                <div class="result-grid">
                    <div class="result-item">
                        <span class="result-label">Descrição</span>
                        <span class="result-value">${escapeHtml(item.descricao || '-')}</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">Categoria</span>
                        <span class="result-value">${escapeHtml(item.categoria || '-')}</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">Pagamento</span>
                        <span class="result-value">${escapeHtml(item.forma_pagamento || 'Não informada')}</span>
                    </div>
                    ${item.observacao ? `
                    <div class="result-item">
                        <span class="result-label">Observação</span>
                        <span class="result-value">${escapeHtml(item.observacao)}</span>
                    </div>` : ''}
                </div>
            </div>
            `;
        }).join('');

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

    function renderizarHistorico(registros) {
        if (!registros || registros.length === 0) {
            historyList.innerHTML = `<div class="empty-state">Nenhum gasto registrado nesta sessão. Diga algo no microfone para salvar automaticamente.</div>`;
            return;
        }

        historyList.innerHTML = registros.map(reg => {
            const itens = reg.itens || (reg.dados ? [reg.dados] : []);
            const total = reg.valor_total || (itens.length > 0 ? itens.reduce((acc, i) => acc + (parseFloat(i.valor) || 0), 0) : 0);

            const itensHtml = itens.map(it => `
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 2px 0;">
                    <span>• <strong>${escapeHtml(it.descricao || 'Item')}</strong> <em style="color: #94A3B8;">(${escapeHtml(it.categoria || 'Geral')})</em></span>
                    <span style="color: #34D399; font-weight: 500;">${formatMoeda(it.valor)}</span>
                </div>
            `).join('');

            return `
            <div class="history-item">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                    <span style="font-size: 0.8rem; color: #A5B4FC; font-weight: 600;">
                        ${itens.length} ${itens.length > 1 ? 'itens registrados' : 'item registrado'}
                    </span>
                    <strong style="color: #34D399; font-size: 1rem;">${formatMoeda(total)}</strong>
                </div>
                <div style="background: rgba(0,0,0,0.2); padding: 6px 8px; border-radius: 6px; margin-bottom: 4px;">
                    ${itensHtml}
                </div>
                <div style="font-size: 0.725rem; color: #64748B;">
                    <em>Prompt: "${escapeHtml(reg.texto)}"</em> • ${escapeHtml(reg.timestamp || '')}
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
