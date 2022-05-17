import { useRouteMatch } from 'react-router-dom';
import { ComponentID } from '@teambit/component-id';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { useLanesContext } from '@teambit/lanes.ui.lanes';
import { ComponentModel } from './component-model';
import { ComponentError } from './component-error';
import { useComponentQuery } from './use-component-query';

export type Component = {
  component?: ComponentModel;
  error?: ComponentError;
  componentDescriptor?: ComponentDescriptor;
  loading?: boolean;
};

type ComponentRoute = {
  componentId?: string;
};

export function useComponent(host: string, id?: ComponentID): Component {
  const {
    params: { componentId },
  } = useRouteMatch<ComponentRoute>();
  const query = useQuery();
  const version = id?.version || query.get('version') || undefined;
  const lanesContext = useLanesContext();
  const targetId = id?.toString({ ignoreVersion: true }) || componentId;
  if (!targetId) throw new TypeError('useComponent received no component id');
  const currentLane = lanesContext?.viewedLane;
  // when on a lane, always fetch all the logs starting from the 'head' version
  const laneComponentId = lanesContext?.viewedLane?.components.find(
    (component) => component.id.fullName === targetId
  )?.id;

  const componentIdStr = laneComponentId ? laneComponentId?.toString() : withVersion(targetId, version);

  const logFilters = currentLane
    ? {
        log: {
          logHead: laneComponentId?.version,
        },
      }
    : undefined;

  return useComponentQuery(componentIdStr, host, logFilters);
}

function withVersion(id: string, version?: string) {
  if (!version) return id;
  if (id.includes('@')) return id;
  return `${id}@${version}`;
}
