/**
 * Shared type definitions for the repository-create project.
 */

export interface TemplateConfig {
	/** Template repository owner */
	owner: string;
	/** Template repository name */
	repo: string;
	/** Copy all branches (default: default branch only) */
	includeAllBranches?: boolean;
	/** Replace first H1 in README with the new repo name (default: true) */
	updateReadmeHeading?: boolean;
}

export interface RepoSettings {
	/** Repository description */
	description?: string;
	/** Visibility — 'internal' requires GitHub Enterprise Cloud (GHEC) */
	visibility?: 'public' | 'private' | 'internal';
	/** Enable Issues tab */
	hasIssues?: boolean;
	/** Enable Projects tab */
	hasProjects?: boolean;
	/** Enable Wiki tab */
	hasWiki?: boolean;
	/** Allow squash merges */
	allowSquashMerge?: boolean;
	/** Allow merge commits */
	allowMergeCommit?: boolean;
	/** Allow rebase merges */
	allowRebaseMerge?: boolean;
	/** 'PR_TITLE' | 'COMMIT_OR_PR_TITLE' */
	squashMergeCommitTitle?: 'PR_TITLE' | 'COMMIT_OR_PR_TITLE';
	/** 'PR_BODY' | 'COMMIT_MESSAGES' | 'BLANK' */
	squashMergeCommitMessage?: 'PR_BODY' | 'COMMIT_MESSAGES' | 'BLANK';
	/** Auto-delete head branch after merge */
	deleteBranchOnMerge?: boolean;
	/** Allow auto-merge on PRs */
	allowAutoMerge?: boolean;
	/** Create initial commit — ignored when template is set */
	auto_init?: boolean;
	/** Create from template when set */
	template?: TemplateConfig | null;
}

export interface RefNameCondition {
	/** Ref patterns to include (e.g. ['refs/heads/main']) */
	include: string[];
	/** Ref patterns to exclude */
	exclude: string[];
}

export interface RulesetConditions {
	ref_name: RefNameCondition;
}

export interface RulesetRule {
	/** Rule type (e.g. 'pull_request', 'deletion', 'non_fast_forward') */
	type: string;
	/** Rule-specific parameters */
	parameters?: Record<string, unknown>;
}

export interface RulesetBypassActor {
	actor_id: number;
	actor_type: string;
	bypass_mode: string;
}

export interface RulesetConfig {
	/** Ruleset name */
	name: string;
	/** Target type */
	target: 'branch' | 'tag';
	/** Enforcement level */
	enforcement: 'active' | 'evaluate' | 'disabled';
	/** Branch/tag filter conditions */
	conditions: RulesetConditions;
	/** List of rules */
	rules: RulesetRule[];
	/** Actors that can bypass the ruleset */
	bypass_actors?: RulesetBypassActor[];
}

export interface GitHubFileContent {
	type: 'file' | 'dir' | 'symlink' | 'submodule';
	path: string;
	sha: string;
	/** Base64-encoded file content (present when type === 'file') */
	content?: string;
	encoding?: string;
}
