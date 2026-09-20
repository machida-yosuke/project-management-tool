# Google OAuth ログイン/サインイン 設計

## 背景・目的

プロジェクトマネジメントツールにユーザー認証を追加する。認証方式はGoogle OAuthのみに対応する(他のプロバイダは対象外)。認証できたユーザーは誰でも利用可能とし、初回ログイン時に自動でユーザーレコードを作成する(招待制・ドメイン制限は行わない)。

環境構築フェーズ(`docs/superpowers/specs`未作成時点)で以下は既に決定済み:
- セッションはCloudflare KV(`SESSIONS`)を使ったサーバーサイドセッション方式(JWTステートレス方式は採用しない。理由: 単一Workerサービス+KVという構成でステートレス化のメリットが薄く、即時失効のしやすさを優先)
- OAuthライブラリは `@hono/oauth-providers/google`
- `users`テーブルは`packages`ではなく`apps/backend/src/db/schema.ts`に定義済み(`id`, `email`, `name`, `createdAt`)

## セッションの有効期限

固定TTL 7日間。作成時から7日でKVエントリが失効し、使用中かどうかに関わらず強制的に再ログインが必要になる(スライディング更新はしない)。理由: 実装をシンプルに保つため。ユーザー承認済み。

## セキュリティ対策(調査済み・必須)

- **`@hono/oauth-providers`のバージョン固定**: v0.8.6未満にはstate parameter検証をバイパスされる既知の脆弱性(CVE-2026-81888、login CSRF・forced account linking)がある。`package.json`で`^0.8.6`以上を明示指定する。
- **Open Redirect対策**: ログイン後の遷移先を運ぶ`redirect`クエリ/`oauth_redirect`Cookieの値は、フロントエンド・バックエンドの両方で「`/`から始まり、`//`または`\`から始まらない」相対パスのみを許可するバリデーションを通す。検証に落ちた場合はデフォルトの`/`にフォールバックする。
- **CORSのorigin制限**: `credentials: true`とワイルドカードoriginは併用不可。許可originは環境変数(`FRONTEND_URL`)で明示する。
- **`email_verified`確認**: Googleプロフィールの`email_verified`が`false`の場合はサインアップ・ログインを拒否し、エラーページへ誘導する。
- **セッション固定化対策**: ログイン成功のたびに`crypto.randomUUID()`で新規セッションIDを発行する(既存セッションIDの使い回しをしない)。
- **機微情報のログ出力回避**: `session_id`やGoogleの認可コード/アクセストークンをログに出力しない。

## バックエンド設計

### ルート一覧(`apps/backend/src/routes/auth/google.ts`)

| メソッド/パス | 役割 |
|---|---|
| `GET /api/auth/google` | `redirect`クエリを検証し`oauth_redirect`Cookie(5分)に保存、`googleAuth()`でGoogle同意画面へ |
| `GET /api/auth/google/callback` | Googleプロフィール受領→`email_verified`確認→`users`をemail基準でupsert→セッション発行→`session_id`Cookie設定→`oauth_redirect`の行き先(検証済み)へリダイレクト、`oauth_redirect`Cookieは削除 |
| `GET /api/auth/me` | `session_id`Cookieを検証し、有効なら`{id, email, name}`を200、無効/なしなら401 |
| `POST /api/auth/logout` | KVからセッション削除、`session_id`Cookie削除(Max-Age=0) |

### セッションデータ

KV `SESSIONS` に `sessionId -> JSON.stringify({ userId, email, name })`、`expirationTtl: 60 * 60 * 24 * 7`(固定、更新なし)。

### Cookie属性

- `session_id`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure`(本番のみ、`APP_ENV`で分岐)
- `oauth_redirect`: 同上、`maxAge: 300`(5分、OAuthハンドシェイクの往復時間を吸収する一時Cookie)

### 関数分割(テスト容易性のため)

Googleとの実OAuth通信(`googleAuth()`ミドルウェア内部)はテスト対象にしない。以下は純粋な関数として`src/auth/`配下に切り出し、単体テストする:

- `validateRedirectPath(value: string | undefined): string` — 相対パスのみ許可、それ以外は`/`を返す
- `upsertUserByEmail(db, profile): Promise<User>` — email基準でupsert
- `createSession(kv, user): Promise<string>` — セッションID発行・KV保存、IDを返す
- `getSessionUser(kv, sessionId): Promise<SessionUser | null>` — セッション検証

### CORS

`hono/cors`ミドルウェアを`origin: env.FRONTEND_URL`, `credentials: true`で設定する。

## フロントエンド設計

### Piniaストア `apps/frontend/src/stores/auth.ts`

```ts
interface AuthState {
  user: { id: string; email: string; name: string } | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
}
```

- `fetchMe()`: `GET /api/auth/me`(`credentials: 'include'`)を呼び、200なら`authenticated`+`user`セット、401なら`unauthenticated`
- `logout()`: `POST /api/auth/logout`を呼び、成功後`user = null`, `status = 'unauthenticated'`

### ルーティング

- `apps/frontend/src/views/LoginView.vue`を追加。`route.query.redirect`を`validateRedirectPath`相当のロジック(フロントにも同じ検証を実装、多層防御)で検証し、`<a :href="\`${apiBaseUrl}/api/auth/google?redirect=${encodeURIComponent(safeRedirect)}\`">Googleでログイン</a>`を表示
- 既存の`/`(HomeView)に`meta: { requiresAuth: true }`を付与
- `router.beforeEach`: `to.meta.requiresAuth`かつ`authStore.status !== 'authenticated'`の場合、`fetchMe()`が未実行なら先に実行して判定、それでも未認証なら`/login?redirect=${to.fullPath}`へ`next()`

### 初期化順序

`App.vue`の`onMounted`で`authStore.fetchMe()`を呼ぶ。`main.ts`でPiniaを`app.use()`した後、ルーターの初期ナビゲーションが`fetchMe`の結果を待てるよう、`router.beforeEach`内で`status === 'idle'`なら`await authStore.fetchMe()`してから判定する(ガード内で直接fetchすることで、リロード時の誤判定を防ぐ)。

### UI

`App.vue`にヘッダー相当の領域を追加し、`authStore.status === 'authenticated'`なら`user.name`とログアウトボタンを表示。

## テスト方針(TDD)

- Backend: `validateRedirectPath`, `upsertUserByEmail`, `createSession`, `getSessionUser`の単体テスト(Red→Green)。`GET /api/auth/me`(Cookieなし401、有効セッション200)、`POST /api/auth/logout`(KV削除・Cookie削除)の統合テスト。Google実通信はモック/対象外
- Frontend: `authStore`の`fetchMe`/`logout`(fetch mock)、router guardが未認証で`/login?redirect=...`にリダイレクトすること、`LoginView`が不正な`redirect`値を無害化すること

## スコープ外(次フェーズ)

- Google以外のOAuthプロバイダ
- ログイン試行のレート制限
- 状態変更API全般へのCSRFトークン導入(現状は`SameSite=Lax`のみで対応、必要になった時点で追加検討)
- ユーザー情報の編集機能
