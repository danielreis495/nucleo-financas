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

## No celular

- **iPhone (Safari):** Compartilhar → Adicionar à Tela de Início
- **Android (Chrome):** menu ⋮ → Instalar app

## Desenvolvimento local

```bash
npm install
npm run dev
```

Os dados ficam no aparelho (não vão para a nuvem).
