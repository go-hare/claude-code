import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  resetSettingsCache,
  setSessionSettingsCache,
} from "src/utils/settings/settingsCache.js";

type EffortModule = typeof import("src/utils/effort.js");

let isEffortLevel: EffortModule["isEffortLevel"];
let parseEffortValue: EffortModule["parseEffortValue"];
let isValidNumericEffort: EffortModule["isValidNumericEffort"];
let convertEffortValueToLevel: EffortModule["convertEffortValueToLevel"];
let getEffortLevelDescription: EffortModule["getEffortLevelDescription"];
let getEffortSuffix: EffortModule["getEffortSuffix"];
let resolveAppliedEffort: EffortModule["resolveAppliedEffort"];
let resolvePickerEffortPersistence: EffortModule["resolvePickerEffortPersistence"];
let shouldShowEffortUI: EffortModule["shouldShowEffortUI"];
let toPersistableEffort: EffortModule["toPersistableEffort"];
let EFFORT_LEVELS: EffortModule["EFFORT_LEVELS"];
let modelSupportsXhighEffort: EffortModule["modelSupportsXhighEffort"];

beforeAll(async () => {
  ({
    isEffortLevel,
    parseEffortValue,
    isValidNumericEffort,
    convertEffortValueToLevel,
    getEffortLevelDescription,
    getEffortSuffix,
    resolveAppliedEffort,
    resolvePickerEffortPersistence,
    shouldShowEffortUI,
    toPersistableEffort,
    EFFORT_LEVELS,
    modelSupportsXhighEffort,
  } = await import("src/utils/effort.js"));
});

beforeEach(() => {
  resetSettingsCache();
  setSessionSettingsCache({ settings: {}, errors: [] });
});

afterEach(() => {
  resetSettingsCache();
});

// ─── EFFORT_LEVELS constant ────────────────────────────────────────────

describe("EFFORT_LEVELS", () => {
  test("contains the canonical levels", () => {
    expect(EFFORT_LEVELS).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });
});

// ─── isEffortLevel ─────────────────────────────────────────────────────

describe("isEffortLevel", () => {
  test("returns true for 'low'", () => {
    expect(isEffortLevel("low")).toBe(true);
  });

  test("returns true for 'medium'", () => {
    expect(isEffortLevel("medium")).toBe(true);
  });

  test("returns true for 'high'", () => {
    expect(isEffortLevel("high")).toBe(true);
  });

  test("returns true for 'max'", () => {
    expect(isEffortLevel("max")).toBe(true);
  });

  test("returns true for 'xhigh'", () => {
    expect(isEffortLevel("xhigh")).toBe(true);
  });

  test("returns false for 'invalid'", () => {
    expect(isEffortLevel("invalid")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isEffortLevel("")).toBe(false);
  });
});

// ─── parseEffortValue ──────────────────────────────────────────────────

describe("parseEffortValue", () => {
  test("returns undefined for undefined", () => {
    expect(parseEffortValue(undefined)).toBeUndefined();
  });

  test("returns undefined for null", () => {
    expect(parseEffortValue(null)).toBeUndefined();
  });

  test("returns undefined for empty string", () => {
    expect(parseEffortValue("")).toBeUndefined();
  });

  test("returns number for integer input", () => {
    expect(parseEffortValue(42)).toBe(42);
  });

  test("returns string for valid effort level string", () => {
    expect(parseEffortValue("low")).toBe("low");
    expect(parseEffortValue("medium")).toBe("medium");
    expect(parseEffortValue("high")).toBe("high");
    expect(parseEffortValue("max")).toBe("max");
    expect(parseEffortValue("xhigh")).toBe("xhigh");
  });

  test("parses numeric string to number", () => {
    expect(parseEffortValue("42")).toBe(42);
  });

  test("returns undefined for invalid string", () => {
    expect(parseEffortValue("invalid")).toBeUndefined();
  });

  test("non-integer number falls through to string parsing (parseInt truncates)", () => {
    // 3.14 fails isValidNumericEffort, then String(3.14) -> "3.14" -> parseInt = 3
    expect(parseEffortValue(3.14)).toBe(3);
  });

  test("handles case-insensitive effort level strings", () => {
    expect(parseEffortValue("LOW")).toBe("low");
    expect(parseEffortValue("HIGH")).toBe("high");
  });
});

