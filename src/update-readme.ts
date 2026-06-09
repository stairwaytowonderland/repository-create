import type { Octokit } from 'octokit';
import type { GitHubFileContent } from './types.js';
import * as core from '@actions/core';
import { base64Decode, base64Encode, sanitizeRepoName } from './utils.js';

type ReadmeFileContent = GitHubFileContent & { type: 'file'; content: string };

/**
 * Updates the all occurrences of H1 heading in the README that match the template name.
 *
 * Uses GET /repos/{owner}/{repo}/contents/README.md to fetch the current content,
 * replaces the first `# ...` line, then commits it back via PUT.
 *
 * Note: GitHub populates template repository contents asynchronously after the
 * repo is created, so this function retries the README fetch until it appears.
 */

async function updateReadmeHeading(
	octokit: Octokit,
	repo: { owner: string; repo: string; template?: string },
	options?: { retryDelayMs?: number; maxRetries?: number },
	file?: GitHubFileContent | null
): Promise<GitHubFileContent | null> {
	try {
		const sanitizedRepo = sanitizeRepoName(repo.repo);
		const targetFile = await normalizeTargetFile(octokit, { owner: repo.owner, repo: sanitizedRepo }, options, file);
		const original = base64Decode(targetFile.content);
		const matches = original.match(/^#\s+.*$/m);
		const originalHeading = matches ? matches[0].replace(/^#\s+/, '').trim() : null;

		core.info(
			`  Updating README heading from "${originalHeading}" to "${repo.repo}" (API repo: "${sanitizedRepo}")...`
		);

		// Replace only the first H1 line (# Title), robust to spaces and special characters

		// const updated = original.replace(/^#\s+.*$/m, `# ${repo.repo}`);
		const updated = original.replace(new RegExp(`#\\s+${originalHeading}`, 'gm'), `# ${repo.repo}`);

		if (updated === original) {
			core.warning(`  ⚠ No H1 heading found in README — skipping heading update.`);
			return null;
		}

		return {
			...targetFile,
			content: base64Encode(updated),
		};

		// await octokit.rest.repos.createOrUpdateFileContents({
		// 	owner,
		// 	repo: sanitizedRepo,
		// 	path: targetFile.path,
		// 	message: `chore(docs): rename README.md heading to ${repo} [skip ci]`,
		// 	content: Buffer.from(updated).toString('base64'),
		// 	sha: targetFile.sha,
		// });

		// core.info(`  ✓ README heading updated.`);
	} catch (err) {
		core.warning(`  ⚠ Failed to update README heading: ${(err as Error).message}`);
		return null;
	}
}

/**
 * Updates GitHub repository links in the README to match the repo name.
 */
async function updateReadmeRepoLinks(
	octokit: Octokit,
	repo: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number; replaceGitProtocolLinks?: boolean },
	file?: GitHubFileContent | null
): Promise<GitHubFileContent | null> {
	try {
		const sanitizedRepo = sanitizeRepoName(repo.repo);
		core.info(`  Updating README repository links to match repo name "${repo.repo}" (API repo: "${sanitizedRepo}")...`);

		const targetFile = await normalizeTargetFile(octokit, { owner: repo.owner, repo: sanitizedRepo }, options, file);
		const original = base64Decode(targetFile.content);
		let repoLinkRegex: RegExp;
		if (options?.replaceGitProtocolLinks) {
			repoLinkRegex = new RegExp(
				`((?:https://github\\.com/|git@github\\.com:)${repo.owner}/)([^/)?.\`]+)(/[^)\`]+(?:^.*$)?)?`,
				'g'
			);
		} else {
			repoLinkRegex = new RegExp(`(https://github\\.com/${repo.owner}/)([^/)?.\`]+)(/[^)\`]+(?:^.*$)?)?`, 'g');
		}

		const updated = original.replace(repoLinkRegex, `$1${repo.repo}$3`);

		if (updated === original) {
			core.warning(`  ⚠ No GitHub repository links found in README — skipping repository links update.`);
			return null;
		}

		return {
			...targetFile,
			content: base64Encode(updated),
		};
	} catch (err) {
		core.warning(`  ⚠ Failed to update README repository links: ${(err as Error).message}`);
		return null;
	}
}

/**
 * Updates the repository owner and name in GitHub Actions workflow badges in the README.
 *
 * Example badge format:
 * [![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yaml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yaml)
 */
// async function updateReadmeGitHubBadges(
// 	octokit: Octokit,
// 	{ owner, repo }: { owner: string; repo: string },
// 	options?: { retryDelayMs?: number; maxRetries?: number },
// 	file?: GitHubFileContent | null
// ): Promise<GitHubFileContent | null> {
// 	try {
// 		const sanitizedRepo = sanitizeRepoName(repo);
// 		core.info(`  Updating README badges to match repo name "${repo}" (API repo: "${sanitizedRepo}")...`);

// 		const targetFile = await normalizeTargetFile(octokit, { owner, sanitizedRepo }, options, file);
// 		const original = base64Decode(targetFile.content);
// 		const badgeRepoSegmentRegex =
// 			/(https:\/\/github\.com\/[^/]+\/)([^/]+)(\/actions\/workflows\/[^)]+(?:\/badge\.svg(?:\?[^)]*)?)?)/g;

// 		const updated = original.replace(badgeRepoSegmentRegex, `$1${repo}$3`);

// 		if (updated === original) {
// 			core.warning(`  ⚠ No GitHub Actions workflow badges found in README — skipping badge update.`);
// 			return null;
// 		}

// 		return {
// 			...targetFile,
// 			content: base64Encode(updated),
// 		};

// 		// await octokit.rest.repos.createOrUpdateFileContents({
// 		// 	owner,
// 		// 	repo: sanitizedRepo,
// 		// 	path: targetFile.path,
// 		// 	message: `chore(docs): update README.md badges to match ${repo} [skip ci]`,
// 		// 	content: Buffer.from(updated).toString('base64'),
// 		// 	sha: targetFile.sha,
// 		// });

// 		// core.info(`  ✓ README GitHub badges updated.`);
// 	} catch (err) {
// 		core.warning(`  ⚠ Failed to update README badges: ${(err as Error).message}`);
// 		return null;
// 	}
// }

/**
 * Updates the repository owner and name in GitHub Actions workflow badges in the README.
 *
 * Example badge formats:
 * [![GitHub latest release](https://img.shields.io/github/v/release/<owner>/<repo>?include_prereleases&logo=rocket)](https://github.com/<owner>/<repo>/releases)
 * [![GitHub last commit](https://img.shields.io/github/last-commit/<owner>/<repo>/main?logo=git)](https://github.com/<owner>/<repo>/commits/main)
 * [![GitHub license](https://img.shields.io/github/license/<owner>/<repo>?logo=opensourceinitiative&color=yellow)](https://github.com/<owner>/<repo>/tree/main/LICENSE)
 */
async function updateReadmeGitHubShieldsBadges(
	octokit: Octokit,
	repo: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number },
	file?: GitHubFileContent | null
): Promise<GitHubFileContent | null> {
	const sanitizedRepo = sanitizeRepoName(repo.repo);
	try {
		core.info(`  Updating README badges to match repo name "${repo.repo}" (API repo: "${sanitizedRepo}")...`);

		const targetFile = await normalizeTargetFile(octokit, { owner: repo.owner, repo: sanitizedRepo }, options, file);
		const original = base64Decode(targetFile.content);
		const badgeRepoSegmentRegex =
			/(?:(\[\![^\]]+\]\(https:\/\/img\.shields\.io\/github\/(?:v\/release|last-commit|license)\/[^/]+\/)([^)\?]+)((?:\?[^)]*)?)\)[^:]+\((https:\/\/github\.com\/[^/]+\/)([^/]+)(((\/[^\/]+))+)\))/g;

		const updated = original.replace(badgeRepoSegmentRegex, `$1${repo.repo}$3)]($4${repo.owner}/${repo.repo}$6)`);

		if (updated === original) {
			core.warning(`  ⚠ No GitHub Shields.io badges found in README — skipping badge update.`);
			return null;
		}

		return {
			...targetFile,
			content: base64Encode(updated),
		};

		// await octokit.rest.repos.createOrUpdateFileContents({
		// 	owner,
		// 	repo: sanitizedRepo,
		// 	path: targetFile.path,
		// 	message: `chore(docs): update README.md badges to match ${repo} [skip ci]`,
		// 	content: Buffer.from(updated).toString('base64'),
		// 	sha: targetFile.sha,
		// });

		// core.info(`  ✓ README GitHub Shields.io badges updated.`);
	} catch (err) {
		core.warning(`  ⚠ Failed to update README badges: ${(err as Error).message}`);
		return null;
	}
}

