import os
from datetime import datetime
from flask import Flask, render_template, request, jsonify

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static")
)

# Armazenamento em memória simples para os registros transcritos
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

@app.route("/api/transcricoes", methods=["POST"])
def salvar_transcricao():
    dados = request.get_json() or {}
    texto = dados.get("texto", "").strip()

    if not texto:
        return jsonify({"sucesso": False, "mensagem": "Texto não pode estar vazio"}), 400

    item = {
        "id": len(historico_transcricoes) + 1,
        "texto": texto,
        "timestamp": datetime.now().strftime("%d/%m/%Y às %H:%M:%S")
    }
    historico_transcricoes.insert(0, item)

    return jsonify({
        "sucesso": True,
        "mensagem": "Transcrição registrada com sucesso!",
        "item": item
    }), 201

@app.route("/api/limpar", methods=["POST"])
def limpar_historico():
    historico_transcricoes.clear()
    return jsonify({"sucesso": True, "mensagem": "Histórico limpo com sucesso!"})

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
