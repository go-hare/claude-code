import type { Command } from "../commands.js";
import type { MCPServerConnection } from "../services/mcp/types.js";
import type { Message as MessageType } from "../types/message.js";
import type { GlobalConfig } from "../utils/config.js";
import uniqBy from "lodash-es/uniqBy.js";
import { dedupeToolsByName, type Tool } from "../Tool.js";

export type SetupTrigger = "init" | "maintenance" | null;

export type StartupMcpState = {
	clients: MCPServerConnection[];
	tools: Tool[];
	commands: Command[];
};

export type SessionTurnUploader = (messages: MessageType[]) => void;

export function createDeferredSessionTurnUploader(options: {
	userType?: string;
	loadSessionDataUploader: () => Promise<{
		createSessionTurnUploader: () => SessionTurnUploader | void;
	}>;
}): Promise<SessionTurnUploader | null> | null {
	const { userType, loadSessionDataUploader } = options;
	if (userType !== "ant") {
		return null;
	}

	return loadSessionDataUploader()
		.then((mod) => {
			const uploader = mod.createSessionTurnUploader();
			return typeof uploader === "function" ? uploader : null;
		})
		.catch(() => null);
}

export function recordStartupAndScheduleTelemetry(options: {
	saveGlobalConfig: (updater: (current: GlobalConfig) => GlobalConfig) => void;
	logStartupTelemetry: () => void | Promise<void>;
	logSessionTelemetry: () => void | Promise<void>;
	schedule?: (callback: () => void) => void;
}): void {
	const {
		saveGlobalConfig,
		logStartupTelemetry,
		logSessionTelemetry,
		schedule = (callback) => setImmediate(callback),
	} = options;

	saveGlobalConfig((current) => ({
		...current,
		numStartups: (current.numStartups ?? 0) + 1,
	}));
	schedule(() => {
		void logStartupTelemetry();
		void logSessionTelemetry();
	});
}

export function createCliSessionConfig<
	TCommand,
	TTool,
	TMcpClient,
	TMainThreadAgentDefinition,
	TDynamicMcpConfig,
	TStrictMcpConfig,
	TThinkingConfig,
>(options: {
	debug: boolean;
	commands: TCommand[];
	mcpCommands: TCommand[];
	initialTools: TTool[];
	mcpClients: TMcpClient[];
	autoConnectIdeFlag: boolean;
	mainThreadAgentDefinition: TMainThreadAgentDefinition;
	disableSlashCommands: boolean;
	dynamicMcpConfig: TDynamicMcpConfig;
	strictMcpConfig: TStrictMcpConfig;
	systemPrompt?: string;
	appendSystemPrompt?: string;
	taskListId?: string;
	thinkingConfig: TThinkingConfig;
	uploaderReady?: Promise<SessionTurnUploader | null> | null;
}) {
	const {
		debug,
		commands,
		mcpCommands,
		initialTools,
		mcpClients,
		autoConnectIdeFlag,
		mainThreadAgentDefinition,
		disableSlashCommands,
		dynamicMcpConfig,
		strictMcpConfig,
		systemPrompt,
		appendSystemPrompt,
		taskListId,
		thinkingConfig,
		uploaderReady,
	} = options;

	return {
		debug,
		commands: [...commands, ...mcpCommands],
		initialTools,
		mcpClients,
		autoConnectIdeFlag,
		mainThreadAgentDefinition,
		disableSlashCommands,
		dynamicMcpConfig,
		strictMcpConfig,
		systemPrompt,
		appendSystemPrompt,
		taskListId,
		thinkingConfig,
		...(uploaderReady && {
			onTurnComplete: (messages: MessageType[]) => {
				void uploaderReady.then((uploader) => uploader?.(messages));
			},
		}),
	};
}

export function createResumeContext<
	TModeApi,
	TMainThreadAgentDefinition,
	TAgentDefinitions,
	TCliAgents,
	TInitialState,
>(options: {
	modeApi: TModeApi;
	mainThreadAgentDefinition: TMainThreadAgentDefinition;
	agentDefinitions: TAgentDefinitions;
	currentCwd: string;
	cliAgents: TCliAgents;
	initialState: TInitialState;
}) {
	return {
		modeApi: options.modeApi,
		mainThreadAgentDefinition: options.mainThreadAgentDefinition,
		agentDefinitions: options.agentDefinitions,
		currentCwd: options.currentCwd,
		cliAgents: options.cliAgents,
		initialState: options.initialState,
	};
}

export function createStartupModes(options: {
	activateProactive: () => void;
	activateBrief: () => void;
}) {
	return {
		activateProactive() {
			options.activateProactive();
		},
		activateBrief() {
			options.activateBrief();
		},
	};
}

export function determineSetupTrigger(options: {
	initOnly: boolean;
	init: boolean;
	maintenance: boolean;
}): SetupTrigger {
	const { initOnly, init, maintenance } = options;

	if (initOnly || init) {
		return "init";
	}
	if (maintenance) {
		return "maintenance";
	}
	return null;
}

