import test from 'node:test';
import assert from 'node:assert/strict';
import * as aiStatus from '../src/services/aiStatusService';

test('aiStatus archives previous step output and resets current step stream on step change', async () => {
  const taskId = `task-${Date.now()}`;

  aiStatus.start(taskId, '测试任务', ['步骤一', '步骤二']);
  aiStatus.appendStream(taskId, 'Hello');
  aiStatus.appendStream(taskId, ' World');

  await new Promise((resolve) => setTimeout(resolve, 120));

  const running = aiStatus.getCurrent();
  assert.equal(running?.streamText, 'Hello World');

  aiStatus.step(taskId, 1, '步骤二');
  const afterStep = aiStatus.getCurrent();
  assert.equal(afterStep?.streamText, '');
  assert.deepEqual(afterStep?.stepLogs, [
    { stepLabel: '步骤一', text: 'Hello World' }
  ]);

  aiStatus.finish(taskId);
});
