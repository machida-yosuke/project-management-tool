# プロジェクト / TODO / スレッド / メンバー権限 設計

## 背景・目的

ログイン済みユーザーがプロジェクトを作成し、プロジェクト単位で TODO（タスク）の管理、担当者アサイン、TODO ごとのスレッド会話、メンバー招待と権限管理を行えるようにする。

## 決定事項

- メール送信は行わない。招待は「メールアドレス + 暗証番号」を管理人が登録し、暗証番号は LINE 等で口頭伝達する
- バリデーションは `zod` + `@hono/zod-validator` を backend に追加して行う
- スレッドは TODO ごとに 1 本（フラットなコメント列、返信ネストなし）
- 招待の受諾は「Google ログイン中ユーザーのメールが招待先メールと一致」かつ「暗証番号が一致」した場合のみ

## 権限モデル（プロジェクト単位）

| ロール   | 閲覧 | プロジェクト編集 | TODO 作成/編集/削除/アサイン | コメント投稿 | メンバー招待/削除/権限変更 |
| -------- | ---- | ---------------- | ---------------------------- | ------------ | -------------------------- |
| admin    | ○    | ○                | ○                            | ○            | ○                          |
| staff    | ○    | ○                | ○                            | ○            | ×                          |
| substaff | ○    | ×                | ×                            | ×            | ×                          |

- プロジェクト作成者（owner）は自動で `admin` のメンバーになる
- owner は削除できず、ロール変更もできない
- 非メンバーからのアクセスはプロジェクトの存在を漏らさないため `404` を返す
- 権限不足は `403 { error: 'forbidden' }`

## DB スキーマ（`apps/backend/src/db/schema.ts` に追加）

```
projects
  id          text PK
  name        text NOT NULL
  description text NOT NULL DEFAULT ''
  owner_id    text NOT NULL  -> users.id
  created_at  integer(timestamp) NOT NULL

project_members
  project_id  text NOT NULL -> projects.id (ON DELETE CASCADE)
  user_id     text NOT NULL -> users.id
  role        text NOT NULL   ('admin' | 'staff' | 'substaff')
  created_at  integer(timestamp) NOT NULL
  PK (project_id, user_id)

project_invitations
  id            text PK
  project_id    text NOT NULL -> projects.id (ON DELETE CASCADE)
  email         text NOT NULL   (小文字正規化して保存)
  role          text NOT NULL
  passcode_hash text NOT NULL   (PBKDF2-SHA256, WebCrypto)
  passcode_salt text NOT NULL
  failed_attempts integer NOT NULL DEFAULT 0
  invited_by    text NOT NULL -> users.id
  expires_at    integer(timestamp) NOT NULL
  created_at    integer(timestamp) NOT NULL
  UNIQUE (project_id, email)

tasks
  id          text PK
  project_id  text NOT NULL -> projects.id (ON DELETE CASCADE)
  title       text NOT NULL
  description text NOT NULL DEFAULT ''
  status      text NOT NULL DEFAULT 'open'  ('open' | 'done')
  assignee_id text NULL -> users.id
  created_by  text NOT NULL -> users.id
  created_at  integer(timestamp) NOT NULL
  updated_at  integer(timestamp) NOT NULL

task_comments
  id         text PK
  task_id    text NOT NULL -> tasks.id (ON DELETE CASCADE)
  user_id    text NOT NULL -> users.id
  body       text NOT NULL
  created_at integer(timestamp) NOT NULL
```

新テーブルの日時カラムは `timestamp_ms`（ミリ秒精度）とし、一覧の並び順は `created_at, rowid` で安定させる。同一秒内の作成順が崩れないようにするため。既存の `users.created_at` は秒精度のまま。

マイグレーションは `pnpm --filter backend db:generate` で生成し `apps/backend/migrations/` にコミットする。

## 招待フロー

1. admin が `POST /api/projects/:projectId/invitations` に `{ email, role, passcode }` を送る。同じ (project, email) の未受諾招待があれば上書き。既にメンバーなら `409 { error: 'already_member' }`
2. 招待された人は Google でログインする。`GET /api/invitations` が「ログインユーザーのメールに一致し、期限内の招待」を返す。フロントのトップページに一覧表示する
3. `POST /api/invitations/:invitationId/accept` に `{ passcode }` を送る。一致すれば membership を作成し招待を削除する。他人宛て・存在しない招待は `404 { error: 'not_found' }`
4. 暗証番号不一致は `400 { error: 'invalid_passcode' }`。`failed_attempts` を加算し、10 回超で `423 { error: 'locked' }`（管理人が再招待すればリセット）
5. 期限は作成から 7 日。期限切れは `410 { error: 'expired' }`
6. 暗証番号は 4〜32 文字。平文は保存しない

