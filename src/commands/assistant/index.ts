import type { Command } from '../../commands.js'
import { isAssistantCommandEnabled } from './gate.js'

const assistant = {
  type: 'local-jsx',
  name: 'assistant',
  description: 'Open the Kairos assistant panel',
  isEnabled: isAssistantCommandEnabled,
  get isHidden() {
    return !isAssistantCommandEnabled()
  },
  immediate: true,
  load: () => import('./assistant.js'),
} satisfies Command

export default assistant