/**
 * Updates the repository first tasks checkboxes.
 *
 * Sets the repository creation tasks checkboxes to checked (x) in the README, if they exist.
 */
async function updateReadmeFirstTasks(
	octokit: Octokit,
	repo: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number },
	file?: GitHubFileContent | null
): Promise<GitHubFileContent | null> {
	try {
		const sanitizedRepo = sanitizeRepoName(repo.repo);
		core.info(
			`  Updating README first tasks checkboxes to checked for repo "${repo.repo}" (API repo: "${sanitizedRepo}")...`
		);

		const targetFile = await normalizeTargetFile(octokit, { owner: repo.owner, repo: sanitizedRepo }, options, file);
		const original = base64Decode(targetFile.content);
		const updated = original.replace(/(^(?:-|[0-9]+\.)\s+)(\[[^\]]\])(\s+\*+(?:Create your repo)\:.*$)/gm, '$1[x]$3');

		if (updated === original) {
			core.warning(`  ⚠ No unchecked task list items found in README — skipping first tasks update.`);
			return null;
		}

		return {
			...targetFile,
			content: base64Encode(updated),
		};
	} catch (err) {
		core.warning(`  ⚠ Failed to update README first tasks: ${(err as Error).message}`);
		return null;
	}
}

export async function updateReadme(
	octokit: Octokit,
	repo: { owner: string; repo: string; template?: string },
	options?: { retryDelayMs?: number; maxRetries?: number; replaceGitProtocolLinks?: boolean }
): Promise<void> {
	let file = null;

	file = await updateReadmeHeading(
		octokit,
		{ owner: repo.owner, repo: repo.repo, template: repo.template },
		options,
		file
	);
	file = await updateReadmeRepoLinks(octokit, { owner: repo.owner, repo: repo.repo }, options, file);
	file = await updateReadmeGitHubShieldsBadges(octokit, { owner: repo.owner, repo: repo.repo }, options, file);
	// file = await updateReadmeGitHubBadges(octokit, { owner, repo }, options, file);

	if (!file) {
		core.warning(`  ⚠ README was not updated — skipping commit.`);
	}

	const updatedContent = file?.content ?? '';
	const updatedContentText = Buffer.from(updatedContent, 'base64').toString('utf8');

	if (!updatedContent || !updatedContentText.trim()) {
		core.warning(`  ⚠ README content is empty after updates — skipping commit.`);
	}

	await octokit.rest.repos.createOrUpdateFileContents({
		owner: repo.owner,
		repo: sanitizeRepoName(repo.repo),
		path: file?.path ?? 'README.md',
		message: `chore(docs): update README.md to match ${repo.repo} [skip ci]`,
		content: updatedContent,
		sha: file?.sha,
	});

	core.info(`  ✓ README updated.`);
}

