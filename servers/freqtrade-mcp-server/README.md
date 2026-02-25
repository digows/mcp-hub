# Freqtrade MCP Server

Este servidor permite que agentes de IA interajam com uma instância do **Freqtrade** através do **Model Context Protocol (MCP)**.

## 🚀 Transpotes Suportados

O servidor suporta dois modos de operação (transpotes):

### 1. STDIO (Padrão)
Otimizado para rodar como um sub-processo dentro de um Hub ou Gateway MCP (como o `mcp-proxy-server`).
- **Vantagem**: Baixo overhead, segurança local total e gerenciamento direto de processo.
- **Configuração**: Use `MCP_TRANSPORT=stdio` (ou deixe o padrão).

### 2. SSE (Server-Sent Events)
Útil para rodar o servidor avulso ou quando as ferramentas precisam ser acessadas remotamente via HTTP.
- **Configuração**: Use `MCP_TRANSPORT=sse`.
- **Porta**: Padrão `3001` (ajustável via `PORT`).
- **Endpoint**: `http://localhost:3001/sse`.

## ⚙️ Configuração (Variáveis de Ambiente)

| Variável | Descrição | Padrão |
| :--- | :--- | :--- |
| `FREQTRADE_URL` | URL da API do Freqtrade (ex: `http://localhost:8080`) | Opcional |
| `FREQTRADE_USER` | Usuário da API | Opcional |
| `FREQTRADE_PASS` | Senha da API | Opcional |
| `MCP_TRANSPORT` | Tipo de transporte (`stdio` ou `sse`) | `stdio` |
| `PORT` | Porta para o modo SSE | `3001` |
| `AUDIT_LOG_FILE` | Caminho para o log de auditoria | `/tmp/freqtrade_audit.jsonl` |

## 🛠️ Ferramentas Disponíveis
O servidor expõe diversas ferramentas prefixadas com `freqtrade.`, incluindo:
- `freqtrade.status`, `freqtrade.balance`, `freqtrade.profit`
- `freqtrade.force_enter` (Protegido por Risk Engine)
- `freqtrade.force_exit`
- `freqtrade.reconcile_state` (Dados consolidados)

## 🏗️ Integração com Hub
Quando usado em uma "Fat Image", o Hub (Proxy) inicia este servidor via linha de comando:
```bash
node build/index.js
```
Como o padrão é `stdio`, a integração é instantânea e de alta performance.