## バックエンド API

すべて `/api/*` 配下、`requireAuth` ミドルウェア（`apps/backend/src/middleware/require-auth.ts`）を通す。ミドルウェアは `session_id` Cookie を検証し `c.set('user', SessionUser)` する。未認証は `401 { error: 'unauthorized' }`。

日時は ISO 8601 文字列で返す。レスポンス型は `packages/shared/src/projects.ts` の型に一致させる。

### プロジェクト `src/routes/projects.ts`

- `GET /api/projects` → `Project[]`（自分がメンバーのもの、`role` は自分のロール）
- `POST /api/projects` `{ name, description? }` → `201 Project`
- `GET /api/projects/:projectId` → `Project`
- `PATCH /api/projects/:projectId` `{ name?, description? }` → `Project`（admin/staff）
- `DELETE /api/projects/:projectId` → `204`（owner のみ）

### メンバー・招待 `src/routes/members.ts`, `src/routes/invitations.ts`

- `GET /api/projects/:projectId/members` → `ProjectMember[]`
- `PATCH /api/projects/:projectId/members/:userId` `{ role }` → `ProjectMember`（admin。owner 対象は `400 { error: 'owner_immutable' }`）
- `DELETE /api/projects/:projectId/members/:userId` → `204`（admin。owner 対象は `400`。自分自身は `400 { error: 'cannot_remove_self' }`。削除したメンバーが担当していたタスクは担当なしに戻す）
- `GET /api/projects/:projectId/invitations` → `ProjectInvitation[]`（admin）
- `POST /api/projects/:projectId/invitations` `{ email, role, passcode }` → `201 ProjectInvitation`（admin）
- `DELETE /api/projects/:projectId/invitations/:invitationId` → `204`（admin）
- `GET /api/invitations` → `ProjectInvitation[]`（自分宛て）
- `POST /api/invitations/:invitationId/accept` `{ passcode }` → `Project`

### タスク・コメント `src/routes/tasks.ts`, `src/routes/comments.ts`

- `GET /api/projects/:projectId/tasks` → `Task[]`（作成日時昇順）
- `POST /api/projects/:projectId/tasks` `{ title, description?, assigneeId? }` → `201 Task`（admin/staff）
- `PATCH /api/projects/:projectId/tasks/:taskId` `{ title?, description?, status?, assigneeId? (null で解除) }` → `Task`（admin/staff。assignee はプロジェクトメンバーのみ、違反は `400 { error: 'assignee_not_member' }`）
- `DELETE /api/projects/:projectId/tasks/:taskId` → `204`（admin/staff）
- `GET /api/projects/:projectId/tasks/:taskId/comments` → `TaskComment[]`（作成日時昇順）
- `POST /api/projects/:projectId/tasks/:taskId/comments` `{ body }` → `201 TaskComment`（admin/staff）

### バリデーション

- `name`, `title`: 1〜200 文字（trim 後）
- `description`, `body`: `body` は 1〜4000 文字、`description` は 0〜4000 文字
- `email`: zod の email、小文字化
- `role`: `PROJECT_ROLES`
- 不正入力は `400 { error: 'validation_error', issues }`（`@hono/zod-validator` の hook で統一）

### 関数分割

DB アクセスは `src/projects/*.ts`（`projects.ts`, `members.ts`, `invitations.ts`, `tasks.ts`, `comments.ts`）に関数として切り出し、ルートは薄く保つ。権限判定は `src/projects/authorize.ts` の `loadMembership(db, projectId, userId)` と `assertRole` に集約する。

## フロントエンド

### API クライアント `src/lib/api.ts`

`fetch` を包む薄い関数 `apiFetch<T>(path, init?)`。`credentials: 'include'`、JSON ボディ、非 2xx は `ApiError` を含む `ApiRequestError` を throw。`401` のときは auth ストアを `unauthenticated` にする。

### ストア

- `stores/projects.ts`: 一覧、作成、`current` プロジェクト取得
- `stores/tasks.ts`: プロジェクトのタスク一覧、作成、更新、削除、選択中タスクのコメント一覧・投稿
- `stores/members.ts`: メンバー一覧、招待一覧、招待作成・削除、ロール変更、メンバー削除
- `stores/invitations.ts`: 自分宛て招待一覧、受諾

### ルーティング（すべて `requiresAuth: true`）

