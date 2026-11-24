/**
 * Update the Typedoc configuration for the project.
 *
 * Replace all the links in the Typedoc configuration with the appropriate project-specific URLs.
 */

import * as fs from 'node:fs/promises'
import path from 'node:path'
import { inspect } from 'node:util'

// Using prettier/standalone lowers the overhead of importing the full prettier package in a Node.js environment.
// Also Fixes: [!] RollupError: Invalid value for option "output.file" - when building multiple chunks, the "output.dir" option must be used, not "output.file". To inline dynamic imports, set the "inlineDynamicImports" option.
import type { Options as PrettierOptions } from 'prettier'
import * as prettier from 'prettier/standalone'
import * as prettierPluginBabel from 'prettier/plugins/babel'
import * as prettierPluginEstree from 'prettier/plugins/estree'

import * as core from '@actions/core'
import type { GitHubFileContent } from './types.js'
import type { Octokit } from './github-client.js'
import { base64Decode, base64Encode, sanitizeRepoName } from './utils.js'

type TypedocFileContent = GitHubFileContent & { type: 'file'; content: string }

interface FileLocation {
	path: string
}

export async function updateTypedocConfig(
	octokit: Octokit,
	repo: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number }
) {
	const file = await normalizeTargetFile(octokit, { owner: repo.owner, repo: repo.repo }, options)
	const config = JSON.parse(base64Decode(file.content))

	const prettierOptions = await fetchPrettierConfig(octokit, [
		{
			path: './config/.prettierrc.json',
		},
		{
			path: './config/.prettierrc',
		},
	])

	// const prettierOptions = await prettier.resolveConfig(file.path, {
	// 	config: './config/.prettierrc.json',
	// })

	// Update the links in the configuration
	config.cleanJsdocTheme.siteUrl = `https://${repo.owner}.github.io/${repo.repo}`
	config.cleanJsdocTheme.basePath = `/${repo.repo}`
	config.cleanJsdocTheme.menu[1].link = `https://github.com/${repo.owner}/${repo.repo}`

	// core.info(`Updated Typedoc configuration:\n${inspect(config, { depth: null, colors: true })}`)

	core.info(
		`\nFormatting Typedoc configuration with Prettier options:\n${inspect(prettierOptions, { depth: null, colors: true })}`
	)
	const formattedJson = await prettier.format(JSON.stringify(config, null, 2), {
		...prettierOptions,
		parser: 'json',
		plugins: [prettierPluginBabel, prettierPluginEstree],
	})

	await octokit.rest.repos.createOrUpdateFileContents({
		owner: repo.owner,
		repo: repo.repo,
		path: file.path,
		message: `docs: update Typedoc configuration to match ${repo.repo} [skip ci]`,
		content: base64Encode(formattedJson),
		sha: file.sha,
	})

	core.info(`  ✓ Typedoc configuration updated for ${repo.owner}/${repo.repo}`)
}

interface RepoFileLocation extends FileLocation {
	owner: string
	repo: string
	ref?: string
}

async function fetchPrettierConfig(
	octokit: Octokit,
	location: (FileLocation | RepoFileLocation)[]
): Promise<PrettierOptions> {
	if (location.length === 0) {
		throw new Error(`No locations provided for Prettier configuration`)
	}

	for (const loc of location) {
		core.info(`\nRetrieving Prettier configuration from: ${JSON.stringify(loc)}`)
		if ('owner' in loc && 'repo' in loc) {
			const { owner, repo, path, ref } = loc
			const { data } = await octokit.rest.repos.getContent({
				owner,
				repo,
				path,
				...(ref ? { ref } : {}),
			})

			if (!('content' in data) || Array.isArray(data)) {
				throw new Error(`Expected ${path} to be a file in ${owner}/${repo}`)
			}
			core.info(`  ✓ Prettier configuration retrieved from: ${path}`)
			return JSON.parse(base64Decode(data.content)) as PrettierOptions
		} else {
			try {
				const filePath = path.resolve(loc.path)
				const rawConfig = await fs.readFile(filePath, 'utf8')
				core.info(`  ✓ Prettier configuration retrieved from local path: ${filePath}`)
				return JSON.parse(rawConfig) as PrettierOptions
			} catch {
				core.warning(`  ⚠ Failed to read Prettier configuration from local path: ${loc.path}`)
			}
		}
	}

	throw new Error(`Prettier configuration not found in any of the specified locations`)
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
		core.info(`\nFetching ${path} ...`)
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const { data } = await octokit.rest.repos.getContent({ owner, repo: sanitizedRepo, path })
				core.info(`  ✓ Fetched ${path} successfully`)
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
