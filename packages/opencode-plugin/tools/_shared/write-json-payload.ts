import type { AnyJsonValue } from '@boboddy/core/common/contracts/json';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeJsonPayload(
  relativeFilePath: string,
  payload: AnyJsonValue,
): Promise<string> {
  const filePath = path.join(process.cwd(), relativeFilePath);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');

  return JSON.stringify(
    {
      ok: true,
      path: relativeFilePath,
    },
    null,
    2,
  );
}
