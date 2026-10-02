import { sqliteTable, text, integer, primaryKey, unique, index } from 'drizzle-orm/sqlite-core';
import { PROJECT_ROLES, TASK_STATUSES } from '@pm-tool/shared';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarKey: text('avatar_key'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Millisecond precision so rows created in quick succession still sort by creation time.
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const projectMembers = sqliteTable(
  'project_members',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: PROJECT_ROLES }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index('project_members_user_id_idx').on(t.userId),
  ],
);

export const projectInvitations = sqliteTable(
  'project_invitations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role', { enum: PROJECT_ROLES }).notNull(),
    passcodeHash: text('passcode_hash').notNull(),
    passcodeSalt: text('passcode_salt').notNull(),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => users.id),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    unique('project_invitations_project_email_unique').on(t.projectId, t.email),
    index('project_invitations_email_idx').on(t.email),
  ],
);

export const taskLabels = sqliteTable(
  'task_labels',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [unique('task_labels_project_name_unique').on(t.projectId, t.name)],
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // Rich text docs are stored as JSON; rows written before that hold plain text.
    description: text('description').notNull().default(''),
    descriptionEditedAt: integer('description_edited_at', { mode: 'timestamp_ms' }),
    status: text('status', { enum: TASK_STATUSES }).notNull().default('open'),
    assigneeId: text('assignee_id').references(() => users.id),
    // Calendar dates as 'YYYY-MM-DD' so lexical comparison matches chronological order.
    startDate: text('start_date'),
    endDate: text('end_date'),
    labelId: text('label_id').references(() => taskLabels.id, { onDelete: 'set null' }),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('tasks_project_id_idx').on(t.projectId)],
);

export const taskComments = sqliteTable(
  'task_comments',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    editedAt: integer('edited_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('task_comments_task_id_idx').on(t.taskId)],
);

export const taskAttachments = sqliteTable(
  'task_attachments',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => users.id),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('task_attachments_project_id_idx').on(t.projectId)],
);
