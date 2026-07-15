import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CodeSession } from "@lush/code";

export class CodeSessionStore {
  constructor(private readonly root: string) {}

  async list() {
    await mkdir(this.root, { recursive: true });
    const files = await readdir(this.root);
    const sessions = await Promise.all(
      files.filter((file) => file.endsWith(".json")).map((file) => this.readFile(path.join(this.root, file)))
    );
    return sessions.filter((session): session is CodeSession => Boolean(session));
  }

  async get(id: string) {
    return this.readFile(this.sessionPath(id));
  }

  async put(session: CodeSession) {
    await mkdir(this.root, { recursive: true });
    const destination = this.sessionPath(session.id);
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, destination);
  }

  private sessionPath(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid session id");
    return path.join(this.root, `${id}.json`);
  }

  private async readFile(file: string) {
    try {
      return JSON.parse(await readFile(file, "utf8")) as CodeSession;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
}
