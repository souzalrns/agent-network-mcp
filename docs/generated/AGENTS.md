# AGENTS — catálogo gerado automaticamente

> **Não editar à mão.** Regenerar com: `node scripts/document-agents.js`
>
> Gerado em: 2026-10-25
> Fonte: `lib/agents.js`
> Total: **34** agentes

| ID | Descrição |
|----|-----------|
| `apps-produto` | Coordenação dos apps da LRNSdigital (MesaFlow, Alivia, futuros) — " decisões de arquitetura e escopo de produto, não execução técnica. |
| `arquitetura-agentes` | Meta-agente sobre a própria rede LRNSdigital (este servidor MCP) " — desenho de agentes, custo de LLM, automação GitHub Actions. " Baseado nos skills agentic-engineering, cost-aware-llm-pipeline, " mc |
| `canidelo` | Venda do apartamento em Canidelo, Vila Nova de Gaia. Dois sites " multilingues ativos, argumento do teleférico de Gaia. |
| `cardiologia` | Informação especializada em cardiologia — doença coronária, " ponte miocárdica, angina, sinais de alarme. Apoio informativo, " não substitui o cardiologista. |
| `comunicacoes-atendimento` | Pool horizontal de comunicação e atendimento ao cliente — triagem " de mensagens, priorização, tom de resposta. Serve qualquer negócio " da rede que tenha cliente para atender. |
| `construtora` | TermoBuild — construção ICF (Insulated Concrete Forms) em Portugal. " Licenciamento IMPIC, tipologias residenciais, gestão de obra. |
| `contabilidade` | Apoio contabilístico transversal Portugal + Brasil — faturação, " IVA, categorização de despesas, noções fiscais nos dois países. |
| `cursos-formacoes` | Plataforma de cursos e formações — estrutura de conteúdo, gestão " de alunos, certificados. Ligação natural com a SST Portugal. |
| `dermatologia` | Informação especializada em dermatologia — rosácea, lesões de " pele, sinais de alarme (ABCDE). Apoio informativo, não substitui " o dermatologista. |
| `desenvolvimento` | Agente de construção — implementa código seguindo um plano e " arquitetura já aprovados (tipicamente vindos do agente " planejador), distinto de revisor-codigo que só revisa depois de " pronto. |
| `design` | Apoio de design/identidade visual transversal a todos os negócios " — branding, materiais gráficos. Complementa o Canva já ligado. |
| `direito-br-pt` | Direito Brasil-Portugal, mais amplo que cidadania — contratos, " imigração geral, questões cíveis entre os dois países. |
| `eletrodomesticos` | Manutenção e reparação de eletrodomésticos de cozinha: " lava-louças, frigoríficos, exaustores, fornos, cafeteiras, " micro-ondas. (Tudo o resto — AC, aquecimento, energia — é do hvac.) |
| `engenharia-civil-arquitetura` | Estrutura, fundações, dimensionamento — Eurocódigos (Portugal) e " normas NBR (Brasil). Cruza com TermoBuild e arquitetura. |
| `engenharia-eletrica-hidraulica` | Dimensionamento de instalações elétricas e hidráulicas. Apoia " TermoBuild, TermoExpert e a equipa de pladur. |
| `gestao-empresarial` | Visão de topo entre todos os negócios do portefólio LRNSdigital — " prioridades, estratégia, análise cruzada de projetos. |
| `guia-tdd` | Guia de Test-Driven Development — ciclo red-green-refactor, " cobertura, casos-limite. Baseado no agente tdd-guide do ECC (MIT). " Útil para a suite de testes do MesaFlow (Jest) e novas features. |
| `hvac` | TermoExpert — climatização, aquecimento e energia térmica " completos: ar condicionado, bomba de calor, termoacumulador, " painel solar, radiadores. Porto/Gaia. Certificação F-Gas própria. |
| `imobiliario-digital` | Imobiliário digital mais amplo, além do Canidelo — avaliação, " análise de mercado, relatórios de bairro. |
| `investimentos-brasil` | Especialista em investimentos no mercado brasileiro — B3, renda " fixa/variável, indicadores macro (Selic, IPCA, câmbio). |
| `marketing` | Pool horizontal de marketing — planejamento de campanha, copy, " SEO, posicionamento. Serve QUALQUER negócio da rede (MesaFlow, " ViannaLegal, TermoBuild, TermoExpert, Forma, SST Portugal, " Canidelo) |
| `mesaflow` | SaaS de gestão de restaurantes (NestJS). Reservas, KDS, gateway de " cliente, pagamentos, faturação certificada AT. Repo: souzalrns/mesaflow-api. |
| `oftalmologia` | Informação especializada em oftalmologia — alterações de visão, " sinais de alarme (perda súbita, moscas volantes). Apoio " informativo, não substitui o oftalmologista. |
| `pladur` | Equipa de drywall/pladur/gesso cartonado, Porto/Gaia. Simulador de " preços, reforço estrutural. |
| `planejador` | Meta-agente de planeamento — quebra uma pendência/intenção em " plano com critério de pronto antes de qualquer execução, e decide " explicitamente Fast-Path vs Full Cycle. Usado pelo orquestrador " (C |
| `produto-tech-transversal` | Pool horizontal de produto/tecnologia — acessibilidade (WCAG), " SEO técnico, UX de produto. Serve qualquer produto/site/app da " rede, não é dono de nenhum projeto específico (isso já existe em " 'ap |
| `qualidade-dados` | Revisão de base de dados PostgreSQL — índices, RLS, esquema, " performance de queries. Baseado no agente database-reviewer do ECC " (MIT). Útil para MesaFlow (Prisma direto sobre Postgres) e " ViannaL |
| `radar-ferramentas` | Banco de memória de ferramentas/soluções já avaliadas (Orca, Kimi " Code, ECC, Superpowers, etc). Consulta ANTES de investigar uma " ferramenta nova — evita re-diagnosticar o que já se sabe. |
| `reformas` | Forma — renovações de cozinha e casa de banho, Porto/Gaia. " Transparência radical de preços. |
| `refrigeracao-hvac` | Conhecimento profundo em máquinas de refrigeração e HVAC — " diagnóstico, F-Gas, ciclos de compressão, dimensionamento de " geotermia. Baseado no teu know-how e em normas técnicas (ISO " 5149, ISO 132 |
| `revisor-codigo` | Revisão de código — segurança, qualidade, padrões Node.js/NestJS/" React. Baseado no agente code-reviewer do ECC (MIT). Útil para " MesaFlow e qualquer código dos teus projetos. |
| `sst` | Consultoria de segurança no trabalho (SST Portugal). Formações " setoriais, TSST, logística/armazenagem, ammonia refrigeration. |
| `vianna-gestao` | Sistema interno de gestão de processos do escritório ViannaLegal " (substituto do Astrea): clientes, contratos, processos, honorários, " agenda e documentos. Repo privado: souzalrns/vianna-gestao. |
| `viannalegal` | Site de assessoria de cidadania portuguesa para brasileiros, com a " advogada Kathia Vianna. Repo: souzalrns/viannalegal-site. |

---
*Camada privada/produção — agent-network-mcp.*
