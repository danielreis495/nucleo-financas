# Núcleo

App de orçamento da casa: foto, PDF ou planilha viram lançamentos. Quase sem digitação.

## Usar de graça

1. Abra [vercel.com](https://vercel.com) e entre com esta conta do GitHub.
2. **Add New → Project** e escolha `nucleo-financas`.
3. Clique em **Deploy**. Não precisa de cartão no plano Hobby.

Quando terminar, a Vercel te dá um link (algo como `nucleo-financas.vercel.app`). Abra no celular e, se quiser, adicione à tela inicial.

### Leitura automática de documentos

Para interpretar fotos e documentos no importador, configure `GEMINI_API_KEY` nas variáveis de ambiente da Vercel. Marque **Preview** para testar branches e **Production** para o app publicado.

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
