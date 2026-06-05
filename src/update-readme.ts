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

	return targetFile;

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
 * Updates the badges immediately following the first H1 heading in the README to match the repo name.
 *
 * Uses GET /repos/{owner}/{repo}/contents/README.md to fetch the current content,
 * replaces the badges immediately following the first H1 heading, then commits it back via PUT.
 *
 * Note: GitHub populates template repository contents asynchronously after the
 * repo is created, so this function retries the README fetch until it appears.
 *
 * Example badge format:
 * [![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yaml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yaml)
 */
async function updateReadmeBadges(
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

	// Replace badges immediately following the first H1 heading
	const updated = original.replace(
		/^#\s+.*$\n((\s*\[!\[.*\]\(https:\/\/github\.com\/[^\/]+\/)[^\/]+(\/actions\/workflows\/.*badge\.svg\)\]\(https:\/\/github\.com\/[^\/]+\/actions\/workflows\/.*\)))*\n?/m,
		(match, badgePrefix, badgeSuffix) => {
			if (!badgePrefix || !badgeSuffix) return match; // No badges found, return original

			// Update all badges in the matched block
			const updatedBadges =
				badgePrefix +
				repo +
				badgeSuffix.replace(
					/(https:\/\/github\.com\/[^\/]+\/)[^\/]+(\/actions\/workflows\/.*badge\.svg\)\]\(https:\/\/github\.com\/[^\/]+\/actions\/workflows\/.*\))/g,
					`$1${repo}$2`
				);
			return `# ${repo}\n${updatedBadges}\n`;
		}
	);

	if (updated === original) {
		core.warning(`  ⚠ No badges found immediately following H1 heading — skipping badge update.`);
		return;
	}

	return targetFile;

	// await octokit.rest.repos.createOrUpdateFileContents({
	// 	owner,
	// 	repo: sanitizedRepo,
	// 	path: targetFile.path,
	// 	message: `chore(docs): update README.md badges to match ${repo} [skip ci]`,
	// 	content: Buffer.from(updated).toString('base64'),
	// 	sha: targetFile.sha,
	// });

	// core.info(`  ✓ README badges updated.`);
}

export async function updateReadme(
	octokit: Octokit,
	{ owner, repo }: { owner: string; repo: string },
	options?: { retryDelayMs?: number; maxRetries?: number }
): Promise<void> {
	let file = null;

	file = await updateReadmeHeading(octokit, { owner, repo }, options, file);
	file = await updateReadmeBadges(octokit, { owner, repo }, options, file);

	const updatedContent = Buffer.from(file?.content ?? '', 'base64').toString('utf8');

	if (!updatedContent || !updatedContent.trim()) {
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
