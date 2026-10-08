import { createFileRoute } from "@tanstack/react-router";

/**
 * Chamado todo dia pelo Vercel Cron (ver `vercel.config.crons` em vite.config.ts). A Vercel envia
 * `Authorization: Bearer <CRON_SECRET>`; sem CRON_SECRET configurado, a rota recusa tudo.
 */
export const Route = createFileRoute("/api/cron/sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET?.trim();
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { syncAll } = await import("@/lib/bank/sync");
        const result = await syncAll("cron");
        return Response.json(result, { status: result.ok ? 200 : 500 });
      },
    },
  },
});
