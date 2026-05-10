/**
 * Default mapping from Anthropic model names to OpenAI model names.
 * Used only when ANTHROPIC_DEFAULT_*_MODEL env vars are not set.
 */
const DEFAULT_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-20250514': 'gpt-4o',
  'claude-sonnet-4-5-20250929': 'gpt-4o',
  'claude-sonnet-4-6': 'gpt-4o',
  'claude-opus-4-20250514': 'o3',
  'claude-opus-4-1-20250805': 'o3',
  'claude-opus-4-5-20251101': 'o3',
  'claude-opus-4-6': 'o3',
  'claude-opus-4-7': 'o3',
  'claude-haiku-4-5-20251001': 'gpt-4o-mini',
  'claude-3-5-haiku-20241022': 'gpt-4o-mini',
  'claude-3-7-sonnet-20250219': 'gpt-4o',
  'claude-3-5-sonnet-20241022': 'gpt-4o',
}

function getModelFamily(model: string): 'haiku' | 'sonnet' | 'opus' | null {
  if (/haiku/i.test(model)) return 'haiku'
  if (/opus/i.test(model)) return 'opus'
  if (/sonnet/i.test(model)) return 'sonnet'
  return null
}

function isAnthropicModelLike(model: string): boolean {
  return model.startsWith('claude-') || getModelFamily(model) !== null
}

/**
 * Resolve the OpenAI model name for a given Anthropic model.
 *
 * Priority:
 * 1. Direct OpenAI/custom model names pass through unchanged
 * 2. OPENAI_MODEL env var for Claude-family model names
 * 3. OPENAI_DEFAULT_{FAMILY}_MODEL env var (e.g. OPENAI_DEFAULT_SONNET_MODEL)
 * 4. ANTHROPIC_DEFAULT_{FAMILY}_MODEL env var (backward compatibility)
 * 5. DEFAULT_MODEL_MAP lookup
 * 6. Pass through original model name
 */
export function resolveOpenAIModel(anthropicModel: string): string {
  const cleanModel = anthropicModel.replace(/\[1m\]$/, '')

  // If the caller already selected an OpenAI/custom model (for example via
  // --model gpt-5.4), do not let OPENAI_MODEL from settings.env remap it.
  // OPENAI_MODEL is the default mapping for Claude-family model names.
  if (!DEFAULT_MODEL_MAP[cleanModel] && !isAnthropicModelLike(cleanModel)) {
    return cleanModel
  }

  if (process.env.OPENAI_MODEL) {
    return process.env.OPENAI_MODEL
  }

  const family = getModelFamily(cleanModel)
  if (family) {
    const openaiEnvVar = `OPENAI_DEFAULT_${family.toUpperCase()}_MODEL`
    const openaiOverride = process.env[openaiEnvVar]
    if (openaiOverride) return openaiOverride

    const anthropicEnvVar = `ANTHROPIC_DEFAULT_${family.toUpperCase()}_MODEL`
    const anthropicOverride = process.env[anthropicEnvVar]
    if (anthropicOverride) return anthropicOverride
  }

  return DEFAULT_MODEL_MAP[cleanModel] ?? cleanModel
}
