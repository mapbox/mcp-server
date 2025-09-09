import { BaseResource } from './BaseResource.js';
import { TestResourcesResource } from './test-resources-resource/TestResourcesResource.js';

const resources: BaseResource[] = [new TestResourcesResource()];

export function getAllResources(): BaseResource[] {
  return resources;
}
