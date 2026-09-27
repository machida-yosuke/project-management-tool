import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsView from '../../src/views/SettingsView.vue';
import { ImageDecodeError, resizeAvatar } from '../../src/lib/image';
import { useAuthStore } from '../../src/stores/auth';
import { alice, API_BASE, json, noContent, stubApi } from '../helpers/api-mock';
import { inputValue, mountAt } from '../helpers/mount';

// happy-dom has no Canvas or createImageBitmap, so resizing is covered in tests/lib/image.spec.ts.
vi.mock('../../src/lib/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/image')>()),
  resizeAvatar: vi.fn(),
}));
const resizeAvatarMock = vi.mocked(resizeAvatar);
const resized = new Blob(['resized'], { type: 'image/webp' });

// happy-dom inputs have no settable FileList, so stub the property the view reads.
async function selectFile(
  input: { element: unknown; trigger: (event: string) => Promise<void> },
  file: File,
) {
  Object.defineProperty(input.element as object, 'files', {
    configurable: true,
    value: { length: 1, item: (index: number) => (index === 0 ? file : null) },
  });
  await input.trigger('change');
  await flushPromises();
}

describe('SettingsView', () => {
  beforeEach(() => {
    resizeAvatarMock.mockResolvedValue(resized);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resizeAvatarMock.mockReset();
  });

  it('updates the name and reflects it in the auth store', async () => {
    const fetchMock = stubApi({
      'PATCH /api/me': (body) => json({ ...alice, ...(body as { name: string }) }),
    });

    const { wrapper, pinia } = await mountAt(SettingsView, '/settings', alice);
    const input = wrapper.get('input[aria-label="名前"]');
    expect(inputValue(input)).toBe('Alice');

    await input.setValue('  Alicia  ');
    await wrapper.get('[data-testid="name-form"]').trigger('submit');
    await flushPromises();

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Alicia' });
    expect(useAuthStore(pinia).user?.name).toBe('Alicia');
    expect(wrapper.get('[role="status"]').text()).toBe('名前を更新しました');
  });

  it('shows a validation message when the name is rejected', async () => {
    stubApi({ 'PATCH /api/me': json({ error: 'validation_error' }, 400) });

    const { wrapper } = await mountAt(SettingsView, '/settings', alice);
    await wrapper.get('[data-testid="name-form"]').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('名前は1〜100文字で入力してください');
  });

  it('uploads the resized avatar as multipart and then removes it', async () => {
    const withAvatar = { ...alice, avatarUrl: '/api/avatars/u-alice/f1' };
    let uploaded: unknown = null;
    stubApi({
      'PUT /api/me/avatar': (body) => {
        uploaded = body instanceof FormData ? body.get('file') : null;
        return json(withAvatar);
      },
      'DELETE /api/me/avatar': json(alice),
    });

    const { wrapper } = await mountAt(SettingsView, '/settings', alice);
    const section = () => wrapper.get('[data-testid="avatar-section"]');
    expect(section().find('img').exists()).toBe(false);
    expect(section().find('button').exists()).toBe(false);

    const file = new File(['png'], 'me.png', { type: 'image/png' });
    await selectFile(section().get('input[type="file"]'), file);

    expect(resizeAvatarMock).toHaveBeenCalledWith(file);
    expect(uploaded).toBeInstanceOf(File);
    expect((uploaded as File).name).toBe('avatar.webp');
    expect((uploaded as File).type).toBe('image/webp');
    expect(await (uploaded as File).text()).toBe('resized');
    expect(section().get('img').attributes('src')).toBe(`${API_BASE}/api/avatars/u-alice/f1`);

    await section().get('button').trigger('click');
    await flushPromises();

    expect(section().find('img').exists()).toBe(false);
    expect(section().find('button').exists()).toBe(false);
  });

  it.each([
    [
      json({ error: 'unsupported_media_type' }, 400),
      'PNG / JPEG / WebP / GIF の画像を選んでください',
    ],
    [
      json({ error: 'payload_too_large' }, 413),
      '画像の処理に失敗しました。別の画像を試してください',
    ],
    [
      new Response('Payload Too Large', { status: 413 }),
      '画像の処理に失敗しました。別の画像を試してください',
    ],
    [json({ error: 'image_too_large' }, 400), '画像の処理に失敗しました。別の画像を試してください'],
  ])('shows an avatar upload error', async (response, message) => {
    stubApi({ 'PUT /api/me/avatar': response });

    const { wrapper } = await mountAt(SettingsView, '/settings', alice);
    await selectFile(
      wrapper.get('input[type="file"]'),
      new File(['x'], 'x.bin', { type: 'application/octet-stream' }),
    );

    expect(wrapper.get('[data-testid="avatar-section"] [role="alert"]').text()).toBe(message);
  });

  it('shows a decode error without uploading when the image cannot be read', async () => {
    resizeAvatarMock.mockRejectedValue(new ImageDecodeError('Failed to decode image'));
    const fetchMock = stubApi({});

    const { wrapper } = await mountAt(SettingsView, '/settings', alice);
    await selectFile(
      wrapper.get('input[type="file"]'),
      new File(['x'], 'x.heic', { type: 'image/heic' }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="avatar-section"] [role="alert"]').text()).toBe(
      '画像を読み込めませんでした',
    );
  });

  it('disables the file input while the avatar is being resized', async () => {
    let finishResize: (blob: Blob) => void = () => {};
    resizeAvatarMock.mockReturnValue(
      new Promise<Blob>((resolve) => {
        finishResize = resolve;
      }),
    );
    stubApi({ 'PUT /api/me/avatar': json(alice) });

    const { wrapper } = await mountAt(SettingsView, '/settings', alice);
    await selectFile(
      wrapper.get('input[type="file"]'),
      new File(['png'], 'me.png', { type: 'image/png' }),
    );

    expect(wrapper.get('input[type="file"]').attributes('disabled')).toBeDefined();

    finishResize(resized);
    await flushPromises();

    expect(wrapper.get('input[type="file"]').attributes('disabled')).toBeUndefined();
  });

  it('requires a second confirmation before deleting the account and then goes to /login', async () => {
    const fetchMock = stubApi({ 'DELETE /api/me': noContent() });

    const { wrapper, router, pinia } = await mountAt(SettingsView, '/settings', alice);
    const section = () => wrapper.get('[data-testid="delete-account"]');

    await section().get('button').trigger('click');
    expect(fetchMock).not.toHaveBeenCalled();
    const confirmButton = section()
      .findAll('button')
      .find((b) => b.text() === '本当に退会する');
    expect(confirmButton).toBeDefined();

    await confirmButton?.trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/login');
    const authStore = useAuthStore(pinia);
    expect(authStore.user).toBeNull();
    expect(authStore.status).toBe('unauthenticated');
  });

  it('lists the projects that block account deletion', async () => {
    stubApi({
      'DELETE /api/me': json(
        {
          error: 'owned_projects_have_members',
          projects: [
            { id: 'p1', name: 'Shared One' },
            { id: 'p2', name: 'Shared Two' },
          ],
        },
        409,
      ),
    });

    const { wrapper, router, pinia } = await mountAt(SettingsView, '/settings', alice);
    await wrapper.get('[data-testid="delete-account"] button').trigger('click');
    const confirmButton = wrapper
      .findAll('[data-testid="delete-account"] button')
      .find((b) => b.text() === '本当に退会する');
    await confirmButton?.trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="delete-account"] [role="alert"]').text()).toContain(
      '先にプロジェクトを削除してください',
    );
    const links = wrapper.findAll('[data-testid="blocking-projects"] a');
    expect(links.map((a) => a.text())).toEqual(['Shared One', 'Shared Two']);
    expect(links[0]?.attributes('href')).toBe('/projects/p1');
    expect(router.currentRoute.value.path).toBe('/settings');
    expect(useAuthStore(pinia).status).toBe('authenticated');
  });
});
