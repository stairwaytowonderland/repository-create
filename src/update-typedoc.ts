/**
 * Update the Typedoc configuration for the project.
 *
 * Replace all the links in the Typedoc configuration with the appropriate project-specific URLs.
 *
 * FIXME: docs still needs to be manually dispatched even after updating the Typedoc configuration.
 * The deploy itself works, but for some reason a "redeploy" is necessary for the pages site after initial repo creation.
 * SOLVED: The reason is because the default happens at initial commit, but the typedoc config is only updated after the initial commit, and does not trigger a redeploy automatically.
 */

// import { inspect } from 'node:util'
import * as core from '@actions/core'
import type { GitHubFileContent } from './types.js'
import type { Octokit } from './github-client.js'
import { base64Decode, base64Encode, sanitizeRepoName } from './utils.js'

type TypedocFileContent = GitHubFileContent & { type: 'file'; content: string }

export async function updateTypedocConfig(
	octokit: Octokit,
	repo: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number }
) {
	const file = await normalizeTargetFile(octokit, { owner: repo.owner, repo: repo.repo }, options)
	const config = JSON.parse(base64Decode(file.content))

	// Update the links in the configuration
	config.cleanJsdocTheme.siteUrl = `https://${repo.owner}.github.io/${repo.repo}`
	config.cleanJsdocTheme.basePath = `/${repo.repo}`
	config.cleanJsdocTheme.menu[1].link = `https://github.com/${repo.owner}/${repo.repo}`

	// core.info(`Updated Typedoc configuration:\n${inspect(config, { depth: null, colors: true })}`)

	await octokit.rest.repos.createOrUpdateFileContents({
		owner: repo.owner,
		repo: repo.repo,
		path: file.path,
		message: `docs: update Typedoc configuration to match ${repo.repo} [skip ci]`,
		content: base64Encode(`${JSON.stringify(config, null, '\t')}\n`),
		sha: file.sha,
	})

	core.info(`  ✓ Typedoc configuration updated for ${repo.owner}/${repo.repo}`)
}

async function fetchTypedocWithRetry(
	octokit: Octokit,
	{ owner, repo }: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number }
) {
	const candidates = ['typedoc.site.json', 'typedoc.json', 'typedoc.config.json']
	const maxRetries = options?.maxRetries ?? 10
	const retryDelayMs = options?.retryDelayMs ?? 3000

	// Always sanitize repo name for API calls
	const sanitizedRepo = sanitizeRepoName(repo)

	for (const path of candidates) {
		core.info(`\nUpdating ${path} ...`)
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const { data } = await octokit.rest.repos.getContent({ owner, repo: sanitizedRepo, path })
				return data as GitHubFileContent
			} catch (err) {
				const isNotReady =
					(err as { status?: number }).status === 409 ||
					((err as { status?: number; message?: string }).status === 404 &&
						(err as { status?: number; message?: string }).message?.includes('This repository is empty'))

				if (!isNotReady) throw err
				if ((err as { status?: number }).status !== 404) throw err
			}

			// if (attempt === maxRetries) throw new Error(`Failed to fetch Typedoc configuration from ${path}`)
			// await new Promise((resolve) => setTimeout(resolve, retryDelayMs))

			if (attempt < maxRetries) {
				core.info(`  Waiting for template contents to be ready (attempt ${attempt}/${maxRetries})...`)
				await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
			}
		}
	}
}

async function normalizeTargetFile(
	octokit: Octokit,
	sanitized: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number },
	file?: GitHubFileContent | null
): Promise<TypedocFileContent> {
	const targetFile =
		file ?? (await fetchTypedocWithRetry(octokit, { owner: sanitized.owner, repo: sanitized.repo }, options))

	if (!targetFile) {
		core.warning(`  ⚠ No Typedoc configuration found after retries — skipping heading update.`)
		throw new Error('Typedoc configuration file not found')
	}

	if (targetFile.type !== 'file' || !targetFile.content) {
		core.warning(`  ⚠ Typedoc configuration is not a regular file — skipping heading update.`)
		throw new Error('Typedoc configuration file is not a regular file')
	}

	return targetFile as TypedocFileContent
}
