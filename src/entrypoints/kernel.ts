/**
 * Package-level kernel entrypoint.
 *
 * Built to dist/kernel.js so external consumers can import
 * `claude-code/kernel` without depending on src paths.
 *
 * This is the only package-level kernel surface covered by the public semver
 * contract. Consumers should not import `src/kernel/*` leaf modules directly.
 */
export * from '../kernel/index.js'
