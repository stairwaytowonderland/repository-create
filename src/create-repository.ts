import { inspect } from 'node:util'
import * as core from '@actions/core'
import type { CreateOptions, RepoSettings, RulesetConfig, TemplateConfig, ActionPolicy } from './types.js'
import type { Octokit } from './github-client.js'
import { applySettings } from './apply-settings.js'
import { createRulesets } from './create-rulesets.js'
import { createActionPolicies } from './create-action-policies.js'
import { updateReadme } from './update-readme.js'
import { updateTypedocConfig } from './update-typedoc.js'
import { sanitizeRepoName, sleep } from './utils.js'

type TemplateRepo = Awaited<ReturnType<Octokit['rest']['repos']['createUsingTemplate']>>['data']
type OrgRepo = Awaited<ReturnType<Octokit['rest']['repos']['createInOrg']>>['data']

/**
 * Orchestrates repository creation:
 *   1. Create the repository in the org (blank or from a template)
 *   1a. Configure GitHub Pages (if applicable)
 *   1b. Update README (if applicable)
 *   2. Apply general settings (second-pass PATCH for settings unavailable at creation)
 *   3. Create branch rulesets
 *   4. Create action policies
 */
export async function createRepository(
	octokit: Octokit,
	{
		org,
		name,
		settings,
		rulesets,
		actionPolicies,
		createOptions,
	}: {
		org: string
		name: string
		settings: RepoSettings
		rulesets: RulesetConfig[]
		actionPolicies?: ActionPolicy[]
		createOptions: CreateOptions
	}
): Promise<object> {
	// Sanitize repository name for API calls: only [\w.-], others to '-'
	const nameSanitized: string = sanitizeRepoName(name)
	core.info(`\nCreating repository "${org}/${name}"...`)

	core.info(`Create options:\n${inspect(createOptions, { depth: null, colors: true, compact: false })}`)

	const maxRetries = settings.template?.createFromTemplateMaxRetries ?? 5
	const retryDelayMs = settings.template?.createFromTemplateRetryDelay ?? 3000

	// let repo: { html_url: string; full_name: string; name: string; owner: { login: string }; id: number }
	let repo: TemplateRepo | OrgRepo | undefined

	if (settings.template) {
		// ;({ data: repo } = await createFromTemplate(octokit, { org, name: nameSanitized, settings }))
		repo = (await createFromTemplate(octokit, { org, name: nameSanitized, settings })).data

		if (createOptions.updateReadme) {
			// Use unsanitized name for README heading
			await updateReadme(
				octokit,
				{ owner: org, repo: name, template: { repo: settings.template?.repo, owner: settings.template?.owner } },
				{
					retryDelayMs,
					maxRetries,
					replaceGitProtocolLinks: createOptions.replaceGitProtocolLinks,
					createLabels: createOptions.createLabels,
					createIssues: createOptions.createIssues,
				}
			)
		}
	} else {
		// ;({ data: repo } = await createBlank(octokit, { org, name: nameSanitized, settings }))
		repo = (await createBlank(octokit, { org, name: nameSanitized, settings })).data
	}

	core.info(`\n✓ Repository "${org}/${name}" created: (id: ${repo.id})`)

	// Second-pass settings update (covers fields not available at creation time)
	await applySettings(octokit, { owner: org, repo: nameSanitized, settings })

	await handlePages(
		octokit,
		{ org, name: nameSanitized, pagesWorkflow: createOptions.pagesWorkflow },
		{
			retryDelayMs,
			maxRetries,
		}
	)

	// Branch rulesets
	if (rulesets && rulesets.length > 0) {
		core.info(`\nCreating branch rulesets...`)
		await createRulesets(octokit, { owner: org, repo: nameSanitized, rulesets })
	}

	// Action policies
	if (actionPolicies && actionPolicies.length > 0) {
		core.info(`\nCreating action policies...`)
		await createActionPolicies(octokit, { owner: org, repo: nameSanitized, actionPolicies })
	}

	if (createOptions.pagesWorkflow) {
		core.info(`\nChecking if workflow "${createOptions.pagesWorkflow}" is active...`)
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const { data: workflow } = await octokit.rest.actions.getWorkflow({
					owner: org,
					repo: nameSanitized,
					workflow_id: createOptions.pagesWorkflow,
				})
				if (workflow.state === 'active') {
					break
				}
			} catch (err: unknown) {
				const status = (err as { status?: number }).status
				if (status !== 404 || attempt === maxRetries) {
					throw err
				}
			}

			if (attempt < maxRetries) {
				core.info(
					`  Waiting for workflow "${createOptions.pagesWorkflow}" to become active (attempt ${attempt}/${maxRetries})...`
				)
				await sleep(retryDelayMs)
			}
		}
		core.info(`  ✓ Workflow "${createOptions.pagesWorkflow}" is active.`)

		await octokit.rest.actions.createWorkflowDispatch({
			owner: org,
			repo: nameSanitized,
			workflow_id: createOptions.pagesWorkflow,
			ref: repo.default_branch,
		})
	}

	core.info(`\n✓ Repository "${repo.full_name}" setup complete.`)
	core.info(`\n🌐 Repository available at: ${repo.html_url}`)
	return repo
}

async function handlePages(
	octokit: Octokit,
	{ org, name, pagesWorkflow }: { org: string; name: string; pagesWorkflow?: string },
	options: { retryDelayMs: number; maxRetries: number }
): Promise<void> {
	if (!pagesWorkflow) {
		core.info(`\nNo GitHub Pages workflow specified for "${org}/${name}". Skipping Pages setup.`)
		return
	}

	core.info(`\nEnabling GitHub Pages for "${org}/${name}"...`)

	// https://docs.github.com/en/rest/pages/pages?apiVersion=2026-03-10#create-a-github-pages-site
	const { data: pages } = await octokit.rest.repos.createPagesSite({
		owner: org,
		repo: name,
		build_type: 'workflow', // Use 'legacy' if deploying from a branch
		// If using 'legacy', include source:
		// source: { branch: 'main', path: '/' },
	})

	core.info(`  ✓ GitHub Pages enabled at: ${pages.html_url}`)

	await updateTypedocConfig(
		octokit,
		{ owner: org, repo: name },
		{
			retryDelayMs: options.retryDelayMs,
			maxRetries: options.maxRetries,
		}
	)
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
		// private: settings.visibility !== 'public',
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
	})
}

/**
 * Creates a repository from a template using
 * POST /repos/{template_owner}/{template_repo}/generate.
 *
 * Note: visibility, has_issues, has_projects, and has_wiki cannot be set at
 * generation time — they are applied by the subsequent applySettings call.
 */
async function createFromTemplate(
	octokit: Octokit,
	{ org, name, settings }: { org: string; name: string; settings: RepoSettings }
) {
	const { owner: templateOwner, repo: templateRepo, includeAllBranches = false } = settings.template as TemplateConfig

	core.info(`  Using template: ${templateOwner}/${templateRepo}`)
	core.info(`  Destination:    ${org}/${name} (visibility: ${settings.visibility})`)

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
				)
			}
			throw err
		})
}
