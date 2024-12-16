import chalk from 'chalk';
import { ComponentIdList, ComponentID } from '@teambit/component-id';
import { Command, CommandOptions } from '@teambit/cli';
import { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { DEFAULT_BIT_RELEASE_TYPE, COMPONENT_PATTERN_HELP, CFG_FORCE_LOCAL_BUILD } from '@teambit/legacy.constants';
import { GlobalConfigMain } from '@teambit/global-config';
import { IssuesClasses } from '@teambit/component-issues';
import { ReleaseType } from 'semver';
import { BitError } from '@teambit/bit-error';
import { Logger } from '@teambit/logger';
import { TagResults, SnappingMain } from './snapping.main.runtime';
import { BasicTagParams } from './tag-model-component';

export const NOTHING_TO_TAG_MSG = 'nothing to tag';
export const AUTO_TAGGED_MSG = 'auto-tagged dependents';

const RELEASE_TYPES = ['major', 'premajor', 'minor', 'preminor', 'patch', 'prepatch', 'prerelease'];

export const tagCmdOptions = [
  ['m', 'message <message>', 'a log message describing latest changes'],
  ['u', 'unmodified', 'include unmodified components (by default, only new and modified components are tagged)'],
  [
    '',
    'editor [editor]',
    'open an editor to write a tag message for each component. optionally, specify the editor-name (defaults to vim).',
  ],
  ['v', 'ver <version>', 'tag with the given version'],
  ['l', 'increment <level>', `options are: [${RELEASE_TYPES.join(', ')}], default to patch`],
  ['', 'prerelease-id <id>', 'prerelease identifier (e.g. "dev" to get "1.0.0-dev.1")'],
  ['p', 'patch', 'syntactic sugar for "--increment patch"'],
  ['', 'minor', 'syntactic sugar for "--increment minor"'],
  ['', 'major', 'syntactic sugar for "--increment major"'],
  ['', 'pre-release [identifier]', 'syntactic sugar for "--increment prerelease" and `--prerelease-id <identifier>`'],
  ['', 'snapped', 'tag only components whose head is a snap (not a tag)'],
  ['', 'unmerged', 'complete a merge process by tagging the unmerged components'],
  ['', 'skip-tests', 'skip running component tests during tag process'],
  [
    '',
    'skip-tasks <string>',
    `skip the given tasks. for multiple tasks, separate by a comma and wrap with quotes.
specify the task-name (e.g. "TypescriptCompiler") or the task-aspect-id (e.g. teambit.compilation/compiler)`,
  ],
  ['', 'skip-auto-tag', 'skip auto tagging dependents'],
  ['', 'soft', 'do not persist. only keep note of the changes to be made'],
  [
    '',
    'persist [skip-build]',
    'persist the changes generated by --soft tag. by default, run the build pipeline, unless "skip-build" is provided',
  ],
  ['', 'disable-tag-pipeline', 'skip the tag pipeline to avoid publishing the components'],
  ['', 'ignore-build-errors', 'proceed to tag pipeline even when build pipeline fails'],
  ['', 'rebuild-deps-graph', 'do not reuse the saved dependencies graph, instead build it from scratch'],
  [
    '',
    'increment-by <number>',
    '(default to 1) increment semver flag (patch/minor/major) by. e.g. incrementing patch by 2: 0.0.1 -> 0.0.3.',
  ],
  [
    'i',
    'ignore-issues <issues>',
    `ignore component issues (shown in "bit status" as "issues found"), issues to ignore:
[${Object.keys(IssuesClasses).join(', ')}]
to ignore multiple issues, separate them by a comma and wrap with quotes. to ignore all issues, specify "*".`,
  ],
  [
    'I',
    'ignore-newest-version',
    'allow tagging even when the component has newer versions e.g. for hotfixes (default = false)',
  ],
  [
    '',
    'fail-fast',
    'stop pipeline execution on the first failed task (by default a task is skipped only when its dependency failed)',
  ],
  ['b', 'build', 'locally run the build pipeline (i.e. not via rippleCI) and complete the tag'],
] as CommandOptions;

export type TagParams = {
  snapped?: boolean;
  unmerged?: boolean;
  ver?: string;
  patch?: boolean;
  minor?: boolean;
  major?: boolean;
  increment?: ReleaseType;
  preRelease?: string;
  prereleaseId?: string;
  ignoreUnresolvedDependencies?: boolean;
  ignoreIssues?: string;
  incrementBy?: number;
  failFast?: boolean;
  disableTagPipeline?: boolean;
} & Partial<BasicTagParams>;

export class TagCmd implements Command {
  name = 'tag [component-patterns...]';
  group = 'development';
  description = 'create an immutable and exportable component snapshot, tagged with a release version.';
  extendedDescription = `if no patterns are provided, it will tag all new and modified components.
if patterns are entered, you can specify a version per pattern using "@" sign, e.g. bit tag foo@1.0.0 bar@minor baz@major`;
  arguments = [
    {
      name: 'component-patterns...',
      description: `${COMPONENT_PATTERN_HELP}. By default, all new and modified are tagged.`,
    },
  ];
  helpUrl = 'reference/components/snaps#create-a-tag-(release-version)';
  alias = 't';
  loader = true;
  options = tagCmdOptions;
  remoteOp = true; // In case a compiler / tester is not installed
  examples = [{ cmd: 'tag --ver 1.0.0', description: 'tag all components to version 1.0.0' }];

  constructor(
    private snapping: SnappingMain,
    private logger: Logger,
    private globalConfig: GlobalConfigMain
  ) {}

  // eslint-disable-next-line complexity
  async report([patterns = []]: [string[]], options: TagParams): Promise<string> {
    const {
      message = '',
      ver,
      editor = '',
      snapped = false,
      unmerged = false,
      ignoreIssues,
      ignoreNewestVersion = false,
      skipTests = false,
      skipTasks,
      skipAutoTag = false,
      unmodified = false,
      soft = false,
      persist = false,
      disableTagPipeline = false,
      ignoreBuildErrors = false,
      rebuildDepsGraph,
      failFast = false,
      incrementBy = 1,
    } = options;

    if (!message && !persist && !editor) {
      this.logger.consoleWarning(
        `--message will be mandatory in the next few releases. make sure to add a message with your tag`
      );
    }
    const { releaseType, preReleaseId } = validateOptions(options);

    const disableTagAndSnapPipelines = disableTagPipeline;
    let build = options.build;
    build = (await this.globalConfig.getBool(CFG_FORCE_LOCAL_BUILD)) || Boolean(build);
    if (persist) {
      if (persist === true) build = true;
      else if (persist === 'skip-build') build = false;
      else throw new BitError(`unknown value for --persist, use either --persist or --persist=skip-build`);
    }
    if (!build && !soft) {
      this.logger.consoleWarning(
        `tagging components on "main" lane when using remote build is not recommended. To avoid SemVer versions of your component with failing builds, please refer to:
- Snap changes in a different lane and merge to "main" on your remote (learn more on lanes - https://bit.dev/reference/lanes/getting-started-with-lanes)
- Use \`bit tag --build\` to build your components locally.
- Use \`snap\` or \`build\` first to validate your build passing, and then version and export safely.

To undo local tag use the "bit reset" command.`
      );
    }

    const params = {
      ids: patterns,
      snapped,
      unmerged,
      editor,
      message,
      releaseType,
      preReleaseId,
      ignoreIssues,
      ignoreNewestVersion,
      skipTests,
      skipTasks,
      skipAutoTag,
      build,
      soft,
      persist,
      unmodified,
      disableTagAndSnapPipelines,
      ignoreBuildErrors,
      rebuildDepsGraph,
      incrementBy,
      version: ver,
      failFast,
    };

    const results = await this.snapping.tag(params);
    if (!results) return chalk.yellow(persist ? 'no soft-tag found' : NOTHING_TO_TAG_MSG);
    return tagResultOutput(results);
  }
}

export function validateOptions(options: TagParams) {
  const { patch, minor, major, preRelease, increment, prereleaseId } = options;
  if (prereleaseId && (!increment || increment === 'major' || increment === 'minor' || increment === 'patch')) {
    throw new BitError(
      `--prerelease-id should be entered along with --increment flag, while --increment must be one of the following: [prepatch, prerelease, preminor, premajor]`
    );
  }

  const releaseFlags = [patch, minor, major, preRelease].filter((x) => x);
  if (releaseFlags.length > 1) {
    throw new BitError('you can use only one of the following - patch, minor, major, pre-release');
  }

  const getReleaseType = (): ReleaseType => {
    if (increment) {
      if (!RELEASE_TYPES.includes(increment)) {
        throw new BitError(`invalid increment-level "${increment}".
semver allows the following options only: ${RELEASE_TYPES.join(', ')}`);
      }
      return increment;
    }
    if (major) return 'major';
    if (minor) return 'minor';
    if (patch) return 'patch';
    if (preRelease) return 'prerelease';
    return DEFAULT_BIT_RELEASE_TYPE;
  };
  const getPreReleaseId = (): string | undefined => {
    if (prereleaseId) {
      return prereleaseId;
    }
    if (preRelease && typeof preRelease === 'string') {
      return preRelease;
    }
    return undefined;
  };

  return {
    releaseType: getReleaseType(),
    preReleaseId: getPreReleaseId(),
  };
}

export function tagResultOutput(results: TagResults): string {
  const { taggedComponents, autoTaggedResults, warnings, newComponents, removedComponents, exportedIds }: TagResults =
    results;
  const changedComponents = taggedComponents.filter((component) => !newComponents.searchWithoutVersion(component.id));
  const addedComponents = taggedComponents.filter((component) => newComponents.searchWithoutVersion(component.id));
  const autoTaggedCount = autoTaggedResults ? autoTaggedResults.length : 0;

  const warningsOutput = warnings && warnings.length ? `${chalk.yellow(warnings.join('\n'))}\n\n` : '';
  const tagExplanationPersist = exportedIds
    ? ''
    : `\n(use "bit export" to push these components to a remote")
(use "bit reset" to unstage versions)`;
  const tagExplanationSoft = `\n(use "bit tag --persist" to persist the soft-tagged changes as a fully tagged version")
(use "bit reset --soft" to remove the soft-tags)`;

  const tagExplanation = results.isSoftTag ? tagExplanationSoft : tagExplanationPersist;

  const compInBold = (id: ComponentID) => {
    const version = id.hasVersion() ? `@${id.version}` : '';
    return `${chalk.bold(id.toStringWithoutVersion())}${version}`;
  };

  const outputComponents = (comps: ConsumerComponent[]) => {
    return comps
      .map((component) => {
        let componentOutput = `     > ${compInBold(component.id)}`;
        const autoTag = autoTaggedResults.filter((result) => result.triggeredBy.searchWithoutVersion(component.id));
        if (autoTag.length) {
          const autoTagComp = autoTag.map((a) => compInBold(a.component.id));
          componentOutput += `\n       ${AUTO_TAGGED_MSG}:
          ${autoTagComp.join('\n            ')}`;
        }
        return componentOutput;
      })
      .join('\n');
  };

  const publishOutput = () => {
    const { publishedPackages } = results;
    if (!publishedPackages || !publishedPackages.length) return '';
    const successTitle = `\n\n${chalk.green(
      `published the following ${publishedPackages.length} component(s) successfully\n`
    )}`;
    const successCompsStr = publishedPackages.join('\n');
    const successOutput = successCompsStr ? successTitle + successCompsStr : '';
    return successOutput;
  };

  const exportedOutput = () => {
    if (!exportedIds) return '';
    if (!exportedIds.length) return `\n${chalk.yellow('no component has been exported')}\n`;
    const title = `\n${chalk.underline('exported components')}\n`;
    const ids = exportedIds.map((id) => `     > ${compInBold(id)}`).join('\n');
    return `${title}${ids}\n`;
  };

  const softTagPrefix = results.isSoftTag ? 'soft-tagged ' : '';
  const outputIfExists = (label: string, explanation: string, components: ConsumerComponent[]) => {
    if (!components.length) return '';
    return `\n${chalk.underline(softTagPrefix + label)}\n(${explanation})\n${outputComponents(components)}\n`;
  };

  const newDesc = results.isSoftTag
    ? 'set to be tagged with first version for components when persisted'
    : 'first version for components';
  const changedDesc = results.isSoftTag
    ? 'components that are set to get a version bump when persisted'
    : 'components that got a version bump';
  const softTagClarification = results.isSoftTag
    ? chalk.bold(
        '\nkeep in mind that this is a soft-tag (changes recorded to be tagged), to persist the changes use --persist flag'
      )
    : '';
  return (
    outputIfExists('new components', newDesc, addedComponents) +
    outputIfExists('changed components', changedDesc, changedComponents) +
    outputIdsIfExists('removed components', removedComponents) +
    publishOutput() +
    exportedOutput() +
    warningsOutput +
    chalk.green(
      `\n${taggedComponents.length + autoTaggedCount} component(s) ${results.isSoftTag ? 'soft-' : ''}tagged${
        exportedIds ? ' and exported' : ''
      }`
    ) +
    tagExplanation +
    softTagClarification
  );
}

export function outputIdsIfExists(label: string, ids?: ComponentIdList) {
  if (!ids?.length) return '';
  return `\n${chalk.underline(label)}\n${ids.map((id) => id.toStringWithoutVersion()).join('\n')}\n`;
}
