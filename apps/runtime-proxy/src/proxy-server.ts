import { connect, createServer, type Server, type Socket } from "node:net";
import type { RuntimeProxyConfig, RuntimeProxyMapping } from "./config";

const destroySocket = (socket: Socket) => {
  if (!socket.destroyed) {
    socket.destroy();
  }
};

const closeServer = async (server: Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

const listenOnPort = async (mapping: RuntimeProxyMapping): Promise<Server> => {
  const server = createServer((downstreamSocket) => {
    const upstreamSocket = connect({
      host: mapping.targetHost,
      port: mapping.targetPort,
    });

    const handleSocketError = (socket: Socket) => () => {
      destroySocket(socket);
    };

    downstreamSocket.on("error", handleSocketError(upstreamSocket));
    upstreamSocket.on("error", handleSocketError(downstreamSocket));

    downstreamSocket.pipe(upstreamSocket);
    upstreamSocket.pipe(downstreamSocket);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(mapping.listenPort, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
};

export const startRuntimeProxyServer = async (config: RuntimeProxyConfig) => {
  const servers = await Promise.all(config.mappings.map(listenOnPort));

  return {
    async stop() {
      await Promise.all(servers.map(closeServer));
    },
  };
};
