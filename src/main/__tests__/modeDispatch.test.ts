import { describe, expect, test } from "bun:test";

import { determineMainLaunchMode } from "../modeDispatch.js";

describe("determineMainLaunchMode", () => {
	test("headless takes precedence over interactive flows", () => {
		expect(
			determineMainLaunchMode({
				isNonInteractiveSession: true,
				continueRequested: true,
				hasPendingDirectConnect: true,
				hasPendingSsh: true,
				hasPendingAssistantChat: true,
				hasResumeLikeRequest: true,
			}),
		).toBe("headless");
	});

	test("continue takes precedence over other interactive branches", () => {
		expect(
			determineMainLaunchMode({
				isNonInteractiveSession: false,
				continueRequested: true,
				hasPendingDirectConnect: true,
				hasPendingSsh: true,
				hasPendingAssistantChat: true,
				hasResumeLikeRequest: true,
			}),
		).toBe("continue");
	});

	test("direct-connect wins when it is the highest-priority interactive branch", () => {
		expect(
			determineMainLaunchMode({
				isNonInteractiveSession: false,
				continueRequested: false,
				hasPendingDirectConnect: true,
				hasPendingSsh: true,
				hasPendingAssistantChat: true,
				hasResumeLikeRequest: true,
			}),
		).toBe("direct-connect");
	});

	test("falls back to interactive when no specialized mode matches", () => {
		expect(
			determineMainLaunchMode({
				isNonInteractiveSession: false,
				continueRequested: false,
				hasPendingDirectConnect: false,
				hasPendingSsh: false,
				hasPendingAssistantChat: false,
				hasResumeLikeRequest: false,
			}),
		).toBe("interactive");
	});
});
