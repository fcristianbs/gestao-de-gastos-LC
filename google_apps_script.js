/**
 * Google Apps Script - Webhook para Registro de Gastos Financeiros
 * 
 * Instruções de instalação:
 * 1. Abra sua planilha do Google Sheets.
 * 2. Clique no menu superior: "Extensões" > "Apps Script".
 * 3. Apague o código que estiver lá e cole todo este arquivo.
 * 4. Clique em "Implantar" (botão azul no canto superior direito) > "Nova implantação".
 * 5. Clique no ícone de engrenagem ao lado de "Tipo" e selecione "App da Web".
 * 6. Preencha:
 *    - Descrição: "Webhook Gastos"
 *    - Executar como: "Eu (seu_email@...)"
 *    - Quem tem acesso: "Qualquer pessoa" (MUITO IMPORTANTE!)
 * 7. Clique em "Implantar", conceda as permissões do Google e copie a "URL do app da web".
 */

function doPost(e) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000); // Evita gravação simultânea corromper linhas

    var contents = e.postData.contents;
    var data = JSON.parse(contents);

    // Seleciona a primeira aba ou uma aba específica chamada "Gastos"
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Gastos");
    
    // Se a aba "Gastos" não existir, usa a aba ativa atual
    if (!sheet) {
      sheet = ss.getActiveSheet();
    }

    // Se a planilha estiver vazia (sem cabeçalho), cria as colunas automaticamente
    if (sheet.getLastRow() === 0) {
      var header = [
        "Data",
        "Descrição",
        "Categoria",
        "Valor (R$)",
        "Forma de Pagamento",
        "Observação"
      ];
      sheet.appendRow(header);
      
      // Estiliza o cabeçalho
      var headerRange = sheet.getRange(1, 1, 1, header.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#374151");
      headerRange.setFontColor("#FFFFFF");
    }

    // Dados recebidos do Flask / Gemini
    var dataHora = data.data || Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm:ss");
    var descricao = data.descricao || "Não informada";
    var categoria = data.categoria || "Geral";
    var valor = parseFloat(data.valor) || 0;
    var formaPagamento = data.forma_pagamento || "Outros";
    var observacao = data.observacao || "";

    // Adiciona a linha na planilha
    sheet.appendRow([
      dataHora,
      descricao,
      categoria,
      valor,
      formaPagamento,
      observacao
    ]);

    // Formata a coluna de Valor como moeda na nova linha
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 4).setNumberFormat('R$ #,##0.00');

    lock.releaseLock();

    return ContentService.createTextOutput(JSON.stringify({
      "sucesso": true,
      "mensagem": "Gasto registrado com sucesso na planilha!",
      "linha": lastRow
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      "sucesso": false,
      "erro": error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Permite testar se o webhook está no ar abrindo a URL no navegador
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    "status": "online",
    "mensagem": "Webhook do Gerenciador de Gastos está funcionando!"
  })).setMimeType(ContentService.MimeType.JSON);
}
