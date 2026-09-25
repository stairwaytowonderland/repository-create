import type { Octokit } from 'octokit'
import type { ActionPolicy } from './types.js'
import * as core from '@actions/core'

/**
 * Creates repo action policies on a repository via POST /repos/{owner}/{repo}/action/policies.
 *
 * GitHub documentation:
 * https://docs.github.com/en/rest/actions/policies?apiVersion=2026-03-10#create-a-repository-actions-policy
 */
export async function createActionPolicies(
	octokit: Octokit,
	{ owner, repo, actionPolicies }: { owner: string; repo: string; actionPolicies: ActionPolicy[] }
): Promise<object[]> {
	const results = []

	for (const actionPolicy of actionPolicies) {
		core.info(`  Creating action policy "${actionPolicy.name}"...`)
		try {
			const { data } = await octokit.request('POST /repos/{owner}/{repo}/actions/policies', {
				owner,
				repo,
				name: actionPolicy.name,
				description: actionPolicy.description,
				enforcement: actionPolicy.enforcement,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				rules: actionPolicy.rules as any,
			})

			core.info(`  ✓ Action policy "${actionPolicy.name}" created (id: ${data.id}).`)
			results.push(data)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (err: any) {
			// Detect plan limitation error for private repos (403 or 422 with specific message)
			const msg = err?.message || ''
			if (
				(err.status === 403 || err.status === 422) &&
				/upgrade to GitHub Pro|make this repository public/i.test(msg)
			) {
				core.warning(`  ⚠️  Could not create action policy "${actionPolicy.name}" for private repo: ${msg}`)
				continue
			} else if (err.status === 403 || err.status === 422) {
				core.warning(`  ⚠️  Could not create action policy "${actionPolicy.name}": ${msg}`)
				continue
			}
			throw err
		}
	}

	return results
}
