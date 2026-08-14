# Configuração da VM bridge-worker — LRNSdigital

## Identificação
- **Projeto Google Cloud**: hale-structure-477321-p6
- **Nome da instância**: bridge-worker
- **Zona**: us-west1-a
- **Tipo**: e2-micro (Always Free — grátis para sempre, mas limitado: 1 vCPU, 1GB RAM)
- **SO**: Ubuntu 26.04
- **Utilizador**: souzalrns (home: `/home/souzalrns`)
- **Criada em**: 06/08/2026

## Software instalado
- Node.js v22.23.2
- pm2 v7.0.3 (gestor de processos — mantém o bridge-worker.js a correr)
- Claude Code (autenticado com a conta Pro souzalrns@gmail.com)
- git, configurado com credential.helper store (token GitHub guardado em `~/.git-credentials`)
- claude-mem (memória persistente do Claude Code — worker, Claude Agent SDK, plano subscription, modelo Haiku 4.5)
- context7 (MCP conectado via HTTP)
- Repositórios clonados: `/home/souzalrns/agent-network-mcp` (confirmado). Outros repos (mesaflow-api, etc.) podem não estar clonados — já tivemos de clonar mesaflow-api manualmente numa sessão.

## Como o bridge-worker funciona
- Ficheiro: `agent-network-mcp/bridge-worker.js` (dentro do repo já clonado)
- Corre via pm2: `pm2 start bridge-worker.js --name bridge-worker` (nome do processo: `bridge-worker`)
- Faz **polling** à tabela `code_tasks` no Supabase (projeto `mpsuurqilnhsvbnjmrpm`) — não recebe pedidos de fora diretamente, é ele que pergunta "há alguma tarefa nova?" de tempos a tempos
- Quando encontra uma tarefa `pending`, marca `running`, corre o Claude Code localmente com o prompt da tarefa, grava o resultado, marca `done` ou `error`
- **Processa só uma tarefa de cada vez** — é sequencial, não paralelo (isto já causou o problema da tarefa presa 8h)

## GAP CONHECIDO — provável causa do problema atual
- **Arranque automático (`@reboot`) NUNCA foi confirmado como configurado.** Isto significa: se a VM reiniciar por qualquer motivo (manutenção da Google, falta de memória, etc.), o `pm2` não volta a arrancar sozinho — fica tudo parado até alguém entrar manualmente e correr `pm2 resurrect` ou `pm2 start` outra vez.
- Isto explica o silêncio atual: é muito provável que a VM tenha reiniciado em algum momento nos últimos dias, e o worker nunca mais voltou.

## Firewall (corrigido em 13/08/2026)
- Regra `allow-iap-ssh`: permite SSH via Cloud Identity-Aware Proxy — origem `35.235.240.0/20`, porta TCP `22`, rede `default`. Confirmada criada e ativa.
- API "Cloud Identity-Aware Proxy API" (`iap.googleapis.com`) foi ativada no projeto (estava desativada, causava falha 4003).

## Passos de recuperação (quando entrares por SSH)
1. Confirmar que o pm2 está a correr: `pm2 list` — se não mostrar `bridge-worker`, foi isto.
2. Se não estiver: `cd ~/agent-network-mcp && pm2 start bridge-worker.js --name bridge-worker && pm2 save`
3. **Corrigir o gap de vez** (fazer isto agora evita repetir o problema): configurar arranque automático a sério —
   ```
   pm2 startup systemd -u souzalrns --hp /home/souzalrns
   ```
   (isto imprime um comando `sudo env PATH=...` — copiar e correr esse comando também)
   depois: `pm2 save`
4. Confirmar variáveis de ambiente do worker (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) ainda estão corretas — provavelmente num `.env` ou `start-bridge.sh` dentro do repo.

## Credenciais/segredos usados (não estão aqui os valores, só onde encontrar)
- Token GitHub: em `~/.git-credentials` na própria VM
- Credenciais Supabase: variáveis de ambiente do processo bridge-worker (verificar ficheiro de arranque)
- INGEST_SECRET (para o dashboard/ingestão): variável de ambiente no Vercel, Settings → Environment Variables do projeto `agent-network-mcp`
