import type { Octokit } from 'octokit';
import type { RulesetConfig } from './types.js';
import * as core from '@actions/core';

/**
 * Creates branch rulesets on a repository via POST /repos/{owner}/{repo}/rulesets.
 *
 * GitHub documentation:
 * https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset
 */
export async function createRulesets(
	octokit: Octokit,
	{ owner, repo, rulesets }: { owner: string; repo: string; rulesets: RulesetConfig[] }
): Promise<object[]> {
	const results = [];

	for (const ruleset of rulesets) {
		core.info(`  Creating ruleset "${ruleset.name}"...`);
		try {
			const { data } = await octokit.request('POST /repos/{owner}/{repo}/rulesets', {
				owner,
				repo,
				name: ruleset.name,
				target: ruleset.target,
				enforcement: ruleset.enforcement,
				conditions: {
					ref_name: {
						include: ruleset.conditions.ref_name.include,
						exclude: ruleset.conditions.ref_name.exclude,
					},
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				rules: ruleset.rules as any,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				bypass_actors: ruleset.bypass_actors as any,
			});

			core.info(`  ✓ Ruleset "${ruleset.name}" created (id: ${data.id}).`);
			results.push(data);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (err: any) {
			// Detect plan limitation error for private repos (403 or 422 with specific message)
			const msg = err?.message || '';
			if (
				(err.status === 403 || err.status === 422) &&
				/upgrade to GitHub Pro|make this repository public/i.test(msg)
			) {
				core.warning(`  ⚠️  Could not create ruleset "${ruleset.name}" for private repo: ${msg}`);
				continue;
			} else if (err.status === 403 || err.status === 422) {
				core.warning(`  ⚠️  Could not create ruleset "${ruleset.name}": ${msg}`);
				continue;
			}
			throw err;
		}
	}

	return results;
}
