import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { Client } from 'pg';
import { getAwsSsoCredentialsForProfile } from '@boboddy/tch';

function getRequiredValue(
  record: Record<string, string | undefined>,
  key: string,
): string {
  const value = record[key]?.trim();

  if (!value) {
    throw new Error(`Missing required value for ${key}`);
  }

  return value;
}

function getOptionalValue(
  record: Record<string, string | undefined>,
  key: string,
  fallback: string,
): string {
  return record[key]?.trim() || fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnectToPort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await canConnectToPort(host, port)) {
      return;
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${host}:${port} to accept connections`);
}

function startProdReadonlyTunnel(localPort: number, verbose?: boolean): ChildProcess {
  if (verbose) {
    console.log(`Starting prod readonly DB tunnel on localhost:${localPort}`);
  }

  return spawn(
    'aws',
    [
      'ssm',
      'start-session',
      '--target',
      getOptionalValue(process.env, 'PROD_DB_TUNNEL_TARGET', 'i-0fcc12a84eaf7e6da'),
      '--document-name',
      'AWS-StartPortForwardingSessionToRemoteHost',
      '--parameters',
      JSON.stringify({
        host: [
          getOptionalValue(
            process.env,
            'PROD_DB_TUNNEL_HOST',
            'prod-relational-database-provisioning-rdsproxy-read-only.endpoint.proxy-clgcccsuqvs0.us-east-1.rds.amazonaws.com',
          ),
        ],
        portNumber: [getOptionalValue(process.env, 'PROD_DB_TUNNEL_REMOTE_PORT', '5432')],
        localPortNumber: [String(localPort)],
      }),
      '--profile',
      getOptionalValue(process.env, 'PROD_AWS_PROFILE', 'prod'),
    ],
    {
      stdio: verbose ? 'inherit' : 'ignore',
    },
  );
}

async function withProdReadonlyTunnel<T>(
  localPort: number,
  verbose: boolean | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const host = '127.0.0.1';
  const alreadyRunning = await canConnectToPort(host, localPort);

  if (alreadyRunning) {
    if (verbose) {
      console.log(`Reusing existing prod readonly DB tunnel on ${host}:${localPort}`);
    }

    return await fn();
  }

  await getAwsSsoCredentialsForProfile(
    getOptionalValue(process.env, 'PROD_AWS_PROFILE', 'prod'),
    verbose,
  );

  const tunnel = startProdReadonlyTunnel(localPort, verbose);

  try {
    await waitForPort(host, localPort, 15000);
    return await fn();
  } finally {
    tunnel.kill('SIGTERM');
  }
}

function createProdReadonlyClient(): Client {
  return new Client({
    host: getOptionalValue(process.env, 'PROD_POSTGRES_HOST', '127.0.0.1'),
    port: Number.parseInt(getOptionalValue(process.env, 'PROD_POSTGRES_PORT', '5431'), 10),
    database: getOptionalValue(
      process.env,
      'PROD_POSTGRES_DATABASE',
      getRequiredValue(process.env, 'POSTGRES_DATABASE'),
    ),
    user: getOptionalValue(
      process.env,
      'PROD_POSTGRES_USERNAME',
      getRequiredValue(process.env, 'POSTGRES_USERNAME'),
    ),
    password: getOptionalValue(
      process.env,
      'PROD_POSTGRES_PASSWORD',
      getRequiredValue(process.env, 'POSTGRES_PASSWORD'),
    ),
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

export async function withProdReadonlyDb<T>(
  verbose: boolean | undefined,
  fn: (db: Client) => Promise<T>,
): Promise<T> {
  const localPort = Number.parseInt(
    getOptionalValue(process.env, 'PROD_POSTGRES_PORT', '5431'),
    10,
  );

  return await withProdReadonlyTunnel(localPort, verbose, async () => {
    const db = createProdReadonlyClient();
    await db.connect();

    try {
      return await fn(db);
    } finally {
      await db.end();
    }
  });
}
