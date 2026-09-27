import { env } from 'cloudflare:workers';
import { SELF } from 'cloudflare:test';
import type { Project, ProjectRole } from '@pm-tool/shared';
import { createSession } from '../../src/auth/session';
import { upsertUserByEmail, type UserRecord } from '../../src/auth/users';

export interface TestUser extends UserRecord {
  cookie: string;
}

export async function createUser(label: string): Promise<TestUser> {
  const email = `${label}-${crypto.randomUUID()}@example.com`;
  const user = await upsertUserByEmail(env.DB, { email, name: label });
  const sessionId = await createSession(env.SESSIONS, user);
  return { ...user, cookie: `session_id=${sessionId}` };
}

export function api(
  user: TestUser | null,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (user) headers.cookie = user.cookie;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return SELF.fetch(`http://example.com${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export async function json<T>(res: Response): Promise<T> {
  return res.json<T>();
}

export async function createProjectAs(owner: TestUser, name = 'Project'): Promise<Project> {
  const res = await api(owner, '/api/projects', { method: 'POST', body: { name } });
  if (res.status !== 201) throw new Error(`createProject failed: ${res.status}`);
  return json<Project>(res);
}

export async function addMember(
  admin: TestUser,
  projectId: string,
  member: TestUser,
  role: ProjectRole,
): Promise<void> {
  const invite = await api(admin, `/api/projects/${projectId}/invitations`, {
    method: 'POST',
    body: { email: member.email, role, passcode: '1234' },
  });
  if (invite.status !== 201) throw new Error(`invite failed: ${invite.status}`);
  const { id } = await json<{ id: string }>(invite);
  const accept = await api(member, `/api/invitations/${id}/accept`, {
    method: 'POST',
    body: { passcode: '1234' },
  });
  if (accept.status !== 200) throw new Error(`accept failed: ${accept.status}`);
}

export interface ProjectFixture {
  project: Project;
  admin: TestUser;
  staff: TestUser;
  substaff: TestUser;
  outsider: TestUser;
}

export async function setupProject(): Promise<ProjectFixture> {
  const admin = await createUser('admin');
  const staff = await createUser('staff');
  const substaff = await createUser('substaff');
  const outsider = await createUser('outsider');
  const project = await createProjectAs(admin);
  await addMember(admin, project.id, staff, 'staff');
  await addMember(admin, project.id, substaff, 'substaff');
  return { project, admin, staff, substaff, outsider };
}
