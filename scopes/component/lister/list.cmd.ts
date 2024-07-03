import { Command, CommandOptions } from '@teambit/cli';
import { isEmpty } from 'lodash';
import chalk from 'chalk';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { listTemplate } from './list-template';
import { ListerMain, ListScopeResult } from './lister.main.runtime';

type ListFlags = {
  ids?: boolean;
  scope?: boolean;
  json?: boolean;
  outdated?: boolean;
  namespace?: string;
};

export class ListCmd implements Command {
  name = 'list [remote-scope]';
  description = 'list components on a workspace or a remote scope (with flag).';
  group = 'discover';
  helpUrl = 'reference/reference/cli-reference#list';
  alias = 'ls';
  options = [
    ['i', 'ids', 'show only component ids, unformatted'],
    ['s', 'scope', 'show only components stored in the local scope, including indirect dependencies'],
    ['o', 'outdated', 'highlight outdated components, in comparison with their latest remote version (if one exists)'],
    ['j', 'json', 'show the output in JSON format'],
    ['n', 'namespace <string>', "show only components in the specified namespace/s e.g. '-n ui' or '*/ui'"],
  ] as CommandOptions;
  loader = true;
  skipWorkspace = true;
  remoteOp = true;

  constructor(private lister: ListerMain) {}

  async report([scopeName]: string[], listFlags: ListFlags) {
    const listScopeResults = await this.getListResults(scopeName, listFlags);

    const { ids, outdated = false } = listFlags;

    function decideHeaderSentence() {
      if (!scopeName) return `found ${listScopeResults.length} components\n`;
      return chalk.white(`found ${listScopeResults.length} components in ${chalk.bold(scopeName)}\n`);
    }

    if (isEmpty(listScopeResults)) {
      return chalk.white(decideHeaderSentence());
    }

    if (ids) return JSON.stringify(listScopeResults.map((result) => result.id.toString()));
    // TODO - use a cheaper list for ids flag (do not fetch versions at all) @!IMPORTANT
    return decideHeaderSentence() + listTemplate(listScopeResults, false, outdated);
  }

  async json([scopeName]: string[], listFlags: ListFlags) {
    const listScopeResults = await this.getListResults(scopeName, listFlags);

    if (isEmpty(listScopeResults)) {
      return [];
    }

    const { ids, outdated = false } = listFlags;
    if (ids) return listScopeResults.map((result) => result.id.toString());
    return listTemplate(listScopeResults, true, outdated) as Record<string, any>;
  }

  private async getListResults(
    scopeName?: string,
    { namespace, scope, outdated }: ListFlags = {}
  ): Promise<ListScopeResult[]> {
    const getNamespaceWithWildcard = () => {
      if (!namespace) return undefined;
      if (hasWildcard(namespace)) return namespace;
      return `${namespace}/*`;
    };
    const namespacesUsingWildcards = getNamespaceWithWildcard();

    return scopeName
      ? this.lister.remoteList(scopeName, { namespacesUsingWildcards })
      : this.lister.localList(scope, outdated, namespacesUsingWildcards);
  }
}
