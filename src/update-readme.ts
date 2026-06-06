import type { Octokit } from 'octokit';
import type { GitHubFileContent } from './types.js';
import * as core from '@actions/core';
import { sanitizeRepoName } from './utils.js';

/**
 * Updates the first H1 heading in the repository's README to match the repo name.
 *
 * Uses GET /repos/{owner}/{repo}/contents/README.md to fetch the current content,
 * replaces the first `# ...` line, then commits it back via PUT.
 *
 * Note: GitHub populates template repository contents asynchronously after the
 * repo is created, so this function retries the README fetch until it appears.
 */

async function updateReadmeHeading(
	octokit: Octokit,
	{ owner, repo }: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number },
	file?: GitHubFileContent | null
): Promise<GitHubFileContent | undefined> {
	const sanitizedRepo = sanitizeRepoName(repo);
	core.info(`  Updating README heading to "${repo}" (API repo: "${sanitizedRepo}")...`);

	const targetFile = file ?? (await fetchReadmeWithRetry(octokit, { owner, repo: sanitizedRepo }, options));

	if (!targetFile) {
		core.warning(`  ⚠ No README found after retries — skipping heading update.`);
		return;
	}

	if (targetFile.type !== 'file' || !targetFile.content) {
		core.warning(`  ⚠ README is not a regular file — skipping heading update.`);
		return;
	}

	const original = Buffer.from(targetFile.content, 'base64').toString('utf8');

	// Replace only the first H1 line (# Title), robust to spaces and special characters
	const updated = original.replace(/^#\s+.*$/m, `# ${repo}`);

	if (updated === original) {
		core.warning(`  ⚠ No H1 heading found in README — skipping heading update.`);
		return;
	}

	return {
		...targetFile,
		content: Buffer.from(updated).toString('base64'),
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
}

/**
 * Updates the repository owner and name in GitHub Actions workflow badges in the README.
 *
 * Example badge format:
 * [![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yaml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yaml)
 */
async function updateReadmeGitHubBadges(
	octokit: Octokit,
	{ owner, repo }: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number },
	file?: GitHubFileContent | null
): Promise<GitHubFileContent | undefined> {
	const sanitizedRepo = sanitizeRepoName(repo);
	core.info(`  Updating README badges to match repo name "${repo}" (API repo: "${sanitizedRepo}")...`);

	const targetFile = file ?? (await fetchReadmeWithRetry(octokit, { owner, repo: sanitizedRepo }, options));

	if (!targetFile) {
		core.warning(`  ⚠ No README found after retries — skipping badge update.`);
		return;
	}

	if (targetFile.type !== 'file' || !targetFile.content) {
		core.warning(`  ⚠ README is not a regular file — skipping badge update.`);
		return;
	}

	const original = Buffer.from(targetFile.content, 'base64').toString('utf8');
	const badgeRepoSegmentRegex =
		/(https:\/\/github\.com\/[^/]+\/)([^/]+)(\/actions\/workflows\/[^)]+(?:\/badge\.svg(?:\?[^)]*)?)?)\)/g;

	const updated = original.replace(badgeRepoSegmentRegex, `$1${repo}$3`);

	if (updated === original) {
		core.warning(`  ⚠ No GitHub Actions workflow badges found in README — skipping badge update.`);
		return;
	}

	return {
		...targetFile,
		content: Buffer.from(updated).toString('base64'),
	};

	// await octokit.rest.repos.createOrUpdateFileContents({
	// 	owner,
	// 	repo: sanitizedRepo,
	// 	path: targetFile.path,
	// 	message: `chore(docs): update README.md badges to match ${repo} [skip ci]`,
	// 	content: Buffer.from(updated).toString('base64'),
	// 	sha: targetFile.sha,
	// });

	// core.info(`  ✓ README GitHub badges updated.`);
}

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
	{ owner, repo }: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number },
	file?: GitHubFileContent | null
): Promise<GitHubFileContent | undefined> {
	const sanitizedRepo = sanitizeRepoName(repo);
	core.info(`  Updating README badges to match repo name "${repo}" (API repo: "${sanitizedRepo}")...`);

	const targetFile = file ?? (await fetchReadmeWithRetry(octokit, { owner, repo: sanitizedRepo }, options));

	if (!targetFile) {
		core.warning(`  ⚠ No README found after retries — skipping badge update.`);
		return;
	}

	if (targetFile.type !== 'file' || !targetFile.content) {
		core.warning(`  ⚠ README is not a regular file — skipping badge update.`);
		return;
	}

	const original = Buffer.from(targetFile.content, 'base64').toString('utf8');
	const badgeRepoSegmentRegex =
		/(https:\/\/img\.shields\.io\/github\/(?:v\/release|last-commit|license)\/[^/]+)\/([^/?]+)([?\/][^)]+)?\)\]\((https:\/\/github\.com\/[^/]+\/)([^/]+)\/[^\/]+\)/g;

	const updated = original.replace(badgeRepoSegmentRegex, `$1${repo}$3)`);

	if (updated === original) {
		core.warning(`  ⚠ No GitHub Shields.io badges found in README — skipping badge update.`);
		return;
	}

	return {
		...targetFile,
		content: Buffer.from(updated).toString('base64'),
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
}

export async function updateReadme(
	octokit: Octokit,
	{ owner, repo }: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number }
): Promise<void> {
	let file = null;

	file = await updateReadmeHeading(octokit, { owner, repo }, options, file);
	file = await updateReadmeGitHubBadges(octokit, { owner, repo }, options, file);
	file = await updateReadmeGitHubShieldsBadges(octokit, { owner, repo }, options, file);

	if (!file) {
		core.warning(`  ⚠ README was not updated — skipping commit.`);
		return;
	}

	const updatedContent = file?.content ?? '';
	const updatedContentText = Buffer.from(updatedContent, 'base64').toString('utf8');

	if (!updatedContent || !updatedContentText.trim()) {
		core.warning(`  ⚠ README content is empty after updates — skipping commit.`);
		return;
	}

	await octokit.rest.repos.createOrUpdateFileContents({
		owner,
		repo: sanitizeRepoName(repo),
		path: file?.path ?? 'README.md',
		message: `chore(docs): update README.md to match ${repo} [skip ci]`,
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
