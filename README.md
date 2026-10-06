# Transcritor de Voz com Flask e Web Speech API

Aplicação web desenvolvida com Flask e interface moderna para transcrição de áudio em tempo real diretamente no navegador.

## Arquitetura Adotada: Web Speech API

A melhor solução para este caso é a **Web Speech API** nativa do navegador integrada com rotas REST do **Flask**:
- **Transcrição em tempo real**: O texto vai aparecendo na tela enquanto você fala (suporte a *interim results*).
- **Sem custos ou chaves de API**: Não precisa de OpenAI Whisper pago nem bibliotecas pesadas de IA consumindo memória/GPU.
- **Português (`pt-BR`) nativo**: Alta precisão de reconhecimento.
- **Design Moderno**: Interface dark mode elegante com animação de ondas sonoras quando o microfone está ativo.

---

## Estrutura do Projeto

```text
gerenciador de gastos/
├── main.py              # Servidor Flask com rotas de API
├── requirements.txt     # Dependências (Flask)
├── templates/
│   └── index.html       # Interface web
└── static/
    ├── css/
    │   └── style.css    # Estilização com Glassmorphism e animações
    └── js/
        └── app.js       # Controle do microfone e Web Speech API
```

---

## Como Executar

1. Abra o terminal na pasta do projeto.
2. Inicie a aplicação com o comando:
   ```bash
   py main.py
   ```
3. Abra no navegador (recomendado **Google Chrome** ou **Microsoft Edge**):
   ```text
   http://127.0.0.1:5000
   ```
4. Permita o acesso ao microfone quando o navegador solicitar e clique no botão circular para começar a falar!
