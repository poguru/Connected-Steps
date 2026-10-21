import fs from "fs";
import path from "path";

/**
 * The registration rules, as source text. They live in the shared module (lib/it-run-register-core.ts), and the public
 * route keeps only the request handling and PATCH. Tests that check a rule read both files.
 */
export function registrationSource(): string {
  const root = path.resolve(__dirname, "../..");
  return [
    "lib/it-run-register-core.ts",
    "app/api/it-run/register/route.ts",
  ].map(p => fs.readFileSync(path.join(root, p), "utf8")).join("\n");
}
