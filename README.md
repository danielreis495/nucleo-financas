# Núcleo

App de orçamento da casa: foto, PDF ou planilha viram lançamentos. Quase sem digitação.

## Usar de graça

1. Abra [vercel.com](https://vercel.com) e entre com esta conta do GitHub.
2. **Add New → Project** e escolha `nucleo-financas`.
3. Clique em **Deploy**. Não precisa de cartão no plano Hobby.

Quando terminar, a Vercel te dá um link (algo como `nucleo-financas.vercel.app`). Abra no celular e, se quiser, adicione à tela inicial.

### Leitura automática com Gemini (grátis)

Foto, PDF e conselhos usam a chave gratuita do [Google AI Studio](https://aistudio.google.com/apikey).

1. Abra [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e copie sua chave.
2. Na Vercel: **Settings → Environment Variables**
   - Nome: `GEMINI_API_KEY`
   - Valor: a chave (começa com `AIza`)
3. **Redeploy**.

Sem a chave, o resto do app funciona (lançamento rápido, pessoas, parcelas, extrato).

## No celular

- **iPhone (Safari):** Compartilhar → Adicionar à Tela de Início
- **Android (Chrome):** menu ⋮ → Instalar app

## Desenvolvimento local

```bash
npm install
npm run dev
```

Os dados ficam no aparelho (não vão para a nuvem).
