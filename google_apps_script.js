/**
 * Google Apps Script - Webhook para Registro de Gastos Financeiros
 * 
 * Layout da Planilha:
 * Coluna A: Data
 * Coluna B: Tipo (Despesa / Receita)
 * Coluna C: Categoria
 * Coluna D: Descrição
 * Coluna E: Valor
 * Coluna F: Observações
 * Coluna G: Texto Original (Prompt)
 */

function doPost(e) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    var contents = e.postData.contents;
    var data = JSON.parse(contents);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Gastos");
    if (!sheet) {
      sheet = ss.getActiveSheet();
    }

    // Se a planilha estiver vazia, cria o cabeçalho correspondente
    if (sheet.getLastRow() === 0) {
      var header = [
        "Data",
        "Tipo",
        "Categoria",
        "Descrição",
        "Valor",
        "Observações",
        "Texto Original (Prompt)"
      ];
      sheet.appendRow(header);
      
      var headerRange = sheet.getRange(1, 1, 1, header.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#1E293B");
      headerRange.setFontColor("#FFFFFF");
    }

    // Extrai os campos formatados pelo Gemini
    var dataHora = data.data || Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm:ss");
    var tipo = data.tipo || "Despesa";
    var categoria = data.categoria || "Geral";
    var descricao = data.descricao || "Não informada";
    var valor = parseFloat(data.valor) || 0;
    
    // Junta forma de pagamento e observações no campo Observações se não houver coluna exclusiva
    var formaPagamento = data.forma_pagamento ? "Pagamento: " + data.forma_pagamento : "";
    var obsTexto = data.observacao || "";
    var observacoes = [formaPagamento, obsTexto].filter(function(x) { return x.length > 0; }).join(" | ");
    
    var promptOriginal = data.prompt_original || "";

    // Adiciona exatamente na ordem das colunas da planilha:
    // A: Data | B: Tipo | C: Categoria | D: Descrição | E: Valor | F: Observações | G: Prompt
    sheet.appendRow([
      dataHora,
      tipo,
      categoria,
      descricao,
      valor,
      observacoes,
      promptOriginal
    ]);

    // Formata a coluna E (coluna 5) como moeda R$
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 5).setNumberFormat('R$ #,##0.00');

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
    "mensagem": "Webhook funcionando!"
  })).setMimeType(ContentService.MimeType.JSON);
}
