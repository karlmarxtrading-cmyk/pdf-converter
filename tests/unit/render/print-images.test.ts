// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { awaitImages } from '../../../src/render/paginate';

const images = (ids: string[]) => ids.map(id => `<img src="${id}.png" alt="${id}">`).join('');
const setSize = (img: HTMLImageElement, width: number, height: number) => {
  Object.defineProperties(img, { naturalWidth: { value: width }, naturalHeight: { value: height } });
};
const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
function decoder(decode: (this: HTMLImageElement) => Promise<void>) {
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: decode });
}
afterEach(() => {
  if (original) Object.defineProperty(HTMLImageElement.prototype, 'decode', original);
  else Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
});

it('checks each distinct source once with at most two explicit decode requests in flight', async () => {
  let active = 0, peak = 0;
  const seen: string[] = [];
  decoder(async function() {
    seen.push(this.getAttribute('src')!);
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 1));
    setSize(this, 64, 32);
    active--;
  });
  expect(await awaitImages(document, images(['one', 'two', 'one', 'three', 'four']), 1000)).toEqual([]);
  expect(peak).toBe(2);
  expect(seen.sort()).toEqual(['four.png', 'one.png', 'three.png', 'two.png']);
});

it('stops queuing images and detaches active sources when print is cancelled', async () => {
  const active: HTMLImageElement[] = [];
  decoder(function() { active.push(this); return new Promise(() => {}); });
  const controller = new AbortController();
  const result = awaitImages(document, images(['one', 'two', 'three']), 5000, controller.signal);
  expect(active).toHaveLength(2);
  controller.abort();
  await expect(result).rejects.toMatchObject({ failure: { code: 'ABORTED' } });
  expect(active).toHaveLength(2);
  expect(active.every(img => !img.hasAttribute('src'))).toBe(true);
});

it('distinguishes a timed-out decoder, rejected decode and out-of-budget native dimensions', async () => {
  const body = images(['one']);
  decoder(() => new Promise(() => {}));
  expect(await awaitImages(document, body, 5)).toMatchObject([{ code: 'IMAGE_TIMEOUT', blocking: true }]);
  decoder(() => Promise.reject(new Error('decode')));
  expect(await awaitImages(document, body, 1000)).toMatchObject([{ code: 'IMAGE_LOAD_FAILED', blocking: true }]);
  decoder(async function() { setSize(this, 8000, 6000); });
  expect(await awaitImages(document, body, 1000)).toMatchObject([{ code: 'IMAGE_PIXELS_EXCEEDED', blocking: true }]);
});

it('counts a repeated source once in the total native pixel budget', async () => {
  const decode = vi.fn(async function(this: HTMLImageElement) { setSize(this, 8000, 5000); });
  decoder(decode);
  expect(await awaitImages(document, images(['1', '2', '3', '4', '5', '1']), 1000)).toEqual([]);
  expect(decode).toHaveBeenCalledTimes(5);
  expect(await awaitImages(document, images(['1', '2', '3', '4', '5', '6']), 1000)).toMatchObject([{ code: 'IMAGE_PIXELS_EXCEEDED' }]);
});
