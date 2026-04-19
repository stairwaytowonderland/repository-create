import { Octokit } from 'octokit';

/**
 * Returns an authenticated Octokit instance.
 *
 * Current auth: Personal Access Token (PAT) supplied via GITHUB_TOKEN.
 * Required PAT scopes: repo, admin:org (for creating org repos and rulesets).
 *
 * ─── Future state: GitHub App authentication ────────────────────────────────
 * Replace the body of this function with:
 *
 *   import { createAppAuth } from '@octokit/auth-app';
 *
 *   return new Octokit({
 *     authStrategy: createAppAuth,
 *     auth: {
 *       appId:          process.env.GITHUB_APP_ID,
 *       privateKey:     process.env.GITHUB_APP_PRIVATE_KEY,
 *       installationId: process.env.GITHUB_APP_INSTALLATION_ID,
 *     },
 *   });
 *
 * Add @octokit/auth-app to dependencies when making this change.
 * ────────────────────────────────────────────────────────────────────────────
 */
export function createGitHubClient(token: string): Octokit {
	if (!token) {
		throw new Error('GitHub token is required. Set the GITHUB_TOKEN environment variable.');
	}

	return new Octokit({
		auth: token,
		headers: {
			'X-GitHub-Api-Version': '2026-03-10',
		},
	});
}
