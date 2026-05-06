/**
 * SDK Control Types — inferred from Zod schemas in controlSchemas.ts / coreSchemas.ts.
 *
 * These types define the control protocol between the CLI bridge and the server.
 * Used by bridge/transport layer, remote session manager, and CLI print/IO paths.
 */
import type { z } from 'zod'
import type {
  ProtocolControlRequestSchema,
  ProtocolControlResponseSchema,
  ProtocolControlInitializeRequestSchema,
  ProtocolControlInitializeResponseSchema,
  ProtocolControlMcpSetServersResponseSchema,
  ProtocolControlReloadPluginsResponseSchema,
  ProtocolControlPermissionRequestSchema,
  ProtocolControlCancelRequestSchema,
  ProtocolControlRequestInnerSchema,
  ProtocolStdoutMessageSchema,
  ProtocolStdinMessageSchema,
} from './controlSchemas.js'
import type { ProtocolPartialAssistantMessageSchema } from './coreSchemas.js'

export type ProtocolControlRequest = z.infer<ReturnType<typeof ProtocolControlRequestSchema>>
export type ProtocolControlResponse = z.infer<ReturnType<typeof ProtocolControlResponseSchema>>
export type ProtocolStdoutMessage = z.infer<ReturnType<typeof ProtocolStdoutMessageSchema>>
export type ProtocolControlInitializeRequest = z.infer<ReturnType<typeof ProtocolControlInitializeRequestSchema>>
export type ProtocolControlInitializeResponse = z.infer<ReturnType<typeof ProtocolControlInitializeResponseSchema>>
export type ProtocolControlMcpSetServersResponse = z.infer<ReturnType<typeof ProtocolControlMcpSetServersResponseSchema>>
export type ProtocolControlReloadPluginsResponse = z.infer<ReturnType<typeof ProtocolControlReloadPluginsResponseSchema>>
export type ProtocolStdinMessage = z.infer<ReturnType<typeof ProtocolStdinMessageSchema>>
export type ProtocolPartialAssistantMessage = z.infer<ReturnType<typeof ProtocolPartialAssistantMessageSchema>>
export type ProtocolControlPermissionRequest = z.infer<ReturnType<typeof ProtocolControlPermissionRequestSchema>>
export type ProtocolControlCancelRequest = z.infer<ReturnType<typeof ProtocolControlCancelRequestSchema>>
export type ProtocolControlRequestInner = z.infer<ReturnType<typeof ProtocolControlRequestInnerSchema>>
