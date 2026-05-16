import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tool, type ToolDefinition } from '@opencode-ai/plugin';

const subcommands = ['actions', 'console', 'network'] as const;

function runPlaywrightTraceAnalyzer(
  subcommand: (typeof subcommands)[number],
  tracePath: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('playwright-trace-analyzer', [subcommand, tracePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    child.stdout.on('data', (chunk: string | Buffer) => {
      output += chunk.toString();
    });

    child.stderr.on('data', (chunk: string | Buffer) => {
      output += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', () => {
      resolve(output);
    });
  });
}

const playwrightTraceAnalyzer: ToolDefinition = tool({
  description:
    'Run playwright-trace-analyzer subcommands against a trace zip on Unix systems',
  args: {
    subcommand: tool.schema
      .enum(subcommands)
      .describe('Trace analyzer subcommand to run'),
    tracePath: tool.schema
      .string()
      .describe('Path to the Playwright trace.zip file'),
  },
  async execute(args) {
    await access(args.tracePath, constants.R_OK);
    return await runPlaywrightTraceAnalyzer(args.subcommand, args.tracePath);
  },
});

export default playwrightTraceAnalyzer;
