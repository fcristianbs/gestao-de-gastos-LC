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
  "tipo": "Despesa ou Receita (padrão é Despesa caso seja compra/gasto)",
  "categoria": "Categoria apropriada (ex: Alimentação, Transporte, Moradia, Saúde, Lazer, Educação, Contas, Outros)",
  "descricao": "Nome curto do que foi comprado ou gasto (ex: Almoço, Café, Abastecimento)",
  "valor": 0.00,
  "forma_pagamento": "Forma de pagamento se mencionada (ex: Cartão de Crédito, Cartão de Débito, Pix, Dinheiro, ou Não informada)",
  "observacao": "Detalhe adicional relevante se houver, ou string vazia",
  "prompt_original": "{texto_transcrito}"
}}
Importante: O campo "valor" deve ser SEMPRE um número float puro (ex: 50.0 ou 12.50).
"""

    # Lista de modelos resilientes em ordem de prioridade para fallback automático
    modelo_configurado = os.getenv("GEMINI_MODEL", "").strip()
    candidatos_modelos = [
        "gemini-3-flash-preview",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
        "gemini-flash-latest"
    ]
    if modelo_configurado and modelo_configurado not in candidatos_modelos:
        candidatos_modelos.insert(0, modelo_configurado)
    elif modelo_configurado:
        candidatos_modelos.remove(modelo_configurado)
        candidatos_modelos.insert(0, modelo_configurado)

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

    erros_acumulados = []

    for mod in candidatos_modelos:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{mod}:generateContent?key={api_key}"
        try:
            print(f"[Gemini] Tentando processar com o modelo: {mod}...")
            resp = requests.post(url, json=payload, timeout=12)

            if resp.status_code == 200:
                res_json = resp.json()
                candidates = res_json.get("candidates", [])
                if candidates:
                    raw_text = candidates[0]["content"]["parts"][0]["text"].strip()
                    print(f"[Gemini] Sucesso com o modelo: {mod}")
                    return json.loads(raw_text)
                else:
                    erros_acumulados.append(f"{mod}: Nenhuma resposta gerada")
            else:
                msg_erro = f"{mod} (Status {resp.status_code}): {resp.text[:120]}"
                print(f"[Gemini] Falha no modelo {mod}: {resp.status_code}. Tentando próximo modelo...")
                erros_acumulados.append(msg_erro)

        except requests.exceptions.RequestException as req_err:
            msg_erro = f"{mod} (Timeout/Rede): {str(req_err)}"
            print(f"[Gemini] Exceção no modelo {mod}. Tentando próximo modelo...")
            erros_acumulados.append(msg_erro)

    # Se todos falharem
    raise Exception(f"Todos os modelos do Gemini falharam: {'; '.join(erros_acumulados)}")

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
                try:
                    sheet_data = sheet_resp.json()
                    if sheet_data.get("sucesso"):
                        planilha_status = "salvo na planilha"
                    else:
                        planilha_status = f"erro no script: {sheet_data.get('erro', 'desconhecido')}"
                except Exception:
                    # Se não for JSON, o Google Apps Script gerou uma página HTML de erro
                    if "ReferenceError" in sheet_resp.text:
                        planilha_status = "erro de sintaxe no código do Apps Script"
                    elif "<!DOCTYPE html>" in sheet_resp.text:
                        planilha_status = "permissão negada ou erro no Apps Script"
                    else:
                        planilha_status = f"erro ({sheet_resp.status_code})"
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
