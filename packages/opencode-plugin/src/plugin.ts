import type { PluginModule } from "@opencode-ai/plugin";
import boboddyCancelCommand from "./tools/boboddy-cancel-command";
import boboddyEnsureRuntimeService from "./tools/boboddy-ensure-runtime-service";
import boboddyListRuntimeDefinitions from "./tools/boboddy-list-runtime-definitions";
import boboddyRunCommand from "./tools/boboddy-run-command";
import boboddyRunRuntimeCommand from "./tools/boboddy-run-runtime-command";
import boboddySubmitStepFindings from "./tools/boboddy-submit-step-findings";
import playwrightTraceAnalyzer from "./tools/playwright-trace-analyzer";
import { BlockDirectDependencyCommandsPlugin } from "./plugins/block-direct-dependency-commands";

const BoboddyOpencodePlugin: PluginModule = {
  server: async (input, options) => {
    const blockHooks = await BlockDirectDependencyCommandsPlugin(
      input,
      options,
    );
    const beforeHook = blockHooks["tool.execute.before"];
    return {
      tool: {
        "boboddy-cancel-command": boboddyCancelCommand,
        "boboddy-ensure-runtime-service": boboddyEnsureRuntimeService,
        "boboddy-list-runtime-definitions": boboddyListRuntimeDefinitions,
        "boboddy-run-command": boboddyRunCommand,
        "boboddy-run-runtime-command": boboddyRunRuntimeCommand,
        "boboddy-submit-step-findings": boboddySubmitStepFindings,
        "playwright-trace-analyzer": playwrightTraceAnalyzer,
      },
      ...(beforeHook ? { "tool.execute.before": beforeHook } : {}),
    };
  },
};

export default BoboddyOpencodePlugin;
