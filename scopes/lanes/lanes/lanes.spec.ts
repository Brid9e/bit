import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import SnappingAspect, { SnappingMain } from '@teambit/snapping';
import { ExportAspect, ExportMain } from '@teambit/export';
import { LaneId } from '@teambit/lane-id';
import { SUPPORT_LANE_HISTORY, addFeature, removeFeature } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents, modifyMockedComponents } from '@teambit/component.testing.mock-components';
import { ChangeType } from '@teambit/lanes.entities.lane-diff';
import { LanesAspect } from './lanes.aspect';
import { LanesMain } from './lanes.main.runtime';

describe('LanesAspect', function () {
  describe('getLanes()', () => {
    let lanes: LanesMain;
    let workspaceData: WorkspaceData;
    beforeAll(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');
    }, 30000);
    afterAll(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should list all lanes', async () => {
      const currentLanes = await lanes.getLanes({});
      expect(currentLanes.length).toEqual(1);
      expect(currentLanes[0].name).toEqual('stage');
    });
  });

  describe('isLaneUpToDate', () => {
    let lanes: LanesMain;
    let snapping: SnappingMain;
    let workspaceData: WorkspaceData;
    beforeAll(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      snapping = await loadAspect(SnappingAspect, workspacePath);
      await snapping.tag({ ids: ['comp1'], build: false, ignoreIssues: 'MissingManuallyConfiguredPackages' });
      const exporter: ExportMain = await loadAspect(ExportAspect, workspacePath);
      await exporter.export();
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');
      await modifyMockedComponents(workspacePath, 'v2');
      const result = await snapping.snap({
        pattern: 'comp1',
        build: false,
        ignoreIssues: 'MissingManuallyConfiguredPackages',
      });
      // intermediate step, make sure it is snapped
      expect(result?.snappedComponents.length).toEqual(1);
    }, 30000);
    afterAll(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should return that the lane is up to date when the lane is ahead of main', async () => {
      const currentLane = await lanes.getCurrentLane();
      if (!currentLane) throw new Error('unable to get the current lane');
      const isUpToDate = (
        await lanes.diffStatus(currentLane.toLaneId(), undefined, { skipChanges: true })
      ).componentsStatus.every((c) => c.upToDate);

      expect(isUpToDate).toEqual(true);
    });
    it('should return that the lane is not up to date when main is ahead', async () => {
      const currentLane = await lanes.getCurrentLane();
      if (!currentLane) throw new Error('unable to get the current lane');
      await lanes.switchLanes('main', { skipDependencyInstallation: true });
      await snapping.snap({
        pattern: 'comp1',
        build: false,
        unmodified: true,
        ignoreIssues: 'MissingManuallyConfiguredPackages',
      });
      const isUpToDate = (
        await lanes.diffStatus(currentLane.toLaneId(), undefined, { skipChanges: true })
      ).componentsStatus.every((c) => c.upToDate);

      expect(isUpToDate).toEqual(false);
    });
  });

  describe('laneDiff', () => {
    let lanes: LanesMain;
    let snapping: SnappingMain;
    let workspaceData: WorkspaceData;
    beforeAll(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      snapping = await loadAspect(SnappingAspect, workspacePath);
      await snapping.tag({ ids: ['comp1'], build: false });
      const exporter: ExportMain = await loadAspect(ExportAspect, workspacePath);
      await exporter.export();
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');
      const result = await snapping.snap({ pattern: 'comp1', build: false, unmodified: true });
      // intermediate step, make sure it is snapped
      expect(result?.snappedComponents.length).toEqual(1);
    }, 30000);
    afterAll(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should return that the lane is up to date when the lane is ahead of main', async () => {
      const currentLane = await lanes.getCurrentLane();
      if (!currentLane) throw new Error('unable to get the current lane');
      const laneDiffResults = await lanes.diffStatus(currentLane.toLaneId());
      expect(laneDiffResults.componentsStatus[0].upToDate).toEqual;
      expect(laneDiffResults.componentsStatus[0].changeType).toEqual(ChangeType.NONE);
    });
    it('should return that the lane is not up to date when main is ahead', async () => {
      const currentLane = await lanes.getCurrentLane();
      if (!currentLane) throw new Error('unable to get the current lane');
      await lanes.switchLanes('main', { skipDependencyInstallation: true });
      await snapping.snap({ pattern: 'comp1', build: false, unmodified: true });

      const laneDiffResults = await lanes.diffStatus(currentLane.toLaneId());
      expect(laneDiffResults.componentsStatus[0].upToDate).toEqual(false);
      expect(laneDiffResults.componentsStatus[0].changeType).toEqual(ChangeType.NONE);
    });
  });

  describe('restoreLane()', () => {
    let lanes: LanesMain;
    let workspaceData: WorkspaceData;
    beforeAll(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');

      // as an intermediate step, make sure the lane was created
      const currentLanes = await lanes.getLanes({});
      expect(currentLanes.length).toEqual(1);

      await lanes.switchLanes('main', { skipDependencyInstallation: true });
      await lanes.removeLanes(['stage']);

      // as an intermediate step, make sure the lane was removed
      const lanesAfterDelete = await lanes.getLanes({});
      expect(lanesAfterDelete.length).toEqual(0);

      await lanes.restoreLane(currentLanes[0].hash);
    }, 30000);
    afterAll(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should restore the deleted lane', async () => {
      const currentLanes = await lanes.getLanes({});
      expect(currentLanes.length).toEqual(1);
      expect(currentLanes[0].id.name).toEqual('stage');
    });
    describe('delete restored lane', () => {
      let output: string[];
      beforeAll(async () => {
        output = await lanes.removeLanes(['stage']);
      });
      it('should not throw', () => {
        expect(output.length).toEqual(1);
      });
    });
  });

  describe('restore lane when an existing lane has the same id', () => {
    let lanes: LanesMain;
    let workspaceData: WorkspaceData;
    let laneHash: string;
    beforeAll(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');

      // as an intermediate step, make sure the lane was created
      const currentLanes = await lanes.getLanes({});
      expect(currentLanes.length).toEqual(1);

      await lanes.switchLanes('main', { skipDependencyInstallation: true });
      await lanes.removeLanes(['stage']);

      await lanes.createLane('stage');
      laneHash = currentLanes[0].hash;
    }, 30000);
    afterAll(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should throw when restoring the lane', async () => {
      let error: Error | undefined;
      try {
        await lanes.restoreLane(laneHash);
      } catch (err: any) {
        error = err;
      }
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toMatch(/unable to restore lane/);
    });
  });

  describe('lane history', () => {
    let lanes: LanesMain;
    let workspaceData: WorkspaceData;
    let snapping: SnappingMain;
    let laneId: LaneId;
    beforeAll(async () => {
      addFeature(SUPPORT_LANE_HISTORY);
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');
      snapping = await loadAspect(SnappingAspect, workspacePath);
      const currentLaneId = lanes.getCurrentLaneId();
      if (!currentLaneId) throw new Error('unable to get the current lane-id');
      laneId = currentLaneId;
    }, 30000);
    afterAll(async () => {
      removeFeature(SUPPORT_LANE_HISTORY);
      await destroyWorkspace(workspaceData);
    });
    it('should create lane history object when creating a new lane', async () => {
      const laneHistory = await lanes.getLaneHistory(laneId);
      const history = laneHistory.getHistory();
      expect(Object.keys(history).length).toEqual(1);
    });
    it('should add a record to LaneHistory when snapping', async () => {
      const results = await snapping.snap({ pattern: 'comp1', build: false, message: 'first snap' });
      const laneHistory = await lanes.getLaneHistory(laneId);
      const history = laneHistory.getHistory();
      expect(Object.keys(history).length).toEqual(2);
      const snapHistory = history[Object.keys(history)[1]];
      expect(snapHistory.log.message).toEqual('snap (first snap)');
      expect(snapHistory.components.length).toEqual(1);
      expect(snapHistory.components[0]).toEqual(results?.snappedComponents[0].id.toString() as string);
    });
    describe('import to another workspace', () => {
      let newWorkspace: WorkspaceData;
      beforeAll(async () => {
        // make another snap to check to test the checkout later.
        await snapping.snap({ pattern: 'comp1', build: false, message: 'second snap' });
        const laneHistory = await lanes.getLaneHistory(laneId);
        const history = laneHistory.getHistory();
        expect(Object.keys(history).length).toEqual(3);

        const exporter: ExportMain = await loadAspect(ExportAspect, workspaceData.workspacePath);
        const exportResults = await exporter.export();
        expect(exportResults.componentsIds.length).toEqual(1);
        expect(exportResults.exportedLanes.length).toEqual(1);

        newWorkspace = mockWorkspace({ bareScopeName: workspaceData.remoteScopeName });

        lanes = await loadAspect(LanesAspect, newWorkspace.workspacePath);
        await lanes.switchLanes(laneId.toString(), { skipDependencyInstallation: true, getAll: true });
        await lanes.importLaneObject(laneId, true, true);
      }, 30000);
      afterAll(async () => {
        await destroyWorkspace(newWorkspace);
      });
      it('should not add a record to the lane-history', async () => {
        const laneHistory = await lanes.getLaneHistory(laneId);
        const history = laneHistory.getHistory();
        expect(Object.keys(history).length).toEqual(3);
      });
      it('should be able to checkout to a previous state of the lane', async () => {
        const laneHistory = await lanes.getLaneHistory(laneId);
        const history = laneHistory.getHistory();
        const snapHistoryId = Object.keys(history).find((key) => history[key].log.message?.includes('first snap'));
        if (!snapHistoryId) throw new Error('unable to find snap history of the first snap');
        const results = await lanes.checkoutHistory(snapHistoryId, { skipDependencyInstallation: true });
        expect(results.components?.length).toEqual(1);
        expect(results.failedComponents?.length).toEqual(0);
      });
    });
  });
});
