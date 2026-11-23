/**
 * Update the Typedoc configuration for the project.
 *
 * Replace all the links in the Typedoc configuration with the appropriate project-specific URLs.
 */

import * as core from '@actions/core'
import type { GitHubFileContent } from './types.js'
import type { Octokit } from './github-client.js'
import { sanitizeRepoName } from './utils.js'

type TypedocFileContent = GitHubFileContent & { type: 'file'; content: string }

export async function updateTypedocConfig(
	octokit: Octokit,
	repo: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number }
) {
	const file = await normalizeTargetFile(octokit, { owner: repo.owner, repo: repo.repo }, options)
	const config = JSON.parse(file.content)

	// Update the links in the configuration
	config.cleanJsdocTheme.siteUrl = `https://${repo.owner}.github.io/${repo.repo}`
	config.cleanJsdocTheme.basePath = `/${repo.repo}`
	config.cleanJsdocTheme.menu[1].link = `https://github.com/${repo.owner}/${repo.repo}`

	await octokit.rest.repos.createOrUpdateFileContents({
		owner: repo.owner,
		repo: repo.repo,
		path: file.path,
		message: `docs: update Typedoc configuration to match ${repo.repo} [skip ci]`,
		content: Buffer.from(JSON.stringify(config)).toString('base64'),
		sha: file.sha,
	})
}

async function fetchTypedocWithRetry(
	octokit: Octokit,
	{ owner, repo }: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number }
) {
	const candidates = ['typedoc.site.json', 'typedoc.json', 'typedoc.config.json']
	const retryDelayMs = options?.retryDelayMs ?? 1000
	const maxRetries = options?.maxRetries ?? 3

	const sanitizedRepo = sanitizeRepoName(repo)

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		for (const filePath of candidates) {
			try {
				const { data } = await octokit.rest.repos.getContent({ owner, repo: sanitizedRepo, path: filePath })
				return data as GitHubFileContent
			} catch (err) {
				if ((err as { status?: number }).status !== 404) throw err
			}

			if (attempt === maxRetries) throw new Error(`Failed to fetch Typedoc configuration from ${filePath}`)
			await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
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
