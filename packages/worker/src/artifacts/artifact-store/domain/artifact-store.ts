export type SaveArtifactInput = {
  stepExecutionId: string;
  sourcePath: string;
  relativeStorePath: string;
};

export type SaveArtifactResult = {
  storeRef: string;
  sizeBytes: number;
};

export interface ArtifactStore {
  saveArtifact(input: SaveArtifactInput): Promise<SaveArtifactResult>;
}
