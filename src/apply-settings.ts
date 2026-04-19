import type { Octokit } from 'octokit';
import type { RepoSettings } from './types.js';

/**
 * Applies general repository settings via PATCH /repos/{owner}/{repo}.
 *
 * Some settings (e.g. squash commit message format, auto-merge) are only
 * available on update, not on initial creation, so this runs as a second pass.
 */
export async function applySettings(
	octokit: Octokit,
	{ owner, repo, settings }: { owner: string; repo: string; settings: RepoSettings }
) {
	console.log(`  Applying repository settings...`);

	const { data } = await octokit.rest.repos.update({
		owner,
		repo,
		description: settings.description,
		visibility: settings.visibility as 'private' | 'public' | undefined,
		has_issues: settings.hasIssues,
		has_projects: settings.hasProjects,
		has_wiki: settings.hasWiki,
		allow_squash_merge: settings.allowSquashMerge,
		allow_merge_commit: settings.allowMergeCommit,
		allow_rebase_merge: settings.allowRebaseMerge,
		squash_merge_commit_title: settings.squashMergeCommitTitle,
		squash_merge_commit_message: settings.squashMergeCommitMessage,
		delete_branch_on_merge: settings.deleteBranchOnMerge,
		allow_auto_merge: settings.allowAutoMerge,
	});

	console.log(`  ✓ Settings applied.`);
	return data;
}
