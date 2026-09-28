# TODO の期間・色・アーカイブとカレンダー 設計

## 背景・目的

TODO に開始日・終了日と表示色を持たせ、プロジェクトごとのカレンダー画面で期間を帯として見られるようにする。あわせて TODO の削除をアーカイブに置き換え、完了済みや不要になった TODO をスレッドごと残したまま一覧から外せるようにする。

API 契約は `docs/openapi.yaml`、共有型は `packages/shared/src/projects.ts`（`TASK_COLORS`, `TaskColor`, `DEFAULT_TASK_COLOR`, `Task`）に従う。

## 決定事項

| 項目                | 決定                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 日付カラム          | `text` NULL、`'YYYY-MM-DD'`。タイムゾーンを持たない暦日として扱い、文字列比較で `start <= end` を判定する                                                              |
| 日付の組合せ        | 両方あり、または両方なし。`startDate <= endDate`。違反は `400 { error: 'invalid_date_range' }`。PATCH は部分更新なので保存済みの相手側と突き合わせる（データ層で判定） |
| 色                  | `TASK_COLORS` の 8 色（red, orange, yellow, green, teal, blue, purple, gray）。既定は `gray`                                                                           |
| アーカイブ          | `archived_at` に日時を持つ。`null` なら未アーカイブ。`users.deleted_at` と同じ形                                                                                       |
| 削除                | TODO の削除 API は廃止し、アーカイブ / 復元に置き換える                                                                                                                |
| 冪等性              | アーカイブ / 復元は既にその状態なら `archivedAt` も `updatedAt` も変えず、現在の TODO を返す                                                                           |
| 権限                | アーカイブ / 復元は PATCH と同じ（admin / staff）                                                                                                                      |
| 一覧                | 既定はアーカイブ済みを除外。`includeArchived` で含める                                                                                                                 |
| アーカイブ済み TODO | 一覧（`includeArchived=true`）・PATCH・コメント閲覧 / 投稿はすべて許可する                                                                                             |

## DB スキーマ（`tasks` に追加）

```
tasks
  start_date  text NULL      ('YYYY-MM-DD')
  end_date    text NULL      ('YYYY-MM-DD')
  color       text NOT NULL DEFAULT 'gray'  (TASK_COLORS)
  archived_at integer(timestamp_ms) NULL
```

マイグレーションは `pnpm --filter backend db:generate` で生成した `apps/backend/migrations/0003_*.sql`（`ALTER TABLE tasks ADD ...` を 4 本）。既存行は日付なし・`gray`・未アーカイブになる。

## バックエンド API

### 変更

- `GET /api/projects/:projectId/tasks?includeArchived=` → `Task[]`（作成日時昇順）。`true` / `1` でアーカイブ済みも含める。省略・`false` / `0` は未アーカイブのみ。それ以外の値は `400 validation_error`
- `POST /api/projects/:projectId/tasks` `{ title, description?, assigneeId?, startDate?, endDate?, color? }` → `201 Task`（admin / staff）。`color` 省略時は `gray`
- `PATCH /api/projects/:projectId/tasks/:taskId` `{ title?, description?, status?, assigneeId?, startDate?, endDate?, color? }` → `Task`（admin / staff）。`startDate` / `endDate` は `null` でクリア、省略で変更なし

### 追加

- `POST /api/projects/:projectId/tasks/:taskId/archive` → `200 Task`（admin / staff）
- `POST /api/projects/:projectId/tasks/:taskId/unarchive` → `200 Task`（admin / staff）

どちらも非メンバー・別プロジェクトの TODO は `404 { error: 'not_found' }`、substaff は `403 { error: 'forbidden' }`。

### 廃止

- `DELETE /api/projects/:projectId/tasks/:taskId`

### バリデーション

- `startDate`, `endDate`: zod の `z.iso.date()`。`YYYY-MM-DD` 形式かつ実在する日付（閏年込み）のみ。`2026-02-30`、`2026/10/01`、`20261001`、日時文字列、空文字は `400 validation_error`
- `color`: `TASK_COLORS` 以外は `400 validation_error`
- 片方だけの指定、片方だけ `null`、`startDate > endDate` は `400 { error: 'invalid_date_range' }`。PATCH では省略した側に保存済みの値を補ってから判定する

`Task` のレスポンスには `startDate`, `endDate`（`string | null`）、`color`、`archivedAt`（ISO 8601 または `null`）が加わる。

## フロントエンド

### カレンダー画面 `/projects/:projectId/calendar`

- ガントチャート形式。縦軸が TODO（1 行 1 TODO、作成順）、横軸が日付（1 列 1 日）。左のタスク名列は固定し、日付列は横スクロールする
- 月表示（その月の 1 日〜末日）と週表示（月曜始まりの 7 日）を切り替えられる
- 日付を持つ TODO は自分の行に開始日から終了日までの帯を TODO の色で描く。表示範囲からはみ出す側は角丸なし。日付のない TODO は行だけ出し「日付未設定」と表示する
- 帯をドラッグすると期間を保ったまま移動し、帯の端をドラッグすると開始日 / 終了日を伸縮する。確定時に PATCH する
- 帯をクリックすると TODO の詳細とスレッド（コメント一覧・投稿）を開く
- 「アーカイブを表示」チェックでアーカイブ済みの TODO も表示する（`includeArchived=true`）
- 編集操作は `canEdit` のロールにだけ出す

### TODO 一覧 `/projects/:projectId`

- 削除ボタンをアーカイブ / 復元ボタンに置き換える
- 「アーカイブを表示」チェックでアーカイブ済みの TODO も表示する
- 開始日・終了日と色（8 色）を編集できる

## テスト方針

- backend: `tests/projects/tasks.spec.ts` で以下をカバーする
  - アーカイブ / 復元のライフサイクル（既定一覧からの除外、`includeArchived` の各値、冪等性、不正値の 400）
  - 権限境界（substaff の 403、非メンバーと別プロジェクトの 404）
  - アーカイブ済み TODO の PATCH とコメント閲覧 / 投稿
  - 日付と色の保存、部分更新での範囲判定、クリア、`invalid_date_range`
  - 日付形式と色の `validation_error`
- frontend: カレンダーの帯の配置・ドラッグ操作と、一覧のアーカイブ表示切替をテストする

## スコープ外

- 繰り返し TODO
- 通知
- 期限アラート
