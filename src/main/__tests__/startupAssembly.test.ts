import { describe, expect, mock, test } from "bun:test";

import {
	determineSetupTrigger,
	runSessionStartupSideEffects,
	runVersionedPluginStartup,
} from "../startupAssembly.js";

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
