# GLiNER2

Modelo de 205M parâmetros (`fastino/gliner2-base-v1`) para extração de entidades,
classificação de texto e extração estruturada — roda em CPU, sem GPU, sem chamar
nenhuma API de LLM. Custo ~zero comparado a mandar o mesmo texto pro Gemini/Claude
só para extrair dados simples.

Testado e confirmado a funcionar em 09/08/2026 (ver `example_entities.py`).

## Quando usar isto em vez de um agente LLM

- Extrair nomes/empresas/datas de texto solto (ex: triagem de e-mails do contato,
  mensagens do WhatsApp, dados vindos do scrape.yml) — não precisa de raciocínio,
  só reconhecimento de padrão.
- Classificar mensagens em categorias fixas (ex: "dúvida jurídica" vs "reclamação"
  vs "spam" no ViannaLegal).
- Estruturar dados bagunçados num formato fixo antes de um agente LLM processar —
  reduz tokens gastos no agente de verdade.

## Instalação

```bash
pip install gliner2
```

## Uso real (testado)

```python
from gliner2 import GLiNER2

model = GLiNER2.from_pretrained("fastino/gliner2-base-v1")

# Extração de entidades
resultado = model.extract_entities(
    "Kathia Vianna é advogada na ViannaLegal, especialista em cidadania portuguesa.",
    ["pessoa", "profissão", "empresa", "país"]
)
# -> {'entities': {'pessoa': ['Kathia Vianna'], 'profissao': ['advogada'],
#                   'empresa': ['ViannaLegal'], 'pais': ['Portugal']}}
```

Para classificação de texto, consultar a documentação oficial
(`github.com/fastino-ai/GLiNER2`) — a API de `classify_text` espera um schema
mais elaborado do que uma lista simples de labels (diferente do que o exemplo
inicial testado assumia).

## Nota sobre ambiente

Precisa de acesso à internet para baixar os pesos do modelo do Hugging Face
na primeira execução (fica em cache local depois). Não funciona em sandboxes
com allowlist de rede restrita que bloqueiam huggingface.co.