| path                           | view                 | 内容                                                                                             |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------ |
| `/`                            | `HomeView`           | プロジェクト一覧、作成フォーム、自分宛て招待の一覧（暗証番号入力で受諾）                         |
| `/projects/:projectId`         | `ProjectView`        | TODO 一覧（追加・完了切替・担当者選択・削除）。TODO を選ぶと右側にスレッド（コメント一覧＋投稿） |
| `/projects/:projectId/members` | `ProjectMembersView` | メンバー一覧。admin には招待フォーム（メール・ロール・暗証番号）、招待一覧、ロール変更、削除     |

- 権限に応じて編集 UI を出し分ける。`substaff` は読み取り表示（フォーム非表示、ボタン disabled ではなく非表示）
- 判定には `@pm-tool/shared` の `canEdit` / `canManageMembers` を使う
- `App.vue` にホームへのリンクを置く

## ユーザー設定

ログインユーザーが表示名の変更、アバターの設定・削除、退会を行える。

### 認証の真実源

`requireAuth` は KV のセッションからユーザー id だけを取り出し、D1 から `deleted_at IS NULL` のユーザーを毎回読む。見つからなければセッションを破棄して `401 { error: 'unauthorized' }`。これで名前変更が即時に反映され、退会すると他端末のセッションも使えなくなる。`c.get('user')` と `GET /api/auth/me` は `{ id, email, name, avatarUrl }` を返す。

### スキーマ

`users` に `avatar_key text NULL`（R2 のキー）と `deleted_at integer(timestamp_ms) NULL` を追加する。

### API（すべて `requireAuth` 配下）

- `PATCH /api/me` `{ name }`（trim 後 1〜100 文字）→ ユーザー
- `PUT /api/me/avatar` multipart の `file` → ユーザー。`image/png` / `image/jpeg` / `image/webp` のみ（それ以外は `400 { error: 'unsupported_media_type' }`、`file` がなければ `400 { error: 'file_required' }`）。100KB 超は `413 { error: 'payload_too_large' }`。ヘッダから読んだ幅か高さが 256px 超、またはヘッダを判別できなければ `400 { error: 'image_too_large' }`。R2 キーは `avatars/<userId>/<uuid>` で、DB を更新してから旧オブジェクトを削除する
- `DELETE /api/me/avatar` → ユーザー（`avatarUrl: null`）
- `DELETE /api/me` → `204`、Cookie 削除。自分が owner で他メンバーのいるプロジェクトがあれば `409 { error: 'owned_projects_have_members', projects: [{ id, name }] }`
- `GET /api/avatars/:userId/:fileId` → 画像。`Cache-Control: private, max-age=31536000, immutable`、`X-Content-Type-Options: nosniff`。アップロードごとにキーが変わるので同じ URL の中身は変わらない

アバターは frontend が 128×128 の webp / jpeg にリサイズしてから送る前提で、backend の上限はその余裕を持たせた値にしている。

`UserSummary` と `ProjectMember` は `avatarUrl: string | null` を持つ。値は `/api/avatars/<userId>/<fileId>` のパスで、frontend が API のベース URL を前置する。`<img>` による取得は frontend と backend が same-site である前提（セッション Cookie と同じく `SameSite=Lax`）で Cookie が付く。

### 退会

1. 自分が owner で他メンバーのいるプロジェクトがあれば 409 で拒否する。先に削除してもらう
2. 1 回の batch で以下を行う
   - 自分しかメンバーのいないプロジェクトを削除（cascade でタスク・コメント・招待も消える）
   - 自分の membership を削除し、担当タスクを担当なしに戻す
   - users 行を匿名化する: `name = '退会したユーザー'`、`email = 'deleted-<id>@deleted.invalid'`、`avatar_key = NULL`、`deleted_at = now`
3. R2 のアバターを best-effort で削除し、現在のセッションを破棄する

users 行は削除しない。`tasks.created_by` / `task_comments.user_id` / `project_invitations.invited_by` が cascade なしで参照しており、退会者の TODO・コメントは「退会したユーザー」として残す。

メールを匿名化するので、同じ Google アカウントで再ログインすると別 id の新規ユーザーになる。退会前の旧メール宛て招待（期限内のもの）は新しいアカウントからも見え、受諾できる。

## テスト方針

- backend: `SELF.fetch` による統合テストを各ルートファイルに対応して `tests/projects/*.spec.ts` に置く。セッションは `createSession(env.SESSIONS, user)` で発行して Cookie を付ける。権限境界（substaff の書き込み拒否、非メンバーの 404、owner の不変性、暗証番号の不一致・ロック・期限切れ）を必ずカバーする
- frontend: ストアとビューは `vi.stubGlobal('fetch', ...)` でモックし、権限による UI 出し分けと受諾フローをテストする

## スコープ外

- 招待メール送信、通知
- コメントの編集・削除、返信ネスト
- タスクの並び替え、期限、ラベル
- プロジェクトのアーカイブ
