import type { Octokit } from 'octokit';
import type { RulesetConfig } from './types.js';

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
		console.log(`  Creating ruleset "${ruleset.name}"...`);

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

		console.log(`  ✓ Ruleset "${ruleset.name}" created (id: ${data.id}).`);
		results.push(data);
	}

	return results;
}
