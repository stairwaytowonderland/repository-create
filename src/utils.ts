/**
 * Sanitizes a repository name to match GitHub's normalization:
 * Only [A-Za-z0-9_.-] are allowed, everything else becomes '-'.
 */
export function sanitizeRepoName(name: string): string {
	return name.replace(/[^\w.\-]/g, '-');
}
