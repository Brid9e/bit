import chai, { expect } from 'chai';
import path from 'path';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('create extension', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  // describe.skip('react template', () => {
  //   let implFilePath;
  //   let testFilePath;
  //   let implContents;
  //   let testContents;
  //   const COMPONENT_NAME = 'foo';
  //   before(() => {
  //     helper.scopeHelper.initHarmonyWorkspace();
  //     helper.fixtures.copyFixtureExtensions('react-create-template');
  //     helper.command.addComponent('react-create-template');
  //     helper.extensions.addExtensionToWorkspace('my-scope/react-create-template', {});
  //     helper.extensions.addExtensionToWorkspace('teambit.generator/generator', { template: 'react-create-template' });
  //     helper.scopeHelper.linkBitLegacy();
  //     helper.command.link();
  //     helper.command.create(COMPONENT_NAME);
  //     const compDir = path.join(helper.scopes.localPath, `components/${COMPONENT_NAME}`);
  //     implFilePath = path.join(compDir, `${COMPONENT_NAME}.js`);
  //     testFilePath = path.join(compDir, `${COMPONENT_NAME}.spec.js`);
  //     implContents = fs.readFileSync(implFilePath).toString();
  //     testContents = fs.readFileSync(testFilePath).toString();
  //   });
  //   it('should create the component files', () => {
  //     expect(implFilePath).to.be.a.file();
  //     expect(testFilePath).to.be.a.file();
  //   });
  //   it('should add the files to bitmap', () => {
  //     const status = helper.command.status();
  //     expect(status).to.have.string('foo');
  //   });
  //   it('should use the template for the files', () => {
  //     expect(implContents).to.have.string(
  //       `export default function ${COMPONENT_NAME}() { console.log('hello react template'); }`
  //     );
  //     expect(testContents).to.have.string(
  //       `export default function ${COMPONENT_NAME}() { console.log('hello react template test'); }`
  //     );
  //   });
  // });
  describe('with --namespace flag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.create('aspect', 'my-aspect', '--namespace ui');
    });
    it('should create the directories properly', () => {
      const compRootDir = path.join(helper.scopes.localPath, helper.scopes.remote, 'ui/my-aspect');
      expect(compRootDir).to.be.a.directory();
      expect(path.join(compRootDir, 'index.ts')).to.be.a.file();
      expect(path.join(compRootDir, 'my-aspect.main.runtime.ts')).to.be.a.file();
      expect(path.join(compRootDir, 'my-aspect.aspect.ts')).to.be.a.file();
    });
    it('should add the component correctly', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('ui/my-aspect');
    });
  });
  describe('name with namespace as part of the name', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.create('aspect', 'ui/my-aspect');
    });
    it('should create the directories properly', () => {
      const compRootDir = path.join(helper.scopes.localPath, helper.scopes.remote, 'ui/my-aspect');
      expect(compRootDir).to.be.a.directory();
      expect(path.join(compRootDir, 'index.ts')).to.be.a.file();
      expect(path.join(compRootDir, 'my-aspect.main.runtime.ts')).to.be.a.file();
      expect(path.join(compRootDir, 'my-aspect.aspect.ts')).to.be.a.file();
    });
    it('should add the component correctly', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('ui/my-aspect');
    });
  });
  describe('name with namespace as part of the name and namespace flag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.create('aspect', 'ui/my-aspect', '--namespace another/level');
    });
    it('should create the directories properly', () => {
      const compRootDir = path.join(helper.scopes.localPath, helper.scopes.remote, 'another/level/ui/my-aspect');
      expect(compRootDir).to.be.a.directory();
      expect(path.join(compRootDir, 'index.ts')).to.be.a.file();
      expect(path.join(compRootDir, 'my-aspect.main.runtime.ts')).to.be.a.file();
      expect(path.join(compRootDir, 'my-aspect.aspect.ts')).to.be.a.file();
    });
    it('should add the component correctly', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('another/level/ui/my-aspect');
    });
  });
});
