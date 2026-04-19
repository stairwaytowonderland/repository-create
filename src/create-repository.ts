import type { Octokit } from 'octokit';
import type { RepoSettings, RulesetConfig, TemplateConfig } from './types.js';
import { applySettings } from './apply-settings.js';
import { createRulesets } from './create-rulesets.js';
import { updateReadmeHeading } from './update-readme.js';

/**
 * Orchestrates repository creation:
 *   1. Create the repository in the org (blank or from a template)
 *   2. Apply general settings (second-pass PATCH for settings unavailable at creation)
 *   3. Create branch rulesets
 */
export async function createRepository(
	octokit: Octokit,
	{ org, name, settings, rulesets }: { org: string; name: string; settings: RepoSettings; rulesets: RulesetConfig[] }
): Promise<object> {
	console.log(`\nCreating repository "${org}/${name}"...`);

	let repo: { html_url: string; full_name: string; id: number };

	if (settings.template) {
		({ data: repo } = await createFromTemplate(octokit, { org, name, settings }));
		if (settings.template.updateReadmeHeading !== false) {
			await updateReadmeHeading(octokit, { owner: org, repo: name });
		}
	} else {
		({ data: repo } = await createBlank(octokit, { org, name, settings }));
	}

	console.log(`\n✓ Repository "${org}/${name}" created: (id: ${repo.id})`);

	// Second-pass settings update (covers fields not available at creation time)
	await applySettings(octokit, { owner: org, repo: name, settings });

	// Branch rulesets
	if (rulesets && rulesets.length > 0) {
		console.log(`\nCreating branch rulesets...`);
		await createRulesets(octokit, { owner: org, repo: name, rulesets });
	}

	console.log(`\n✓ Repository "${repo.full_name}" setup complete.`);
	console.log(`\n🌐 Repository available at: ${repo.html_url}`);
	return repo;
}

/**
 * Creates a blank repository in the org.
 */
function createBlank(octokit: Octokit, { org, name, settings }: { org: string; name: string; settings: RepoSettings }) {
	return octokit.rest.repos.createInOrg({
		org,
		name,
		description: settings.description,
		/**
		 * 'private' is the legacy boolean parameter; 'visibility' is preferred for
		 * orgs that use 'internal' (GHEC). Both are sent so older API versions
		 * continue to work.
		 */
		private: settings.visibility !== 'public',
		visibility: settings.visibility as 'private' | 'public' | undefined,
		has_issues: settings.hasIssues,
		has_projects: settings.hasProjects,
		has_wiki: settings.hasWiki,
		/**
		 * auto_init creates an initial commit on the default branch so that
		 * branch rulesets can be applied immediately after creation.
		 * When using a template, the template provides the initial content, so
		 * auto_init is not needed and is ignored if set.
		 */
		auto_init: settings.template ? undefined : settings.auto_init,
	});
}

/**
 * Creates a repository from a template using
 * POST /repos/{template_owner}/{template_repo}/generate.
 *
 * Note: visibility, has_issues, has_projects, and has_wiki cannot be set at
 * generation time — they are applied by the subsequent applySettings call.
 */
function createFromTemplate(
	octokit: Octokit,
	{ org, name, settings }: { org: string; name: string; settings: RepoSettings }
) {
	const { owner: templateOwner, repo: templateRepo, includeAllBranches = false } = settings.template as TemplateConfig;

	console.log(`  Using template: ${templateOwner}/${templateRepo}`);
	console.log(`  Destination:    ${org}/${name} (visibility: ${settings.visibility})`);

	return octokit.rest.repos
		.createUsingTemplate({
			template_owner: templateOwner,
			template_repo: templateRepo,
			owner: org,
			name,
			description: settings.description,
			private: settings.visibility !== 'public',
			include_all_branches: includeAllBranches,
		})
		.catch((err: { status?: number }) => {
			if (err.status === 404) {
				throw new Error(
					`Template repository "${templateOwner}/${templateRepo}" not found (HTTP 404).\n` +
						`  Possible causes:\n` +
						`    1. The repository name or owner is incorrect.\n` +
						`    2. The repository has not been marked as a template\n` +
						`       (Settings → General → "Template repository" checkbox).\n` +
						`    3. The token does not have read access to "${templateOwner}/${templateRepo}".`
				);
			}
			throw err;
		});
}
