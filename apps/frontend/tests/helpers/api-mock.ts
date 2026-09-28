import { vi } from 'vitest';
import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  emptyRichTextDoc,
  type Project,
  type ProjectInvitation,
  type ProjectMember,
  type Task,
  type UserSummary,
} from '@pm-tool/shared';
import { axiosInstance } from '../../src/lib/api';

export const API_BASE = 'https://localhost:8787';

type Handler = (body: unknown) => Response | Promise<Response>;

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function setAdapter(adapter: AxiosAdapter) {
  axiosInstance.defaults.adapter = adapter;
}

export function rejectAllRequests() {
  setAdapter((config) => {
    const { method, path } = describeRequest(config);
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
}

function describeRequest(config: InternalAxiosRequestConfig): RecordedRequest {
  const method = (config.method ?? 'get').toUpperCase();
  const url = config.url ?? '';
  const base = url.startsWith(API_BASE) ? url.slice(API_BASE.length) : url;
  const query = new URLSearchParams();
  const params: unknown = config.params;
  if (typeof params === 'object' && params !== null) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.append(key, String(value));
    }
  }
  const search = query.toString();
  const path = search ? `${base}?${search}` : base;
  const raw: unknown = config.data;
  const body =
    typeof raw === 'string'
      ? (JSON.parse(raw) as unknown)
      : raw instanceof FormData
        ? raw
        : undefined;
  return { method, path, body };
}

// Mirrors axios' internal `settle` so interceptors see the same AxiosError shape as a real adapter.
async function toAxiosResponse(
  res: Response,
  config: InternalAxiosRequestConfig,
): Promise<AxiosResponse> {
  const response: AxiosResponse = {
    data: await res.text(),
    status: res.status,
    statusText: res.statusText,
    headers: new AxiosHeaders(Object.fromEntries(res.headers.entries())),
    config,
  };
  if (config.validateStatus && !config.validateStatus(res.status)) {
    throw new AxiosError(
      `Request failed with status code ${res.status}`,
      res.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      null,
      response,
    );
  }
  return response;
}

// Routes are keyed as "METHOD /path"; an unmatched request fails the test loudly.
export function stubApi(routes: Record<string, Handler | Response>) {
  const requests = vi.fn((request: RecordedRequest) => request);
  setAdapter(async (config) => {
    const request = requests(describeRequest(config));
    const route = routes[`${request.method} ${request.path}`];
    if (!route) {
      throw new Error(`Unexpected request: ${request.method} ${request.path}`);
    }
    const res = route instanceof Response ? route.clone() : await route(request.body);
    return toAxiosResponse(res, config);
  });
  return requests;
}

export const alice: UserSummary = {
  id: 'u-alice',
  email: 'alice@example.com',
  name: 'Alice',
  avatarUrl: null,
};
export const bob: UserSummary = {
  id: 'u-bob',
  email: 'bob@example.com',
  name: 'Bob',
  avatarUrl: null,
};

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Project One',
    description: emptyRichTextDoc(),
    ownerId: alice.id,
    role: 'admin',
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    projectId: 'p1',
    title: 'Write spec',
    description: emptyRichTextDoc(),
    descriptionEditedAt: null,
    status: 'open',
    assignee: null,
    startDate: null,
    endDate: null,
    color: 'gray',
    archivedAt: null,
    createdBy: alice,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeMember(
  user: UserSummary,
  overrides: Partial<ProjectMember> = {},
): ProjectMember {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: 'staff',
    isOwner: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeInvitation(overrides: Partial<ProjectInvitation> = {}): ProjectInvitation {
  return {
    id: 'inv1',
    projectId: 'p2',
    projectName: 'Invited Project',
    email: bob.email,
    role: 'staff',
    invitedBy: alice,
    expiresAt: '2026-10-01T00:00:00.000Z',
    createdAt: '2026-09-24T00:00:00.000Z',
    ...overrides,
  };
}