// ─── isValidNumericEffort ──────────────────────────────────────────────

describe("isValidNumericEffort", () => {
  test("returns true for integer", () => {
    expect(isValidNumericEffort(50)).toBe(true);
  });

  test("returns true for zero", () => {
    expect(isValidNumericEffort(0)).toBe(true);
  });

  test("returns true for negative integer", () => {
    expect(isValidNumericEffort(-1)).toBe(true);
  });

  test("returns false for float", () => {
    expect(isValidNumericEffort(3.14)).toBe(false);
  });

  test("returns false for NaN", () => {
    expect(isValidNumericEffort(NaN)).toBe(false);
  });

  test("returns false for Infinity", () => {
    expect(isValidNumericEffort(Infinity)).toBe(false);
  });
});

// ─── convertEffortValueToLevel ─────────────────────────────────────────

describe("convertEffortValueToLevel", () => {
  test("returns valid effort level string as-is", () => {
    expect(convertEffortValueToLevel("low")).toBe("low");
    expect(convertEffortValueToLevel("medium")).toBe("medium");
    expect(convertEffortValueToLevel("high")).toBe("high");
    expect(convertEffortValueToLevel("max")).toBe("max");
    expect(convertEffortValueToLevel("xhigh")).toBe("xhigh");
  });

  test("returns 'high' for unknown string", () => {
    expect(convertEffortValueToLevel("unknown" as any)).toBe("high");
  });

  test("non-ant numeric value returns 'high'", () => {
    const saved = process.env.USER_TYPE;
    delete process.env.USER_TYPE;

    expect(convertEffortValueToLevel(50)).toBe("high");
    expect(convertEffortValueToLevel(100)).toBe("high");

    process.env.USER_TYPE = saved;
  });

  describe("ant numeric mapping", () => {
    let savedUserType: string | undefined;

    beforeEach(() => {
      savedUserType = process.env.USER_TYPE;
      process.env.USER_TYPE = "ant";
    });

    afterEach(() => {
      if (savedUserType === undefined) {
        delete process.env.USER_TYPE;
      } else {
        process.env.USER_TYPE = savedUserType;
      }
    });

    test("value <= 50 maps to 'low'", () => {
      expect(convertEffortValueToLevel(50)).toBe("low");
      expect(convertEffortValueToLevel(0)).toBe("low");
      expect(convertEffortValueToLevel(-10)).toBe("low");
    });

    test("value 51-85 maps to 'medium'", () => {
      expect(convertEffortValueToLevel(51)).toBe("medium");
      expect(convertEffortValueToLevel(85)).toBe("medium");
    });

    test("value 86-100 maps to 'high'", () => {
      expect(convertEffortValueToLevel(86)).toBe("high");
      expect(convertEffortValueToLevel(100)).toBe("high");
    });

    test("value > 100 maps to 'max'", () => {
      expect(convertEffortValueToLevel(101)).toBe("max");
      expect(convertEffortValueToLevel(200)).toBe("max");
    });
  });
});

// ─── getEffortLevelDescription ─────────────────────────────────────────

describe("getEffortLevelDescription", () => {
  test("returns description for 'low'", () => {
    const desc = getEffortLevelDescription("low");
    expect(desc).toContain("Quick");
  });

  test("returns description for 'medium'", () => {
    const desc = getEffortLevelDescription("medium");
    expect(desc).toContain("Balanced");
  });

  test("returns description for 'high'", () => {
    const desc = getEffortLevelDescription("high");
    expect(desc).toContain("Comprehensive");
  });

  test("returns description for 'max'", () => {
    const desc = getEffortLevelDescription("max");
    expect(desc).toContain("Maximum");
  });

  test("returns description for 'xhigh'", () => {
    const desc = getEffortLevelDescription("xhigh");
    expect(desc).toContain("Opus 4.7");
  });
});

// ─── persistence and applied effort ────────────────────────────────────

describe("toPersistableEffort", () => {
  test("persists xhigh", () => {
    expect(toPersistableEffort("xhigh")).toBe("xhigh");
  });
});

