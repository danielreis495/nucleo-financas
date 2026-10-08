# Núcleo

App de orçamento da casa: foto, PDF ou planilha viram lançamentos. Quase sem digitação.

## Usar de graça

1. Abra [vercel.com](https://vercel.com) e entre com esta conta do GitHub.
2. **Add New → Project** e escolha `nucleo-financas`.
3. Clique em **Deploy**. Não precisa de cartão no plano Hobby.

Quando terminar, a Vercel te dá um link (algo como `nucleo-financas.vercel.app`). Abra no celular e, se quiser, adicione à tela inicial.

### Leitura automática de documentos

Para interpretar fotos e documentos no importador, conecte uma credencial do Gemini pelo Vercel Connect ao projeto. A conexão `generativelanguage.googleapis.com/nucleo-financas1` já é usada automaticamente pelo app em **Production**, **Preview** e **Development**. Como alternativa, o servidor também aceita `GEMINI_API_KEY` ou `GOOGLE_API_KEY` nas variáveis de ambiente.

A chave fica protegida no servidor e não precisa ser cadastrada nos aparelhos. Sem ela, o restante do app funciona normalmente (lançamento rápido, pessoas, parcelas e extrato).

### Código de acesso do Núcleo IA (obrigatório em produção)

As funções de IA usam a sua cota do Gemini, então só respondem a quem informar o código de acesso:

1. Na Vercel, em **Settings → Environment Variables**, crie `NUCLEO_ACCESS_CODE` com um código difícil de adivinhar (por exemplo, uma frase longa) em **Production** e **Preview**, e faça um novo deploy.
2. Em cada aparelho da casa, abra **Casa → Núcleo IA**, digite o código e toque em **Salvar**.

Sem a variável, a IA fica bloqueada em produção (em vez de aberta para qualquer pessoa). No desenvolvimento local ela continua liberada.

### Privacidade

Os lançamentos ficam no aparelho. Quando a IA é usada, o texto e as imagens do documento importado, ou o resumo financeiro enviado na conversa, vão para o Gemini (Google) para interpretação. Extratos e planilhas estruturados são lidos localmente, sem envio.

## No celular

- **iPhone (Safari):** Compartilhar → Adicionar à Tela de Início
- **Android (Chrome):** menu ⋮ → Instalar app

## Bancos conectados (Open Finance)

Itaú e Nubank chegam sozinhos pelo [Meu Pluggy](https://www.pluggy.ai/meu-pluggy) (gratuito para uso pessoal). Todo dia às 7h a Vercel busca as novidades e grava no banco Neon; ao abrir o app, ele também atualiza se a última busca tiver mais de 6 horas.

Variáveis de ambiente na Vercel:

| Nome | O que é |
|---|---|
| `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` | Credenciais da aplicação no painel da Pluggy |
| `PLUGGY_ITEMS` | Itens do MeuPluggy, separados por vírgula: `itemId:you` (você) ou `itemId:partner` (cônjuge) |
| `APP_PASSWORD` | Opcional: senha da casa pedida uma vez em cada aparelho. Sem ela, vale o `NUCLEO_ACCESS_CODE` |
| `CRON_SECRET` | Texto aleatório longo que protege a sincronização diária |
| `DATABASE_URL` | Criada pela integração Neon |
| `PLUGGY_PARTNER_CLIENT_ID`, `PLUGGY_PARTNER_CLIENT_SECRET` | Opcional: conta Pluggy do cônjuge |

Ao mudar a categoria de uma compra do banco, as próximas compras do mesmo estabelecimento seguem a mesma categoria. Movimentos do banco ficam no Neon e são iguais em todos os aparelhos; lançamentos manuais e por foto/PDF continuam salvos só no aparelho onde foram feitos.

## Desenvolvimento local

```bash
npm install
npm run dev
npm test        # testes dos scripts + regras financeiras (src/**/*.test.ts)
```

Os lançamentos ficam no aparelho; veja **Privacidade** acima sobre o uso da IA.
