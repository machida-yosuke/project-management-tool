import { vi } from 'vitest';
import type { Project, ProjectInvitation, ProjectMember, Task, UserSummary } from '@pm-tool/shared';

export const API_BASE = 'https://localhost:8787';

type Handler = (body: unknown) => Response | Promise<Response>;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

// Routes are keyed as "METHOD /path"; an unmatched request fails the test loudly.
export function stubApi(routes: Record<string, Handler | Response>) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = input.startsWith(API_BASE) ? input.slice(API_BASE.length) : input;
    const route = routes[`${method} ${path}`];
    if (!route) {
      throw new Error(`Unexpected request: ${method} ${path}`);
    }
    if (route instanceof Response) {
      return route.clone();
    }
    const rawBody = init?.body;
    const body =
      typeof rawBody === 'string'
        ? (JSON.parse(rawBody) as unknown)
        : rawBody instanceof FormData
          ? rawBody
          : undefined;
    return route(body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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
    description: '',
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
    description: '',
    status: 'open',
    assignee: null,
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
