import { describe, expect, mock, test } from "bun:test";
import { z } from "zod/v4";

import {
	createCliSessionConfig,
	createDeferredSessionTurnUploader,
	createInteractiveStartupMcpMessages,
	createResumeContext,
	createStartupModes,
	determineSetupTrigger,
	mergeStartupMcpState,
	recordStartupAndScheduleTelemetry,
	runSessionStartupSideEffects,
	runStartupPrefetches,
	runVersionedPluginStartup,
} from "../startupAssembly.js";
import { buildTool } from "../../Tool.js";
import type { Command } from "../../types/command.js";
import type { MCPServerConnection } from "../../services/mcp/types.js";
import type { GlobalConfig } from "../../utils/config.js";

function createTestTool(options: {
	name: string;
	description: string;
	mcpInfo?: {
		serverName: string;
		toolName: string;
	};
}) {
	return buildTool({
		name: options.name,
		description: async () => options.description,
		prompt: async () => options.description,
		inputSchema: z.object({}),
		maxResultSizeChars: 10_000,
		renderToolUseMessage: () => null,
		mapToolResultToToolResultBlockParam: (_content, toolUseID) => ({
			type: "tool_result" as const,
			tool_use_id: toolUseID,
			content: options.description,
		}),
		call: async () => ({ data: options.description }),
		...(options.mcpInfo ? { mcpInfo: options.mcpInfo } : {}),
	});
}

function createTestCommand(name: string): Command {
	return {
		name,
		description: `${name} description`,
		type: "local",
		supportsNonInteractive: true,
		load: async () => ({
			call: async () => ({ type: "text", value: `${name} ok` }),
		}),
	};
}

function createTestClient(name: string): MCPServerConnection {
	return {
		name,
		type: "disabled",
		config: {
			type: "sdk",
			name: `${name}-sdk`,
			scope: "local",
		},
	};
}

describe("determineSetupTrigger", () => {
	test("prefers init for initOnly and init", () => {
		expect(
			determineSetupTrigger({
				initOnly: true,
				init: false,
				maintenance: true,
			}),
		).toBe("init");
		expect(
			determineSetupTrigger({
				initOnly: false,
				init: true,
				maintenance: true,
			}),
		).toBe("init");
	});

	test("returns maintenance when only maintenance is set", () => {
		expect(
			determineSetupTrigger({
				initOnly: false,
				init: false,
				maintenance: true,
			}),
		).toBe("maintenance");
	});

	test("returns null when no startup trigger is active", () => {
		expect(
			determineSetupTrigger({
				initOnly: false,
				init: false,
				maintenance: false,
			}),
		).toBeNull();
	});
});

describe("runVersionedPluginStartup", () => {
	test("bare mode skips startup bookkeeping", async () => {
		const initializeVersionedPlugins = mock(async () => {});
		const cleanup = mock(async () => {});
		const warm = mock(() => {});
		const checkpoint = mock(() => {});

		await runVersionedPluginStartup({
			bareMode: true,
			isNonInteractiveSession: false,
			initializeVersionedPlugins,
			cleanupOrphanedPluginVersionsInBackground: cleanup,
			warmGlobExclusions: warm,
			onPluginsInitComplete: checkpoint,
		});

		expect(initializeVersionedPlugins).toHaveBeenCalledTimes(0);
		expect(cleanup).toHaveBeenCalledTimes(0);
		expect(warm).toHaveBeenCalledTimes(0);
		expect(checkpoint).toHaveBeenCalledTimes(0);
	});

	test("headless mode awaits initialization before background cleanup", async () => {
		const calls: string[] = [];
		const initializeVersionedPlugins = mock(async () => {
			calls.push("init");
		});
		const cleanup = mock(async () => {
			calls.push("cleanup");
		});
		const warm = mock(() => {
			calls.push("warm");
		});
		const checkpoint = mock(() => {
			calls.push("checkpoint");
		});

		await runVersionedPluginStartup({
			bareMode: false,
			isNonInteractiveSession: true,
			initializeVersionedPlugins,
			cleanupOrphanedPluginVersionsInBackground: cleanup,
			warmGlobExclusions: warm,
			onPluginsInitComplete: checkpoint,
		});
		await Promise.resolve();

		expect(calls[0]).toBe("init");
		expect(calls[1]).toBe("checkpoint");
		expect(calls).toContain("cleanup");
		expect(calls).toContain("warm");
	});
});

