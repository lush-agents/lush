import { docs } from "collections";
import { loader } from "fumadocs-core/source";

const mdxSource = docs.toFumadocsSource();
const sourceFiles = mdxSource.files as unknown;
const resolvedSource = {
  ...mdxSource,
  files:
    typeof sourceFiles === "function" ? sourceFiles() : sourceFiles
} as typeof mdxSource;

export const source = loader(resolvedSource, {
  baseUrl: "/docs"
});
