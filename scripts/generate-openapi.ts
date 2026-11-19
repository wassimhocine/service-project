import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openApiDocument } from "../src/config/swagger.js";

const outputPath = resolve(process.cwd(), "openapi.json");

writeFileSync(outputPath, JSON.stringify(openApiDocument, null, 2), "utf8");

console.log(`OpenAPI document written to ${outputPath}`);