describe("modelSupportsXhighEffort", () => {
  test("supports Opus 4.7", () => {
    expect(modelSupportsXhighEffort("claude-opus-4-7")).toBe(true);
  });

  test("does not support pre-Opus-4.7 public models", () => {
    expect(modelSupportsXhighEffort("claude-opus-4-6")).toBe(false);
    expect(modelSupportsXhighEffort("claude-sonnet-4-6")).toBe(false);
  });
});

describe("resolveAppliedEffort", () => {
  const saved = {
    CLAUDE_CODE_EFFORT_LEVEL: process.env.CLAUDE_CODE_EFFORT_LEVEL,
    CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
    OPENAI_DEFAULT_OPUS_MODEL: process.env.OPENAI_DEFAULT_OPUS_MODEL,
    OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES:
      process.env.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES,
  };

  afterEach(() => {
    if (saved.CLAUDE_CODE_EFFORT_LEVEL === undefined) {
      delete process.env.CLAUDE_CODE_EFFORT_LEVEL;
    } else {
      process.env.CLAUDE_CODE_EFFORT_LEVEL = saved.CLAUDE_CODE_EFFORT_LEVEL;
    }
    if (saved.CLAUDE_CODE_USE_OPENAI === undefined) {
      delete process.env.CLAUDE_CODE_USE_OPENAI;
    } else {
      process.env.CLAUDE_CODE_USE_OPENAI = saved.CLAUDE_CODE_USE_OPENAI;
    }
    if (saved.OPENAI_DEFAULT_OPUS_MODEL === undefined) {
      delete process.env.OPENAI_DEFAULT_OPUS_MODEL;
    } else {
      process.env.OPENAI_DEFAULT_OPUS_MODEL = saved.OPENAI_DEFAULT_OPUS_MODEL;
    }
    if (
      saved.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES === undefined
    ) {
      delete process.env.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES;
    } else {
      process.env.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES =
        saved.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES;
    }
  });

  test("downgrades xhigh for OpenAI provider without explicit capability override", () => {
    process.env.CLAUDE_CODE_USE_OPENAI = "1";
    expect(resolveAppliedEffort("gpt-5", "xhigh")).toBe("high");
  });

  test("preserves xhigh for OpenAI provider with explicit capability override", () => {
    process.env.CLAUDE_CODE_USE_OPENAI = "1";
    process.env.OPENAI_DEFAULT_OPUS_MODEL = "gpt-5";
    process.env.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES =
      "effort,xhigh_effort";

    expect(resolveAppliedEffort("gpt-5", "xhigh")).toBe("xhigh");
  });

  test("preserves xhigh for Opus 4.7 outside OpenAI provider", () => {
    delete process.env.CLAUDE_CODE_USE_OPENAI;
    expect(resolveAppliedEffort("claude-opus-4-7", "xhigh")).toBe("xhigh");
  });

  test("downgrades xhigh outside OpenAI provider", () => {
    delete process.env.CLAUDE_CODE_USE_OPENAI;
    expect(resolveAppliedEffort("claude-sonnet-4-6", "xhigh")).toBe("high");
  });
});

describe("shouldShowEffortUI", () => {
  const saved = {
    CLAUDE_CODE_EFFORT_LEVEL: process.env.CLAUDE_CODE_EFFORT_LEVEL,
    CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
    OPENAI_DEFAULT_OPUS_MODEL: process.env.OPENAI_DEFAULT_OPUS_MODEL,
    OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES:
      process.env.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES,
  };

  afterEach(() => {
    if (saved.CLAUDE_CODE_EFFORT_LEVEL === undefined) {
      delete process.env.CLAUDE_CODE_EFFORT_LEVEL;
    } else {
      process.env.CLAUDE_CODE_EFFORT_LEVEL = saved.CLAUDE_CODE_EFFORT_LEVEL;
    }
    if (saved.CLAUDE_CODE_USE_OPENAI === undefined) {
      delete process.env.CLAUDE_CODE_USE_OPENAI;
    } else {
      process.env.CLAUDE_CODE_USE_OPENAI = saved.CLAUDE_CODE_USE_OPENAI;
    }
  });

  test("shows effort UI for explicit OpenAI env override on custom model", () => {
    process.env.CLAUDE_CODE_USE_OPENAI = "1";
    process.env.CLAUDE_CODE_EFFORT_LEVEL = "xhigh";
    expect(shouldShowEffortUI("gpt-5.5", undefined)).toBe(true);
  });

  test("hides effort UI for unsupported 3P custom model without explicit override", () => {
    process.env.CLAUDE_CODE_USE_OPENAI = "1";
    delete process.env.CLAUDE_CODE_EFFORT_LEVEL;
    expect(shouldShowEffortUI("gpt-5.5", undefined)).toBe(false);
  });
});

