import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type {
  ArtifactStore,
  SaveArtifactInput,
  SaveArtifactResult,
} from "./artifact-store";

export class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly baseDir: string) {}

  async saveArtifact(input: SaveArtifactInput): Promise<SaveArtifactResult> {
    const dest = path.join(
      this.baseDir,
      input.stepExecutionId,
      input.relativeStorePath,
    );
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(input.sourcePath, dest);
    const { size } = await stat(dest);
    return { storeRef: dest, sizeBytes: size };
  }
}