describe("runSessionStartupSideEffects", () => {
	test("logs immediately and updates session tracking after registration", async () => {
		const calls: string[] = [];
		const logContextMetrics = mock(() => {
			calls.push("context");
		});
		const logPermissionContext = mock(() => {
			calls.push("permission");
		});
		const logManagedSettings = mock(() => {
			calls.push("managed");
		});
		const registerSession = mock(async () => {
			calls.push("register");
			return true;
		});
		const updateSessionName = mock(async (_name: string) => {
			calls.push("update");
		});
		const countConcurrentSessions = mock(async () => {
			calls.push("count");
			return 3;
		});
		const onConcurrentSessions = mock((count: number) => {
			calls.push(`concurrent:${count}`);
		});

		runSessionStartupSideEffects({
			logContextMetrics,
			logPermissionContext,
			logManagedSettings,
			sessionNameArg: "demo",
			registerSession,
			updateSessionName,
			countConcurrentSessions,
			onConcurrentSessions,
		});

		expect(calls.slice(0, 4)).toEqual([
			"context",
			"permission",
			"managed",
			"register",
		]);

		await Promise.resolve();
		await Promise.resolve();

		expect(calls).toContain("update");
		expect(calls).toContain("count");
		expect(calls).toContain("concurrent:3");
	});

	test("does not continue when registerSession returns false", async () => {
		const updateSessionName = mock(async (_name: string) => {});
		const countConcurrentSessions = mock(async () => 2);
		const onConcurrentSessions = mock((_count: number) => {});

		runSessionStartupSideEffects({
			logContextMetrics: () => {},
			logPermissionContext: () => {},
			logManagedSettings: () => {},
			sessionNameArg: "demo",
			registerSession: async () => false,
			updateSessionName,
			countConcurrentSessions,
			onConcurrentSessions,
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(updateSessionName).toHaveBeenCalledTimes(0);
		expect(countConcurrentSessions).toHaveBeenCalledTimes(0);
		expect(onConcurrentSessions).toHaveBeenCalledTimes(0);
	});
});

describe("recordStartupAndScheduleTelemetry", () => {
	test("increments startups synchronously and schedules telemetry", async () => {
		const observed: Array<string | number> = [];
		let currentConfig = { numStartups: 2 } as GlobalConfig;

		recordStartupAndScheduleTelemetry({
			saveGlobalConfig(updater) {
				currentConfig = updater(currentConfig);
				observed.push(currentConfig.numStartups ?? 0);
			},
			logStartupTelemetry() {
				observed.push("startup");
			},
			logSessionTelemetry() {
				observed.push("session");
			},
			schedule(callback) {
				observed.push("scheduled");
				callback();
			},
		});

		expect(currentConfig.numStartups).toBe(3);
		expect(observed).toEqual([3, "scheduled", "startup", "session"]);
	});
});

describe("createDeferredSessionTurnUploader", () => {
	test("skips uploader loading outside ant sessions", () => {
		const loadSessionDataUploader = mock(async () => ({
			createSessionTurnUploader: () => () => {},
		}));

		const uploader = createDeferredSessionTurnUploader({
			userType: "external",
			loadSessionDataUploader,
		});

		expect(uploader).toBeNull();
		expect(loadSessionDataUploader).toHaveBeenCalledTimes(0);
	});

	test("loads the uploader lazily for ant sessions", async () => {
		const sink = mock((_messages: unknown[]) => {});
		const loadSessionDataUploader = mock(async () => ({
			createSessionTurnUploader: () => sink,
		}));

		const uploader = createDeferredSessionTurnUploader({
			userType: "ant",
			loadSessionDataUploader,
		});

		expect(await uploader).toBe(sink);
		expect(loadSessionDataUploader).toHaveBeenCalledTimes(1);
	});
});

describe("createCliSessionConfig", () => {
	test("merges command sources and routes turn completion through uploader", async () => {
		const uploaded: unknown[] = [];
		const sessionConfig = createCliSessionConfig({
			debug: true,
			commands: [createTestCommand("local")],
			mcpCommands: [createTestCommand("mcp")],
			initialTools: [createTestTool({ name: "a", description: "a" })],
			mcpClients: [createTestClient("demo")],
			autoConnectIdeFlag: false,
			mainThreadAgentDefinition: undefined,
			disableSlashCommands: false,
			dynamicMcpConfig: { mode: "dynamic" },
			strictMcpConfig: false,
			systemPrompt: "sys",
			appendSystemPrompt: "append",
			taskListId: "task-list",
			thinkingConfig: { type: "adaptive" },
			uploaderReady: Promise.resolve((messages) => {
				uploaded.push(messages);
			}),
		});

		expect(sessionConfig.commands.map((command) => command.name)).toEqual([
			"local",
			"mcp",
		]);

		await sessionConfig.onTurnComplete?.([{ type: "user" } as never]);
		await Promise.resolve();

		expect(uploaded).toEqual([[{ type: "user" }]]);
	});
});

describe("shared launch assembly helpers", () => {
	test("creates resume context and startup mode adapters", () => {
		const observed: string[] = [];
		const resumeContext = createResumeContext({
			modeApi: { kind: "mode" },
			mainThreadAgentDefinition: { id: "agent" },
			agentDefinitions: { activeAgents: [] },
			currentCwd: "/tmp/project",
			cliAgents: ["reviewer"],
			initialState: { sessionId: "session-1" },
		});
		const startupModes = createStartupModes({
			activateProactive() {
				observed.push("proactive");
			},
			activateBrief() {
				observed.push("brief");
			},
		});

		startupModes.activateProactive();
		startupModes.activateBrief();

		expect(resumeContext).toEqual({
			modeApi: { kind: "mode" },
			mainThreadAgentDefinition: { id: "agent" },
			agentDefinitions: { activeAgents: [] },
			currentCwd: "/tmp/project",
			cliAgents: ["reviewer"],
			initialState: { sessionId: "session-1" },
		});
		expect(observed).toEqual(["proactive", "brief"]);
	});
});

describe("mergeStartupMcpState", () => {
	test("throws when startup MCP prefetches surface different tools with the same name", () => {
		const localTool = createTestTool({
			name: "duplicate_tool",
			description: "local",
		});
		const claudeaiTool = createTestTool({
			name: "duplicate_tool",
			description: "claudeai",
		});

		expect(() =>
			mergeStartupMcpState(
				{ clients: [], tools: [localTool], commands: [] },
				{ clients: [], tools: [claudeaiTool], commands: [] },
			),
		).toThrow('Conflicting tools share primary name "duplicate_tool"');
	});

	test("deduplicates the same MCP logical tool across startup sources", () => {
		const localTool = createTestTool({
			name: "shared_tool",
			description: "shared",
			mcpInfo: {
				serverName: "demo",
				toolName: "shared_tool",
			},
		});
		const claudeaiTool = createTestTool({
			name: "shared_tool",
			description: "shared",
			mcpInfo: {
				serverName: "demo",
				toolName: "shared_tool",
			},
		});

		const merged = mergeStartupMcpState(
			{
				clients: [createTestClient("local")],
				tools: [localTool],
				commands: [createTestCommand("a")],
			},
			{
				clients: [createTestClient("claudeai")],
				tools: [claudeaiTool],
				commands: [createTestCommand("a"), createTestCommand("b")],
			},
		);

		expect(merged.clients.map((client) => client.name)).toEqual([
			"local",
			"claudeai",
		]);
		expect(merged.tools).toEqual([localTool]);
		expect(merged.commands.map((command) => command.name)).toEqual([
			"a",
			"b",
		]);
	});
});

describe("createInteractiveStartupMcpMessages", () => {
	test("returns no messages when startup MCP prefetch succeeds", async () => {
		const onError = mock((_error: unknown) => "warning");

		const messages = await createInteractiveStartupMcpMessages({
			mcpPromise: Promise.resolve({ clients: [], tools: [], commands: [] }),
			onError,
		});

		expect(messages).toEqual([]);
		expect(onError).toHaveBeenCalledTimes(0);
	});

	test("converts startup MCP failures into warning messages", async () => {
		const onError = mock((error: unknown) => `warning:${String(error)}`);

		const messages = await createInteractiveStartupMcpMessages({
			mcpPromise: Promise.reject(new Error("duplicate MCP tool")),
			onError,
		});

		expect(messages).toEqual(["warning:Error: duplicate MCP tool"]);
		expect(onError).toHaveBeenCalledTimes(1);
	});
});

describe("runStartupPrefetches", () => {
	test("runs startup prefetches and saves timestamp when not throttled", async () => {
		const calls: string[] = [];
		const checkQuotaStatus = mock(async () => {
			calls.push("quota");
		});
		const fetchBootstrapData = mock(() => {
			calls.push("bootstrap");
		});
		const prefetchPassesEligibility = mock(() => {
			calls.push("passes");
		});
		const prefetchFastModeStatus = mock(async () => {
			calls.push("fast");
		});
		const resolveFastModeStatusFromCache = mock(() => {
			calls.push("cache");
		});
		const saveStartupPrefetchedAt = mock((timestamp: number) => {
			calls.push(`save:${timestamp}`);
		});
		const refreshExampleCommands = mock(() => {
			calls.push("examples");
		});
		const logForDebugging = mock((message: string) => {
			calls.push(`log:${message}`);
		});
		const onQuotaError = mock((_error: unknown) => {
			calls.push("quota-error");
		});

		runStartupPrefetches({
			bareMode: false,
			isNonInteractiveSession: false,
			bgRefreshThrottleMs: 10_000,
			lastPrefetched: 0,
			fastModeKillSwitchEnabled: false,
			logForDebugging,
			checkQuotaStatus,
			onQuotaError,
			fetchBootstrapData,
			prefetchPassesEligibility,
			prefetchFastModeStatus,
			resolveFastModeStatusFromCache,
			saveStartupPrefetchedAt,
			refreshExampleCommands,
			now: () => 12_345,
		});

		await Promise.resolve();

		expect(calls).toContain("quota");
		expect(calls).toContain("bootstrap");
		expect(calls).toContain("passes");
		expect(calls).toContain("fast");
		expect(calls).toContain("save:12345");
		expect(calls).toContain("examples");
		expect(calls.some((entry) => entry.startsWith("log:Starting background startup prefetches"))).toBeTrue();
		expect(resolveFastModeStatusFromCache).toHaveBeenCalledTimes(0);
		expect(onQuotaError).toHaveBeenCalledTimes(0);
	});

	test("skips throttled prefetches and only resolves cached fast mode", async () => {
		const calls: string[] = [];
		const resolveFastModeStatusFromCache = mock(() => {
			calls.push("cache");
		});
		const refreshExampleCommands = mock(() => {
			calls.push("examples");
		});

		runStartupPrefetches({
			bareMode: false,
			isNonInteractiveSession: true,
			bgRefreshThrottleMs: 60_000,
			lastPrefetched: 70_000,
			fastModeKillSwitchEnabled: false,
			logForDebugging: (message) => {
				calls.push(`log:${message}`);
			},
			checkQuotaStatus: async () => {
				calls.push("quota");
			},
			onQuotaError: (_error) => {
				calls.push("quota-error");
			},
			fetchBootstrapData: () => {
				calls.push("bootstrap");
			},
			prefetchPassesEligibility: () => {
				calls.push("passes");
			},
			prefetchFastModeStatus: async () => {
				calls.push("fast");
			},
			resolveFastModeStatusFromCache,
			saveStartupPrefetchedAt: (timestamp) => {
				calls.push(`save:${timestamp}`);
			},
			refreshExampleCommands,
			now: () => 100_000,
		});

		await Promise.resolve();

		expect(calls).toContain("cache");
		expect(calls.some((entry) => entry.startsWith("log:Skipping startup prefetches"))).toBeTrue();
		expect(calls).not.toContain("quota");
		expect(calls).not.toContain("bootstrap");
		expect(calls).not.toContain("passes");
		expect(calls).not.toContain("fast");
		expect(calls).not.toContain("examples");
		expect(calls.some((entry) => entry.startsWith("save:"))).toBeFalse();
		expect(resolveFastModeStatusFromCache).toHaveBeenCalledTimes(1);
		expect(refreshExampleCommands).toHaveBeenCalledTimes(0);
	});
});
