import {
  runKernelHeadlessLaunch,
  type KernelHeadlessLaunchOptions,
} from './headlessKernelDeps.js'

export type HeadlessLaunchOptions = KernelHeadlessLaunchOptions

export type HeadlessLaunchDeps = {
  runKernelHeadlessLaunch: typeof runKernelHeadlessLaunch
}

const defaultDeps: HeadlessLaunchDeps = {
  runKernelHeadlessLaunch,
}

export async function runHeadlessLaunch(
  options: HeadlessLaunchOptions,
  deps: HeadlessLaunchDeps = defaultDeps,
): Promise<void> {
  return deps.runKernelHeadlessLaunch(options)
}