describe("getEffortSuffix", () => {
  const saved = {
    CLAUDE_CODE_EFFORT_LEVEL: process.env.CLAUDE_CODE_EFFORT_LEVEL,
    CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
    OPENAI_DEFAULT_OPUS_MODEL: process.env.OPENAI_DEFAULT_OPUS_MODEL,
    OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES:
      process.env.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES,
  };

  afterEach(() => {
    if (saved.CLAUDE_CODE_EFFORT_LEVEL === undefined) {
      delete process.env.CLAUDE_CODE_EFFORT_LEVEL;
    } else {
      process.env.CLAUDE_CODE_EFFORT_LEVEL = saved.CLAUDE_CODE_EFFORT_LEVEL;
    }
    if (saved.CLAUDE_CODE_USE_OPENAI === undefined) {
      delete process.env.CLAUDE_CODE_USE_OPENAI;
    } else {
      process.env.CLAUDE_CODE_USE_OPENAI = saved.CLAUDE_CODE_USE_OPENAI;
    }
    if (saved.OPENAI_DEFAULT_OPUS_MODEL === undefined) {
      delete process.env.OPENAI_DEFAULT_OPUS_MODEL;
    } else {
      process.env.OPENAI_DEFAULT_OPUS_MODEL = saved.OPENAI_DEFAULT_OPUS_MODEL;
    }
    if (
      saved.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES === undefined
    ) {
      delete process.env.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES;
    } else {
      process.env.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES =
        saved.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES;
    }
  });

  test("shows clamped env-driven suffix for OpenAI custom model", () => {
    process.env.CLAUDE_CODE_USE_OPENAI = "1";
    process.env.CLAUDE_CODE_EFFORT_LEVEL = "xhigh";
    expect(getEffortSuffix("gpt-5.5", undefined)).toBe(" with high effort");
  });

  test("shows xhigh suffix for OpenAI custom model with capability override", () => {
    process.env.CLAUDE_CODE_USE_OPENAI = "1";
    process.env.CLAUDE_CODE_EFFORT_LEVEL = "xhigh";
    process.env.OPENAI_DEFAULT_OPUS_MODEL = "gpt-5.5";
    process.env.OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES =
      "effort,xhigh_effort";

    expect(getEffortSuffix("gpt-5.5", undefined)).toBe(" with xhigh effort");
  });
});

// ─── resolvePickerEffortPersistence ────────────────────────────────────

describe("resolvePickerEffortPersistence", () => {
  test("returns undefined when picked matches model default and no prior persistence", () => {
    const result = resolvePickerEffortPersistence("high", "high", undefined, false);
    expect(result).toBeUndefined();
  });

  test("returns picked when it differs from model default", () => {
    const result = resolvePickerEffortPersistence("low", "high", undefined, false);
    expect(result).toBe("low");
  });

  test("returns picked when priorPersisted is set (even if same as default)", () => {
    const result = resolvePickerEffortPersistence("high", "high", "high", false);
    expect(result).toBe("high");
  });

  test("returns picked when toggledInPicker is true (even if same as default)", () => {
    const result = resolvePickerEffortPersistence("high", "high", undefined, true);
    expect(result).toBe("high");
  });

  test("returns undefined picked value when no explicit and matches default", () => {
    const result = resolvePickerEffortPersistence(undefined, "high" as any, undefined, false);
    expect(result).toBeUndefined();
  });
});
