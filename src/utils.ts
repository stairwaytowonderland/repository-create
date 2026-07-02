/**
 * Sanitizes a repository name to match GitHub's normalization:
 * Only [A-Za-z0-9_.-] are allowed, everything else becomes '-'.
 */
export function sanitizeRepoName(name: string): string {
	return name.replace(/[^\w.\-]/g, '-')
}

/**
 * Base64 encodes a string (e.g. for GitHub API content encoding).
 */
export function base64Encode(content: string): string {
	return Buffer.from(content).toString('base64')
}

/**
 * Base64 decodes a string (e.g. for GitHub API content decoding).
 */
export function base64Decode(encoded: string): string {
	return Buffer.from(encoded, 'base64').toString('utf8')
}
