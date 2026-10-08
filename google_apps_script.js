/**
 * Google Apps Script - Webhook para Registro de Gastos Financeiros
 * Suporta registro individual ou múltiplos gastos em uma única requisição.
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

    // Normaliza a lista de itens (suporta tanto um único item quanto { "itens": [...] } ou array direto)
    var listaItens = [];
    if (Array.isArray(data)) {
      listaItens = data;
    } else if (data.itens && Array.isArray(data.itens)) {
      listaItens = data.itens;
    } else {
      listaItens = [data];
    }

    var linhasAdicionadas = [];

    for (var i = 0; i < listaItens.length; i++) {
      var item = listaItens[i];

      var dataHora = item.data || Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm:ss");
      var tipo = item.tipo || "Despesa";
      var categoria = item.categoria || "Geral";
      var descricao = item.descricao || "Não informada";
      var valor = parseFloat(item.valor) || 0;
      
      var formaPagamento = item.forma_pagamento ? "Pagamento: " + item.forma_pagamento : "";
      var obsTexto = item.observacao || "";
      var observacoes = [formaPagamento, obsTexto].filter(function(x) { return x.length > 0; }).join(" | ");
      
      var promptOriginal = item.prompt_original || (data.prompt_original || "");

      // Adiciona na ordem exata das colunas:
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
      linhasAdicionadas.push(lastRow);
    }

    lock.releaseLock();

    return ContentService.createTextOutput(JSON.stringify({
      "sucesso": true,
      "mensagem": listaItens.length + (listaItens.length > 1 ? " gastos registrados na planilha!" : " gasto registrado na planilha!"),
      "quantidade": listaItens.length,
      "linhas": linhasAdicionadas
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
    "mensagem": "Webhook funcionando com suporte a múltiplos gastos!"
  })).setMimeType(ContentService.MimeType.JSON);
}
