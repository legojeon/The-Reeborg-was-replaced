import assert from 'node:assert/strict';
import test from 'node:test';

import { createOutcomeAudioController } from '../src/ui/outcomeAudio.ts';

test('unlocks once and plays every repeated outcome', async () => {
  const events: string[] = [];
  const controller = createOutcomeAudioController({
    async resume() { events.push('resume'); },
    async play(kind) { events.push(`play:${kind}`); }
  });

  await controller.unlock();
  await controller.unlock();
  await controller.play('success');
  await controller.play('success');
  await controller.play('fail');

  assert.deepEqual(events, [
    'resume',
    'play:success',
    'play:success',
    'play:fail'
  ]);
});

test('waits for the user-gesture unlock before playing', async () => {
  const events: string[] = [];
  let releaseResume!: () => void;
  const resumeGate = new Promise<void>((resolve) => { releaseResume = resolve; });
  const controller = createOutcomeAudioController({
    async resume() {
      events.push('resume:start');
      await resumeGate;
      events.push('resume:end');
    },
    async play(kind) { events.push(`play:${kind}`); }
  });

  const unlocking = controller.unlock();
  const playing = controller.play('success');
  await Promise.resolve();
  assert.deepEqual(events, ['resume:start']);

  releaseResume();
  await Promise.all([unlocking, playing]);
  assert.deepEqual(events, ['resume:start', 'resume:end', 'play:success']);
});
