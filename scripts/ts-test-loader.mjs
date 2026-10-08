// Resolve imports no estilo Vite para os testes em Node (--experimental-strip-types):
// - "./modulo" sem extensão -> "./modulo.ts" (ou /index.ts)
// - "@/caminho" -> "<raiz>/src/caminho"
// Mantém os testes rodando contra o código real, sem build.
import { existsSync, statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

function candidate(base) {
  for (const path of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL ? fileURLToPath(context.parentURL) : `${root}/`;
  let base = null;
  if (specifier.startsWith("@/")) base = resolvePath(root, "src", specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    base = resolvePath(dirname(parent), specifier);
  }
  if (base) {
    const found = candidate(base);
    if (found) return nextResolve(pathToFileURL(found).href, context);
  }
  return nextResolve(specifier, context);
}
