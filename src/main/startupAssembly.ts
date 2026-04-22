export type SetupTrigger = "init" | "maintenance" | null;

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
