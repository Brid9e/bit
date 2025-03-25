import chai, { expect } from 'chai';
import path from 'path';
import { Modules, readModulesManifest } from '@pnpm/modules-yaml';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import rimraf from 'rimraf';
import { Extensions } from '@teambit/legacy.constants';
import { Helper, fixtures, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('dependency-resolver extension', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('policies changes', function () {
    describe('policies added by the user', function () {
      let barFooOutput;
      let isTypeOutput;

      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.fixtures.createComponentUtilsIsType();
        helper.fs.outputFile(path.join('utils', 'is-type.js'), fixtures.isType);
        helper.command.addComponent('utils', { i: 'utils/is-type' });
        const depResolverConfig = {
          policy: {
            dependencies: {
              'lodash.get': '4.0.0',
            },
            devDependencies: {
              'lodash.words': '4.0.0',
            },
            peerDependencies: {
              'lodash.set': '4.0.0',
            },
          },
        };
        helper.extensions.addExtensionToVariant('bar', 'teambit.dependencies/dependency-resolver', depResolverConfig);
        barFooOutput = helper.command.showComponentParsed('bar/foo');
        isTypeOutput = helper.command.showComponentParsed('utils/is-type');
      });
      it('should have the updated dependencies for bar/foo', function () {
        expect(barFooOutput.packageDependencies).to.have.property('lodash.get', '4.0.0');
        expect(barFooOutput.devPackageDependencies).to.have.property('lodash.words', '4.0.0');
        expect(barFooOutput.peerPackageDependencies).to.have.property('lodash.set', '4.0.0');
      });
      it('should not put the dependencies for not configured component', function () {
        expect(isTypeOutput.packageDependencies).to.not.have.key('lodash.get');
        expect(isTypeOutput.devPackageDependencies).to.not.have.key('lodash.words');
        expect(isTypeOutput.peerPackageDependencies).to.not.have.key('lodash.set');
      });
    });
    // TODO: implement once we can extend a specific env with new methods (to apply config changes)
    // and maybe to also apply custom compiler which add deps
    describe('policies added by an env', function () {
      let barFooOutput;
      describe('policies added core env', function () {
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.fixtures.createComponentBarFoo();
          helper.fixtures.addComponentBarFoo();
          // TODO: use custom env with versions provided from outside in the config by the user
          helper.extensions.addExtensionToVariant('bar', 'teambit.react/react', {});
          barFooOutput = helper.command.showComponentParsed('bar/foo');
        });
        it('should have the updated dependencies for bar/foo from the env', function () {
          expect(barFooOutput.peerPackageDependencies).to.have.property('react', '^16.8.0 || ^17.0.0');
          expect(barFooOutput.devPackageDependencies).to.have.property('@types/react', '^17.0.8');
        });
      });
      describe('policies added by custom env', function () {
        let utilsIsTypeOutput;
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.fixtures.createComponentBarFoo('import "lodash.zip"');
          helper.fixtures.addComponentBarFoo();
          helper.fixtures.createComponentUtilsIsType();
          helper.fs.outputFile('utils/is-type.js', fixtures.isType);
          helper.command.addComponent('utils', { i: 'utils/is-type' });
          // important! don't disable the preview.
          helper.workspaceJsonc.addDefaultScope();
          const envName = helper.env.setCustomEnv('env-add-dependencies');
          const envId = `${helper.scopes.remote}/${envName}`;
          helper.extensions.addExtensionToVariant('*', envId);
          helper.command.install('lodash.zip lodash.get');
          helper.command.compile();
          barFooOutput = helper.command.showComponentParsed('bar/foo');
          utilsIsTypeOutput = helper.command.showComponentParsed('utils/is-type');
        });
        it('should have the updated dependencies for bar/foo from the env', function () {
          expect(barFooOutput.devPackageDependencies).to.have.property('lodash.get', '4.4.2');
        });
        describe('auto detect peers policy', function () {
          it('should resolve version for auto detected peers when used by the component from the env', () => {
            expect(barFooOutput.peerPackageDependencies).to.have.property('lodash.zip', '^4.0.0');
          });
          it('should not add peers when component is not using them', () => {
            expect(utilsIsTypeOutput.peerPackageDependencies).to.not.have.property('lodash.zip');
          });
        });
      });
    });
    describe('policies added by extension', function () {
      const EXTENSIONS_BASE_FOLDER = 'extension-add-dependencies';
      const config = {};
      before(() => {
        helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.fixtures.createComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
        helper.command.addComponent('utils', { i: 'utils/is-type' });
      });

      describe('extension that add simple dependency policy', function () {
        let barFooOutput;
        let isTypeOutput;

        before(() => {
          helper.fixtures.copyFixtureExtensions(EXTENSIONS_BASE_FOLDER);
          helper.command.addComponent(EXTENSIONS_BASE_FOLDER);
          helper.npm.installNpmPackage('@teambit/harmony');
          helper.extensions.addExtensionToVariant('bar', 'my-scope/extension-add-dependencies', config);
          helper.extensions.addExtensionToVariant(EXTENSIONS_BASE_FOLDER, 'teambit.harmony/aspect');
          helper.command.install();
          helper.command.compile();
          barFooOutput = helper.command.showComponentParsed('bar/foo');
          isTypeOutput = helper.command.showComponentParsed('utils/is-type');
        });
        it('should have the updated dependencies for bar/foo', function () {
          expect(barFooOutput.packageDependencies).to.have.property('lodash.get', '4.0.0');
          expect(barFooOutput.devPackageDependencies).to.have.property('lodash.words', '4.0.0');
          expect(barFooOutput.peerPackageDependencies).to.have.property('lodash.set', '4.0.0');
        });
        it('should not put the dependencies for not configured component', function () {
          expect(isTypeOutput.packageDependencies).to.not.have.key('lodash.get');
          expect(isTypeOutput.devPackageDependencies).to.not.have.key('lodash.words');
          expect(isTypeOutput.peerPackageDependencies).to.not.have.key('lodash.set');
        });
      });
      describe.skip('conflict between few extensions policies', function () {
        it.skip('should merge them', function () {});
      });
      describe.skip('conflict between extension and user policies ', function () {
        it.skip('should prefer user config', function () {});
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('saving dependencies package names', function () {
    let npmCiRegistry: NpmCiRegistry;
    let randomStr;
    before(async () => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();

      npmCiRegistry = new NpmCiRegistry(helper);
      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `react.${randomStr}.{name}`;
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      helper.fixtures.populateComponents(4);

      await npmCiRegistry.init();

      helper.command.tagAllComponents();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    it('should save the packageName data into the dependencyResolver extension in the model', () => {
      const comp2 = helper.command.catComponent('comp2@latest');
      const depResolverExt = comp2.extensions.find((e) => e.name === Extensions.dependencyResolver);
      expect(depResolverExt).to.be.ok;
      expect(depResolverExt.data).to.have.property('dependencies');
      // some of the entries are @types/jest, @types/node, @babel/runtime coming from the node env
      expect(depResolverExt.data.dependencies).to.have.lengthOf(3);
      expect(depResolverExt.data.dependencies[0].componentId.name).to.equal('comp3');
      expect(depResolverExt.data.dependencies[0].componentId.version).to.equal('0.0.1');
      expect(depResolverExt.data.dependencies[0].packageName).to.equal(`react.${randomStr}.comp3`);
    });
    describe('exporting the component', () => {
      before(() => {
        helper.command.export();
      });
      it('should change the component id to include the scope name', () => {
        const comp2 = helper.command.catComponent('comp2@latest');
        const depResolverExt = comp2.extensions.find((e) => e.name === Extensions.dependencyResolver);
        expect(depResolverExt.data.dependencies[0].componentId.scope).to.equal(helper.scopes.remote);
        expect(depResolverExt.data.dependencies[0].componentId.version).to.equal('0.0.1');
        expect(depResolverExt.data.dependencies[0].componentId.name).to.equal('comp3');
        expect(depResolverExt.data.dependencies[0].packageName).to.equal(`react.${randomStr}.comp3`);
      });
    });
  });
  describe('overrides', function () {
    // This is the dependency graph that the overrides will modify:
    // is-odd 1.0.0
    // └─┬ is-number 3.0.0
    //   └─┬ kind-of 3.2.2
    //     └── is-buffer 1.1.6
    // rimraf 3.0.2
    // └─┬ glob 7.2.0
    //   ├── fs.realpath 1.0.0
    //   ├─┬ inflight 1.0.6
    //   │ ├─┬ once 1.4.0
    //   │ │ └── wrappy 1.0.2
    //   │ └── wrappy 1.0.2
    //   ├── inherits 2.0.4
    //   ├─┬ minimatch 3.0.4
    //   │ └─┬ brace-expansion 1.1.11
    //   │   ├── balanced-match 1.0.2
    //   │   └── concat-map 0.0.1
    //   ├─┬ once 1.4.0
    //   │ └── wrappy 1.0.2
    //   └── path-is-absolute 1.0.1
    describe('using Yarn as a package manager', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('packageManager', 'teambit.dependencies/yarn');
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('overrides', {
          'is-odd': '1.0.0',
          'glob@^7.1.3': '6.0.4',
          'inflight>once': '1.3.0',
        });
        helper.command.install('is-even@0.1.2 rimraf@3.0.2');
      });
      it('should force a newer version of a subdependency using just the dependency name', function () {
        // Without the override, is-odd would be 0.1.2
        expect(helper.fixtures.fs.readJsonFile('node_modules/is-even/node_modules/is-odd/package.json').version).to.eq(
          '1.0.0'
        );
      });
      it('should force a newer version of a subdependency using the dependency name and version', function () {
        expect(helper.fixtures.fs.readJsonFile('node_modules/rimraf/node_modules/glob/package.json').version).to.eq(
          '6.0.4'
        );
      });
      it('should not change the version of the package if the parent package does not match the pattern', function () {
        expect(
          helper.fixtures.fs.readJsonFile('node_modules/rimraf/node_modules/glob/node_modules/once/package.json')
            .version
        ).to.eq('1.4.0');
      });
      it('should change the version of the package if the parent package matches the pattern', function () {
        // This gets hoisted from the dependencies of inflight
        expect(helper.fixtures.fs.readJsonFile('node_modules/rimraf/node_modules/once/package.json').version).to.eq(
          '1.3.0'
        );
      });
    });
    describe('using pnpm as a package manager', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('packageManager', 'teambit.dependencies/pnpm');
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('overrides', {
          'is-odd': '1.0.0',
          'glob@^7.1.3': '6.0.4',
          'inflight>once': '1.3.0',
        });
        helper.command.install('is-even@0.1.2 rimraf@3.0.2');
      });
      it('should force a newer version of a subdependency using just the dependency name', function () {
        // Without the override, is-odd would be 0.1.2
        expect(
          helper.fixtures.fs.readJsonFile('node_modules/.pnpm/is-odd@1.0.0/node_modules/is-odd/package.json').version
        ).to.eq('1.0.0');
      });
      it('should force a newer version of a subdependency using the dependency name and version', function () {
        expect(
          helper.fixtures.fs.readJsonFile('node_modules/.pnpm/glob@6.0.4/node_modules/glob/package.json').version
        ).to.eq('6.0.4');
      });
      it('should not change the version of the package if the parent package does not match the pattern', function () {
        expect(
          helper.fixtures.fs.readJsonFile('node_modules/.pnpm/glob@6.0.4/node_modules/once/package.json').version
        ).to.eq('1.4.0');
      });
      it('should change the version of the package if the parent package matches the pattern', function () {
        expect(
          helper.fixtures.fs.readJsonFile('node_modules/.pnpm/inflight@1.0.6/node_modules/once/package.json').version
        ).to.eq('1.3.0');
      });
    });
  });
  describe('hoist patterns', function () {
    let modulesState: Modules | null;
    before(async () => {
      helper = new Helper();
      helper.scopeHelper.reInitWorkspace();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/pnpm`);
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('hoistPatterns', ['hoist-pattern']);
      helper.fixtures.populateComponents(1);
      helper.command.install('is-positive');
      modulesState = await readModulesManifest(path.join(helper.fixtures.scopes.localPath, 'node_modules'));
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should run pnpm with the specified hoist pattern', () => {
      expect(modulesState?.hoistPattern).to.deep.eq(['hoist-pattern', `!@${helper.scopes.remote}/comp1`]);
    });
    describe('hoist injected dependencies', function () {
      before(async () => {
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('hoistInjectedDependencies', true);
        rimraf.sync(path.join(helper.fixtures.scopes.localPath, 'node_modules'));
        helper.command.install();
        modulesState = await readModulesManifest(path.join(helper.fixtures.scopes.localPath, 'node_modules'));
      });
      it('should run pnpm with the specified hoist pattern', () => {
        expect(modulesState?.hoistPattern).to.deep.eq(['hoist-pattern']);
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('env.jsonc with policy.peer version="+"', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();

      helper.fixtures.populateComponents(1);
      helper.command.tagAllComponents();
      helper.env.setEmptyEnv();
      helper.fs.outputFile('empty-env/env.jsonc', `{
  "policy": {
    "peers": [
      {
        "name": "${helper.general.getPackageNameByCompName('comp1')}",
        "version": "+",
        "supportedRange": "^0.0.1"
      }
    ]
  }
}
`);
      helper.command.tagAllComponents(); // it'll tag only empty-env.
      helper.command.export();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    function validateDepData(expectedVersion: string) {
      const comp = helper.command.catComponent(`${helper.scopes.remote}/empty-env@latest`);
      const depResolverExt = comp.extensions.find((e) => e.name === Extensions.dependencyResolver);
      const policy = depResolverExt.data.policy.find(p => p.dependencyId === helper.general.getPackageNameByCompName('comp1'));
      expect(policy.value.version).to.equal('+');
      const data =  depResolverExt.data.dependencies.find(p => p.packageName === helper.general.getPackageNameByCompName('comp1'));
      expect(data.version).to.equal(expectedVersion);
      expect(data.componentId.version).to.equal(expectedVersion);
    }
    it('should not break and save the policy correctly with the plus', () => {
      validateDepData('0.0.1');
    });
    describe('making a new version of the env dep', () => {
      before(() => {
        helper.command.tagAllComponents('--unmodified');
        helper.command.export();
      });
      it('should update the dep in the env model', () => {
        validateDepData('0.0.2');
      });
      it('should be able to install the env on a new workspace with no errors', () => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.install(helper.general.getPackageNameByCompName('empty-env'));
        const pkgJson = helper.fs.readJsonFile(`node_modules/${helper.general.getPackageNameByCompName('empty-env')}/package.json`);
        expect(pkgJson.dependencies[`${helper.general.getPackageNameByCompName('comp1')}`]).to.equal('0.0.2');
      });
      // this is an important test. in case the env is imported without the dep, it is unable to resolve the dep-version
      // from the local workspace and it falls back to other strategies, in this case, to the version from the model.
      it('should be able to import the env on a new workspace and tag with no errors', () => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent(`empty-env`);
        helper.command.tagAllComponents('--unmodified');
        validateDepData('0.0.2');
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('env.jsonc with policy.peer version="*"', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();

      helper.fixtures.populateComponents(1);
      helper.command.tagAllComponents();
      helper.env.setEmptyEnv();
      helper.fs.outputFile('empty-env/env.jsonc', `{
  "policy": {
    "peers": [
      {
        "name": "${helper.general.getPackageNameByCompName('comp1')}",
        "version": "*",
        "supportedRange": "*"
      }
    ]
  }
}
`);
      helper.command.tagAllComponents(); // it'll tag only empty-env.
      helper.command.export();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    function validateDepData(expectedVersion: string) {
      const comp = helper.command.catComponent(`${helper.scopes.remote}/empty-env@latest`);
      const depResolverExt = comp.extensions.find((e) => e.name === Extensions.dependencyResolver);
      const policy = depResolverExt.data.policy.find(p => p.dependencyId === helper.general.getPackageNameByCompName('comp1'));
      expect(policy.value.version).to.equal('*');
      const data =  depResolverExt.data.dependencies.find(p => p.packageName === helper.general.getPackageNameByCompName('comp1'));
      expect(data.version).to.equal(expectedVersion);
      expect(data.componentId.version).to.equal(expectedVersion);
    }
    it('should not break and save the policy correctly with the *', () => {
      validateDepData('0.0.1');
    });
    describe('making a new version of the env dep', () => {
      before(() => {
        helper.command.tagAllComponents('--unmodified');
        helper.command.export();
      });
      it('should update the dep in the env model', () => {
        validateDepData('0.0.2');
      });
      it('should be able to install the env on a new workspace with no errors', () => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.install(helper.general.getPackageNameByCompName('empty-env'));
        const pkgJson = helper.fs.readJsonFile(`node_modules/${helper.general.getPackageNameByCompName('empty-env')}/package.json`);
        expect(pkgJson.dependencies[`${helper.general.getPackageNameByCompName('comp1')}`]).to.equal('0.0.2');
      });
    });
  });
});