export async function runVersionedPluginStartup(options: {
	bareMode: boolean;
	isNonInteractiveSession: boolean;
	initializeVersionedPlugins: () => Promise<unknown>;
	cleanupOrphanedPluginVersionsInBackground: () => Promise<unknown>;
	warmGlobExclusions: () => void;
	onPluginsInitComplete: () => void;
}): Promise<void> {
	const {
		bareMode,
		isNonInteractiveSession,
		initializeVersionedPlugins,
		cleanupOrphanedPluginVersionsInBackground,
		warmGlobExclusions,
		onPluginsInitComplete,
	} = options;

	if (bareMode) {
		return;
	}

	if (isNonInteractiveSession) {
		await initializeVersionedPlugins();
		onPluginsInitComplete();
		void cleanupOrphanedPluginVersionsInBackground().then(() =>
			warmGlobExclusions(),
		);
		return;
	}

	void initializeVersionedPlugins().then(async () => {
		onPluginsInitComplete();
		await cleanupOrphanedPluginVersionsInBackground();
		warmGlobExclusions();
	});
}

export function runSessionStartupSideEffects(options: {
	logContextMetrics: () => void;
	logPermissionContext: () => void;
	logManagedSettings: () => void;
	sessionNameArg?: string;
	registerSession: () => Promise<boolean>;
	updateSessionName: (name: string) => Promise<unknown> | void;
	countConcurrentSessions: () => Promise<number>;
	onConcurrentSessions: (count: number) => void;
}): void {
	const {
		logContextMetrics,
		logPermissionContext,
		logManagedSettings,
		sessionNameArg,
		registerSession,
		updateSessionName,
		countConcurrentSessions,
		onConcurrentSessions,
	} = options;

	logContextMetrics();
	logPermissionContext();
	logManagedSettings();

	void registerSession().then((registered) => {
		if (!registered) return;
		if (sessionNameArg) {
			void updateSessionName(sessionNameArg);
		}
		void countConcurrentSessions().then((count) => {
			if (count >= 2) {
				onConcurrentSessions(count);
			}
		});
	});
}

export function mergeStartupMcpState(
	local: StartupMcpState,
	claudeai: StartupMcpState,
): StartupMcpState {
	return {
		clients: [...local.clients, ...claudeai.clients],
		tools: dedupeToolsByName([...local.tools, ...claudeai.tools]),
		commands: uniqBy([...local.commands, ...claudeai.commands], "name"),
	};
}

export function createInteractiveStartupMcpMessages<T>(options: {
	mcpPromise: Promise<StartupMcpState>;
	onError: (error: unknown) => T;
}): Promise<T[]> {
	return options.mcpPromise.then(() => []).catch((error) => [
		options.onError(error),
	]);
}

export function runStartupPrefetches(options: {
	bareMode: boolean;
	isNonInteractiveSession: boolean;
	bgRefreshThrottleMs: number;
	lastPrefetched: number;
	fastModeKillSwitchEnabled: boolean;
	logForDebugging: (message: string) => void;
	checkQuotaStatus: () => Promise<unknown>;
	onQuotaError: (error: unknown) => void;
	fetchBootstrapData: () => Promise<unknown> | void;
	prefetchPassesEligibility: () => Promise<unknown> | void;
	prefetchFastModeStatus: () => Promise<unknown> | void;
	resolveFastModeStatusFromCache: () => void;
	saveStartupPrefetchedAt: (timestamp: number) => void;
	refreshExampleCommands: () => Promise<unknown> | void;
	now?: () => number;
}): void {
	const {
		bareMode,
		isNonInteractiveSession,
		bgRefreshThrottleMs,
		lastPrefetched,
		fastModeKillSwitchEnabled,
		logForDebugging,
		checkQuotaStatus,
		onQuotaError,
		fetchBootstrapData,
		prefetchPassesEligibility,
		prefetchFastModeStatus,
		resolveFastModeStatusFromCache,
		saveStartupPrefetchedAt,
		refreshExampleCommands,
		now = Date.now,
	} = options;

	const currentTime = now();
	const skipStartupPrefetches =
		bareMode ||
		(bgRefreshThrottleMs > 0 &&
			currentTime - lastPrefetched < bgRefreshThrottleMs);

	if (!skipStartupPrefetches) {
		const lastPrefetchedInfo =
			lastPrefetched > 0
				? ` last ran ${Math.round((currentTime - lastPrefetched) / 1000)}s ago`
				: "";
		logForDebugging(
			`Starting background startup prefetches${lastPrefetchedInfo}`,
		);

		checkQuotaStatus().catch((error) => onQuotaError(error));
		void fetchBootstrapData();
		void prefetchPassesEligibility();
		if (!fastModeKillSwitchEnabled) {
			void prefetchFastModeStatus();
		} else {
			resolveFastModeStatusFromCache();
		}
		if (bgRefreshThrottleMs > 0) {
			saveStartupPrefetchedAt(currentTime);
		}
	} else {
		logForDebugging(
			`Skipping startup prefetches, last ran ${Math.round((currentTime - lastPrefetched) / 1000)}s ago`,
		);
		resolveFastModeStatusFromCache();
	}

	if (!isNonInteractiveSession) {
		void refreshExampleCommands();
	}
}
