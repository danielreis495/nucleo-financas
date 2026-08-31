# Núcleo

App de orçamento da casa: foto, PDF ou planilha viram lançamentos. Quase sem digitação.

## Usar de graça (sem pagar o Grok)

1. Abra [vercel.com](https://vercel.com) e entre com esta conta do GitHub.
2. **Add New → Project** e escolha `nucleo-financas`.
3. Clique em **Deploy**. Não precisa de cartão no plano Hobby.

Quando terminar, a Vercel te dá um link (algo como `nucleo-financas.vercel.app`). Abra no celular e, se quiser, adicione à tela inicial.

### Leitura automática de notas (opcional)

Foto, PDF e conselhos usam a API da xAI. Sem isso, o resto do app funciona (lançamento rápido, pessoas, parcelas, extrato).

Se tiver uma chave em [console.x.ai](https://console.x.ai), na Vercel vá em **Settings → Environment Variables** e adicione:

- Nome: `XAI_API_KEY`
- Valor: sua chave

Depois faça um Redeploy.

## No celular

- **iPhone (Safari):** Compartilhar → Adicionar à Tela de Início
- **Android (Chrome):** menu ⋮ → Instalar app

## Desenvolvimento local

```bash
npm install
npm run dev
```

Os dados ficam no aparelho (não vão para a nuvem).
