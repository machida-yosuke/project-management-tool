import { beforeEach } from 'vitest';
import { rejectAllRequests } from './helpers/api-mock';

beforeEach(() => {
  rejectAllRequests();
});
