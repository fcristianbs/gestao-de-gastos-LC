/**
 * Google Apps Script - Webhook para Registro de Gastos Financeiros
 * 
 * Instruções de atualização:
 * 1. Abra sua planilha do Google Sheets.
 * 2. Clique em "Extensões" > "Apps Script".
 * 3. Cole este código atualizado.
 * 4. Clique em "Implantar" > "Gerenciar implantações".
 * 5. Clique no ícone de lápis (Editar) > Versão: "Nova versão" > "Implantar".
 */

function doPost(e) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000); // Evita gravação simultânea corromper linhas

    var contents = e.postData.contents;
    var data = JSON.parse(contents);

    // Seleciona a primeira aba ou a aba chamada "Gastos"
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Gastos");
    if (!sheet) {
      sheet = ss.getActiveSheet();
    }

    // Se a planilha estiver vazia, cria as colunas automaticamente (incluindo o Prompt original)
    if (sheet.getLastRow() === 0) {
      var header = [
        "Data",
        "Descrição",
        "Categoria",
        "Valor (R$)",
        "Forma de Pagamento",
        "Observação",
        "Texto Original (Prompt)"
      ];
      sheet.appendRow(header);
      
      var headerRange = sheet.getRange(1, 1, 1, header.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#1E293B");
      headerRange.setFontColor("#FFFFFF");
    }

    // Dados extraídos pela inteligência do Gemini
    var dataHora = data.data || Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm:ss");
    var descricao = data.descricao || "Não informada";
    var categoria = data.categoria || "Geral";
    var valor = parseFloat(data.valor) || 0;
    var formaPagamento = data.forma_pagamento || "Outros";
    var observacao = data.observacao || "";
    var promptOriginal = data.prompt_original || "";

    // Adiciona a linha na planilha
    sheet.appendRow([
      dataHora,
      descricao,
      categoria,
      valor,
      formaPagamento,
      observacao,
      promptOriginal
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

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    "status": "online",
    "mensagem": "Webhook do Gerenciador de Gastos está funcionando!"
  })).setMimeType(ContentService.MimeType.JSON);
}
