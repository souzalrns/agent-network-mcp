# Medição do RTK — protocolo (opção B)

> **Estado: PROPOSTO, não executado.** Nada foi instalado. Decisão do maestro: testar o RTK sozinho, medindo, antes de adotar qualquer ferramenta de redução de tokens.

## Pergunta

O RTK reduz o **total de tokens de uma sessão de desenvolvimento** em tarefas equivalentes? A alegação do projeto (60–90%) é sobre a saída de comandos Bash, estimada como `bytes/4`, sem benchmark publicado. Não serve de resposta.

## O que o ledger `token_usage` NÃO mede

O `token_usage` (`docs/ops/TOKEN-LEDGER.md`) regista chamadas **Gemini feitas pela app** (router, agentes, embeddings). O RTK atua em sessões do Claude Code. São consumos diferentes: o ledger não serve de base para esta medição.

## Fonte de medida

O transcript da sessão do Claude Code: `~/.claude/projects/<projeto>/<sessão>.jsonl`. Cada resposta traz `message.usage` com `input_tokens`, `output_tokens`, `cache_creation_input_tokens` e `cache_read_input_tokens`. A mesma mensagem aparece repetida, por isso deduplicar por `message.id`:

```bash
jq -s '[.[]|select(.message.usage and .message.id)]|unique_by(.message.id)
  |{msgs:length,
    input:(map(.message.usage.input_tokens)|add),
    output:(map(.message.usage.output_tokens)|add),
    cache_write:(map(.message.usage.cache_creation_input_tokens)|add),
    cache_read:(map(.message.usage.cache_read_input_tokens)|add)}' SESSAO.jsonl
```

(Testado numa sessão real: devolve contagens por categoria. O formato do transcript pode mudar entre versões.)

## Desenho

1. **Tarefa fixa**, repetível e com saída de terminal pesada (ex.: "corre `npm test` e `git log` e resume falhas"). Escrever o prompt exato em ficheiro e reutilizá-lo.
2. **Duas condições:** controlo (sem RTK) e tratamento (com RTK). Mesmo commit, mesmo modelo, sessão nova, cache limpa.
3. **Repetir 3 vezes por condição**, alternando a ordem (C T C T C T). A variação entre execuções do mesmo agente é grande; uma execução só não prova nada.
4. **Métricas, por esta ordem de importância:**
   - custo equivalente = `input` + `output` + `cache_write` (ponderado pelos preços do modelo) + `cache_read` (ponderado);
   - total de tokens de saída do modelo;
   - `cache_read` e `cache_write` separados (o RTK deve alterar o prefixo, não só a saída);
   - qualidade: a tarefa foi concluída com o mesmo resultado? (sim/não, anotar diferenças).
5. **Secundária:** `rtk gain` — só confirma a redução da saída de Bash. É estimativa `bytes/4`, não substitui o transcript.

## Critério de decisão (fixar ANTES de medir)

- **Adotar** se a mediana do custo equivalente cair ≥ 15% **e** a qualidade se mantiver nas 3 repetições.
- **Rejeitar** se a queda for < 5% ou se houver degradação de qualidade.
- Entre 5% e 15%: repetir com uma tarefa diferente antes de decidir.

Os limiares são uma proposta; o maestro pode alterá-los antes de começar.

## Riscos e limites

- O RTK só intercepta chamadas `Bash`; `Read`, `Grep` e `Glob` ficam de fora. Numa tarefa dominada por leitura de ficheiros, o ganho será pequeno.
- Licença: o CLI `rtk` é Apache-2.0; `rtk-engine` e `rtk-proxy` são BUSL-1.1. Confirmar antes de uso comercial.
- Instalar com versão fixa (não `@latest`) e registar a versão na medição. Não correr com credenciais de produção.
- Resultado válido só para este repo e para este tipo de tarefa.

## Registo (preencher)

| Execução | Condição | msgs | input | output | cache_write | cache_read | Qualidade OK |
|---|---|---|---|---|---|---|---|
| 1 | controlo | | | | | | |
| 2 | RTK | | | | | | |
| 3 | controlo | | | | | | |
| 4 | RTK | | | | | | |
| 5 | controlo | | | | | | |
| 6 | RTK | | | | | | |
