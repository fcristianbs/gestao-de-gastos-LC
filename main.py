import os
import json
from datetime import datetime
import requests
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

# Carrega variáveis do arquivo .env
load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static")
)

# Desativa cache durante desenvolvimento e updates rápidos
@app.after_request
def add_header(response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Armazenamento em memória simples para os registros na sessão
historico_transcricoes = []

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/transcricoes", methods=["GET"])
def listar_transcricoes():
    return jsonify({
        "sucesso": True,
        "transcricoes": historico_transcricoes
    })

def extrair_dados_com_gemini(texto_transcrito, api_key):
    """
    Envia a transcrição para a API do Gemini e obtém os dados financeiros estruturados em JSON.
    """
    prompt = f"""
Você é um assistente financeiro inteligente. Analise a seguinte transcrição de áudio de um gasto/despesa e extraia as informações estruturadas.

Texto transcrito: "{texto_transcrito}"

Retorne APENAS um objeto JSON válido (sem tags markdown, sem explicações adicionais) com os seguintes campos:
{{
  "descricao": "Nome curto do que foi comprado ou gasto (ex: Almoço, Café, Abastecimento)",
  "categoria": "Categoria apropriada (ex: Alimentação, Transporte, Moradia, Saúde, Lazer, Educação, Contas, Outros)",
  "valor": 0.00,
  "forma_pagamento": "Forma de pagamento se mencionada (ex: Cartão de Crédito, Cartão de Débito, Pix, Dinheiro, ou Não informada)",
  "observacao": "Detalhe adicional relevante se houver, ou string vazia",
  "prompt_original": "{texto_transcrito}"
}}
Importante: O campo "valor" deve ser SEMPRE um número float puro (ex: 50.0 ou 12.50).
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    resp = requests.post(url, json=payload, timeout=20)
    
    # Se gemini-1.5-flash retornar 404 por atualização de modelo, tenta gemini-2.5-flash
    if resp.status_code == 404:
        url_fallback = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
        resp = requests.post(url_fallback, json=payload, timeout=20)

    if resp.status_code != 200:
        raise Exception(f"Erro na API do Gemini ({resp.status_code}): {resp.text}")

    res_json = resp.json()
    candidates = res_json.get("candidates", [])
    if not candidates:
        raise Exception("Nenhuma resposta gerada pelo Gemini.")

    raw_text = candidates[0]["content"]["parts"][0]["text"].strip()
    return json.loads(raw_text)

def enviar_para_google_sheets(dados_gasto, webhook_url):
    """
    Envia os dados estruturados para o Google Apps Script Webhook.
    """
    headers = {"Content-Type": "application/json"}
    # O Google Apps Script redireciona (302) para uma URL de execução; allow_redirects=True é essencial
    resp = requests.post(webhook_url, json=dados_gasto, headers=headers, timeout=20, allow_redirects=True)
    return resp

@app.route("/api/processar-gasto", methods=["POST"])
def processar_gasto():
    dados = request.get_json() or {}
    texto = dados.get("texto", "").strip()

    if not texto:
        return jsonify({"sucesso": False, "mensagem": "Nenhum texto informado para processar."}), 400

    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    webhook_url = os.getenv("GOOGLE_SHEETS_WEBHOOK_URL", "").strip()

    if not gemini_key:
        return jsonify({
            "sucesso": False,
            "mensagem": "Chave GEMINI_API_KEY não configurada no arquivo .env!"
        }), 400

    try:
        # 1. Estruturação com Gemini
        dados_estruturados = extrair_dados_com_gemini(texto, gemini_key)
        dados_estruturados["data"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

        # 2. Envio para o Google Sheets (se configurado)
        planilha_status = "não configurada"
        if webhook_url:
            try:
                sheet_resp = enviar_para_google_sheets(dados_estruturados, webhook_url)
                if sheet_resp.status_code in (200, 302):
                    planilha_status = "salvo na planilha"
                else:
                    planilha_status = f"erro ao salvar ({sheet_resp.status_code})"
            except Exception as e:
                planilha_status = f"erro na conexão com sheets: {str(e)}"

        # 3. Guarda no histórico da sessão
        item_historico = {
            "id": len(historico_transcricoes) + 1,
            "texto": texto,
            "dados": dados_estruturados,
            "status_planilha": planilha_status,
            "timestamp": dados_estruturados["data"]
        }
        historico_transcricoes.insert(0, item_historico)

        return jsonify({
            "sucesso": True,
            "mensagem": "Gasto processado com sucesso pelo Gemini!",
            "dados": dados_estruturados,
            "status_planilha": planilha_status
        })

    except Exception as err:
        return jsonify({
            "sucesso": False,
            "mensagem": f"Falha no processamento: {str(err)}"
        }), 500

@app.route("/api/limpar", methods=["POST"])
def limpar_historico():
    historico_transcricoes.clear()
    return jsonify({"sucesso": True, "mensagem": "Histórico limpo com sucesso!"})

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
