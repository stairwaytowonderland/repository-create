import type { RepoSettings, RulesetConfig } from './types.js';

/**
 * Default repository settings and branch ruleset configuration.
 *
 * Override any of these values by passing a JSON config file via --repo-config:
 *   node src/index.js --org myorg --name myrepo --repo-config ./my-config.json
 *
 * Config file shape:
 *   {
 *     "settings": { ...partial overrides... },
 *     "rulesets": [ ...full replacement array... ]
 *   }
 *
 * To create from a template repository, add a "template" block to "settings":
 *   {
 *     "settings": {
 *       "template": {
 *         "owner": "my-org",
 *         "repo":  "my-template-repo",
 *         "includeAllBranches": false,
 *         "updateReadmeHeading": true
 *       }
 *     }
 *   }
 * Or use CLI flags: --template-owner <owner> --template-repo <repo> [--include-all-branches]
 */
export const repoDefaults: RepoSettings = {
	// General
	description: '',
	/**
	 * 'public' | 'private' | 'internal'
	 * 'internal' requires GitHub Enterprise Cloud (GHEC).
	 */
	visibility: 'public',

	// Features
	hasIssues: true,
	hasProjects: false,
	hasWiki: false,

	// Merge strategy — squash-only keeps a linear history
	allowSquashMerge: true,
	allowMergeCommit: false,
	allowRebaseMerge: false,
	squashMergeCommitTitle: 'PR_TITLE',
	squashMergeCommitMessage: 'PR_BODY',

	// Housekeeping
	deleteBranchOnMerge: true,
	allowAutoMerge: false,

	/**
	 * auto_init creates an initial commit on the default branch so that
	 * branch rulesets can be applied immediately after creation.
	 * When using a template, the template provides the initial content, so
	 * auto_init is not needed and is ignored if set.
	 */
	auto_init: true,

	/**
	 * Optional: create the repository from a template.
	 * When set, `createUsingTemplate` is used instead of `createInOrg`.
	 * Note: auto_init is ignored when using a template (the template provides
	 * the initial content).
	 */
	template: null,
};

/**
 * Branch ruleset definitions applied after repo creation.
 * Each entry maps to a POST /repos/{owner}/{repo}/rulesets request.
 */
export const rulesetDefaults: RulesetConfig[] = [
	{
		name: 'main-branch-protection',
		/**
		 * 'branch' | 'tag'
		 */
		target: 'branch',
		/**
		 * 'active' | 'evaluate' | 'disabled'
		 * Use 'evaluate' to audit without enforcing.
		 */
		enforcement: 'active',
		conditions: {
			ref_name: {
				include: ['refs/heads/main'],
				exclude: [],
			},
		},
		rules: [
			/**
			 * Require a pull request before merging.
			 * https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset
			 */
			{
				type: 'pull_request',
				parameters: {
					allowed_merge_methods: ['squash'],
					required_approving_review_count: 1,
					dismiss_stale_reviews_on_push: true,
					require_code_owner_review: false,
					require_last_push_approval: true,
					required_review_thread_resolution: true,
				},
			},
			/** Require linear history (no merge commits). */
			{ type: 'required_linear_history' },
			/** Prevent deletion of the protected branch. */
			{ type: 'deletion' },
			/** Prevent force pushes (non-fast-forward updates). */
			{ type: 'non_fast_forward' },
		],
		/**
		 * Actors that can bypass this ruleset.
		 * Format: [{ actor_id: <id>, actor_type: 'Team'|'Integration'|'RepositoryRole', bypass_mode: 'always'|'pull_request' }]
		 * Leave empty to enforce for all actors including admins.
		 */
		bypass_actors: [],
	},
];