/**
 * Retries fetching the README every 3 seconds for up to 30 seconds.
 * GitHub populates template contents asynchronously, so the file may not
 * exist immediately after createUsingTemplate resolves.
 */
async function fetchReadmeWithRetry(
	octokit: Octokit,
	{ owner, repo }: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number }
): Promise<GitHubFileContent | null> {
	const candidates = ['README.md', 'readme.md', 'Readme.md'];
	const maxAttempts = options?.maxRetries ?? 10;
	const delayMs = options?.retryDelayMs ?? 3000;

	// Always sanitize repo name for API calls
	const sanitizedRepo = sanitizeRepoName(repo);

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		for (const path of candidates) {
			try {
				const { data } = await octokit.rest.repos.getContent({ owner, repo: sanitizedRepo, path });
				return data as GitHubFileContent;
			} catch (err) {
				if ((err as { status?: number }).status !== 404) throw err;
			}
		}

		if (attempt < maxAttempts) {
			core.info(`  Waiting for template contents to be ready (attempt ${attempt}/${maxAttempts})...`);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	return null;
}

/**
 * Normalizes the target README file.
 *
 * If the file is not provided, it will attempt to fetch it with retries.
 * Throws an error if the README is not found or is not a regular file.
 */
async function normalizeTargetFile(
	octokit: Octokit,
	sanitized: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number },
	file?: GitHubFileContent | null
): Promise<ReadmeFileContent> {
	const targetFile =
		file ?? (await fetchReadmeWithRetry(octokit, { owner: sanitized.owner, repo: sanitized.repo }, options));

	if (!targetFile) {
		core.warning(`  ⚠ No README found after retries — skipping heading update.`);
		throw new Error('README file not found');
	}

	if (targetFile.type !== 'file' || !targetFile.content) {
		core.warning(`  ⚠ README is not a regular file — skipping heading update.`);
		throw new Error('README file is not a regular file');
	}

	return targetFile as ReadmeFileContent;
}
